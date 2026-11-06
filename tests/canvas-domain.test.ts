import { afterEach, expect, it } from 'vitest';
import { createEntity } from '../src/domain/entities';
import { validateEntity } from '../src/domain/validation';
import { createEntityDocument, parseEntityDocument } from '../src/storage/document';
import { summarizeSource, type SourceState } from '../src/arrangement/sources';
import { sourcePeriod, clipExtent, repetitionBoundary } from '../src/arrangement/timing';
import { resolveArrangement } from '../src/arrangement/preflight';
import { addLane, renameLane, reorderLane, deleteLane, placeClip, editClip, duplicateClip, deleteClip } from '../src/modules/canvas/commands';
import { CanvasLibrary } from '../src/modules/canvas/library';
import { MotifLibrary } from '../src/modules/motif/library';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { contentRevision } from '../src/storage/content-revision';
import { MemoryVault } from './support/memory-vault';
const close: (() => void)[] = [];
afterEach(() => { for (const fn of close.splice(0))
    fn(); });
const revision = 'a'.repeat(64);
function source(ppq = 960, start = 0, duration = 240, length = 3840) { const motif = createEntity('motif', 'Source'); motif.data = { ...motif.data, ppq, lengthTicks: length, notes: [{ id: 'n', pitch: 60, startTick: start, durationTicks: duration, velocity: 80 }] }; return summarizeSource(motif, revision, 'Source.md'); }
function composition() { const c = addLane(createEntity('composition', 'Composition'), 'Melody'); c.data.lengthTicks = 50000; return c; }
async function fixture() { const vault = new MemoryVault(), index = new EntityIndex(vault), repo = new EntityRepository(vault, index), motifs = new MotifLibrary(index, repo, vault), library = new CanvasLibrary(index, repo, vault, id => motifs.isDirty(id)); close.push(() => { library.dispose(); motifs.dispose(); repo.dispose(); index.dispose(); }); await index.start(); return { vault, index, repo, library, motifs }; }
it('roundtrips compatible schema1 extensions and retains existing assigned-channel records', () => { let c = composition(); c = placeClip(c, c.data.lanes[0]?.id ?? '', source(), 0, 2); const lane = c.data.lanes[0]; if (!lane)
    throw Error(); expect(lane.midiChannel).toBeUndefined(); expect(lane.id).toMatch(/^[0-9a-f-]{36}$/); expect(lane.clips[0]?.laneId).toBe(lane.id); c.description = 'Arrangement'; c.extra.custom = { keep: true }; c.data.future = 'kept'; lane.extra = { retain: 1 }; expect(parseEntityDocument(createEntityDocument(c))?.entity).toEqual(c); lane.midiChannel = 2; expect(validateEntity(c)).toEqual(c); const copy = structuredClone(c); copy.data.lanes[0]?.clips.push({ ...lane.clips[0], id: lane.clips[0]?.id ?? '', motifId: source().id, startTick: 0, repeatCount: 1 }); expect(() => validateEntity(copy)).toThrow('duplicate'); if (copy.data.lanes[0])
    copy.data.lanes[0].clips = []; copy.data.schemaVersion = 99 as 1; expect(() => validateEntity(copy)).toThrow('schema'); });
it('creates32 unallocated lanes with stable array ordering and rejects duplicate/inconsistent IDs', () => { let c = createEntity('composition', 'Many'); for (let i = 0; i < 32; i++)
    c = addLane(c, 'Lane' + i); expect(c.data.lanes).toHaveLength(32); expect(() => addLane(c, 'Too many')).toThrow(); const ids = c.data.lanes.map(l => l.id); c = reorderLane(c, ids[0] ?? '', 1); expect(c.data.lanes[1]?.id).toBe(ids[0]); c = renameLane(c, ids[0] ?? '', 'Renamed'); expect(c.data.lanes[1]?.name).toBe('Renamed'); expect(() => reorderLane(c, ids[1] ?? '', -1)).toThrow(); const lane = c.data.lanes[0]; if (!lane)
    throw Error(); lane.clips = [{ id: 'clip', laneId: 'different', motifId: source().id, startTick: 0, repeatCount: 1 }]; expect(() => validateEntity(c)).toThrow('laneId'); });
it.each([[960, 0, 240, 3840, 3840], [1000, 25, 25, 1000, 960], [480, 1, 1, 480, 960], [3, 1, 1, 3, 960]])('converts all required endpoints exactly at source PPQ%i', (ppq, start, duration, length, expected) => { expect(sourcePeriod(source(ppq, start, duration, length))).toBe(expected); expect(clipExtent(960, expected, 4)).toEqual({ durationTicks: expected * 4, endTick: 960 + expected * 4 }); expect(repetitionBoundary(960, expected, 4, 3)).toBe(960 + expected * 3); });
it('rejects an inexact note endpoint even when total source length converts exactly', () => { expect(() => sourcePeriod(source(1000, 1, 25, 1000))).toThrow('No rounding'); expect(() => sourcePeriod(source(1000, 25, 25, 1001))).toThrow('No rounding'); });
it('uses complete trailing silence and allows an empty saved motif as a positive rest', () => { const m = createEntity('motif', 'Rest'); m.data.lengthTicks = 7680; const s = summarizeSource(m, revision, 'Rest.md'); expect(sourcePeriod(s)).toBe(7680); const c = composition(), placed = placeClip(c, c.data.lanes[0]?.id ?? '', s, 0, 1), plan = resolveArrangement(placed, () => ({ status: 'ready', source: s })); expect(plan.clips[0]?.durationTicks).toBe(7680); expect(plan.diagnostics.some(d => d.code === 'empty-source')).toBe(true); });
it.each([[0, 960, 1], [-1, 960, 1], [0, 0, 1], [0, -1, 1], [0, 960, 0], [0, 960, 1001], [Number.MAX_SAFE_INTEGER, 960, 1], [999999999, 960, 1000]])('rejects invalid/unsafe extent %i/%i/%i', (start, period, count) => { if (start === 0 && period === 960 && count === 1)
    expect(clipExtent(start, period, count).durationTicks).toBe(960);
else
    expect(() => clipExtent(start, period, count)).toThrow(); });
it.each([{ numerator: 4, denominator: 4 }, { numerator: 6, denominator: 8 }, { numerator: 3, denominator: 4 }])('keeps musical periods independent of composition meter %j', meter => { const c = composition(); c.data.lengthTicks = 100000; c.data.meter = meter; const s = source(); const p = resolveArrangement(placeClip(c, c.data.lanes[0]?.id ?? '', s, 960, 4), () => ({ status: 'ready', source: s })); expect(p.clips[0]?.endTick).toBe(16320); expect(p.exportReady).toBe(false); });
it('preserves overlaps and parametric repeats without embedding musical notes', () => { const s = source(); let c = composition(); c.data.lengthTicks = 50000; c = placeClip(c, c.data.lanes[0]?.id ?? '', s, 0, 4); c = placeClip(c, c.data.lanes[0]?.id ?? '', s, 960, 2); const p = resolveArrangement(c, () => ({ status: 'ready', source: s })); expect(p.diagnostics.some(d => d.code === 'clip-overlap')).toBe(true); expect(JSON.stringify(c)).not.toContain('durationTicks'); expect(c.data.lanes[0]?.clips[0]?.repeatCount).toBe(4); expect(p.referencesReady).toBe(true); });
it('makes lane/clip transactions and failure rejection undoable through shared history', async () => { const { library } = await fixture(), session = library.create(); session.edit('lane', c => addLane(c, 'A')); const lane = session.draft.data.lanes[0]?.id ?? '', s = source(); session.edit('place', c => placeClip(c, lane, s, 0, 1)); const clip = session.draft.data.lanes[0]?.clips[0]?.id ?? '', before = session.draft; expect(() => session.edit('delete', c => deleteLane(c, lane, false))).toThrow('Confirm'); expect(session.draft).toEqual(before); const history = session.historySize; session.edit('move', c => editClip(c, clip, lane, 960, 2, 'Verse', s)); expect(session.historySize).toBe(history + 1); session.undo(); expect(session.draft).toEqual(before); session.redo(); expect(session.draft.data.lanes[0]?.clips[0]?.startTick).toBe(960); session.edit('duplicate', c => duplicateClip(c, clip, s)); expect(session.draft.data.lanes[0]?.clips).toHaveLength(2); session.edit('remove', c => deleteClip(c, clip)); session.undo(); expect(session.draft.data.lanes[0]?.clips).toHaveLength(2); session.edit('delete lane', c => deleteLane(c, lane, true)); expect(session.draft.data.lanes).toHaveLength(0); session.undo(); expect(session.draft.data.lanes).toHaveLength(1); });
it('resolves missing/malformed/future/duplicate/archived sources without dropping clips', () => { const s = source(), base = composition(), c = placeClip(base, base.data.lanes[0]?.id ?? '', s, 0, 1), before = structuredClone(c); for (const status of ['missing', 'malformed', 'unsupported', 'duplicate', 'wrong-kind', 'archived'] as const) {
    const state: SourceState = { status, paths: ['Source.md'] }, p = resolveArrangement(c, () => state);
    expect(p.clips).toHaveLength(1);
    expect(p.clips[0]?.id).toBe(c.data.lanes[0]?.clips[0]?.id);
    expect(p.diagnostics.some(d => d.code === status)).toBe(true);
    expect(p.referencesReady).toBe(false);
} expect(c).toEqual(before); });
it('uses saved source-text SHA256 across rename, change, draft edits and explicit review', async () => {
    const { vault, index, repo, library, motifs } = await fixture(), m = createEntity('motif', 'Live');
    m.data.lengthTicks = 3840;
    const record = await repo.create(m), session = library.create();
    session.edit('lane', c => addLane(c, 'Lane'));
    const lane = session.draft.data.lanes[0]?.id ?? '';
    library.place(session, lane, m.id, 0, 2);
    const clip = session.draft.data.lanes[0]?.clips[0];
    if (!clip)
        throw Error();
    expect(clip.sourceRevision).toHaveLength(64);
    await session.save();
    const saved = await repo.read(session.draft.id);
    vault.rename(record.path, 'Moved motif.md');
    await index.settled();
    let plan = library.plan(session.draft);
    expect(plan.diagnostics.some(d => d.code === 'moved')).toBe(true);
    expect(plan.diagnostics.some(d => d.code === 'changed')).toBe(false);
    const musical = await motifs.open(m.id);
    musical.edit('draft', value => ({ ...value, title: 'Pending source' }));
    expect(library.plan(session.draft).diagnostics.some(d => d.code === 'unsaved-source')).toBe(true);
    expect(library.source(m.id).title).toBe('Live');
    await musical.save();
    plan = library.plan(session.draft);
    expect(plan.diagnostics.some(d => d.code === 'changed')).toBe(true);
    expect(plan.clips[0]?.source?.title).toBe('Pending source');
    expect(() => library.review(session, clip.id, clip.sourceRevision ?? '')).toThrow('during review');
    library.review(session, clip.id, library.source(m.id).revision);
    expect(library.plan(session.draft).diagnostics.some(d => d.code === 'changed')).toBe(false);
    session.undo();
    expect(library.plan(session.draft).diagnostics.some(d => d.code === 'changed')).toBe(true);
    expect((await repo.read(session.draft.id)).source).toBe(saved.source);
    vault.files.delete('Moved motif.md');
    await index.refresh('Moved motif.md');
    session.edit('name', c => ({ ...c, title: 'Still savable' }));
    await session.save();
    expect(session.draft.data.lanes[0]?.clips).toHaveLength(1);
    expect(library.plan(session.draft).diagnostics.some(d => d.code === 'missing')).toBe(true);
});
it('has a stable known SHA256 and detects source-text changes', async () => { expect(await contentRevision('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); expect(await contentRevision('abc\n')).not.toBe(await contentRevision('abc')); });
it('keeps Markdown/unknown data safe on conflict, failure, recovery and future schema', async () => { const { vault, index, repo, library } = await fixture(), c = composition(); c.description = 'Structure'; c.extra.custom = { retain: true }; const record = await repo.create(c); vault.modify(record.path, record.source + '\nUser prose\n'); await index.settled(); const session = await library.open(c.id); session.edit('title', c => ({ ...c, title: 'Pending' })); await session.checkpoint(); const path = session.recoveryPath; if (!path)
    throw Error(); expect((await library.recovery.inspect(path)).draft?.title).toBe('Pending'); vault.modify(record.path, (vault.files.get(record.path) ?? '') + '\nExternal edit\n'); await expect(session.save()).rejects.toThrow('changed'); expect(vault.files.get(record.path)).toContain('External edit'); expect(session.draft.title).toBe('Pending'); library.discard(session); const fresh = await library.open(c.id); fresh.edit('title', c => ({ ...c, title: 'Saved' })); await fresh.save(); expect(fresh.base?.source).toContain('User prose'); expect(fresh.draft.extra.custom).toEqual({ retain: true }); vault.failProcess = 'before'; fresh.edit('title', c => ({ ...c, title: 'Failed' })); await expect(fresh.save()).rejects.toThrow(); expect(vault.files.get(record.path)).toContain('title: Saved'); expect(fresh.recoveryPath).toBeDefined(); vault.failProcess = undefined; const raw = vault.files.get(record.path) ?? ''; vault.modify(record.path, raw.replace('mnemobard_schema: 1', 'mnemobard_schema: 99')); await index.settled(); library.discard(fresh); await expect(library.open(c.id)).rejects.toThrow('schema'); expect(vault.files.get(record.path)).toContain('mnemobard_schema: 99'); });
it('invalidates saved summaries for actual duplicate/future/malformed/archive sources and preserves them on unrelated index changes', async () => { const { vault, index, repo, library } = await fixture(), motif = createEntity('motif', 'Catalog'), record = await repo.create(motif), first = library.source(motif.id); expect('notes' in first).toBe(false); await repo.create(createEntity('instrument', 'Unrelated')); expect(library.source(motif.id)).toBe(first); await vault.create('Duplicate.md', record.source); await index.settled(); expect(library.sources.get(motif.id).status).toBe('duplicate'); vault.files.delete('Duplicate.md'); await index.refresh('Duplicate.md'); vault.modify(record.path, record.source.replace('mnemobard_schema: 1', 'mnemobard_schema: 99')); await index.settled(); expect(library.sources.get(motif.id).status).toBe('unsupported'); vault.modify(record.path, record.source.replace('"ppq": 960', '"ppq": "bad"')); await index.settled(); expect(library.sources.get(motif.id).status).toBe('malformed'); vault.modify(record.path, record.source); await index.settled(); const original = await repo.read(motif.id); await repo.save(original, { ...original.entity, extra: { mnemobard_archived: true } }); expect(library.sources.get(motif.id).status).toBe('archived'); });
it('cannot place, duplicate or repeat incompatible/out-of-range sources and preserves existing clip data after source growth', async () => { const { library } = await fixture(), session = library.create(); session.edit('lane', c => addLane(c, 'A')); const lane = session.draft.data.lanes[0]?.id ?? '', good = source(); session.edit('place', c => placeClip(c, lane, good, 0, 1)); const before = session.draft; expect(() => session.edit('bad', c => placeClip(c, lane, source(1000, 1, 25, 1000), 0, 1))).toThrow('No rounding'); expect(session.draft).toEqual(before); const clip = before.data.lanes[0]?.clips[0]; if (!clip)
    throw Error(); const grown = { ...good, lengthTicks: 960 * 512, endpointQuantum: 960 }; const plan = resolveArrangement(before, () => ({ status: 'ready', source: grown })); expect(plan.diagnostics.some(d => d.code === 'beyond-end')).toBe(true); expect(plan.clips[0]?.id).toBe(clip.id); expect(() => duplicateClip(before, clip.id, grown)).toThrow('exceeds'); expect(session.draft).toEqual(before); });
it('persists explicit clip-label removal without restoring owned fields or dropping unknown clip metadata', async () => {
    const { library, repo } = await fixture(), session = library.create(), savedSource = source();
    session.edit('Lane', c => addLane(c, 'A'));
    const laneId = session.draft.data.lanes[0]?.id ?? '';
    session.edit('Clip', c => placeClip(c, laneId, savedSource, 0, 1));
    const id = session.draft.data.lanes[0]?.clips[0]?.id ?? '';
    session.edit('Label', c => {
        const next = editClip(c, id, laneId, 0, 1, 'Verse', savedSource);
        const clip = next.data.lanes[0]?.clips[0];
        if (clip) clip.future = { retained: true };
        return next;
    });
    await session.save();
    session.edit('Clear label', c => editClip(c, id, laneId, 0, 1, '', savedSource));
    await session.save();
    const record = await repo.read(session.draft.id);
    if (record.entity.kind !== 'composition') throw Error('Expected composition');
    expect(record.entity.data.lanes[0]?.clips[0]?.label).toBeUndefined();
    expect(record.entity.data.lanes[0]?.clips[0]?.future).toEqual({ retained: true });
    session.undo();
    expect(session.draft.data.lanes[0]?.clips[0]?.label).toBe('Verse');
});
