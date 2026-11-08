import { afterEach, describe, expect, it } from 'vitest';
import { createEntity, type Entity, type Motif } from '../src/domain/entities';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository, type EntityRecord } from '../src/storage/repository';
import { MotifLibrary } from '../src/modules/motif/library';
import { MotifSession } from '../src/modules/motif/session';
import { HistorySession } from '../src/application/history-session';
import { freezeDeep, isDeeplyFrozen } from '../src/application/freeze';
import { canonicalJson, jsonEqual } from '../src/application/json-equal';
import { editableMotif, moveNotes, quantizeNotes, resizeNotes, sealedMotif, sessionMotif, transposeNotes, velocityNotes, deleteNotes } from '../src/modules/motif/commands';
import { MemoryVault } from './support/memory-vault';

/** Milestone 4H: ownership, immutability and exactness of the faster edit-commit path (§5.4, §8.1). */
const closers: (() => void)[] = []; afterEach(() => { for (const close of closers.splice(0)) close(); });
const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
/** Deterministic generated motif: same layout as the native benchmark, plus unknown fields at every level. */
function generated(count: number): Motif {
  const m = createEntity('motif', `Generated ${count}`) as Motif;
  m.extra = { custom: { keep: true, list: [1, 'two', null] } };
  m.data = { ...m.data, lengthTicks: Math.max(3840, Math.ceil(count * 240 / 3840) * 3840), future: 'retained', notes: Array.from({ length: count }, (_, i) => ({ id: id(i + 1), pitch: 36 + (i % 48), startTick: i * 240, durationTicks: 200, velocity: 64 + (i % 40), ...(i % 7 === 0 ? { articulation: 'legato' } : {}) })) };
  return m;
}
async function opened(count: number) {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), library = new MotifLibrary(index, repository, vault);
  closers.push(() => { library.dispose(); repository.dispose(); index.dispose(); });
  const base = await repository.create(generated(count)), session = await library.open(base.entity.id);
  return { vault, repository, library, base, session };
}
const ids = (m: Readonly<Motif>): string[] => m.data.notes.map(n => n.id);
const nth = (m: Readonly<Motif>, i: number): Motif['data']['notes'][number] => { const n = m.data.notes[i]; if (!n) throw Error(`no note ${i}`); return n; };

describe('4H frozen values', () => {
  it('freezeDeep freezes every level, makes writes throw and is recognised only for values it froze', () => {
    const value = freezeDeep({ a: { b: [{ c: 1 }] } });
    expect(Object.isFrozen(value.a.b[0])).toBe(true); expect(isDeeplyFrozen(value)).toBe(true);
    expect(() => { (value.a.b[0] as { c: number }).c = 2; }).toThrow(TypeError);
    expect(isDeeplyFrozen(Object.freeze({ shallow: {} }))).toBe(false); expect(isDeeplyFrozen({})).toBe(false);
  });
});

describe('4H jsonEqual is exactly the canonical-JSON comparison it replaces', () => {
  // Seeded generator (mulberry32) so a failure is reproducible.
  let seed = 0x4d4e; const random = (): number => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)] as T;
  const leaf = (): unknown => pick<unknown>([0, -0, 1, 2.5, NaN, Infinity, -Infinity, '', 'a', 'b', true, false, null, undefined, () => 1]);
  const tree = (depth: number): unknown => {
    if (depth > 3 || random() < 0.35) return leaf();
    if (random() < 0.5) return Array.from({ length: Math.floor(random() * 4) }, () => tree(depth + 1));
    const out: Record<string, unknown> = {}; for (const key of ['x', 'y', 'z', '1', '10'].filter(() => random() < 0.6)) out[key] = tree(depth + 1); return out;
  };
  /** Same content, every object rebuilt with its keys in reverse insertion order. */
  const reordered = (value: unknown): unknown => Array.isArray(value) ? value.map(reordered) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reordered(v)])) : value;
  /** Change one leaf somewhere (may or may not change the JSON, e.g. NaN → null does not). */
  const mutated = (value: unknown): unknown => {
    if (Array.isArray(value)) { if (!value.length) return [leaf()]; const copy = value.slice(); const i = Math.floor(random() * copy.length); copy[i] = mutated(copy[i]); return copy; }
    if (value && typeof value === 'object') { const keys = Object.keys(value); const copy: Record<string, unknown> = { ...value }; if (!keys.length || random() < 0.2) { copy.w = leaf(); return copy; } const k = pick(keys); copy[k] = mutated(copy[k]); return copy; }
    return leaf();
  };
  it('agrees with canonicalJson equality on 6,000 generated pairs (reordered keys, changed leaves, undefined, NaN, -0, functions)', () => {
    let equalPairs = 0;
    for (let i = 0; i < 2000; i++) {
      const a = tree(0);
      for (const b of [reordered(a), mutated(a), tree(0)]) {
        const expected = canonicalJson(a) === canonicalJson(b); expect(jsonEqual(a, b)).toBe(expected); expect(jsonEqual(b, a)).toBe(expected); if (expected) equalPairs++;
      }
    }
    expect(equalPairs).toBeGreaterThan(2000); // every reordered pair at least
  });
  it('falls back to the canonical strings for values outside plain JSON data', () => {
    const date = new Date(0), map = new Map([[1, 2]]);
    for (const [a, b] of [[{ d: date }, { d: '1970-01-01T00:00:00.000Z' }], [{ m: map }, { m: {} }], [{ t: { toJSON: () => 1 } }, { t: 1 }], [[undefined], [null]], [{ a: undefined }, {}], [undefined, () => 1]] as [unknown, unknown][])
      expect(jsonEqual(a, b)).toBe(canonicalJson(a) === canonicalJson(b));
  });
});

describe('4H sealed MOTIF command results', () => {
  it('keeps the default command contract: results are fully validated, mutable copies', () => {
    const m = generated(16), moved = moveNotes(m, new Set([id(1)]), 240, 0);
    expect(isDeeplyFrozen(moved)).toBe(false); nth(moved, 0).velocity = 1; expect(nth(m, 0).velocity).toBe(64);
  });
  it('seals only values that passed editableMotif, and the session validator re-validates everything else', () => {
    const m = generated(16), sealed = moveNotes(m, new Set([id(1)]), 240, 0, sealedMotif);
    expect(isDeeplyFrozen(sealed)).toBe(true); expect(sessionMotif(sealed)).toBe(sealed);
    expect(() => { nth(sealed, 0).pitch = 200; }).toThrow(TypeError);
    const unsealed = editableMotif(m); nth(unsealed, 0).pitch = 200; // validated, then made invalid: never trusted
    expect(() => sessionMotif(unsealed)).toThrow('pitch'); expect(() => sealedMotif(unsealed)).toThrow('pitch');
    const forged = freezeDeep(editableMotif(m)); expect(sessionMotif(forged)).not.toBe(forged); // frozen alone is not sealed
  });
});

describe.each([16, 500, 5000, 10000])('4H edit commits on a %i-note motif', count => {
  it('are exact, atomic, undoable and never mutate history, the saved base or untouched notes; save/reopen round-trips', async () => {
    const { session, repository, base } = await opened(count), baseJson = JSON.stringify(base.entity), sessionBaseJson = JSON.stringify(session.base?.entity);
    const order = ids(session.snapshot), snapshots: Readonly<Motif>[] = [session.snapshot], texts = [JSON.stringify(session.snapshot)];
    expect(Object.isFrozen(session.snapshot.data.notes[0])).toBe(true);
    expect(() => { (session.snapshot.data.notes[0] as { pitch: number }).pitch = 1; }).toThrow(TypeError);
    const copy = session.draft; nth(copy, 0).pitch = 1; expect(nth(session.snapshot, 0).pitch).toBe(36); // draft is an independent copy
    const first = new Set([id(1)]), hundred = new Set(order.slice(0, Math.min(100, Math.floor(count * 0.75))));
    const edits: [string, (m: Motif) => Motif, ReadonlySet<string>][] = [
      ['Move notes', m => moveNotes(m, first, 240, 0, sealedMotif), first],
      ['Resize notes', m => resizeNotes(m, first, 120, sealedMotif), first],
      ['Set velocity', m => velocityNotes(m, first, 101, sealedMotif), first],
      ['Transpose notes', m => transposeNotes(m, first, 12, sealedMotif), first],
      ['Quantize starts', m => quantizeNotes(m, hundred, 'quarter', sealedMotif), hundred],
      ['Move notes', m => moveNotes(m, hundred, 480, 0, sealedMotif), hundred],
      ['Inline settings', m => ({ ...m, title: 'Renamed' }), new Set()],
    ];
    for (const [label, transform, touched] of edits) {
      const before = session.snapshot; session.edit(label, transform); const after = session.snapshot;
      expect(after).not.toBe(before); expect(Object.isFrozen(after)).toBe(true); expect(ids(after)).toEqual(order); // identities and order stable
      for (let i = 0; i < after.data.notes.length; i++) { const n = nth(after, i); if (!touched.has(n.id)) expect(n).toEqual(before.data.notes[i]); }
      snapshots.push(after); texts.push(JSON.stringify(after));
    }
    expect(session.snapshot.data.notes.find(n => n.id === id(1))).toEqual({ id: id(1), pitch: 48, startTick: 480, durationTicks: 320, velocity: 101, articulation: 'legato' });
    // Rejected edits are atomic: nothing changes, no history entry is added and nobody is notified — through the sealed
    // command path (bounds) and through the fully validated inline-transform path (pitch range, same-pitch overlap).
    const historyBefore = session.historySize, current = session.snapshot; let published = 0; const off = session.subscribe(() => published++);
    expect(() => session.edit('Resize notes', m => resizeNotes(m, new Set([id(2)]), 10_000_000, sealedMotif))).toThrow('extends beyond motif');
    expect(() => session.edit('Inline', m => ({ ...m, data: { ...m.data, notes: m.data.notes.map((n, i) => i === 1 ? { ...n, pitch: 200 } : n) } }))).toThrow('pitch');
    expect(() => session.edit('Inline', m => ({ ...m, data: { ...m.data, notes: m.data.notes.map((n, i) => i === 2 ? { ...nth(m, 1), id: n.id } : n) } }))).toThrow('overlapping'); // note count unchanged (10,000 is the schema limit)
    expect(session.snapshot).toBe(current); expect(session.historySize).toBe(historyBefore); expect(published).toBe(0); off();
    // Undo/redo chain restores every reachable state exactly; earlier snapshots were never mutated. History keeps its
    // unchanged 16 MiB estimate (2 × serialised before+after per entry), so at 10,000 notes only the latest edits remain.
    const reachable = session.historySize, last = texts.length - 1;
    if (count >= 10000) expect(reachable).toBeLessThan(edits.length); else expect(reachable).toBe(edits.length);
    for (let i = last; i > last - reachable; i--) { expect(JSON.stringify(session.snapshot)).toBe(texts[i]); session.undo(); }
    expect(JSON.stringify(session.snapshot)).toBe(texts[last - reachable]); expect(session.canUndo).toBe(false);
    if (reachable === edits.length) { expect(session.dirty).toBe(false); expect(session.status).toBe('Saved'); }
    for (let i = last - reachable + 1; i <= last; i++) { session.redo(); expect(JSON.stringify(session.snapshot)).toBe(texts[i]); }
    expect(session.canRedo).toBe(false);
    snapshots.forEach((snapshot, i) => { expect(isDeeplyFrozen(snapshot)).toBe(true); expect(JSON.stringify(snapshot)).toBe(texts[i]); });
    expect(JSON.stringify(base.entity)).toBe(baseJson); expect(JSON.stringify(session.base?.entity)).toBe(sessionBaseJson);
    // Save and reopen: exact notes, unknown fields at entity / data / note level preserved.
    expect(session.dirty).toBe(true); const saved = await session.save(); expect(session.dirty).toBe(false);
    const reread = await repository.read(base.entity.id), entity = reread.entity as Motif;
    expect(jsonEqual(entity, session.snapshot)).toBe(true); expect(entity.data.notes).toHaveLength(count); expect(saved.source).toBe(reread.source);
    expect(entity.extra).toEqual({ custom: { keep: true, list: [1, 'two', null] } }); expect(entity.data.future).toBe('retained');
    expect(entity.data.notes.filter(n => n.articulation === 'legato')).toHaveLength(Math.ceil(count / 7));
  });
});

describe('4H session edge cases', () => {
  it('blocks a stale save after an external change and keeps the large draft, history and a recovery copy', async () => {
    const { session, vault, base } = await opened(5000); session.edit('Move notes', m => moveNotes(m, new Set([id(10)]), 240, 0, sealedMotif));
    const draft = JSON.stringify(session.snapshot); vault.modify(base.path, base.source + '\nExternal prose\n');
    await expect(session.save()).rejects.toThrow('changed elsewhere'); expect(JSON.stringify(session.snapshot)).toBe(draft); expect(session.canUndo).toBe(true);
    await session.checkpoint(); expect(session.recoveryPath && vault.files.get(session.recoveryPath)).toContain(id(10)); expect(vault.files.get(base.path)).toContain('External prose');
  });
  it('keeps selection on edited notes and drops deleted notes from it', async () => {
    const { session } = await opened(500); session.select([id(1), id(2)]);
    session.edit('Move notes', m => moveNotes(m, new Set([id(1)]), 240, 0, sealedMotif)); expect([...session.selected].sort()).toEqual([id(1), id(2)]);
    session.edit('Delete notes', m => deleteNotes(m, new Set([id(2)]), sealedMotif)); expect([...session.selected]).toEqual([id(1)]);
    session.undo(); expect(session.snapshot.data.notes.some(n => n.id === id(2))).toBe(true);
  });
  it('is clean when the draft equals the saved base with a different key order, and dirty after any real change', async () => {
    const { session, base } = await opened(16);
    const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;
    const port = { save: () => Promise.reject(Error('unused')), checkpoint: () => Promise.resolve('unused') };
    const other = new MotifSession(reorder(base.entity) as Motif, session.base as EntityRecord, port); closers.push(() => other.dispose());
    expect(JSON.stringify(other.snapshot)).not.toBe(JSON.stringify(base.entity)); expect(other.dirty).toBe(false);
    other.edit('Set velocity', m => velocityNotes(m, new Set([id(3)]), 100, sealedMotif)); expect(other.dirty).toBe(true);
    other.undo(); expect(other.dirty).toBe(false);
  });
  it('never installs an object a transform still holds when a validator returns its input unchanged', () => {
    const port = { save: () => Promise.reject(Error('unused')), checkpoint: () => Promise.resolve('unused') };
    const isMotif = (e: Entity): e is Motif => e.kind === 'motif';
    const session = new HistorySession<Motif>(generated(16), undefined, port, value => value, isMotif); closers.push(() => session.dispose());
    const held = { ...session.draft, title: 'Held' }; session.edit('Rename', () => held);
    expect(session.snapshot).not.toBe(held); expect(isDeeplyFrozen(held)).toBe(false);
    held.title = 'Mutated later'; expect(session.snapshot.title).toBe('Held');
    session.undo(); session.redo(); expect(session.snapshot.title).toBe('Held');
  });
});
