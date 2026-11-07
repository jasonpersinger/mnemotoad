import type { Composition } from '../../domain/entities';
import { FoundationError, messageOf } from '../../domain/errors';
import { musicalInput } from '../../arrangement/compiled';
import type { EntityIndex } from '../../storage/index';
import type { EntityRecord, EntityRepository } from '../../storage/repository';
import { contentRevision } from '../../storage/content-revision';
import { editableComposition } from './commands';
import type { CanvasSession } from './session';

/**
 * Milestone 4E document freshness: how an open CANVAS session's saved base relates to the authoritative note.
 * Ephemeral (never persisted). Detection uses the shared index's SHA-256 revisions; decisions use a full re-read.
 */
export type Freshness =
  | { state: 'current' }
  | { state: 'checking' }
  | { state: 'refreshed'; areas: string[]; musical: boolean }
  | { state: 'conflict'; areas: string[]; musical: boolean; rename: boolean; kept?: boolean }
  | { state: 'unavailable'; reason: 'missing' | 'invalid' | 'duplicate' | 'unreadable'; message: string; path?: string };

const AREAS: readonly [string, (c: Composition) => unknown][] = [
  ['name', c => c.title],
  ['clips and lanes', c => c.data.lanes.map(l => ({ ...l, midiChannel: undefined, percussion: undefined }))],
  ['MIDI routing', c => c.data.lanes.map(l => [l.id, l.midiChannel, l.percussion])],
  ['tempo, meter and length', c => [c.data.tempoMicrosecondsPerQuarter, c.data.meter, c.data.lengthTicks, c.data.ppq]],
  ['sections', c => c.data.sections],
  ['markers', c => c.data.markers],
  ['recording references', c => [c.data.audioRefs, c.assets]],
  ['description, tags and notes', c => [c.description, c.tags, c.notes]],
];
const KNOWN_ENTITY = new Set(['title', 'data', 'assets', 'description', 'tags', 'notes']);
const KNOWN_DATA = new Set(['lanes', 'tempoMicrosecondsPerQuarter', 'meter', 'lengthTicks', 'ppq', 'sections', 'markers', 'audioRefs']);
const canonical = (value: unknown): string => JSON.stringify(value, (_k, v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v) ?? '';
const rest = (c: Composition): unknown => [Object.fromEntries(Object.entries(c).filter(([k]) => !KNOWN_ENTITY.has(k))), Object.fromEntries(Object.entries(c.data).filter(([k]) => !KNOWN_DATA.has(k)))];

/** Pure: human-readable changed areas plus the 4D musical classification (same denylist as compilation, unknown fields stay musical). */
export function externalChanges(before: Composition, after: Composition): { areas: string[]; musical: boolean } {
  const areas = AREAS.filter(([, pick]) => canonical(pick(before)) !== canonical(pick(after))).map(([name]) => name);
  if (canonical(rest(before)) !== canonical(rest(after))) areas.push('other fields');
  return { areas, musical: musicalInput(before, []) !== musicalInput(after, []) };
}

interface Seen { generation: number; key?: string }
/**
 * Watches the shared index for changes to open sessions' notes. Clean sessions reload (no history entry);
 * dirty sessions are never modified — they are flagged and protected Save keeps refusing. Every async step is
 * guarded by a per-session generation and the base it started from, so stale reads cannot overwrite newer state.
 */
export class CanvasFreshness {
  private readonly seen = new WeakMap<CanvasSession, Seen>();
  private readonly revisions = new WeakMap<CanvasSession, { source: string; revision: Promise<string> }>();
  private readonly afterSave = new WeakSet<CanvasSession>();
  private readonly unsubscribe: () => void;
  private closed = false;
  constructor(private readonly index: EntityIndex, private readonly repository: EntityRepository, private readonly sessions: () => Iterable<CanvasSession>, private readonly renameProof: (s: CanvasSession) => Promise<boolean>) {
    this.unsubscribe = index.subscribe(() => { for (const s of this.sessions()) void this.check(s); });
  }
  /** Re-check once an own Save settles (its index publish arrives while the session is busy) and retire "refreshed" on the next edit. */
  watch(s: CanvasSession): void {
    let busy = s.busy, version = s.changeVersion;
    s.subscribe(() => {
      if (busy && !s.busy) { busy = false; void this.check(s, true); } else busy = s.busy;
      if (s.changeVersion !== version) { version = s.changeVersion; if (s.freshness.state === 'refreshed' && s.dirty) s.setFreshness({ state: 'current' }); }
    });
    if (s.base) void this.check(s);
  }
  private revision(s: CanvasSession, source: string): Promise<string> {
    const cached = this.revisions.get(s); if (cached?.source === source) return cached.revision;
    const revision = contentRevision(source); this.revisions.set(s, { source, revision }); return revision;
  }
  private stale(s: CanvasSession, generation: number, base: EntityRecord): boolean { return this.closed || s.disposed || this.seen.get(s)?.generation !== generation || s.base?.source !== base.source; }
  private unavailable(s: CanvasSession, reason: Extract<Freshness, { state: 'unavailable' }>['reason'], message: string, path?: string): void { s.setFreshness({ state: 'unavailable', reason, message, ...(path ? { path } : {}) }); }

  async check(s: CanvasSession, ownSave = false): Promise<void> {
    const base = s.base; if (this.closed || s.disposed || !base) return;
    const previous = this.seen.get(s), generation = (previous?.generation ?? 0) + 1; this.seen.set(s, { generation, key: previous?.key });
    if (s.busy) { this.afterSave.add(s); return; }
    if (this.afterSave.has(s)) { this.afterSave.delete(s); ownSave = true; }
    const id = base.entity.id.toLowerCase();
    let heads = this.index.heads().filter(h => h.id === id);
    // A rename publishes the removal before the new path is re-read: wait for the index queue, not a timer.
    if (!heads.length) { await this.index.settled(); if (this.stale(s, generation, base)) return; heads = this.index.heads().filter(h => h.id === id); }
    if (!heads.length) { this.unavailable(s, 'missing', 'The composition note was deleted or moved out of the vault. Your arrangement draft is kept in memory; Save is blocked and will not create a replacement note. Restore the note (same UUID) or store a recovery copy.'); return; }
    if (heads.length > 1) { this.unavailable(s, 'duplicate', `Several notes now carry this composition's UUID (${heads.map(h => h.path).sort().join(', ')}). Save is blocked until the duplicate is resolved; your draft is kept.`); return; }
    const head = heads[0]; if (!head) return;
    if (head.errorCode) { this.unavailable(s, 'invalid', `${head.message ?? 'The note cannot be read as a composition.'} The note was not rewritten and your arrangement draft is kept.`, head.path); return; }
    const baseRevision = await this.revision(s, base.source); if (this.stale(s, generation, base)) return;
    const key = `${head.revision}:${head.path}`;
    if (head.revision === baseRevision && head.path === base.path) {
      const state = s.freshness.state; if (state !== 'refreshed' || ownSave) s.setFreshness({ state: 'current' });
      this.seen.set(s, { generation, key }); return;
    }
    if (previous?.key === key && s.freshness.state === 'conflict') return; // already classified this revision
    if (head.revision !== baseRevision) s.setFreshness({ state: 'checking' });
    let record: EntityRecord;
    try { record = await this.repository.read(id); }
    catch (error) {
      if (this.stale(s, generation, base)) return;
      const code = error instanceof FoundationError ? error.code : 'io';
      this.unavailable(s, code === 'missing' ? 'missing' : code === 'duplicate' ? 'duplicate' : code === 'io' ? 'unreadable' : 'invalid', `${messageOf(error)} Your arrangement draft is kept; Save stays protected.`, head.path); return;
    }
    if (this.stale(s, generation, base)) return;
    if (record.source === base.source) { if (record.path !== base.path) s.relocate(record); s.setFreshness({ state: 'current' }); this.seen.set(s, { generation, key }); return; }
    try { if (record.entity.kind !== 'composition') throw new FoundationError('wrong-kind', 'The note is no longer a composition.'); editableComposition(record.entity); }
    catch (error) { this.unavailable(s, 'invalid', `${messageOf(error)} The note was not rewritten and your arrangement draft is kept.`, record.path); return; }
    // Both sides as parsed from their saved sources (same normalization), so only real differences are reported.
    const changes = externalChanges(base.entity as Composition, record.entity);
    if (s.busy) { this.afterSave.add(s); return; }
    if (!s.dirty) { s.reload(record); s.setFreshness({ state: 'refreshed', ...changes }); this.seen.set(s, { generation, key }); return; }
    const rename = await this.renameProof(s).catch(() => false); if (this.stale(s, generation, base)) return;
    s.setFreshness({ state: 'conflict', ...changes, rename }); this.seen.set(s, { generation, key });
  }
  dispose(): void { this.closed = true; this.unsubscribe(); }
}
