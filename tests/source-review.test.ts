// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEntity, type Composition, type Motif } from '../src/domain/entities';
import { summarizeSource, type SourceState } from '../src/arrangement/sources';
import { sourceReview, reviewToken, noteExtent } from '../src/arrangement/source-review';
import { acknowledgeSourceClips, addLane } from '../src/modules/canvas/commands';
import { CanvasLibrary } from '../src/modules/canvas/library';
import { SourceReviewModal } from '../src/modules/canvas/source-review-modal';
import { MotifLibrary } from '../src/modules/motif/library';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { musicalDuration } from '../src/music/durations';
import { MemoryVault } from './support/memory-vault';
import { installDomHelpers } from './support/obsidian';

/** 4G Workstream A: batch source-revision review. Pure planning/command first, then the library's commit-time revalidation. */
const close: (() => void)[] = [];
beforeEach(() => installDomHelpers());
afterEach(() => { for (const fn of close.splice(0)) fn(); document.body.replaceChildren(); });
const OLD = 'a'.repeat(64), NEW = 'b'.repeat(64);
function motif(title: string, length = 3840, ppq = 960): Motif { const m = createEntity('motif', title); m.data = { ...m.data, ppq, lengthTicks: length, notes: [{ id: 'n1', pitch: 60, startTick: 0, durationTicks: ppq, velocity: 80 }, { id: 'n2', pitch: 64, startTick: ppq, durationTicks: ppq, velocity: 70 }] }; return m; }
const ready = (m: Motif, revision = NEW, path = `${m.title}.md`): SourceState => ({ status: 'ready', source: summarizeSource(m, revision, path) });
/** Lane A: two clips of `a` (one never reviewed) + one of `b`; lane B: one clip of `a`. */
function arrangement(a: Motif, b: Motif): Composition {
  let c = addLane(addLane(createEntity('composition', 'Arrangement'), 'Lane A'), 'Lane B'); c.data.lengthTicks = 3840 * 32;
  const [la, lb] = c.data.lanes; if (!la || !lb) throw Error('lanes');
  const clip = (id: string, m: Motif, start: number, revision: string | undefined, repeat = 1) => ({ id, motifId: m.id, startTick: start, repeatCount: repeat, ...(revision ? { sourceRevision: revision, sourceTitle: 'Old title', sourcePath: 'Old/path.md', reviewedLengthTicks: 1920 } : {}) });
  c = { ...c, data: { ...c.data, lanes: [{ ...la, clips: [clip('c1', a, 0, OLD, 2), clip('c2', a, 3840 * 4, undefined), clip('c3', b, 3840 * 8, OLD)] }, { ...lb, clips: [clip('c4', a, 0, OLD, 3)] }] } };
  return c;
}

it('groups changed placements per stable motif across lanes and acknowledges one motif in a single command', () => {
  const a = motif('Alpha'), b = motif('Beta'), c = arrangement(a, b), states = new Map([[a.id, ready(a)], [b.id, ready(b)]]);
  const items = sourceReview(c, id => states.get(id) ?? { status: 'missing', paths: [] });
  expect(items.map(i => [i.title, i.placements.length, i.eligible])).toEqual([['Alpha', 3, true], ['Beta', 1, true]]);
  const alpha = items[0]; if (!alpha) throw Error();
  expect(new Set(alpha.previousRevisions)).toEqual(new Set([OLD, undefined]));
  expect(alpha.placements.map(p => [p.laneName, p.startTick, p.repeatCount, p.previousDurationTicks, p.durationTicks])).toEqual([['Lane A', 0, 2, 3840, 7680], ['Lane A', 15360, 1, undefined, 3840], ['Lane B', 0, 3, 5760, 11520]]);
  const before = structuredClone(c), next = acknowledgeSourceClips(c, reviewToken(alpha), alpha.source ?? (() => { throw Error(); })());
  const clips = next.data.lanes.flatMap(l => l.clips), old = before.data.lanes.flatMap(l => l.clips);
  for (const id of ['c1', 'c2', 'c4']) expect(clips.find(x => x.id === id)).toMatchObject({ sourceRevision: NEW, sourceTitle: 'Alpha', sourcePath: 'Alpha.md', reviewedLengthTicks: 3840 });
  expect(clips.find(x => x.id === 'c3')).toEqual(old.find(x => x.id === 'c3')); // other motif untouched
  for (const clip of clips) { const prior = old.find(x => x.id === clip.id); expect([clip.motifId, clip.startTick, clip.repeatCount]).toEqual([prior?.motifId, prior?.startTick, prior?.repeatCount]); }
  expect(next.data.lanes.map(l => [l.id, l.name, l.midiChannel, l.clips.map(x => x.id)])).toEqual(before.data.lanes.map(l => [l.id, l.name, l.midiChannel, l.clips.map(x => x.id)]));
  expect(c).toEqual(before); // pure: input untouched
  expect(sourceReview(next, id => states.get(id) ?? { status: 'missing', paths: [] }).map(i => i.title)).toEqual(['Beta']);
});

it('refuses a stale review: placement deleted, duplicated, moved, retargeted or the source revision changed', () => {
  const a = motif('Alpha'), b = motif('Beta'), c = arrangement(a, b), state = ready(a), item = sourceReview(c, id => id === a.id ? state : ready(b))[0];
  if (!item?.source) throw Error(); const token = reviewToken(item), source = item.source;
  const edit = (fn: (c: Composition) => void): Composition => { const x = structuredClone(c); fn(x); return x; };
  const lane = (x: Composition, i: number) => x.data.lanes[i] ?? (() => { throw Error(); })();
  const stale = [
    edit(x => { lane(x, 0).clips = lane(x, 0).clips.filter(k => k.id !== 'c2'); }),
    edit(x => { lane(x, 0).clips.push({ ...structuredClone(lane(x, 0).clips[0] ?? (() => { throw Error(); })()), id: 'dup', startTick: 3840 * 20 }); }),
    edit(x => { const k = lane(x, 1).clips[0]; if (k) k.startTick = 3840; }),
    edit(x => { const k = lane(x, 1).clips[0]; if (k) k.repeatCount = 1; }),
    edit(x => { const k = lane(x, 1).clips[0]; if (k) k.motifId = b.id; }),
    edit(x => { const k = lane(x, 1).clips[0]; if (k) k.sourceRevision = NEW; }),
  ];
  for (const x of stale) expect(() => acknowledgeSourceClips(x, token, source)).toThrow(/changed while this review was open/);
  expect(() => acknowledgeSourceClips(c, token, { ...source, revision: 'c'.repeat(64) })).toThrow(/saved motif changed/);
});

it('blocks unavailable, unsupported, incompatible or unsaved sources and never acknowledges a mix partially', () => {
  const a = motif('Alpha'), b = motif('Beta'), c = arrangement(a, b);
  for (const status of ['missing', 'duplicate', 'malformed', 'unsupported', 'archived', 'wrong-kind'] as const) {
    const state: SourceState = { status, paths: ['x.md'] };
    expect(sourceReview(c, id => id === a.id ? state : ready(b)).map(i => i.title)).toEqual(['Beta']); // only listed when kept
    const kept = sourceReview(c, id => id === a.id ? state : ready(b), undefined, a.id).find(i => i.motifId === a.id);
    expect(kept?.eligible).toBe(false); expect(kept?.blockers.length).toBeGreaterThan(0);
    if (kept) expect(() => reviewToken(kept)).toThrow();
  }
  const unsaved = sourceReview(c, id => id === a.id ? ready(a) : ready(b), id => id === a.id).find(i => i.motifId === a.id);
  expect(unsaved?.blockers.join(' ')).toMatch(/unsaved edits/); expect(unsaved?.eligible).toBe(false);
  const odd = motif('Odd', 1001, 1001); odd.data.notes = [{ id: 'n', pitch: 60, startTick: 0, durationTicks: 1, velocity: 80 }];
  const incompatible = sourceReview(c, id => id === a.id ? ready(odd) : ready(b)).find(i => i.motifId === a.id);
  expect(incompatible?.timing.ok).toBe(false); expect(incompatible?.eligible).toBe(false); expect(incompatible?.placements.every(p => p.durationTicks === undefined)).toBe(true);
  // A longer revision would push one placement past the end: the whole motif is blocked (no silent partial acknowledgement).
  const longer = motif('Alpha', 3840 * 16), mixed = sourceReview(c, id => id === a.id ? ready(longer) : ready(b)).find(i => i.motifId === a.id);
  expect(mixed?.placements.map(p => p.eligible)).toEqual([true, true, false]);
  expect(mixed?.eligible).toBe(false); if (mixed) expect(() => reviewToken(mixed)).toThrow(/end after the composition/);
});

it('acknowledges a renamed source by UUID and records the new name and location', () => {
  const a = motif('Alpha'), b = motif('Beta'), c = arrangement(a, b), renamed = { ...a, title: 'Alpha (renamed)' };
  const item = sourceReview(c, id => id === a.id ? ready(renamed, NEW, 'Moved/Alpha (renamed).md') : ready(b)).find(i => i.motifId === a.id);
  if (!item?.source) throw Error();
  const next = acknowledgeSourceClips(c, reviewToken(item), item.source);
  expect(next.data.lanes.flatMap(l => l.clips).filter(k => k.motifId === a.id).map(k => [k.sourceTitle, k.sourcePath])).toEqual(Array(3).fill(['Alpha (renamed)', 'Moved/Alpha (renamed).md']));
  expect(noteExtent(a.data.notes)).toEqual({ first: 0, last: 1920 }); expect(noteExtent([])).toBeUndefined();
});

async function fixture() {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repo = new EntityRepository(vault, index), motifs = new MotifLibrary(index, repo, vault), library = new CanvasLibrary(index, repo, vault, id => motifs.isDirty(id));
  close.push(() => { library.dispose(); motifs.dispose(); repo.dispose(); index.dispose(); }); await index.start();
  const a = await repo.create(motif('Alpha')), b = await repo.create(motif('Beta'));
  const created = await repo.create(addLane(addLane((() => { const x = createEntity('composition', 'Batch'); x.data.lengthTicks = 3840 * 64; return x; })(), 'Lane A'), 'Lane B'));
  const session = await library.open(created.entity.id), [la, lb] = session.draft.data.lanes; if (!la || !lb) throw Error();
  for (let i = 0; i < 4; i++) library.place(session, la.id, a.entity.id, i * 3840 * 2, 1); // same motif repeatedly on one lane
  library.place(session, lb.id, a.entity.id, 0, 2); library.place(session, lb.id, b.entity.id, 3840 * 8, 1); // and on another lane
  await session.save();
  // The motif changes and is saved in MOTIF: every placement now refers to an older revision.
  const m = await motifs.open(a.entity.id); m.edit('Edit', x => ({ ...x, data: { ...x.data, notes: [...x.data.notes, { id: 'n3', pitch: 67, startTick: 1920, durationTicks: 960, velocity: 60 }] } })); await m.save(); motifs.discard(m);
  await index.settled();
  return { vault, index, repo, motifs, library, session, a, b, motifPath: a.path, compositionPath: created.path };
}
const item = (library: CanvasLibrary, session: import('../src/modules/canvas/session').CanvasSession, id: string) => library.reviewItems(session).find(i => i.motifId.toLowerCase() === id.toLowerCase());

it('acknowledges every placement as one undo step, survives undo/redo/save/reopen, and never writes the motif', async () => {
  const { vault, library, session, a, motifPath, repo } = await fixture();
  const pending = item(library, session, a.entity.id); if (!pending) throw Error('pending');
  expect(pending.placements).toHaveLength(5); expect(pending.eligible).toBe(true);
  const motifText = vault.files.get(motifPath), history = session.historySize, before = session.draft;
  expect(await library.reviewAll(session, library.reviewToken(session, pending))).toBe(5);
  expect(session.historySize).toBe(history + 1);
  expect(item(library, session, a.entity.id)).toBeUndefined();
  expect(library.plan(session.draft).diagnostics.some(d => d.code === 'changed')).toBe(false);
  expect(vault.files.get(motifPath)).toBe(motifText); // the source note is never written
  session.undo(); expect(session.draft).toEqual(before); expect(item(library, session, a.entity.id)?.placements).toHaveLength(5);
  session.redo(); expect(item(library, session, a.entity.id)).toBeUndefined();
  await session.save();
  library.discard(session); const reopened = await library.open(session.draft.id);
  expect(item(library, reopened, a.entity.id)).toBeUndefined();
  expect((await repo.read(session.draft.id)).entity).toEqual(reopened.draft);
  expect(JSON.stringify(reopened.draft)).not.toContain('"pitch"'); // compositions reference motifs; no notes were copied in
});

it('revalidates right before committing: disk changes, unsaved MOTIF edits, composition saves and external conflicts stop it', async () => {
  const { vault, library, session, a, motifPath, motifs, compositionPath } = await fixture();
  const fresh = () => { const i = item(library, session, a.entity.id); if (!i) throw Error('item'); return library.reviewToken(session, i); };
  // 1. The motif note changes on disk after the review was prepared (even before the index sees it).
  const token = fresh(), original = vault.files.get(motifPath) ?? '';
  vault.files.set(motifPath, original.replace('"velocity": 60', '"velocity": 61'));
  await expect(library.reviewAll(session, token)).rejects.toThrow(/saved motif changed during the review/);
  vault.modify(motifPath, original); await library.index.settled();
  // 2. MOTIF holds an unsaved draft of this motif.
  const t2 = fresh(), draft = await motifs.open(a.entity.id); draft.edit('Pending', x => ({ ...x, title: 'Pending title' }));
  await expect(library.reviewAll(session, t2)).rejects.toThrow(/unsaved edits/); expect(item(library, session, a.entity.id)?.blockers.join()).toMatch(/unsaved/);
  expect(() => fresh()).toThrow(/unsaved edits/); // and a new review cannot even be prepared
  motifs.discard(draft);
  // 3. The composition is saved (new base) between preparing and committing.
  const t3 = fresh(); session.edit('Rename', c => ({ ...c, title: 'Renamed' })); await session.save();
  await expect(library.reviewAll(session, t3)).rejects.toThrow(/saved or reloaded during the review/);
  // 4. The composition note changes elsewhere while the draft is dirty → protected conflict.
  session.edit('Rename', c => ({ ...c, title: 'Dirty' })); const t4 = fresh();
  vault.modify(compositionPath, (vault.files.get(compositionPath) ?? '').replace('title: Renamed', 'title: External'));
  await vi.waitFor(() => expect(session.freshness.state).toBe('conflict'));
  await expect(library.reviewAll(session, t4)).rejects.toThrow(/changed elsewhere/);
  expect(item(library, session, a.entity.id)?.placements).toHaveLength(5); // nothing acknowledged in any case
  // Save stays blocked (no overwrite) and the recovery copy is retained and readable after the library is recreated.
  await expect(session.save()).rejects.toThrow(); expect(vault.files.get(compositionPath)).toContain('title: External');
  await session.checkpoint(); const path = session.recoveryPath; expect(path).toBeTruthy();
  const again = new CanvasLibrary(library.index, new EntityRepository(vault, library.index), vault); close.push(() => again.dispose());
  expect((await again.recovery.inspect(path ?? '')).draft?.title).toBe('Dirty');
});

it('acknowledges 1,000 placements of one motif in one bounded edit', async () => {
  const { library, session, a, b } = await fixture();
  const lanes = session.draft.data.lanes, [la, lb] = lanes; if (!la || !lb) throw Error();
  const many = (lane: string, n: number, from: number) => Array.from({ length: n }, (_, i) => ({ id: `m${lane}${i}`, laneId: lane, motifId: a.entity.id, startTick: (from + i) * 3840, repeatCount: 1, sourceRevision: OLD }));
  // The schema maximum: 1,000 clips per composition, all placements of the same motif across two lanes.
  session.edit('Many', c => ({ ...c, data: { ...c.data, lengthTicks: 3840 * 1024, lanes: c.data.lanes.map(l => l.id === la.id ? { ...l, clips: many(la.id, 600, 0) } : { ...l, clips: many(lb.id, 400, 0) }) } }));
  const pending = item(library, session, a.entity.id); expect(pending?.placements.length).toBe(1000);
  const t = performance.now(); if (!pending) throw Error(); await library.reviewAll(session, library.reviewToken(session, pending));
  expect(performance.now() - t).toBeLessThan(2000); // generous: correctness of one edit, not a timing budget
  expect(item(library, session, a.entity.id)).toBeUndefined(); void b;
  session.undo(); expect(item(library, session, a.entity.id)?.placements.length).toBe(1000);
});

it('review modal: lists sources, shows only recorded history, confirms explicitly and withdraws a confirmation that went stale', async () => {
  const { library, session, a, motifPath, vault } = await fixture(); const done = vi.fn();
  const modal = new SourceReviewModal({} as never, library, session, undefined, () => undefined, () => {}, done); modal.open();
  const root = modal.contentEl, text = () => root.textContent ?? '', press = (label: string) => { const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent?.startsWith(label) && !x.disabled); if (!b) throw Error('Missing ' + label); b.click(); };
  expect(text()).toContain('Alpha · 5 placements · ready to acknowledge');
  expect(root.querySelector('.mnemobard-review-compare')?.textContent).toContain('not recorded');
  expect(text()).toContain('note-by-note comparison is not possible');
  expect(root.querySelectorAll('.mnemobard-review-clips tbody tr')).toHaveLength(5);
  expect(root.querySelector('.mnemobard-review-clips tbody tr td:nth-child(3)')?.textContent).toMatch(/^\d+:\d+:\d+$/); // musical position
  press('Acknowledge this source for all 5 eligible clips');
  expect(root.querySelector('[aria-label="Confirm acknowledgement"]')?.textContent).toContain('Record revision');
  // The saved motif changes while the confirmation is shown: it is withdrawn, not applied.
  const original = vault.files.get(motifPath) ?? ''; vault.modify(motifPath, original.replace('"velocity": 60', '"velocity": 59')); await library.index.settled(); await Promise.resolve(); await Promise.resolve();
  expect(root.querySelector('[aria-label="Confirm acknowledgement"]')).toBeNull(); expect(text()).toContain('review changed while it was open');
  press('Acknowledge this source for all 5 eligible clips'); press('Confirm acknowledgement');
  await vi.waitFor(() => expect(done).toHaveBeenCalled());
  expect(text()).toContain('No changed sources'); expect(item(library, session, a.entity.id)).toBeUndefined();
  modal.close();
});

it('formats exact musical durations for 4/4, 3/4 and 6/8 without rounding', () => {
  const m = (n: number, d: number) => ({ numerator: n, denominator: d });
  expect(musicalDuration(7680, 960, m(4, 4))).toBe('2 bars');
  expect(musicalDuration(3840 + 1920, 960, m(4, 4))).toBe('1 bar 2 beats');
  expect(musicalDuration(3840 + 960 + 240, 960, m(4, 4))).toBe('1 bar 1 beat 240 ticks');
  expect(musicalDuration(2880, 960, m(3, 4))).toBe('1 bar');
  expect(musicalDuration(3840, 960, m(3, 4))).toBe('1 bar 1 beat');
  expect(musicalDuration(2880, 960, m(6, 8))).toBe('1 bar'); // six eighths
  expect(musicalDuration(480 * 7 + 1, 960, m(6, 8))).toBe('1 bar 1 beat 1 tick');
  expect(musicalDuration(0, 960, m(4, 4))).toBe('0 ticks');
  expect(musicalDuration(3840 * 4096, 960, m(4, 4))).toBe('4096 bars');
  expect(musicalDuration(1000, 1, m(4, 8))).toBe('1000 ticks'); // beat not a whole tick at PPQ 1: exact raw ticks
  expect(() => musicalDuration(1.5, 960, m(4, 4))).toThrow();
});
