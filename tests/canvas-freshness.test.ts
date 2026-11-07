import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { updateEntityDocument } from '../src/storage/document';
import { CanvasLibrary } from '../src/modules/canvas/library';
import { externalChanges } from '../src/modules/canvas/freshness';
import { addLane, renameLane } from '../src/modules/canvas/commands';
import { addMarker, addSection, updateSection } from '../src/modules/canvas/structure';
import type { Composition } from '../src/domain/entities';
import { MemoryVault, deferred } from './support/memory-vault';
import { motif } from './support/arrangement-fixtures';

/** Milestone 4E: conflict-safe freshness of open CANVAS sessions against their authoritative notes. */
const disposals: (() => void)[] = []; afterEach(() => { for (const fn of disposals.splice(0)) fn(); });
const section = '00000000-0000-4000-8000-00000000f001';
async function fixture() {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), library = new CanvasLibrary(index, repository, vault); await index.start();
  disposals.push(() => { library.dispose(); repository.dispose(); index.dispose(); });
  const source = await repository.create(motif()), session = library.create(); session.edit('lane', c => addLane(c, 'Melody'));
  const lane = session.draft.data.lanes[0]; if (!lane) throw Error('lane');
  library.place(session, lane.id, source.entity.id, 0, 2); session.edit('section', c => addSection(c, { label: 'Intro', startTick: 0, endTick: 3840 }, section));
  await session.save(); await index.settled();
  const clip = session.draft.data.lanes[0]?.clips[0]; if (!clip) throw Error('clip');
  return { vault, index, repository, library, session, source, path: session.base?.path ?? '', laneId: lane.id, clipId: clip.id };
}
type F = Awaited<ReturnType<typeof fixture>>;
/** Another editor rewrites the note through the same Markdown codec (unknown frontmatter/body preserved). */
function external(f: F, change: (c: Composition) => Composition): string {
  const current = f.vault.files.get(f.path) ?? '', disk = baseFromDisk(f); if (!disk) throw Error('note');
  const next = updateEntityDocument(current, current, change(disk));
  f.vault.modify(f.path, next); return next;
}
function baseFromDisk(f: F): Composition | undefined { const head = f.index.resolve(f.session.draft.id); return head.status === 'ready' ? head.entity as Composition : undefined; }
const settled = async (f: F, state: string) => { await f.index.settled(); await vi.waitFor(() => expect(f.session.freshness.state).toBe(state)); };

describe('externalChanges', () => {
  it('names organizational and musical areas with the 4D denylist (unknown fields stay musical)', async () => {
    const f = await fixture(), c = f.session.draft;
    expect(externalChanges(c, updateSection(c, section, { label: 'Verse' }))).toEqual({ areas: ['sections'], musical: false });
    expect(externalChanges(c, { ...c, notes: 'x' })).toEqual({ areas: ['description, tags and notes'], musical: false });
    expect(externalChanges(c, renameLane(c, f.laneId, 'Lead'))).toMatchObject({ areas: ['clips and lanes'], musical: true });
    expect(externalChanges(c, { ...c, data: { ...c.data, tempoMicrosecondsPerQuarter: 400000 } })).toMatchObject({ areas: ['tempo, meter and length'], musical: true });
    expect(externalChanges(c, { ...c, data: { ...c.data, futureField: 1 } as Composition['data'] })).toEqual({ areas: ['other fields'], musical: true });
  });
});

describe('clean sessions', () => {
  it('refresh a metadata-only external edit without an undo entry and keep the selection', async () => {
    const f = await fixture(); f.session.selectedLane = f.laneId; f.session.selectedClip = f.clipId; const motifSource = f.vault.files.get(f.source.path);
    const disk = external(f, c => updateSection(c, section, { label: 'Verse' })); await settled(f, 'refreshed');
    expect(f.session.freshness).toEqual({ state: 'refreshed', areas: ['sections'], musical: false });
    expect(f.session.draft.data.sections[0]?.label).toBe('Verse'); expect(f.session.base?.source).toBe(disk); expect(f.session.dirty).toBe(false);
    expect(f.session.canUndo).toBe(false); expect(f.session.historySize).toBe(0);
    expect(f.session.selectedLane).toBe(f.laneId); expect(f.session.selectedClip).toBe(f.clipId);
    expect(f.vault.files.get(f.source.path)).toBe(motifSource);
  });
  it('refresh a musical external edit and report it as musical; a deleted selected clip clears safely', async () => {
    const f = await fixture(); f.session.selectedLane = f.laneId; f.session.selectedClip = f.clipId;
    external(f, c => ({ ...c, data: { ...c.data, lanes: c.data.lanes.map(l => ({ ...l, clips: [] })) } })); await settled(f, 'refreshed');
    expect(f.session.freshness).toMatchObject({ musical: true, areas: ['clips and lanes'] });
    expect(f.session.draft.data.lanes[0]?.clips).toEqual([]); expect(f.session.selectedClip).toBeUndefined(); expect(f.session.selectedLane).toBe(f.laneId);
  });
  it('an own Save is not an external change (no reload, no conflict, history kept)', async () => {
    const f = await fixture(); f.session.edit('Rename section', c => updateSection(c, section, { label: 'Mine' })); const history = f.session.historySize;
    const reads = f.vault.reads.length; await f.session.save(); await f.index.settled(); await vi.waitFor(() => expect(f.session.freshness.state).toBe('current'));
    expect(f.session.historySize).toBe(history); expect(f.session.canUndo).toBe(true); expect(f.session.draft.data.sections[0]?.label).toBe('Mine');
    expect(f.vault.reads.length - reads).toBeLessThanOrEqual(3); // save's own protected read + index refresh; no freshness re-read
  });
  it('rapid successive edits and a stale slow read converge on the latest note', async () => {
    // Read 1 of the note is the index re-read; read 2 is the freshness re-read, which is held until newer edits have been applied.
    const f = await fixture(), gate = deferred(); let reads = 0;
    f.vault.delayRead = async path => { if (path === f.path && ++reads === 2) await gate.promise; };
    external(f, c => updateSection(c, section, { label: 'One' })); await f.index.settled(); await new Promise(r => setTimeout(r, 0)); expect(reads).toBe(2);
    f.vault.delayRead = undefined; external(f, c => updateSection(c, section, { label: 'Two' })); const latest = external(f, c => updateSection(c, section, { label: 'Three' }));
    await f.index.settled(); await vi.waitFor(() => expect(f.session.draft.data.sections[0]?.label).toBe('Three'));
    gate.resolve(); await f.index.settled(); await new Promise(r => setTimeout(r, 10));
    expect(f.session.draft.data.sections[0]?.label).toBe('Three'); expect(f.session.base?.source).toBe(latest); expect(f.session.historySize).toBe(0);
  });
});

describe('dirty sessions', () => {
  it('never replace the draft: conflict is flagged, history/base kept, protected Save refuses and stores recovery', async () => {
    const f = await fixture(); f.session.edit('Mine', c => updateSection(c, section, { label: 'Mine' })); const history = f.session.historySize, base = f.session.base?.source, draft = JSON.stringify(f.session.draft);
    external(f, c => ({ ...c, notes: 'Changed elsewhere' })); await settled(f, 'conflict');
    expect(f.session.freshness).toMatchObject({ state: 'conflict', areas: ['description, tags and notes'], musical: false, rename: false });
    expect(JSON.stringify(f.session.draft)).toBe(draft); expect(f.session.historySize).toBe(history); expect(f.session.base?.source).toBe(base);
    f.session.undo(); f.session.redo(); expect(f.session.draft.data.sections[0]?.label).toBe('Mine');
    await expect(f.session.save()).rejects.toThrow('changed elsewhere'); expect(f.session.recoveryPath).toMatch(/^MNEMOBARD\/Recovery\//);
    await f.index.settled(); await new Promise(r => setTimeout(r, 0)); expect(f.session.freshness.state).toBe('conflict'); expect(f.vault.files.get(f.path)).toContain('Changed elsewhere');
  });
  it('classify musical external changes and clear the conflict when the note returns to the base', async () => {
    const f = await fixture(), original = f.vault.files.get(f.path) ?? ''; f.session.edit('Mine', c => addMarker(c, { label: 'Cue', tick: 960 }));
    external(f, c => renameLane(c, f.laneId, 'Elsewhere')); await settled(f, 'conflict'); expect(f.session.freshness).toMatchObject({ musical: true });
    f.vault.modify(f.path, original); await settled(f, 'current'); expect(f.session.draft.data.markers).toHaveLength(1);
    await f.session.save(); expect(f.vault.files.get(f.path)).toContain('Cue');
  });
  it('an external edit during an internal Save leaves a protected conflict, never a silent overwrite', async () => {
    const f = await fixture(); f.session.edit('Mine', c => updateSection(c, section, { label: 'Mine' }));
    f.vault.beforeProcess = path => { if (path === f.path) { f.vault.beforeProcess = undefined; f.vault.files.set(f.path, (f.vault.files.get(f.path) ?? '') + '\nExternal line\n'); f.vault.emit({ type: 'modify', path }); } };
    await expect(f.session.save()).rejects.toThrow(/changed/); await settled(f, 'conflict');
    expect(f.vault.files.get(f.path)).toContain('External line'); expect(f.session.draft.data.sections[0]?.label).toBe('Mine'); expect(f.session.dirty).toBe(true);
  });
});

describe('invalid, deleted and moved notes', () => {
  it('malformed or future-schema notes never replace a valid draft (read-only, no rewrite)', async () => {
    const f = await fixture(), original = f.vault.files.get(f.path) ?? '', draft = JSON.stringify(f.session.draft);
    f.vault.modify(f.path, original.replace('"lanes"', '"lanes" "broken')); await settled(f, 'unavailable');
    expect(f.session.freshness).toMatchObject({ reason: 'invalid' }); expect(JSON.stringify(f.session.draft)).toBe(draft);
    const future = original.replace('mnemobard_schema: 1', 'mnemobard_schema: 2'); expect(future).not.toBe(original);
    f.vault.modify(f.path, future); await f.index.settled(); await vi.waitFor(() => expect(f.session.freshness).toMatchObject({ state: 'unavailable', message: expect.stringContaining('schema') }));
    expect(JSON.stringify(f.session.draft)).toBe(draft); await expect(f.session.save()).rejects.toThrow();
    expect(f.vault.files.get(f.path)).toBe(future);
    f.vault.modify(f.path, original); await settled(f, 'current'); expect(JSON.stringify(f.session.draft)).toBe(draft);
  });
  it('a deleted note keeps the draft, blocks Save and never creates a replacement note', async () => {
    const f = await fixture(); f.session.edit('Mine', c => updateSection(c, section, { label: 'Mine' }));
    f.vault.files.delete(f.path); f.vault.emit({ type: 'delete', path: f.path }); await settled(f, 'unavailable');
    expect(f.session.freshness).toMatchObject({ reason: 'missing' }); const notes = f.vault.markdownPaths().length;
    await expect(f.session.save()).rejects.toThrow('not found'); expect(f.vault.markdownPaths()).toHaveLength(notes); expect(f.session.draft.data.sections[0]?.label).toBe('Mine');
  });
  it('a renamed note is followed by UUID (not by file name) and Save writes to the new path', async () => {
    const f = await fixture(); f.session.edit('Mine', c => updateSection(c, section, { label: 'Mine' }));
    f.vault.rename(f.path, 'Elsewhere/Renamed.md'); await f.index.settled(); await vi.waitFor(() => expect(f.session.base?.path).toBe('Elsewhere/Renamed.md'));
    expect(f.session.freshness.state).toBe('current'); expect(f.session.dirty).toBe(true);
    await f.session.save(); expect(f.vault.files.has(f.path)).toBe(false); expect(f.vault.files.get('Elsewhere/Renamed.md')).toContain('Mine');
  });
  it('disposed sessions and libraries ignore late notifications', async () => {
    const f = await fixture(), gate = deferred(); f.vault.delayRead = async path => { if (path === f.path) await gate.promise; };
    external(f, c => updateSection(c, section, { label: 'Late' })); await new Promise(r => setTimeout(r, 0));
    const session = f.session; f.library.discard(session); f.vault.delayRead = undefined; gate.resolve(); await f.index.settled(); await new Promise(r => setTimeout(r, 0));
    expect(session.disposed).toBe(true); expect(session.freshness.state).not.toBe('refreshed');
  });
});
