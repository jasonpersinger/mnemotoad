import { describe, expect, it } from 'vitest';
import type { Composition } from '../src/domain/entities';
import { validateEntity } from '../src/domain/validation';
import { createEntityDocument, parseEntityDocument, updateEntityDocument } from '../src/storage/document';
import { musicalPosition, positionTick } from '../src/music/positions';
import { compileArrangement } from '../src/arrangement/compiler';
import { exportArrangement } from '../src/arrangement/export';
import { CanvasSession } from '../src/modules/canvas/session';
import { addLane } from '../src/modules/canvas/commands';
import {
  addSection, updateSection, moveSection, swapSection, deleteSection, orderedSections, sectionOverlaps, sectionAt,
  addMarker, updateMarker, deleteMarker, orderedMarkers,
  addReference, updateReference, relinkReference, removeReference, relinkSuggestion, recordingPath, defaultAnchor, STRUCTURE_LIMITS,
} from '../src/modules/canvas/structure';
import { captured, composition as arrangement, motif, revision, uuid } from './support/arrangement-fixtures';

const BAR = 3840;
function base(): Composition { const c = addLane(arrangement([]), 'Lane'); c.data.lengthTicks = BAR * 32; const lane = c.data.lanes[0]; if (lane) lane.id = uuid(4000); return validateEntity(c) as Composition; }
const id = (n: number) => uuid(5000 + n);
function sections(): Composition {
  let c = base();
  c = addSection(c, { label: 'Introduction', startTick: 0, endTick: BAR * 4 }, id(1));
  c = addSection(c, { label: 'Theme A', startTick: BAR * 4, endTick: BAR * 12 }, id(2));
  return addSection(c, { label: 'Outro', startTick: BAR * 16, endTick: BAR * 20 }, id(3));
}
function session(c: Composition): CanvasSession {
  return new CanvasSession(c, undefined, { save: () => Promise.reject(Error('unused')), checkpoint: () => Promise.resolve('unused') }, 60_000);
}
const roundTrip = (c: Composition): Composition => { const parsed = parseEntityDocument(createEntityDocument(c)); if (parsed?.entity.kind !== 'composition') throw Error('not a composition'); return parsed.entity; };

describe('sections', () => {
  it('creates, renames, moves, resizes and deletes with stable identities', () => {
    let c = sections();
    expect(orderedSections(c).map(s => s.label)).toEqual(['Introduction', 'Theme A', 'Outro']);
    c = updateSection(c, id(2), { label: '  Theme B  ' });
    expect(c.data.sections.find(s => s.id === id(2))?.label).toBe('Theme B');
    c = moveSection(c, id(3), BAR * 13);
    expect(c.data.sections.find(s => s.id === id(3))).toMatchObject({ startTick: BAR * 13, endTick: BAR * 17 });
    c = updateSection(c, id(3), { endTick: BAR * 18 });
    expect(c.data.sections.find(s => s.id === id(3))).toMatchObject({ startTick: BAR * 13, endTick: BAR * 18 });
    c = deleteSection(c, id(1));
    expect(c.data.sections.map(s => s.id)).toEqual([id(2), id(3)]);
    expect(c.data.lanes).toEqual(base().data.lanes);
  });
  it('allows adjacency and gaps but rejects overlap atomically without moving neighbours', () => {
    const c = sections();
    expect(() => addSection(c, { label: 'Bridge', startTick: BAR * 12, endTick: BAR * 16 })).not.toThrow();
    expect(() => addSection(c, { label: 'Bad', startTick: BAR * 11, endTick: BAR * 13 })).toThrow('Overlaps section “Theme A”');
    expect(() => updateSection(c, id(1), { endTick: BAR * 4 + 1 })).toThrow('Overlaps section “Theme A”');
    expect(() => moveSection(c, id(3), BAR * 10)).toThrow('never overlap');
    expect(c).toEqual(sections());
  });
  it('rejects invalid bounds, empty names and out-of-range positions', () => {
    const c = sections();
    expect(() => addSection(c, { label: 'Zero', startTick: BAR * 25, endTick: BAR * 25 })).toThrow('after its start');
    expect(() => addSection(c, { label: 'Late', startTick: BAR * 30, endTick: BAR * 33 })).toThrow('within the composition');
    expect(() => addSection(c, { label: 'Neg', startTick: -1, endTick: 10 })).toThrow('within the composition');
    expect(() => addSection(c, { label: 'Frac', startTick: 0.5, endTick: 10 })).toThrow('within the composition');
    expect(() => addSection(c, { label: '   ', startTick: BAR * 25, endTick: BAR * 26 })).toThrow('Name the section');
    expect(() => addSection(c, { label: 'x'.repeat(STRUCTURE_LIMITS.label + 1), startTick: BAR * 25, endTick: BAR * 26 })).toThrow('limited');
  });
  it('reorders by exchanging timeline order while keeping durations and the gap', () => {
    let c = sections();
    c = swapSection(c, id(3), -1);
    const byId = (n: number) => c.data.sections.find(s => s.id === id(n));
    expect(byId(3)).toMatchObject({ startTick: BAR * 4, endTick: BAR * 8 });
    expect(byId(2)).toMatchObject({ startTick: BAR * 12, endTick: BAR * 20 });
    expect(orderedSections(c).map(s => s.label)).toEqual(['Introduction', 'Outro', 'Theme A']);
    expect(() => swapSection(c, id(1), -1)).toThrow('first section');
  });
  it('diagnoses (but still loads) overlapping sections written by another tool', () => {
    const c = sections(); c.data.sections.push({ id: 'external', label: 'Foreign', startTick: BAR, endTick: BAR * 5 });
    expect(validateEntity(c)).toBeTruthy();
    expect(sectionOverlaps(c).map(([a, b]) => [a.label, b.label])).toEqual([['Introduction', 'Foreign'], ['Foreign', 'Theme A']]);
    expect(sectionAt(sections(), BAR * 4)?.label).toBe('Theme A');
    expect(sectionAt(sections(), BAR * 14)).toBeUndefined();
  });
  it.each([[{ numerator: 4, denominator: 4 }, '5:1:0'], [{ numerator: 3, denominator: 4 }, '6:2:0'], [{ numerator: 6, denominator: 8 }, '6:3:0']])('displays exact one-based positions in %j', (meter, expected) => {
    const c = sections(); c.data.meter = meter;
    const theme = c.data.sections.find(s => s.id === id(2));
    expect(musicalPosition(theme?.startTick ?? -1, c.data.ppq, meter)).toBe(expected);
    expect(positionTick(expected, c.data.ppq, meter)).toBe(BAR * 4);
  });
  it('undoes and redoes each operation as one history entry; failed edits add none', () => {
    const s = session(base());
    s.edit('Add section', c => addSection(c, { label: 'Intro', startTick: 0, endTick: BAR }, id(1)));
    s.edit('Resize section', c => updateSection(c, id(1), { endTick: BAR * 2 }));
    expect(() => s.edit('Add section', c => addSection(c, { label: 'Clash', startTick: BAR, endTick: BAR * 3 }))).toThrow('Overlaps');
    expect(s.historySize).toBe(2);
    s.undo(); expect(s.draft.data.sections[0]?.endTick).toBe(BAR);
    s.undo(); expect(s.draft.data.sections).toEqual([]);
    s.redo(); s.redo(); expect(s.draft.data.sections[0]).toMatchObject({ id: id(1), endTick: BAR * 2 });
    s.dispose();
  });
});

describe('markers', () => {
  function markers(): Composition {
    let c = base();
    c = addMarker(c, { label: 'Ending', tick: BAR * 31 }, id(11));
    c = addMarker(c, { label: 'Choir', tick: BAR * 8 }, id(12));
    c = addMarker(c, { label: 'Build', tick: BAR * 8 }, id(13));
    return addMarker(c, { label: 'Final chord', tick: BAR * 32 }, id(14));
  }
  it('creates, renames, moves and deletes; the composition end is a valid marker position', () => {
    let c = markers();
    expect(c.data.markers.find(m => m.id === id(14))?.tick).toBe(c.data.lengthTicks);
    c = updateMarker(c, id(11), { label: 'Coda', tick: BAR * 30 });
    expect(c.data.markers.find(m => m.id === id(11))).toMatchObject({ label: 'Coda', tick: BAR * 30 });
    c = deleteMarker(c, id(12));
    expect(c.data.markers.map(m => m.id)).toEqual([id(11), id(13), id(14)]);
    expect(() => addMarker(c, { label: 'Past', tick: c.data.lengthTicks + 1 })).toThrow('within the composition');
  });
  it('keeps duplicate positions distinct with deterministic order', () => {
    const c = markers(), shuffled = { ...c, data: { ...c.data, markers: [...c.data.markers].reverse() } };
    expect(orderedMarkers(c).map(m => m.label)).toEqual(['Build', 'Choir', 'Ending', 'Final chord']);
    expect(orderedMarkers(shuffled)).toEqual(orderedMarkers(c));
    const twins = addMarker(addMarker(base(), { label: 'Same', tick: 0 }, id(21)), { label: 'Same', tick: 0 }, id(20));
    expect(orderedMarkers(twins).map(m => m.id)).toEqual([id(20), id(21)]);
  });
  it('undoes marker moves as single entries', () => {
    const s = session(markers());
    s.edit('Move marker', c => updateMarker(c, id(12), { tick: BAR * 9 }));
    s.edit('Move marker', c => updateMarker(c, id(12), { tick: BAR * 10 }));
    s.undo(); expect(s.draft.data.markers.find(m => m.id === id(12))?.tick).toBe(BAR * 9);
    s.undo(); expect(s.draft.data.markers.find(m => m.id === id(12))?.tick).toBe(BAR * 8);
    s.dispose();
  });
});

describe('recording references', () => {
  const path = 'Field/station.wav';
  function refs(): Composition {
    let c = sections();
    c = addMarker(c, { label: 'Cue', tick: BAR * 6 }, id(30));
    c = addReference(c, { label: 'Station', path, description: 'Platform ambience', sectionId: id(2) }, id(40));
    return addReference(c, { label: 'Voice memo', path: 'Memos/hum.m4a', markerId: id(30) }, id(41));
  }
  it('stores metadata, defaults the anchor from associations and mirrors a frontmatter link', () => {
    const c = refs(), station = c.data.audioRefs.find(r => r.id === id(40)), memo = c.data.audioRefs.find(r => r.id === id(41));
    expect(station).toMatchObject({ path, label: 'Station', description: 'Platform ambience', sectionId: id(2), atTick: BAR * 4 });
    expect(memo).toMatchObject({ markerId: id(30), atTick: BAR * 6 });
    expect(defaultAnchor(c)).toBe(0);
    expect(c.assets).toEqual([{ role: 'audio', link: `[[${path}]]` }, { role: 'audio', link: '[[Memos/hum.m4a]]' }]);
  });
  it.each(['../outside.wav', '/home/user/a.wav', 'C:/a.wav', 'file:///a.wav', 'Assets/notes.md', 'Assets/no-extension', 'Assets/a.wav ', 'Assets/[x].wav'])('rejects unsafe or non-audio path %s', bad => {
    expect(() => recordingPath(bad)).toThrow();
    expect(() => addReference(base(), { label: 'Bad', path: bad })).toThrow();
  });
  it('edits metadata, associations and anchor; clearing optional text removes the field', () => {
    let c = refs();
    c = updateReference(c, id(40), { label: 'Night station', description: '', sectionId: '', markerId: id(30), atTick: BAR * 7 });
    const station = c.data.audioRefs.find(r => r.id === id(40));
    expect(station).toMatchObject({ label: 'Night station', markerId: id(30), atTick: BAR * 7 });
    expect(station && 'description' in station).toBe(false);
    expect(station && 'sectionId' in station).toBe(false);
    expect(() => updateReference(c, id(40), { sectionId: 'missing-section' })).toThrow('no longer exists');
  });
  it('clears only the association when its section or marker is deleted', () => {
    const c = deleteMarker(deleteSection(refs(), id(2)), id(30));
    expect(c.data.audioRefs.map(r => [r.id, r.sectionId, r.markerId, r.path])).toEqual([[id(40), undefined, undefined, path], [id(41), undefined, undefined, 'Memos/hum.m4a']]);
  });
  it('relinks and removes references without touching other references or files', () => {
    let c = addReference(refs(), { label: 'Station again', path }, id(42));
    c = relinkReference(c, id(40), 'Field/station-2.wav');
    expect(c.data.audioRefs.find(r => r.id === id(40))).toMatchObject({ path: 'Field/station-2.wav', description: 'Platform ambience', sectionId: id(2) });
    expect(c.assets?.map(a => a.link)).toEqual([`[[${path}]]`, '[[Memos/hum.m4a]]', '[[Field/station-2.wav]]']);
    c = removeReference(c, id(42));
    expect(c.assets?.map(a => a.link)).toEqual(['[[Memos/hum.m4a]]', '[[Field/station-2.wav]]']);
    c = removeReference(removeReference(c, id(40)), id(41));
    expect(c.data.audioRefs).toEqual([]);
    expect(c.assets).toBeUndefined();
    expect(() => relinkReference(refs(), id(40), path)).toThrow('already points');
  });
  it('preserves a user-authored non-mirror frontmatter link on removal', () => {
    const c = refs(); c.assets = [...(c.assets ?? []), { role: 'audio', link: '[[station.wav]]' }, { role: 'image', link: '[[cover.png]]' }];
    expect(removeReference(c, id(40)).assets?.map(a => a.link)).toEqual(['[[Memos/hum.m4a]]', '[[station.wav]]', '[[cover.png]]']);
  });
  it('suggests a relink only for one unambiguous rewritten mirror link', () => {
    const c = refs(), renamed = { ...c, assets: [{ role: 'audio' as const, link: '[[Field/renamed station.wav]]' }, { role: 'audio' as const, link: '[[Memos/hum.m4a]]' }] };
    const files = new Set(['Field/renamed station.wav', 'Memos/hum.m4a']);
    expect(relinkSuggestion(renamed, p => files.has(p), l => l)).toEqual({ referenceIds: [id(40)], from: path, to: 'Field/renamed station.wav' });
    expect(relinkSuggestion(c, p => p === path || p === 'Memos/hum.m4a', l => l)).toBeUndefined();
    const twoOrphans = { ...renamed, assets: [...renamed.assets, { role: 'audio' as const, link: '[[Other.wav]]' }] };
    expect(relinkSuggestion(twoOrphans, p => files.has(p) || p === 'Other.wav', l => l)).toBeUndefined();
    expect(relinkSuggestion(renamed, p => p === 'Memos/hum.m4a', () => null)).toBeUndefined();
  });
  it('undoes add, edit, relink and remove', () => {
    const s = session(sections());
    s.edit('Add recording reference', c => addReference(c, { label: 'Station', path }, id(40)));
    s.edit('Edit recording reference', c => updateReference(c, id(40), { description: 'Notes' }));
    s.edit('Relink recording reference', c => relinkReference(c, id(40), 'Field/b.flac'));
    s.edit('Remove recording reference', c => removeReference(c, id(40)));
    expect(s.draft.data.audioRefs).toEqual([]);
    s.undo(); expect(s.draft.data.audioRefs[0]?.path).toBe('Field/b.flac');
    s.undo(); expect(s.draft.data.audioRefs[0]?.path).toBe(path);
    s.undo(); expect(s.draft.data.audioRefs[0]?.description).toBeUndefined();
    s.undo(); expect(s.draft.data.audioRefs).toEqual([]); expect(s.draft.assets).toBeUndefined();
    s.dispose();
  });
});

describe('persistence and compatibility', () => {
  function full(): Composition {
    let c = sections();
    c = updateSection(c, id(1), { description: 'Slow fog' });
    c = addMarker(c, { label: 'Cue', tick: BAR * 6, description: 'Choir' }, id(30));
    return addReference(c, { label: 'Station', path: 'Field/station.wav', sectionId: id(2), markerId: id(30), description: 'Ambience' }, id(40));
  }
  it('round-trips all structure metadata through Markdown with stable IDs', () => {
    const c = full(), back = roundTrip(c);
    expect(back.data.sections).toEqual(c.data.sections);
    expect(back.data.markers).toEqual(c.data.markers);
    expect(back.data.audioRefs).toEqual(c.data.audioRefs);
    expect(back.assets).toEqual(c.assets);
    expect(createEntityDocument(c)).toContain('mnemobard_audio:');
  });
  it('preserves unknown fields and future extensions, and deletes cleared optional fields', () => {
    const c = full(), source = createEntityDocument(c);
    const edited = source.replace('"label": "Slow fog"', '"label": "Slow fog"').replace('"description": "Slow fog"', '"description": "Slow fog",\n      "color": "violet",\n      "futureCategory": { "kind": "tension" }').replace('"label": "Cue"', '"label": "Cue",\n      "x-cue": 7');
    const parsed = parseEntityDocument(edited); if (parsed?.entity.kind !== 'composition') throw Error();
    let next = updateSection(parsed.entity, id(1), { label: 'Prelude', description: '' });
    next = updateMarker(next, id(30), { tick: BAR * 7 });
    const saved = parseEntityDocument(updateEntityDocument(edited, edited, next)); if (saved?.entity.kind !== 'composition') throw Error();
    const intro = saved.entity.data.sections.find(s => s.id === id(1));
    expect(intro).toMatchObject({ label: 'Prelude', color: 'violet', futureCategory: { kind: 'tension' } });
    expect(intro && 'description' in intro).toBe(false);
    expect(saved.entity.data.markers.find(m => m.id === id(30))).toMatchObject({ tick: BAR * 7, 'x-cue': 7 });
  });
  it('loads 4A/4B records (local IDs, no optional fields) unchanged and keeps them editable', () => {
    const c = base(); c.data.sections = [{ id: 'section1', startTick: 0, endTick: BAR, label: 'Threshold' }]; c.data.markers = [{ id: 'marker1', tick: BAR / 2, label: 'Open' }];
    c.data.audioRefs = [{ id: 'audio1', path: 'MNEMOBARD/Assets/station.wav', atTick: 0, label: 'Platform' }];
    const back = roundTrip(c);
    expect(back.data).toEqual(c.data);
    expect(updateSection(back, 'section1', { endTick: BAR * 2 }).data.sections[0]).toEqual({ id: 'section1', startTick: 0, endTick: BAR * 2, label: 'Threshold' });
  });
  it('rejects malformed optional fields but protects future schema without rewriting', () => {
    const c = full(); (c.data.sections[0] as Record<string, unknown>).description = 42;
    expect(() => validateEntity(c)).toThrow('section description');
    const future = full(); future.data.schemaVersion = 2 as 1;
    expect(() => validateEntity(future)).toThrow('schema');
  });
});

describe('compiler independence', () => {
  it('produces byte-identical MIDI with and without sections, markers and references', () => {
    const m = motif(1), plain = arrangement([m]);
    let structured = addSection(plain, { label: 'Intro', startTick: 0, endTick: BAR }, id(1));
    structured = addMarker(structured, { label: 'Cue', tick: 480 }, id(2));
    structured = addReference(structured, { label: 'Ref', path: 'a.wav', sectionId: id(1) }, id(3));
    const compile = (c: Composition) => { const r = compileArrangement(c, [captured(m)], revision); if (!r.ok) throw Error(JSON.stringify(r.diagnostics)); return r.arrangement; };
    const a = compile(plain), b = compile(structured);
    expect(b.events).toEqual(a.events);
    expect(b.lanes).toEqual(a.lanes);
    expect(Buffer.from(exportArrangement(b))).toEqual(Buffer.from(exportArrangement(a)));
  });
});

describe('library integration (protected sessions)', () => {
  async function fixture() {
    const { MemoryVault } = await import('./support/memory-vault');
    const { EntityIndex } = await import('../src/storage/index');
    const { EntityRepository } = await import('../src/storage/repository');
    const { CanvasLibrary } = await import('../src/modules/canvas/library');
    const vault = new MemoryVault(), index = new EntityIndex(vault), repo = new EntityRepository(vault, index);
    const library = new CanvasLibrary(index, repo, vault, () => false);
    await index.start();
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]).buffer;
    await vault.createBinary('Field/station.wav', bytes); await vault.createBinary('Field/notes.txt', bytes); await vault.createBinary('.hidden/x.wav', bytes);
    return { vault, index, repo, library, bytes, dispose: () => { library.dispose(); repo.dispose(); index.dispose(); } };
  }
  it('lists only visible audio, adds verified references and never touches recording bytes', async () => {
    const f = await fixture();
    expect(f.library.recordingFiles().map(a => a.path)).toEqual(['Field/station.wav']);
    const record = await f.repo.create(sections()), s = await f.library.open(record.entity.id);
    expect(() => f.library.addRecording(s, { label: 'Ghost', path: 'Field/ghost.wav' })).toThrow('no longer exists');
    expect(s.historySize).toBe(0);
    f.library.addRecording(s, { label: 'Station', path: 'Field/station.wav', sectionId: id(2) });
    await s.save();
    const reopened = await f.repo.read(record.entity.id);
    if (reopened.entity.kind !== 'composition') throw Error();
    expect(reopened.entity.data.audioRefs[0]).toMatchObject({ label: 'Station', sectionId: id(2), atTick: BAR * 4 });
    expect(reopened.source).toContain('[[Field/station.wav]]');
    expect(new Uint8Array(f.vault.binaries.get('Field/station.wav') ?? new ArrayBuffer(0))).toEqual(new Uint8Array(f.bytes));
    expect(f.vault.reads.filter(p => p.endsWith('.wav'))).toEqual([]);
    f.dispose();
  });
  it('preserves a missing reference record, reports it and relinks explicitly', async () => {
    const f = await fixture(), c = addReference(sections(), { label: 'Lost', path: 'Field/lost.wav' }, id(40));
    const record = await f.repo.create(c), s = await f.library.open(record.entity.id);
    expect(f.library.recordingStatus('Field/lost.wav')).toMatchObject({ status: 'missing' });
    expect(f.library.recordingStatus('../x.wav')).toMatchObject({ status: 'invalid' });
    expect(s.draft.data.audioRefs).toHaveLength(1);
    expect(() => f.library.relinkRecording(s, id(40), 'Field/none.wav')).toThrow();
    f.library.relinkRecording(s, id(40), 'Field/station.wav');
    expect(s.draft.data.audioRefs[0]).toMatchObject({ id: id(40), label: 'Lost', path: 'Field/station.wav' });
    s.undo(); expect(s.draft.data.audioRefs[0]?.path).toBe('Field/lost.wav');
    f.dispose();
  });
  it('suggests the rewritten mirror link after a host rename', async () => {
    const f = await fixture(), c = addReference(sections(), { label: 'Station', path: 'Field/station.wav' }, id(40));
    f.vault.binaries.set('Field/renamed.wav', f.vault.binaries.get('Field/station.wav') ?? new ArrayBuffer(0)); f.vault.binaries.delete('Field/station.wav');
    const renamed = { ...c, assets: [{ role: 'audio' as const, link: '[[Field/renamed.wav]]' }] };
    expect(f.library.relinkSuggestion(renamed)).toEqual({ referenceIds: [id(40)], from: 'Field/station.wav', to: 'Field/renamed.wav' });
    f.dispose();
  });
  it('keeps structure edits behind protected save conflict and in recovery checkpoints', async () => {
    const f = await fixture(), record = await f.repo.create(sections()), s = await f.library.open(record.entity.id);
    s.edit('Add marker', c => addMarker(c, { label: 'Cue', tick: BAR }, id(30)));
    await s.checkpoint();
    const checkpoint = s.recoveryPath; if (!checkpoint) throw Error('no checkpoint');
    expect((await f.library.recovery.inspect(checkpoint)).draft?.data.markers[0]).toMatchObject({ id: id(30), label: 'Cue' });
    f.vault.modify(record.path, (f.vault.files.get(record.path) ?? '') + '\nExternal edit\n');
    await expect(s.save()).rejects.toThrow('changed');
    expect(f.vault.files.get(record.path)).not.toContain('"Cue"');
    expect(s.draft.data.markers[0]?.label).toBe('Cue');
    f.dispose();
  });
});
