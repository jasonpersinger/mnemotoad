import { afterEach, describe, expect, it } from 'vitest';
import { createEntity, type Entity, type Motif } from '../src/domain/entities';
import { HistorySession, HISTORY_LIMITS } from '../src/application/history-session';
import { RetainedSize } from '../src/application/history-memory';
import { isDeeplyFrozen } from '../src/application/freeze';
import { sameJson } from '../src/application/json-equal';
import { MotifSession } from '../src/modules/motif/session';
import { editableMotif, moveNotes, quantizeNotes, resizeNotes, sealedMotif, transposeNotes, velocityNotes } from '../src/modules/motif/commands';

/** Milestone 4I: identity-aware undo memory accounting (§10–§16). */
const closers: (() => void)[] = []; afterEach(() => { for (const close of closers.splice(0)) close(); });
const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const port = { save: () => Promise.reject(Error('unused')), checkpoint: () => Promise.resolve('unused') };
function motif(count: number, extra: Record<string, unknown> = {}): Motif {
  const m = createEntity('motif', `Accounting ${count}`) as Motif; m.extra = extra;
  m.data = { ...m.data, lengthTicks: Math.ceil(count * 240 / 3840) * 3840 + 3840, notes: Array.from({ length: count }, (_, i) => ({ id: id(i + 1), pitch: 36 + (i % 48), startTick: i * 240, durationTicks: 200, velocity: 64 + (i % 40) })) };
  return m;
}
function session(count: number, extra?: Record<string, unknown>): MotifSession { const s = new MotifSession(motif(count, extra), undefined, port); closers.push(() => s.dispose()); return s; }
type Internals<T> = { past: { before: T; after: T }[]; future: { before: T; after: T }[] };
/** The accounting a from-scratch walk of the retained roots gives (the reference the incremental counts must equal). */
function recount<T extends Entity>(s: HistorySession<T>): number {
  const internal = s as unknown as Internals<T>, fresh = new RetainedSize();
  for (const e of [...internal.past, ...internal.future]) { fresh.retain(e.before); fresh.retain(e.after); }
  return fresh.bytes;
}
const one = new Set([id(6)]);

describe('4I RetainedSize', () => {
  it('counts a shared object once, releases it only when its last root goes, and is order independent', () => {
    const shared = { note: 'x'.repeat(100) }, a = { list: [shared, shared], n: 1 }, b = { list: [shared], n: 2 };
    const r = new RetainedSize(); expect(r.bytes).toBe(0);
    r.retain(a); const onlyA = r.bytes; r.retain(b); const both = r.bytes;
    const solo = new RetainedSize(); solo.retain(shared); expect(both - onlyA).toBeLessThan(solo.bytes + 200); // b adds its own containers, not `shared` again
    r.release(a); expect(r.objects).toBe(3); // b, its list and shared remain
    r.release(b); expect(r.bytes).toBe(0); expect(r.objects).toBe(0);
    const x = new RetainedSize(), y = new RetainedSize(); x.retain(a); x.retain(b); y.retain(b); y.retain(a); expect(x.bytes).toBe(y.bytes);
    x.retain(a); x.release(a); expect(x.bytes).toBe(y.bytes); // counted references, not a set
  });
  it('treats non-plain values as conservative leaves', () => {
    const r = new RetainedSize(); r.retain({ when: new Date(0), map: new Map([[1, 2]]) }); expect(r.bytes).toBeGreaterThan(40 + 2 * 16 + 64);
    r.clear(); expect(r.bytes).toBe(0);
  });
});

describe('4I history accounting in sessions', () => {
  it('shares every unchanged note between MOTIF snapshots and keeps them frozen', () => {
    const s = session(500), before = s.snapshot;
    s.edit('Move notes', m => moveNotes(m, one, 240, 0, sealedMotif)); const after = s.snapshot;
    expect(after.data.notes[0]).toBe(before.data.notes[0]); expect(after.data.notes[5]).not.toBe(before.data.notes[5]);
    expect(after.data.meter).toBe(before.data.meter); expect(isDeeplyFrozen(after)).toBe(true);
    // A MOTIF transform receives the frozen draft: a write throws and the edit is atomic.
    const version = s.changeVersion; expect(() => s.edit('Bad', m => { (m.data.notes[0] as { pitch: number }).pitch = 1; return m; })).toThrow(TypeError);
    expect(s.changeVersion).toBe(version); expect(s.historySize).toBe(1);
  });
  it('equals a from-scratch recount through edits, grouped edits, undo, redo, branch invalidation and eviction', () => {
    const s = session(2000); let seed = 7; const random = (n: number): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let step = 0; step < 160; step++) {
      const choice = random(10);
      if (choice < 5) s.edit('Move notes', m => moveNotes(m, new Set([id(1 + random(1500))]), random(2) ? 240 : -240, 0, sealedMotif));
      else if (choice === 5) s.edit('Rename motif', m => ({ ...m, title: `T${step % 3}` }), 'title'); // inline: full copy, grouped
      else if (choice < 8) s.undo(); else s.redo();
      expect(s.historyBytes).toBe(recount(s));
      expect(s.historySize).toBeLessThanOrEqual(HISTORY_LIMITS.entries);
      expect(s.historySize <= 1 || s.historyBytes <= HISTORY_LIMITS.bytes).toBe(true);
    }
    while (s.canUndo) s.undo(); expect(s.historyBytes).toBe(recount(s));
    s.edit('Move notes', m => moveNotes(m, one, 240, 0, sealedMotif)); // invalidates every redo entry
    expect(s.canRedo).toBe(false); expect(s.historyBytes).toBe(recount(s));
  });
  it('enforces the 100-entry cap and reports empty history as zero', () => {
    const s = session(500); expect(s.historyBytes).toBe(0);
    for (let i = 0; i < 110; i++) s.edit('Velocity', m => velocityNotes(m, one, 40 + (i % 2), sealedMotif));
    expect(s.historySize).toBe(100); expect(s.historyBytes).toBe(recount(s)); expect(s.historyBytes).toBeLessThan(HISTORY_LIMITS.bytes);
    for (let i = 0; i < 100; i++) s.undo(); expect(s.canUndo).toBe(false); expect(s.historyBytes).toBe(recount(s));
  });
  it('keeps at least 25 small edits of a 10,000-note motif within the budget, exactly undoable, then reaches the entry cap', () => {
    const s = session(10000), states = [JSON.stringify(s.snapshot)], ops: ((m: Motif, i: number) => Motif)[] = [
      (m, i) => moveNotes(m, one, i % 2 ? -240 : 240, 0, sealedMotif), (m, i) => resizeNotes(m, one, i % 8 < 4 ? 240 : -240, sealedMotif),
      (m, i) => velocityNotes(m, one, 50 + (i % 7), sealedMotif), (m, i) => transposeNotes(m, one, i % 8 < 4 ? 12 : -12, sealedMotif)];
    for (let i = 0; i < 30; i++) { s.edit('Small edit', m => (ops[i % ops.length] as (m: Motif, i: number) => Motif)(m, i)); states.push(JSON.stringify(s.snapshot)); }
    expect(s.historySize).toBe(30); expect(s.historyBytes).toBeLessThanOrEqual(HISTORY_LIMITS.bytes); expect(s.historyBytes).toBe(recount(s));
    for (let i = 30; i > 0; i--) { expect(JSON.stringify(s.snapshot)).toBe(states[i]); s.undo(); } expect(JSON.stringify(s.snapshot)).toBe(states[0]);
    for (let i = 1; i <= 30; i++) { s.redo(); expect(JSON.stringify(s.snapshot)).toBe(states[i]); }
    for (let i = 0; i < 90; i++) s.edit('Velocity', m => velocityNotes(m, one, 60 + (i % 2), sealedMotif));
    expect(s.historySize).toBe(100); expect(s.historyBytes).toBeLessThanOrEqual(HISTORY_LIMITS.bytes);
    s.edit('Quantize starts', m => quantizeNotes(m, new Set(s.snapshot.data.notes.slice(0, 100).map(n => n.id)), 'quarter', sealedMotif));
    expect(s.historyBytes).toBe(recount(s));
  });
  it('counts unshared snapshots in full, so whole-document copies still hit the memory budget', () => {
    const s = session(10000);
    for (let i = 0; i < 12; i++) s.edit('Inline', m => ({ ...m, title: `Copy ${i}` })); // not sealed: editableMotif copies every note
    expect(s.historySize).toBeGreaterThan(1); expect(s.historySize).toBeLessThan(12); // budget reached
    expect(s.historyBytes).toBeLessThanOrEqual(HISTORY_LIMITS.bytes); expect(s.historyBytes).toBe(recount(s));
  });
  it('keeps the newest entry even when one edit alone exceeds the budget, and counts large metadata once', () => {
    const big = { text: 'm'.repeat(5_000_000) }, s = session(16, { big });
    const initial = s.snapshot; s.edit('Move notes', m => moveNotes(m, one, 240, 0, sealedMotif)); // sealed: extra is shared, so the 10 MB string counts once
    expect(s.snapshot.extra.big).toBe(initial.extra.big); const shared = s.historyBytes; expect(shared).toBeLessThan(10_500_000);
    s.edit('Inline', m => ({ ...m, title: 'Unshared' })); // editableMotif copies the string: two distinct copies exceed 16 MiB
    expect(s.historySize).toBe(1); expect(s.historyBytes).toBe(recount(s)); expect(s.canUndo).toBe(true);
    // Repeated references to one nested object survive the copy and are counted once.
    const alias = { v: 'x'.repeat(1000) }, t = session(16, { a: alias, b: alias });
    t.edit('Inline', m => ({ ...m, title: 'Aliased' })); const extra = t.snapshot.extra as { a: unknown; b: unknown }; expect(extra.a).toBe(extra.b);
    expect(t.historyBytes).toBe(recount(t));
  });
  it('creates no entry for no-op edits (exact former JSON-text semantics) and none for invalid edits', () => {
    const s = session(16);
    s.edit('Same', m => ({ ...m })); s.edit('Same', m => m); expect(s.historySize).toBe(0); expect(s.historyBytes).toBe(0);
    s.edit('Reorder', m => { const { title, ...rest } = m; return { ...rest, title } as Motif; }); // key order changes the JSON text
    expect(s.historySize).toBe(1);
    expect(() => s.edit('Bad', m => moveNotes(m, one, 10_000_000, 0, sealedMotif))).toThrow(); expect(s.historySize).toBe(1);
    expect(() => s.edit('Bad', m => ({ ...m, data: { ...m.data, ppq: 0 } }))).toThrow(); expect(s.historySize).toBe(1);
  });
  it('sameJson is exactly JSON.stringify equality on generated values', () => {
    let seed = 3; const r = (n: number): number => { seed = (seed * 48271) % 2147483647; return seed % n; };
    const leaf = (): unknown => [0, -0, 1, NaN, 'a', '', true, null, undefined][r(9)];
    const tree = (d: number): unknown => d > 3 || r(3) === 0 ? leaf() : r(2) ? Array.from({ length: r(3) }, () => tree(d + 1)) : Object.fromEntries(['a', 'b', '1'].filter(() => r(2)).map(k => [k, tree(d + 1)]));
    const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;
    for (let i = 0; i < 3000; i++) { const a = tree(0); for (const b of [reorder(a), tree(0), structuredClone(a)]) expect(sameJson(a, b)).toBe(JSON.stringify(a) === JSON.stringify(b)); }
  });
  it('leaves the editableMotif (default) contract and CANVAS-style copying sessions unchanged', () => {
    const m = motif(16), moved = moveNotes(m, one, 240, 0); expect(isDeeplyFrozen(moved)).toBe(false); expect(moved.data.notes[0]).not.toBe(m.data.notes[0]);
    const isMotif = (e: Entity): e is Motif => e.kind === 'motif';
    const copying = new HistorySession<Motif>(motif(16), undefined, port, editableMotif, isMotif); closers.push(() => copying.dispose());
    copying.edit('Mutating transform', value => { value.title = 'Changed in place'; return value; }); // default sessions still pass a private copy
    expect(copying.snapshot.title).toBe('Changed in place'); expect(copying.historyBytes).toBe(recount(copying));
  });
});
