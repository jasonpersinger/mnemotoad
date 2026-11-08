/**
 * 4H: key-order-insensitive JSON equality without building strings.
 *
 * `jsonEqual(a, b)` is exactly `canonicalJson(a) === canonicalJson(b)`, where canonicalJson is JSON.stringify with every
 * plain object's keys sorted (the comparison HistorySession.dirty used through 4G). It follows JSON.stringify's rules:
 * object members whose value is undefined/function/symbol are omitted, the same values inside arrays become null,
 * non-finite numbers become null and -0 equals 0. Anything outside plain JSON data (toJSON, Date, Map, boxed values,
 * bigint, class instances) falls back to comparing the canonical strings, so the result never differs from the old check.
 */
export function canonicalJson(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
const unsupported = Symbol('unsupported');
const absent = (v: unknown): boolean => v === undefined || typeof v === 'function' || typeof v === 'symbol';
function primitive(v: unknown): unknown {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') throw unsupported;
  return v;
}
function plain(v: object): boolean {
  if (Array.isArray(v)) return Object.getPrototypeOf(v) === Array.prototype && typeof (v as { toJSON?: unknown }).toJSON !== 'function';
  const proto = Object.getPrototypeOf(v) as unknown;
  return (proto === Object.prototype || proto === null) && typeof (v as { toJSON?: unknown }).toJSON !== 'function';
}
function same(x: unknown, y: unknown, ordered = false): boolean {
  const a = primitive(x), b = primitive(y);
  if (a === b) return true; // the same primitive or the same reference serialises identically
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    if ((a && typeof a === 'object' && !plain(a)) || (b && typeof b === 'object' && !plain(b))) throw unsupported;
    return false;
  }
  if (!plain(a) || !plain(b)) throw unsupported;
  const arrayA = Array.isArray(a), arrayB = Array.isArray(b);
  if (arrayA !== arrayB) return false;
  if (arrayA && arrayB) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { const p: unknown = a[i], q: unknown = b[i]; if (!same(absent(p) ? null : p, absent(q) ? null : q, ordered)) return false; }
    return true;
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  if (ordered) {
    // JSON.stringify emits members in Object.keys order: equal text needs the same present keys in the same order.
    const keysA = Object.keys(left).filter(k => !absent(left[k])), keysB = Object.keys(right).filter(k => !absent(right[k]));
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) { const k = keysA[i] as string; if (k !== keysB[i] || !same(left[k], right[k], true)) return false; }
    return true;
  }
  let count = 0;
  for (const key of Object.keys(left)) {
    const p = left[key]; if (absent(p)) continue; count++;
    if (!Object.prototype.hasOwnProperty.call(right, key) || !Object.prototype.propertyIsEnumerable.call(right, key)) return false;
    const q = right[key]; if (absent(q) || !same(p, q)) return false;
  }
  for (const key of Object.keys(right)) if (!absent(right[key])) count--;
  return count === 0;
}
export function jsonEqual(a: unknown, b: unknown): boolean {
  try { return same(absent(a) ? undefined : a, absent(b) ? undefined : b); }
  catch (error) { if (error !== unsupported) throw error; return canonicalJson(a) === canonicalJson(b); }
}
/**
 * 4I: exactly `JSON.stringify(a) === JSON.stringify(b)` (key order matters), without building either string; shared
 * frozen subtrees compare by identity. Falls back to the strings for values outside plain JSON data.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  try { return same(absent(a) ? undefined : a, absent(b) ? undefined : b, true); }
  catch (error) { if (error !== unsupported) throw error; return JSON.stringify(a) === JSON.stringify(b); }
}
