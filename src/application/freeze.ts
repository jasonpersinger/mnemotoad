const deeplyFrozen = new WeakSet<object>();
/**
 * 4H: deep-freeze a value the caller owns exclusively (children before parents; values already frozen by this function
 * are skipped). Session drafts, history snapshots and validated MOTIF command results are frozen, so sharing them instead
 * of copying is safe: any write throws (the bundle and every test run in strict mode).
 */
export function freezeDeep<V>(value: V): V {
  if (value && typeof value === 'object' && !deeplyFrozen.has(value)) {
    deeplyFrozen.add(value);
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
/** True only for values frozen (completely) by freezeDeep. */
export function isDeeplyFrozen(value: unknown): boolean { return !!value && typeof value === 'object' && deeplyFrozen.has(value) && Object.isFrozen(value); }
