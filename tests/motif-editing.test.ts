import { afterEach, describe, expect, it } from 'vitest';
import { createEntity, type Motif } from '../src/domain/entities';
import { validateEntity } from '../src/domain/validation';
import { createEntityDocument, parseEntityDocument } from '../src/storage/document';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { MotifLibrary } from '../src/modules/motif/library';
import { addNote, changeNotes, deleteNotes, duplicateNotes, editableMotif, gridTicks, moveNotes, resizeNotes, snapped } from '../src/modules/motif/commands';
import { MemoryVault, deferred } from './support/memory-vault';
const closers: (() => void)[] = []; afterEach(() => { for (const close of closers.splice(0)) close(); });
function phrase(): Motif { const m = createEntity('motif', 'Phrase'); return addNote(m, { pitch: 60, startTick: 17, durationTicks: 239, velocity: 73 }); }
async function fixture() {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), library = new MotifLibrary(index, repository, vault);
  closers.push(() => { library.dispose(); repository.dispose(); index.dispose(); }); const base = await repository.create(phrase()), session = await library.open(base.entity.id); return { vault, index, repository, library, base, session };
}
describe('motif domain and precise commands', () => {
  it('creates stable notes, chords, polyphony and spanning notes without changing the source', () => {
    const m = phrase(), next = addNote(addNote(m, { pitch: 64, startTick: 17, durationTicks: 1900, velocity: 100 }), { pitch: 67, startTick: 17, durationTicks: 1000, velocity: 110 });
    expect(next.data.notes).toHaveLength(3); expect(m.data.notes).toHaveLength(1); expect(new Set(next.data.notes.map(note => note.id)).size).toBe(3); expect(validateEntity(next)).toEqual(next);
  });
  it.each([{ pitch: -1 }, { pitch: 128 }, { velocity: 0 }, { velocity: 128 }, { startTick: -1 }, { durationTicks: 0 }, { durationTicks: -1 }, { durationTicks: .5 }, { startTick: Number.MAX_SAFE_INTEGER }, { pitch: NaN }])('rejects invalid notes %j without clamping', change => {
    expect(() => addNote(createEntity('motif', 'M'), { pitch: 60, startTick: 0, durationTicks: 120, velocity: 96, ...change })).toThrow();
  });
  it.each([{ ppq: 0 }, { ppq: 32768 }, { tempoMicrosecondsPerQuarter: 0 }, { tempoMicrosecondsPerQuarter: 199999 }, { meter: { numerator: 0, denominator: 4 } }, { meter: { numerator: 4, denominator: 3 } }, { lengthTicks: 0 }])('rejects invalid musical metadata %j', data => {
    const m = phrase(); expect(() => editableMotif({ ...m, data: { ...m.data, ...data } })).toThrow();
  });
  it('keeps the existing same-pitch overlap restriction explicit', () => { const m = phrase(); expect(() => addNote(m, { pitch: 60, startTick: 20, durationTicks: 10, velocity: 96 })).toThrow('overlapping'); });
  it('moves a group as one operation preserving off-grid phase and original IDs', () => {
    const m = addNote(phrase(), { pitch: 64, startTick: 100, durationTicks: 100, velocity: 96 }), ids = new Set(m.data.notes.map(note => note.id));
    const moved = moveNotes(m, ids, 240, 2); expect(moved.data.notes.map(note => note.startTick)).toEqual([257, 340]); expect(moved.data.notes.map(note => note.pitch)).toEqual([62, 66]); expect(moved.data.notes.map(note => note.id)).toEqual([...ids]);
    expect(() => moveNotes(m, ids, -100, 0)).toThrow(); expect(m.data.notes[0]?.startTick).toBe(17);
  });
  it('resizes without changing starts; invalid group changes preserve all originals', () => {
    const m = phrase(), ids = new Set(m.data.notes.map(note => note.id)); expect(resizeNotes(m, ids, 240).data.notes[0]).toMatchObject({ startTick: 17, durationTicks: 479 });
    expect(() => resizeNotes(m, ids, -239)).toThrow(); expect(m.data.notes[0]?.durationTicks).toBe(239);
  });
  it('duplicates independently after the selected bounding end and deletes only selected IDs', () => {
    const m = phrase(), ids = new Set(m.data.notes.map(note => note.id)), copy = duplicateNotes(m, ids);
    expect(copy.motif.data.notes[1]).toMatchObject({ startTick: 256, durationTicks: 239, pitch: 60 }); expect(copy.ids[0]).not.toBe(m.data.notes[0]?.id);
    expect(deleteNotes(copy.motif, new Set(copy.ids)).data.notes).toEqual(m.data.notes);
  });
  it('uses exact integral grids and predictable midpoint snapping without editing notes', () => {
    const m = phrase(), before = structuredClone(m); expect(gridTicks(960, 'quarter')).toBe(960); expect(gridTicks(960, 'eighth')).toBe(480); expect(gridTicks(960, 'sixteenth')).toBe(240); expect(gridTicks(960, 'triplet')).toBe(320);
    expect(snapped(120, 960, 'sixteenth')).toBe(240); expect(snapped(17, 1000, 'off')).toBe(17); expect(() => gridTicks(1000, 'triplet')).toThrow('fractional'); expect(m).toEqual(before);
  });
  it('preserves unknown timing data but blocks unsupported map editing/playback rather than flattening', () => {
    const m = phrase(); m.data.tempoMap = [{ tick: 0, tempo: 500000 }]; expect(parseEntityDocument(createEntityDocument(m))?.entity).toEqual(m); expect(() => editableMotif(m)).toThrow('tempoMap');
  });
  it('round-trips optional metadata and exact PPQ with unknown fields/prose preserved', async () => {
    const { repository, base, vault } = await fixture(), entity = phrase(); entity.data.ppq = 1000; entity.description = 'A line'; entity.notes = 'User context'; entity.extra.custom = { keep: true }; entity.data.future = 'retained';
    const created = await repository.create(entity); vault.modify(created.path, created.source + '\nUntouched prose\n'); const current = await repository.read(created.entity.id);
    const saved = await repository.save(current, { ...current.entity, title: 'Renamed' }); expect(saved.source).toContain('Untouched prose'); expect(saved.entity).toMatchObject({ description: 'A line', notes: 'User context', data: { ppq: 1000, future: 'retained' }, extra: { custom: { keep: true } } }); expect(saved.entity.id).not.toBe(base.entity.id);
  });
});
describe('motif session history, persistence and recovery', () => {
  it('undoes/redoes every note operation, with selection and history scoped per UUID', async () => {
    const { library, session } = await fixture(); const original = session.draft, ids = new Set(original.data.notes.map(note => note.id)); session.select(ids);
    session.edit('Move', m => moveNotes(m, ids, 240, 1)); session.edit('Resize', m => resizeNotes(m, ids, 240)); session.edit('Velocity', m => changeNotes(m, ids, note => ({ ...note, velocity: 30 })));
    expect(session.historySize).toBe(3); session.undo(); expect(session.draft.data.notes[0]?.velocity).toBe(73); session.undo(); session.undo(); expect(session.draft).toEqual(original); expect(session.dirty).toBe(false);
    session.redo(); session.redo(); session.redo(); expect(session.draft.data.notes[0]).toMatchObject({ startTick: 257, durationTicks: 479, velocity: 30 });
    const other = library.create(); expect(other.canUndo).toBe(false); expect(other.selected.size).toBe(0);
  });
  it('groups a drag at commit, clears redo on new edits and bounds history', async () => {
    const { session } = await fixture(), ids = new Set(session.draft.data.notes.map(note => note.id));
    for (let i = 0; i < 20; i++) moveNotes(session.draft, ids, i, 0); expect(session.historySize).toBe(0);
    session.edit('Drag', m => moveNotes(m, ids, 240, 0)); expect(session.historySize).toBe(1); session.undo(); expect(session.canRedo).toBe(true); session.edit('New branch', m => moveNotes(m, ids, 120, 0)); expect(session.canRedo).toBe(false);
    for (let i = 0; i < 120; i++) session.edit('Velocity', m => changeNotes(m, ids, note => ({ ...note, velocity: i % 100 + 1 }))); expect(session.historySize).toBe(100);
  });
  it('keeps history across Save and repeated open, but not an explicit external reload', async () => {
    const { session, library, repository, vault } = await fixture(); session.edit('Title', m => ({ ...m, title: 'Saved phrase' })); await session.save(); expect(session.canUndo).toBe(true); expect(await library.open(session.draft.id)).toBe(session);
    session.undo(); expect(session.dirty).toBe(true); session.redo(); await session.save(); const record = await repository.read(session.draft.id); vault.modify(record.path, record.source + '\nExternal prose\n'); await library.open(session.draft.id); expect(session.canUndo).toBe(false);
  });
  it('preserves newer input during a pending save and makes conflicts recoverable without discarding history', async () => {
    const { session, vault, base } = await fixture(); session.edit('Title', m => ({ ...m, title: 'Draft' })); vault.modify(base.path, base.source + '\nExternal\n');
    await expect(session.save()).rejects.toThrow('changed elsewhere'); expect(session.canUndo).toBe(true); expect(session.draft.title).toBe('Draft'); await session.checkpoint(); expect(session.recoveryPath && vault.files.has(session.recoveryPath)).toBe(true); expect(vault.files.get(base.path)).toContain('External');
  });
  it('handles write failure before/after submission and retains recovery originals', async () => {
    for (const failure of ['before', 'after'] as const) {
      const { session, vault, base } = await fixture(); session.edit('Title', m => ({ ...m, title: 'Unconfirmed' })); vault.failProcess = failure;
      await expect(session.save()).rejects.toThrow('Inspect the current note'); expect(session.dirty).toBe(true); expect([...vault.files.values()].some(text => text.includes('originalSource') && text.includes('Unconfirmed'))).toBe(true);
      expect(vault.files.get(base.path)?.includes('Unconfirmed')).toBe(failure === 'after');
    }
  });
  it('discovers musical checkpoints only through MOTIF, inspects and loads without changing sources', async () => {
    const { session, library, vault, base } = await fixture(); session.edit('Title', m => ({ ...m, title: 'Recover me' })); await session.checkpoint(); const path = session.recoveryPath; if (!path) throw Error('No checkpoint');
    const checkpoint = vault.files.get(path); library.discard(session); const inspected = await library.recovery.inspect(path); expect(inspected.sourceStatus).toBe('unchanged');
    const restored = library.recover(await library.recovery.prepare(inspected, false)); expect(restored.dirty).toBe(true); expect(vault.files.get(base.path)).toBe(base.source); await restored.save(); expect(vault.files.get(path)).toBe(checkpoint); expect(restored.draft.title).toBe('Recover me');
  });
  it('requires explicit changed-source review and still rejects a later edit', async () => {
    const { session, library, vault, base } = await fixture(); session.edit('Title', m => ({ ...m, title: 'Recover conflict' })); await session.checkpoint(); const path = session.recoveryPath; if (!path) throw Error(); library.discard(session); vault.modify(base.path, base.source + '\nFirst external\n');
    const inspected = await library.recovery.inspect(path); await expect(library.recovery.prepare(inspected, false)).rejects.toThrow('Compare both'); const restored = library.recover(await library.recovery.prepare(inspected, true)); vault.modify(base.path, base.source + '\nSecond external\n'); await expect(restored.save()).rejects.toThrow('changed elsewhere');
  });
  it('supports rename identity, duplicates, future schemas and disposed-session guards', async () => {
    const { session, library, index, vault, base } = await fixture(); vault.rename(base.path, 'Renamed phrase.md'); await index.settled(); expect((await library.open(base.entity.id)).base?.path).toBe('Renamed phrase.md');
    vault.modify('Duplicate.md', base.source); await index.settled(); await expect(library.open(base.entity.id)).rejects.toThrow('Duplicate');
    vault.files.delete('Duplicate.md'); vault.emit({ type: 'delete', path: 'Duplicate.md' }); vault.modify('Renamed phrase.md', base.source.replace('mnemobard_schema: 1', 'mnemobard_schema: 99')); await index.settled(); await expect(library.open(base.entity.id)).rejects.toThrow();
    library.dispose(); expect(() => session.undo()).toThrow('closed'); await expect(library.open(base.entity.id)).rejects.toThrow('closed');
  });
  it('cancels pending checkpoint completions after disposal', async () => {
    const { session, vault } = await fixture(), waiting = deferred<void>(); vault.delayRead = () => waiting.promise;
    session.edit('Title', m => ({ ...m, title: 'Late' })); session.dispose(); expect(() => session.edit('Bad', m => m)).toThrow('closed'); waiting.resolve();
  });
});

it('recognizes the saved state after undo despite serialization property ordering',async()=>{
 const{library}=await fixture(),session=library.create();session.edit('Metadata',m=>({...m,description:'Description',notes:'Notes',tags:['a']}));await session.save();session.edit('Title',m=>({...m,title:'Changed'}));expect(session.dirty).toBe(true);session.undo();expect(session.dirty).toBe(false);expect(session.status).toBe('Saved');
});
