import { createEntity, type Composition } from '../../domain/entities';
import { checkActive, FoundationError } from '../../domain/errors';
import { validateEntity, object } from '../../domain/validation';
import type { EntityIndex } from '../../storage/index';
import type { EntityRecord, EntityRepository } from '../../storage/repository';
import type { VaultPort } from '../../storage/vault-port';
import type { AssetPort } from '../../storage/asset-port';
import { CheckpointRecovery, type RecoveredDraft } from '../../storage/recovery';
import { SourceCatalog } from '../../arrangement/catalog';
import { resolveArrangement } from '../../arrangement/preflight';
import type { SourceSummary } from '../../arrangement/sources';
import { editableComposition, placeClip, editClip, duplicateClip, acknowledgeSource } from './commands';
import { CanvasSession } from './session';
import { SourceCapture } from '../../arrangement/capture';
import { ArrangementPreparation } from '../../arrangement/preparation';
import { MidiFiles } from '../../midi/files';
import type { VaultAsset } from '../../storage/asset-port';
import { linkOnlyRewrite, type RenameMove } from './rename-merge';
import { CanvasFreshness } from './freshness';
import { addReference, relinkReference, relinkSuggestion, recordingPath, RECORDING_EXTENSIONS, type ReferenceInput, type RelinkSuggestion } from './structure';
export type RecordingStatus = { status: 'available'; file: VaultAsset } | { status: 'missing' | 'invalid'; message: string };
export interface RenameOffer { readonly record: EntityRecord; readonly moves: readonly RenameMove[] }
/** 4E: mirror links that Obsidian resolves to the same referenced file; `keep` is the exact `[[path]]` form. */
export interface DuplicateMirror { readonly path: string; readonly keep: string; readonly remove: readonly string[] }
export class CanvasLibrary {
    readonly sources: SourceCatalog;
    readonly recovery: CheckpointRecovery<Composition>;
    readonly capture:SourceCapture;readonly midiFiles:MidiFiles;
    /** 4E: keeps open sessions fresh against their authoritative notes. */
    readonly freshness: CanvasFreshness;
    private sessions = new Map<string, CanvasSession>();
    private owners = new Map<CanvasSession, Set<object>>();
    private closed = false;
    constructor(readonly index: EntityIndex, private readonly repository: EntityRepository, private readonly vault: VaultPort & AssetPort, private readonly unsavedSource: (id: string) => boolean = () => false, private readonly resolveLink?: (target: string, source: string) => string | null) {
        this.sources = new SourceCatalog(index);
        this.capture=new SourceCapture(this.sources,index,repository,vault);this.midiFiles=new MidiFiles(vault);
        this.freshness = new CanvasFreshness(index, repository, () => [...this.sessions.values()], async s => !!(await this.renameConflict(s)));
        this.recovery = new CheckpointRecovery(vault, index, repository, raw => { const fields = object(raw, 'composition recovery'), title = fields.title, e = validateEntity({ ...fields, title: title === '' ? 'Untitled recovery' : title }); if (e.kind !== 'composition')
            throw new FoundationError('wrong-kind', 'Use the original module for this checkpoint.'); if (title === '')
            e.title = ''; return editableComposition(e); });
    }
    items(search = '') { const heads = this.index.heads(); return heads.filter(h => h.kind === 'composition' && h.title?.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(h => ({ ...h, ambiguous: heads.filter(x => x.id === h.id).length > 1 })).sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')); }
    drafts(): CanvasSession[] { return [...this.sessions.values()].filter(s => s.dirty); }
    preparation(session:CanvasSession):ArrangementPreparation{checkActive(undefined,this.closed);return new ArrangementPreparation(this.capture,this.repository,this.midiFiles,()=>({composition:session.draft,base:session.base}));}
    plan(composition: Composition) { return resolveArrangement(composition, id => this.sources.get(id), this.unsavedSource); }
    source(id: string): SourceSummary { const state = this.sources.get(id); if (state.status !== 'ready')
        throw new FoundationError('invalid', `Saved motif is ${state.status}. Inspect/repair it; no clip/source data changed.`); return state.source; }
    private session(draft: Composition, base?: EntityRecord): CanvasSession {
        if (this.drafts().length >= 20)
            throw Error('Save or discard an existing composition before opening more than20 drafts.');
        const s = new CanvasSession(draft, base, { save: (original, next, signal) => original ? this.repository.save(original, editableComposition(next), signal) : this.repository.create(editableComposition(next), signal), checkpoint: (next, original, signal) => this.repository.saveEditorDraft(next, original, signal) });
        this.sessions.set(draft.id.toLowerCase(), s);
        s.subscribe(() => this.trim());
        this.freshness.watch(s);
        this.trim();
        return s;
    }
    create(): CanvasSession { checkActive(undefined, this.closed); const c = createEntity('composition', 'Untitled composition'); c.data.lengthTicks = 960 * 4 * 64; return this.session(c); }
    async open(id: string, signal?: AbortSignal): Promise<CanvasSession> { checkActive(signal, this.closed); const old = this.sessions.get(id.toLowerCase()); if (old?.dirty)
        return old; const record = await this.repository.read(id, signal); checkActive(signal, this.closed); if (record.entity.kind !== 'composition')
        throw Error('Choose a composition.'); editableComposition(record.entity); const current = this.sessions.get(id.toLowerCase()); if (current?.dirty)
        return current; if (current && !current.disposed) {
        current.reload(record);
        return current;
    } return this.session(record.entity, record); }
    place(s: CanvasSession, laneId: string, motifId: string, start: number, repetitions: number): void { const source = this.source(motifId); s.edit('Place motif', c => placeClip(c, laneId, source, start, repetitions)); }
    move(s: CanvasSession, id: string, laneId: string, start: number, repetitions: number, label?: string): void { const clip = s.draft.data.lanes.flatMap(l => l.clips).find(c => c.id === id); if (!clip)
        throw Error('Clip missing.'); const source = this.source(clip.motifId); s.edit('Edit clip placement', c => editClip(c, id, laneId, start, repetitions, label, source)); }
    duplicate(s: CanvasSession, id: string): void { const clip = s.draft.data.lanes.flatMap(l => l.clips).find(c => c.id === id); if (!clip)
        throw Error('Clip missing.'); const source = this.source(clip.motifId); s.edit('Duplicate clip', c => duplicateClip(c, id, source)); }
    review(s: CanvasSession, id: string, revision: string): void { const clip = s.draft.data.lanes.flatMap(l => l.clips).find(c => c.id === id); if (!clip)
        throw Error('Clip missing.'); const source = this.source(clip.motifId); if (source.revision !== revision)
        throw Error('Saved source changed during review. Inspect the new revision before acknowledging.'); s.edit('Review saved motif revision', c => acknowledgeSource(c, id, source)); }
    recover(value: RecoveredDraft<Composition>): CanvasSession { checkActive(undefined, this.closed); const old = this.sessions.get(value.draft.id.toLowerCase()); if (old?.dirty || old?.busy)
        throw Error('Save/discard the existing arrangement before recovery.'); if (old) {
        old.dispose();
        this.owners.delete(old);
    } const s = this.session(value.draft, value.base); s.update(value.draft); s.recoveryPath = value.checkpoint; return s; }
    retain(s: CanvasSession, owner: object): void { const owners = this.owners.get(s) ?? new Set<object>(); owners.add(owner); this.owners.set(s, owners); }
    release(s: CanvasSession, owner: object): void { const owners = this.owners.get(s); owners?.delete(owner); if (!owners?.size)
        this.owners.delete(s); this.trim(); }
    private trim(): void { const clean = [...this.sessions.values()].filter(s => !s.dirty && !s.busy && !this.owners.has(s)); while (clean.length > 8) {
        const s = clean.shift();
        if (s) {
            s.dispose();
            this.sessions.delete(s.draft.id.toLowerCase());
        }
    } }
    /** Vault metadata only: recording bytes are never read, copied or modified. */
    recordingFiles(search = '', limit = 200): VaultAsset[] { return this.recordingCandidates(search, limit).files; }
    /** One vault scan: linkable audio files (sorted, bounded) plus the count hidden by the portable path/wikilink contract (4D). */
    recordingCandidates(search = '', limit = 200): { files: VaultAsset[]; hidden: number } { checkActive(undefined, this.closed); const needle = search.toLocaleLowerCase(), files: VaultAsset[] = []; let hidden = 0; for (const f of this.vault.assetFiles()) { if (!RECORDING_EXTENSIONS.includes(f.extension.toLowerCase()) || !f.path.toLocaleLowerCase().includes(needle) || f.path.split('/').some(part => part.startsWith('.'))) continue; if (this.safe(f.path)) files.push(f); else hidden++; } return { files: files.sort((a, b) => a.path.localeCompare(b.path)).slice(0, limit), hidden }; }
    private safe(path: string): boolean { try { recordingPath(path); return true; } catch { return false; } }
    recordingStatus(path: string): RecordingStatus { try { recordingPath(path); const file = this.vault.fileInfo(path); return file ? { status: 'available', file } : { status: 'missing', message: `Missing recording: ${path}. The reference is preserved; relink it explicitly.` }; } catch (error) { return { status: 'invalid', message: error instanceof Error ? error.message : String(error) }; } }
    private available(path: string): void { const state = this.recordingStatus(path); if (state.status !== 'available') throw new FoundationError(state.status === 'missing' ? 'missing' : 'invalid', state.status === 'missing' ? 'The selected recording no longer exists. Choose it again.' : state.message); }
    addRecording(s: CanvasSession, input: ReferenceInput): void { checkActive(undefined, this.closed); this.available(input.path); s.edit('Add recording reference', c => addReference(c, input)); }
    /** One undo entry even when one renamed file backs several references. */
    relinkRecording(s: CanvasSession, ids: string | readonly string[], path: string): void { checkActive(undefined, this.closed); this.available(path); const list = typeof ids === 'string' ? [ids] : ids, source = s.base?.path ?? ''; s.edit('Relink recording reference', c => this.dedupeMirror(list.reduce((next, id) => relinkReference(next, id, path), c), path, source)); }
    /**
     * 4D: Obsidian's link updater may leave a shortest-form mirror link (e.g. [[take.wav]]) that resolves to the
     * same file as the exact mirror [[folder/take.wav]] the relink just wrote. Drop only links that resolve to exactly
     * `path`; never by basename guessing, never another file's link.
     */
    private dedupeMirror(c: Composition, path: string, source: string): Composition {
        const exact = `[[${path}]]`, resolve = this.resolveLink; if (!resolve || !c.assets) return c;
        const assets = c.assets.filter(a => a.role !== 'audio' || a.link === exact || resolve(a.link.replace(/^\[\[|\]\]$/g, '').split('|')[0] ?? '', source) !== path);
        return assets.length === c.assets.length ? c : { ...c, assets };
    }
    /**
     * 4E legacy cleanup (detection only): audio mirror links that Obsidian's own resolver maps to the SAME referenced,
     * existing file, where the exact `[[path]]` form is present. A shortest-form link whose name matches more than one
     * vault file is ambiguous and never counted. Reference records are not involved.
     */
    duplicateMirrors(c: Composition, sourcePath = ''): DuplicateMirror[] {
        const resolve = this.resolveLink; if (!resolve || !c.assets?.length) return [];
        const referenced = new Set(c.data.audioRefs.map(r => r.path)), groups = new Map<string, string[]>();
        let names: Map<string, number> | undefined;
        const unique = (name: string): boolean => { names ??= this.vault.assetFiles().reduce((m, f) => m.set(f.name.toLowerCase(), (m.get(f.name.toLowerCase()) ?? 0) + 1), new Map<string, number>()); return names.get(name.toLowerCase()) === 1; };
        for (const asset of c.assets) {
            const target = asset.role === 'audio' ? /^\[\[([^\]|#^]+)\]\]$/.exec(asset.link)?.[1] : undefined; if (!target) continue;
            const path = resolve(target, sourcePath); if (!path || !referenced.has(path) || this.recordingStatus(path).status !== 'available') continue;
            if (!target.includes('/') && !unique(target)) continue;
            groups.set(path, [...groups.get(path) ?? [], asset.link]);
        }
        return [...groups].filter(([path, links]) => links.length > 1 && links.includes(`[[${path}]]`)).map(([path, links]) => { const keep = `[[${path}]]`, first = links.indexOf(keep); return { path, keep, remove: links.filter((l, i) => l !== keep || i !== first) }; });
    }
    /** Explicit user action: one undo step; only the detected duplicate mirror links are removed. Files, UUIDs, notes and associations are untouched. */
    removeDuplicateMirrors(s: CanvasSession): number {
        checkActive(undefined, this.closed); let removed = 0; const source = s.base?.path ?? '';
        s.edit('Remove duplicate recording links', c => {
            const groups = this.duplicateMirrors(c, source); if (!groups.length || !c.assets) throw new FoundationError('invalid', 'No provable duplicate recording links remain. Nothing was changed.');
            const kept = new Set<string>(), drop = new Set(groups.map(g => g.path));
            const assets = c.assets.filter(a => { if (a.role !== 'audio') return true; const target = /^\[\[([^\]|#^]+)\]\]$/.exec(a.link)?.[1]; const path = target && this.resolveLink?.(target, source); const group = path && drop.has(path) ? groups.find(g => g.path === path) : undefined; if (!group || !group.remove.includes(a.link)) return true; if (a.link === group.keep && !kept.has(a.link)) { kept.add(a.link); return true; } removed++; return false; });
            return { ...c, assets };
        });
        return removed;
    }
    /** Vault-wide file events (create/delete/rename) for availability display; no reads. */
    subscribeFiles(listener: () => void): () => void { return this.vault.subscribe(() => listener()); }
    relinkSuggestion(c: Composition, sourcePath = ''): RelinkSuggestion | undefined { const exists = (p: string) => this.recordingStatus(p).status === 'available'; return relinkSuggestion(c, exists, link => this.resolveLink ? this.resolveLink(link, sourcePath) : exists(link) ? link : null); }
    /**
     * 4D: detects an external change that is ONLY Obsidian rewriting this note's recording links after a rename.
     * Read-only; works for clean and unsaved drafts; returns undefined for unchanged notes and anything not provably link-only.
     */
    async renameConflict(s: CanvasSession, signal?: AbortSignal): Promise<RenameOffer | undefined> {
        checkActive(signal, this.closed); const base = s.base; if (!base || base.entity.kind !== 'composition') return undefined;
        const record = await this.repository.read(base.entity.id, signal); checkActive(signal, this.closed);
        if (record.source === base.source || record.path !== base.path || s.base?.source !== base.source) return undefined;
        const exists = (p: string) => this.recordingStatus(p).status === 'available';
        const moves = linkOnlyRewrite(base.source, record.source, base.entity, s.draft, exists, link => this.resolveLink ? this.resolveLink(link, record.path) : exists(link) ? link : null);
        return moves ? { record, moves } : undefined;
    }
    /**
     * Explicit user action: relink the draft (one undo step) and adopt the rewritten note as the save base.
     * Re-verifies the note first; nothing is written to disk until the user saves.
     */
    async adoptRename(s: CanvasSession, offer: RenameOffer, signal?: AbortSignal): Promise<void> {
        checkActive(signal, this.closed); const fresh = await this.repository.read(offer.record.entity.id, signal); checkActive(signal, this.closed);
        if (fresh.source !== offer.record.source || s.base?.path !== fresh.path) throw new FoundationError('conflict', 'The note changed again since the rename was detected. Review it before retrying; nothing was changed.');
        for (const move of offer.moves) this.available(move.to);
        const relink = offer.moves.filter(m => m.referenceIds.length);
        if (relink.length) s.edit('Adopt renamed recordings', c => relink.reduce((next, m) => m.referenceIds.reduce((x, id) => relinkReference(x, id, m.to), next), c));
        s.adoptBase(fresh);
    }
    discard(s: CanvasSession): void { this.owners.delete(s); this.sessions.delete(s.draft.id.toLowerCase()); s.dispose(); }
    async checkpointAll(): Promise<void> { for (const s of this.drafts())
        await s.checkpoint(); }
    dispose(): void { this.closed = true; this.freshness.dispose(); this.capture.dispose();this.recovery.dispose(); for (const s of this.sessions.values())
        s.dispose(); this.sessions.clear(); this.owners.clear(); }
}
