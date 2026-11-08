import type { App } from 'obsidian';
import type { Composition, Entity, LibraryEntity, Motif } from '../domain/entities';
import type { CheckpointRecovery, RecoveryInspection, RecoveredDraft } from '../storage/recovery';
import { entryModule, entryTime, entryTitle, moduleOf, queryCatalog, type CatalogEntry, type CatalogQuery, type CheckpointType, type RecoveryCatalog, type RecoveryModule } from '../storage/recovery-catalog';
import { messageOf } from '../domain/errors';
import { musicalDuration } from '../music/durations';
import { musicalPosition } from '../music/positions';
import { button, element } from './dom';

const TYPES: CheckpointType[] = ['Unsaved draft of a saved record', 'Unsaved draft of a new record', 'Pre-save backup', 'Recovery copy', 'Unknown'];
const local = (time: number): string => new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const rowOf = (list: HTMLElement, path: string): HTMLElement | undefined => [...list.querySelectorAll<HTMLElement>('[data-path]')].find(e => e.dataset.path === path);
export interface RecoveryRegisterServices<T extends Entity, S> {
  recovery: CheckpointRecovery<T>; settings: { readOnly: boolean }; recover: (value: RecoveredDraft<T>) => S;
  /** 4I: the module hosting this register (its own checkpoints can be loaded here). */
  module?: RecoveryModule;
  /** 4I: other modules' recovery services, so their checkpoints are validated by their own rules (read-only here). */
  others?: Partial<Record<RecoveryModule, CheckpointRecovery<Entity>>>;
  /** 4I: open another module's recovery register with a checkpoint selected. */
  openIn?: (module: RecoveryModule, path: string) => void;
  /** 4I: whether an unsaved draft of this UUID is open in the host module (loading would be refused). */
  unsaved?: (id: string) => boolean;
}

/**
 * Recovery register (4I): a searchable, filterable, sortable, paginated list of every checkpoint in the documented Recovery
 * folders and a read-only inspector. Browsing and inspecting only read files; loading a draft goes through the module's
 * established prepare()/recover() path (consent for a changed source, refusal while an unsaved draft is open) and never
 * saves. Nothing is deleted, pruned, repaired or written.
 */
export class RecoveryInspector<T extends Entity, S> {
  private readonly lifetime = new AbortController();
  private generation = 0; private reading?: AbortController;
  private readonly catalog: RecoveryCatalog;
  private entries: CatalogEntry[] = [];
  private query: CatalogQuery = { search: '', module: 'all', type: 'all', document: 'all', sort: 'newest', page: 0, pageSize: 25 };
  private selected?: string;
  private readonly status: HTMLElement; private readonly progress: HTMLElement; private readonly list: HTMLElement; private readonly pager: HTMLElement;
  private readonly detail: HTMLElement; private readonly documents: HTMLSelectElement; private readonly panes: HTMLElement;
  /** Stacked layout: the panes are too narrow for list and inspector side by side (see the CSS grid minimum). */
  private narrow(): boolean { return this.panes.clientWidth > 0 && this.panes.clientWidth < 2 * 360 + 12; }
  private placeDetail(): void {
    const row = this.selected ? rowOf(this.list, this.selected)?.closest('li') : undefined;
    if (this.narrow() && row && this.detail.childElementCount) { if (this.detail.parentElement !== row) row.append(this.detail); }
    else if (this.detail.parentElement !== this.panes) this.panes.append(this.detail);
  }
  constructor(private readonly root: HTMLElement, private readonly services: RecoveryRegisterServices<T, S>,
    private readonly loaded: (session: S) => void, private readonly open: (path: string) => void, initialPath?: string) {
    root.classList.add('mnemobard-recovery-register');
    element(root, 'h3', 'Recovery register');
    element(root, 'p', 'Checkpoints are copies of pending drafts or pre-save versions. Browsing and inspecting never change anything; loading creates an unsaved draft. History is append-only: nothing is pruned or deleted.', 'mnemobard-hint');
    this.catalog = services.recovery.catalog();
    const controls = element(root, 'div', undefined, 'mnemobard-recovery-controls'); controls.setAttribute('role', 'search');
    const field = <K extends 'input' | 'select'>(label: string, tag: K): HTMLElementTagNameMap[K] => { const wrap = element(controls, 'label'); element(wrap, 'span', label); const e = element(wrap, tag); e.setAttribute('aria-label', label); return e; };
    const search = field('Search checkpoints', 'input'); search.type = 'search'; search.placeholder = 'Name, path, ID or date';
    search.addEventListener('input', () => this.change({ search: search.value }));
    const select = (label: string, options: [string, string][], key: keyof CatalogQuery, value = 'all'): HTMLSelectElement => { const s = field(label, 'select'); for (const [v, t] of options) element(s, 'option', t).value = v; s.value = value; s.addEventListener('change', () => this.change({ [key]: key === 'pageSize' ? Number(s.value) : s.value })); return s; };
    select('Module', [['all', 'All modules'], ['MOTIF', 'MOTIF'], ['CANVAS', 'CANVAS'], ['PATCHBOOK', 'PATCHBOOK'], ['Unknown', 'Unknown']], 'module');
    select('Checkpoint type', [['all', 'All types'], ...TYPES.map(t => [t, t] as [string, string])], 'type');
    this.documents = select('Original document', [['all', 'All documents']], 'document');
    const date = (label: string, key: 'from' | 'to'): void => { const d = field(label, 'input'); d.type = 'date'; d.addEventListener('change', () => this.change({ [key]: d.value || undefined })); };
    date('From date', 'from'); date('To date', 'to');
    select('Sort', [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name', 'Document name']], 'sort', 'newest');
    select('Page size', [['25', '25 per page'], ['50', '50 per page'], ['100', '100 per page']], 'pageSize', '25');
    const actions = element(root, 'div', undefined, 'mnemobard-actions');
    button(actions, 'Refresh list', () => { this.refresh(); });
    button(actions, 'Read all checkpoint details', () => { void this.readAll(); });
    this.progress = element(actions, 'span', '', 'mnemobard-hint'); this.progress.setAttribute('role', 'status');
    this.status = element(root, 'p', '', 'mnemobard-recovery-count'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    const panes = element(root, 'div', undefined, 'mnemobard-recovery-panes');
    const listPane = element(panes, 'div', undefined, 'mnemobard-recovery-list-pane');
    this.list = element(listPane, 'ol', undefined, 'mnemobard-recovery-list'); this.list.setAttribute('aria-label', 'Checkpoints');
    this.pager = element(listPane, 'nav', undefined, 'mnemobard-recovery-pager'); this.pager.setAttribute('aria-label', 'Checkpoint pages');
    this.detail = element(panes, 'section', undefined, 'mnemobard-recovery-detail'); this.detail.setAttribute('aria-label', 'Checkpoint inspector');
    this.panes = panes;
    // 4J: on narrow panes the inspector opens directly under its row (the place in the list is kept); beside it when wide.
    if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(() => this.placeDetail()); observer.observe(panes); this.lifetime.signal.addEventListener('abort', () => observer.disconnect()); }
    this.refresh();
    if (initialPath) void this.inspect(initialPath);
  }
  /** Tier-1 listing (no reads), then the visible page's details. */
  refresh(): void {
    this.entries = this.catalog.list();
    const known = new Map<string, string>();
    for (const e of this.entries) if (e.folderId && e.documentTitle) known.set(e.folderId.toLowerCase(), `${e.documentTitle} · ${entryModule(e)}`);
    const current = this.documents.value; this.documents.replaceChildren(); element(this.documents, 'option', 'All documents').value = 'all';
    for (const [id, name] of [...known].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))) element(this.documents, 'option', name).value = id;
    this.documents.value = known.has(current) ? current : 'all'; if (this.documents.value === 'all') this.query.document = 'all';
    this.render();
  }
  private change(next: Partial<CatalogQuery>): void { this.query = { ...this.query, ...next, page: 'page' in next ? next.page : 0 }; this.render(); }
  private render(): void {
    const generation = ++this.generation, result = queryCatalog(this.entries, this.query), total = this.entries.length;
    this.query.page = result.page;
    this.status.textContent = !total ? 'No checkpoints in documented Recovery folders.'
      : !result.total ? `No checkpoints match the search and filters (${plural(total, 'checkpoint')} in total).`
      : `Showing ${result.first}–${result.last} of ${plural(result.total, 'checkpoint')}${result.total === total ? '' : ` (filtered from ${total})`}`;
    if (result.unnamedUnmatched) this.status.textContent += ` · ${plural(result.unnamedUnmatched, 'checkpoint')} of documents that are not in the vault ${result.unnamedUnmatched === 1 ? 'was' : 'were'} matched by ID, path and date only (names not read yet); use Read all checkpoint details.`;
    if (result.unreadExcluded) this.status.textContent += ` · ${plural(result.unreadExcluded, 'checkpoint')} not read yet ${result.unreadExcluded === 1 ? 'is' : 'are'} not included by the type filter; use Read all checkpoint details.`;
    if (this.detail.parentElement !== this.panes) this.panes.append(this.detail);
    this.list.replaceChildren();
    for (const entry of result.rows) this.row(entry);
    this.placeDetail();
    if (total && !result.total) button(this.list, 'Clear search and filters', () => { this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.mnemobard-recovery-controls input, .mnemobard-recovery-controls select').forEach(e => { e.value = e.getAttribute('aria-label') === 'Sort' ? 'newest' : e.getAttribute('aria-label') === 'Page size' ? String(this.query.pageSize) : e instanceof HTMLSelectElement ? 'all' : ''; }); this.query = { ...this.query, search: '', module: 'all', type: 'all', document: 'all', from: undefined, to: undefined, page: 0 }; this.render(); });
    this.pager.replaceChildren();
    if (result.pages > 1) {
      const prev = button(this.pager, 'Previous page', () => this.change({ page: result.page - 1 })); prev.disabled = result.page === 0;
      element(this.pager, 'span', `Page ${result.page + 1} of ${result.pages}`).setAttribute('aria-current', 'page');
      const next = button(this.pager, 'Next page', () => this.change({ page: result.page + 1 })); next.disabled = result.page >= result.pages - 1;
    }
    // Details of visible rows only (bounded reads), then refresh those rows in place.
    const unread = result.rows.filter(e => !e.details);
    if (unread.length) void Promise.all(unread.map(e => this.catalog.details(e, this.lifetime.signal).catch(() => undefined))).then(() => { if (!this.lifetime.signal.aborted && generation === this.generation) this.rerenderRows(result.rows); });
  }
  private rerenderRows(rows: CatalogEntry[]): void {
    const focused = this.root.ownerDocument.activeElement?.closest('[data-path]')?.getAttribute('data-path');
    if (this.detail.parentElement !== this.panes) this.panes.append(this.detail); // keep the inspector while rows re-render
    this.list.replaceChildren(); for (const entry of rows) this.row(entry); this.placeDetail();
    if (focused) rowOf(this.list, focused)?.focus();
  }
  private row(entry: CatalogEntry): void {
    const item = element(this.list, 'li'), d = entry.details, module = entryModule(entry), name = entryTitle(entry) ?? (module === 'Unknown' ? 'Unknown document' : `Unnamed ${module} document`);
    const time = entryTime(entry), type = d ? d.type : 'Type not read yet', integrity = d ? d.integrity : '';
    const availability = entry.availability === 'ready' ? '' : entry.availability === 'missing' ? 'Original missing' : entry.availability === 'unknown' ? '' : `Original ${entry.availability}`;
    const b = button(item, '', () => { void this.inspect(entry.path); }); b.classList.add('mnemobard-recovery-row'); b.dataset.path = entry.path; b.dataset.module = module;
    if (d) b.dataset.integrity = d.integrity;
    element(b, 'strong', name);
    const draftName = d?.draftTitle && d.draftTitle !== entry.documentTitle && d.draftTitle !== name ? `draft titled “${d.draftTitle}”` : '';
    element(b, 'span', [module, local(time), type, draftName, integrity !== 'Readable' ? integrity : '', availability].filter(Boolean).join(' · '), 'mnemobard-recovery-meta');
    b.setAttribute('aria-label', `${name}. ${[module, `checkpoint ${local(time)}`, type, draftName, integrity, availability].filter(Boolean).join(', ')}. Inspect checkpoint.`);
    if (entry.path === this.selected) b.setAttribute('aria-current', 'true');
  }
  private async readAll(): Promise<void> {
    this.reading?.abort(); const job = new AbortController(); this.reading = job; const signal = AbortSignal.any([job.signal, this.lifetime.signal]);
    const stop = button(this.progress.parentElement ?? this.root, 'Stop reading', () => job.abort()); let last = 0;
    try {
      await this.catalog.readAll(this.entries, signal, (done, total) => { this.progress.textContent = `Read ${done} of ${total} checkpoint details`; if (done - last >= 50 || done === total) { last = done; this.render(); } });
      this.progress.textContent = 'All checkpoint details read.';
    } catch (error) { if (!this.lifetime.signal.aborted) this.progress.textContent = job.signal.aborted ? 'Reading stopped; details read so far are kept.' : messageOf(error); }
    finally { stop.remove(); if (!this.lifetime.signal.aborted) this.render(); }
  }
  /** The module-specific validator for a checkpoint (its owning module's rules), or the host's. */
  private owner(module: RecoveryModule): CheckpointRecovery<Entity> { return (module === this.services.module ? undefined : this.services.others?.[module]) ?? (this.services.recovery as unknown as CheckpointRecovery<Entity>); }
  private async inspect(path: string): Promise<void> {
    const generation = ++this.generation, entry = this.entries.find(e => e.path === path) ?? this.catalog.list().find(e => e.path === path);
    if (!entry) { this.status.textContent = 'That checkpoint is no longer in a documented Recovery folder. Refresh the list.'; return; }
    this.selected = path; this.list.querySelectorAll('[aria-current]').forEach(e => e.removeAttribute('aria-current')); rowOf(this.list, path)?.setAttribute('aria-current', 'true');
    this.detail.replaceChildren(); element(this.detail, 'p', 'Reading checkpoint…', 'mnemobard-hint');
    try {
      const details = await this.catalog.details(entry, this.lifetime.signal), module = moduleOf(entry.documentKind ?? details.kind);
      const inspection = details.integrity === 'Too large to inspect' ? undefined : await this.owner(module).inspect(path, this.lifetime.signal);
      if (this.lifetime.signal.aborted || generation !== this.generation) return;
      this.renderDetail(entry, module, inspection); this.placeDetail();
      this.detail.scrollIntoView?.({ block: 'nearest' }); // stacked (narrow) layouts: bring the inspector into view
    } catch (error) { if (!this.lifetime.signal.aborted) { this.detail.replaceChildren(); element(this.detail, 'p', messageOf(error), 'mnemobard-library-issues'); } }
  }
  private renderDetail(entry: CatalogEntry, module: RecoveryModule, inspection: RecoveryInspection<Entity> | undefined): void {
    const root = this.detail, d = entry.details, host = this.services.module; root.replaceChildren();
    const draft = inspection?.draft, name = draft?.title || entryTitle(entry) || 'Unknown document', time = entryTime(entry);
    element(root, 'h4', name);
    const valid = !!draft && inspection?.sourceStatus !== 'unreadable';
    const integrity = !inspection ? `${d?.integrity ?? 'Unreadable'}${d?.problem ? ` — ${d.problem}` : ''}` : valid ? 'Valid checkpoint' : `Cannot be safely interpreted — ${inspection.diagnostic ?? d?.problem ?? 'unknown reason'}`;
    const availability = inspection?.sourceStatus === 'unchanged' ? 'Available · unchanged since this checkpoint' : inspection?.sourceStatus === 'changed' ? 'Available · changed after this checkpoint (conflict)'
      : inspection?.sourceStatus === 'new' ? 'Never saved (new record)' : entry.availability === 'ready' ? 'Available' : entry.availability === 'unknown' ? 'Unknown' : entry.availability === 'missing' ? 'Missing · the original note is unavailable' : `Unavailable (${entry.availability})`;
    const summary = element(root, 'dl', undefined, 'mnemobard-recovery-summary'); summary.setAttribute('aria-label', 'Checkpoint summary');
    const fact = (term: string, value: string): HTMLElement => { element(summary, 'dt', term); return element(summary, 'dd', value); };
    fact('Module', module); fact('Checkpoint time', local(time)); fact('Type', d?.type ?? 'Unknown');
    fact('Original path', inspection?.current?.path ?? entry.documentPath ?? d?.sourcePath ?? 'Not recorded'); fact('Original document', availability);
    fact('Integrity', integrity).dataset.integrity = valid ? 'valid' : 'problem';
    // Established source-status wording (unchanged since 1B), in words, never colour alone.
    const states = { unchanged: 'Authoritative source unchanged since checkpoint.', changed: 'CONFLICT: authoritative source changed after this checkpoint. Compare all versions before loading.', new: 'New unsaved record; no authoritative note exists.', unavailable: 'Authoritative record unavailable. Resolve missing or duplicate identity before loading.', unreadable: 'Checkpoint is inspection-only.' };
    if (inspection) element(root, 'p', states[inspection.sourceStatus], 'mnemobard-recovery-status');
    if (d?.invalidFields) fact('Note', 'Stored while some form values were invalid; the draft must be corrected before it can be saved.');
    if (draft) this.preview(root, draft);
    // What recovering would mean, and the actions that are actually supported.
    const status = inspection?.sourceStatus, own = !!host && module === host;
    const meaning = !valid ? 'This checkpoint is kept unchanged and can be opened as a file for inspection. It cannot be loaded.'
      : status === 'unavailable' ? 'The original document is unavailable. The checkpoint is kept; no replacement document is created. Restore or resolve the original first.'
      : status === 'changed' ? 'The saved note changed after this checkpoint. Loading requires confirming the current note as the save base; both versions are kept.'
      : status === 'new' ? 'This record was never saved. Loading creates an unsaved draft; nothing is written until you save it.'
      : 'Loading creates an unsaved draft with this content. The saved note and this checkpoint stay unchanged until you explicitly save.';
    element(root, 'p', meaning, 'mnemobard-recovery-meaning');
    const actions = element(root, 'div', undefined, 'mnemobard-actions'); actions.setAttribute('role', 'group'); actions.setAttribute('aria-label', 'Checkpoint actions');
    if (own && valid && draft && ['new', 'unchanged', 'changed'].includes(status ?? '') && inspection) this.loadAction(actions, inspection as unknown as RecoveryInspection<T>, draft.id);
    else if (valid && module !== 'Unknown' && module !== host && this.services.openIn) button(actions, `Open in ${module} recovery`, () => this.services.openIn?.(module, entry.path));
    const original = inspection?.current?.path ?? (entry.availability === 'ready' ? entry.documentPath : undefined);
    if (original) button(actions, 'Open original document', () => this.open(original));
    button(actions, 'Open checkpoint file', () => this.open(entry.path));
    button(actions, 'Close inspector', () => { root.replaceChildren(); this.selected = undefined; this.placeDetail(); const row = rowOf(this.list, entry.path); row?.removeAttribute('aria-current'); row?.focus(); });
    // Technical details: identifiers, exact timestamps and the stored texts.
    const technical = element(root, 'details', undefined, 'mnemobard-recovery-technical'); element(technical, 'summary', 'Technical details');
    const tech = element(technical, 'dl'); const t = (term: string, value?: string): void => { if (value) { element(tech, 'dt', term); element(tech, 'dd', value); } };
    t('Checkpoint ID', entry.checkpointId); t('Checkpoint file', entry.path); t('Document UUID', d?.entityId ?? entry.folderId); t('Saved at (ISO)', d?.savedAt); t('File modified (ISO)', new Date(entry.modified).toISOString());
    t('File size', `${entry.size.toLocaleString()} bytes`); t('Format', d?.format); t('Reason', d?.reason); t('Source status', inspection?.sourceStatus);
    if (inspection) {
      this.text(technical, 'Original checkpoint JSON', inspection.raw);
      if (inspection.originalSource) this.text(technical, 'Saved source at checkpoint', inspection.originalSource);
      if (inspection.current) this.text(technical, 'Current authoritative source', inspection.current.source);
      if (draft) this.text(technical, 'Recoverable draft', JSON.stringify(draft, null, 2));
    }
  }
  private preview(root: HTMLElement, draft: Entity): void {
    const box = element(root, 'dl', undefined, 'mnemobard-recovery-preview'); box.setAttribute('aria-label', 'Checkpoint content');
    const fact = (term: string, value?: string | number): void => { if (value !== undefined && value !== '') { element(box, 'dt', term); element(box, 'dd', String(value)); } };
    if (draft.kind === 'motif') {
      const m = draft as Motif, d = m.data, notes = d.notes;
      fact('Motif', m.title || 'Untitled motif'); fact('Notes', notes.length); fact('Length', musicalDuration(d.lengthTicks, d.ppq, d.meter));
      fact('Tempo', `${+(60_000_000 / d.tempoMicrosecondsPerQuarter).toFixed(2)} BPM`); fact('Time signature', `${d.meter.numerator}/${d.meter.denominator}`); fact('PPQ', d.ppq);
      if (notes.length) { let first = Infinity, last = 0; for (const n of notes) { first = Math.min(first, n.startTick); last = Math.max(last, n.startTick + n.durationTicks); } fact('Notes span', `${musicalPosition(first, d.ppq, d.meter)} – ${musicalPosition(last, d.ppq, d.meter)} (bar:beat:tick)`); }
    } else if (draft.kind === 'composition') {
      const c = draft as Composition, d = c.data, clips = d.lanes.flatMap(l => l.clips), motifs = [...new Set(clips.map(clip => clip.motifId.toLowerCase()))];
      const unresolved = motifs.filter(id => this.catalog.status(id) !== 'ready');
      fact('Composition', c.title || 'Untitled composition'); fact('Lanes', d.lanes.length); fact('Clips', clips.length); fact('Referenced motifs', motifs.length);
      fact('Length', musicalDuration(d.lengthTicks, d.ppq, d.meter)); fact('Tempo', `${+(60_000_000 / d.tempoMicrosecondsPerQuarter).toFixed(2)} BPM`); fact('Time signature', `${d.meter.numerator}/${d.meter.denominator}`); fact('PPQ', d.ppq);
      fact('Unresolved references', unresolved.length ? `${plural(unresolved.length, 'motif')} not found or ambiguous` : 'None');
    } else {
      const l = draft as LibraryEntity, instrument = l.kind === 'patch' ? l.instrument || (l.instrumentId ? this.catalog.title(l.instrumentId) ?? l.instrumentId : undefined) : undefined;
      fact(l.kind === 'patch' ? 'Patch' : l.kind === 'instrument' ? 'Instrument' : 'Effects chain', l.title || 'Untitled record'); fact('Instrument or synthesizer', instrument);
      fact('Tags', l.tags?.length ? l.tags.join(', ') : 'None'); fact('Referenced assets', l.assets?.length ?? 0);
      if (l.kind === 'patch') fact('Associated motifs (saved)', this.catalog.referencing(l.id, 'motif'));
      if (l.kind === 'effects-chain') fact('Stages', l.steps.length);
    }
  }
  private loadAction(actions: HTMLElement, inspection: RecoveryInspection<T>, id: string): void {
    if (this.services.unsaved?.(id)) { element(actions, 'p', 'An unsaved draft of this document is open. Save or explicitly discard it first; loading is refused so it is never replaced.', 'mnemobard-library-issues'); return; }
    let reviewed: HTMLInputElement | undefined;
    if (inspection.sourceStatus === 'changed') {
      const label = element(actions, 'label', undefined, 'mnemobard-recovery-consent');
      reviewed = element(label, 'input'); reviewed.type = 'checkbox';
      const text = 'I compared the versions. Use the displayed current source as the save base for this recovered draft.';
      reviewed.setAttribute('aria-label', text); element(label, 'span', text);
    }
    const load = button(actions, 'Load draft without saving', () => { void restore(); }, 'mod-cta'); load.disabled = this.services.settings.readOnly || !!reviewed;
    reviewed?.addEventListener('change', () => { load.disabled = !reviewed?.checked || this.services.settings.readOnly; });
    const restore = async (): Promise<void> => {
      load.disabled = true;
      try {
        const draft = await this.services.recovery.prepare(inspection, reviewed?.checked ?? false, this.lifetime.signal);
        if (this.lifetime.signal.aborted) return;
        this.loaded(this.services.recover(draft));
      } catch (error) { if (!this.lifetime.signal.aborted) { this.status.textContent = messageOf(error); load.disabled = this.services.settings.readOnly || (!!reviewed && !reviewed.checked); } }
    };
  }
  private text(parent: HTMLElement, label: string, value: string): void {
    const details = element(parent, 'details'); element(details, 'summary', label);
    const area = element(details, 'textarea'); area.readOnly = true; area.rows = 8; area.value = value.slice(0, 65536); area.setAttribute('aria-label', label);
    if (value.length > 65536) element(details, 'p', 'Display limited to 64 Ki characters. Open the checkpoint file for all content; it remains unchanged.');
  }
  dispose(): void { this.lifetime.abort(); this.reading?.abort(); this.generation++; this.root.replaceChildren(); this.root.classList.remove('mnemobard-recovery-register'); }
}
/** 4I: cross-module links for a register hosted in one module (validation by each owning module; open its register). */
export function recoveryLinks(services: { motifs: { recovery: CheckpointRecovery<Motif> }; canvas: { recovery: CheckpointRecovery<Composition> }; recovery: CheckpointRecovery<LibraryEntity> }, open: (module: RecoveryModule, path: string) => Promise<void>, fail: (error: unknown) => void): Pick<RecoveryRegisterServices<Entity, unknown>, 'others' | 'openIn'> {
  return { others: { MOTIF: services.motifs.recovery, CANVAS: services.canvas.recovery, PATCHBOOK: services.recovery } as Partial<Record<RecoveryModule, CheckpointRecovery<Entity>>>, openIn: (module, path) => { void open(module, path).catch(fail); } };
}
/** 4I: leave the current module (its leave() checkpoints a dirty draft), open `module` and show its register at `path`. */
export async function openModuleRecovery(app: App, modules: { enabled(type: 'patchbook' | 'motif' | 'canvas'): boolean; open(type: 'patchbook' | 'motif' | 'canvas'): Promise<void> }, leave: () => Promise<void>, module: RecoveryModule, path: string): Promise<void> {
  const type = module === 'MOTIF' ? 'motif' : module === 'CANVAS' ? 'canvas' : module === 'PATCHBOOK' ? 'patchbook' : undefined;
  if (!type) return; if (!modules.enabled(type)) throw Error(`${module} is disabled. Enable it in settings to load this checkpoint.`);
  await leave(); await modules.open(type);
  const leaf = app.workspace.getLeavesOfType(`mnemobard-${type}`)[0]; await leaf?.loadIfDeferred();
  const view = leaf?.view as { openRecovery?: (path: string) => void } | undefined; view?.openRecovery?.(path);
}
