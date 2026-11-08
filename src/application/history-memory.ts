/**
 * 4I: estimated memory retained by undo history, counting every distinct object ONCE while any history root reaches it.
 *
 * Model. History snapshots are deeply frozen, acyclic JSON trees that may share nested objects (MOTIF edits share every
 * unchanged note with the previous snapshot; consecutive entries share whole snapshots). The estimate is the sum, over the
 * distinct objects reachable from the retained roots, of an approximate V8-style own size:
 *   - plain object: 40 bytes + 16 per own enumerable property; array: 32 bytes + 8 per element (the slot/pointer);
 *   - primitive member values: string 24 + 2 × length (counted per occurrence, no interning assumed), number 16 (boxed
 *     heap number, conservative for small integers), boolean/null/undefined 0 beyond the slot;
 *   - anything that is not a plain object or array (never present in validated entities) is a leaf costing
 *     64 + 2 × its JSON length (1 KiB if it cannot be serialised).
 * It is an estimate of retained heap, not a measurement: engine overheads, hidden classes and string interning differ.
 * It is deterministic for a given set of roots and independent of insertion order.
 *
 * Mechanics. Reference counting over the DAG: `retain(root)` increments the root; an object reaching count 1 is added
 * and its children retained; `release(root)` decrements, and an object reaching 0 is subtracted and its children released.
 * Both cost O(newly added/removed objects + their direct children), so a small edit costs one pass over the new
 * snapshot's changed containers (for a MOTIF: the notes array), not over the whole history.
 */
const plain = (value: object): boolean => Array.isArray(value) ? Object.getPrototypeOf(value) === Array.prototype : [Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null);
function primitiveBytes(value: unknown): number {
  if (typeof value === 'string') return 24 + 2 * value.length;
  if (typeof value === 'number' || typeof value === 'bigint') return 16;
  return 0;
}
function leafBytes(value: object): number { try { return 64 + 2 * (JSON.stringify(value)?.length ?? 0); } catch { return 1024; } }
function ownBytes(value: object): number {
  if (!plain(value)) return leafBytes(value);
  if (Array.isArray(value)) { let bytes = 32 + 8 * value.length; for (const item of value as unknown[]) bytes += primitiveBytes(item); return bytes; }
  let bytes = 40; for (const key of Object.keys(value)) bytes += 16 + primitiveBytes((value as Record<string, unknown>)[key]); return bytes;
}
const children = (value: object): unknown[] => plain(value) ? Array.isArray(value) ? value as unknown[] : Object.values(value) : [];

export class RetainedSize {
  private readonly counts = new Map<object, { refs: number; bytes: number }>();
  private size = 0;
  /** Estimated bytes of all distinct objects reachable from the retained roots. */
  get bytes(): number { return this.size; }
  /** Distinct objects currently counted (diagnostics/tests). */
  get objects(): number { return this.counts.size; }
  retain(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const entry = this.counts.get(value);
    if (entry) { entry.refs++; return; }
    const bytes = ownBytes(value); this.counts.set(value, { refs: 1, bytes }); this.size += bytes;
    for (const child of children(value)) this.retain(child);
  }
  release(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const entry = this.counts.get(value); if (!entry) return;
    if (--entry.refs > 0) return;
    this.counts.delete(value); this.size -= entry.bytes;
    for (const child of children(value)) this.release(child);
  }
  clear(): void { this.counts.clear(); this.size = 0; }
}
