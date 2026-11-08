import type { Entity } from '../domain/entities';
import { checkActive, messageOf } from '../domain/errors';
import { UUID } from '../domain/validation';
import type { AssetPort, VaultAsset } from './asset-port';
import type { EntityIndex } from './index';
import type { VaultPort } from './vault-port';

/**
 * 4I recovery register catalog. A read-only, in-memory view over the documented Recovery folders; never a second source
 * of truth (nothing is persisted, every value is re-derived from the vault and the entity index).
 *
 * Tier 1 (`list`, no file reads): file listing + entity index → path, checkpoint id, folder UUID, file time and size,
 * and — when the UUID resolves — the current document's name, module, path and availability.
 * Tier 2 (`details`, one read per checkpoint, cached by path + size + modified time): the envelope's format, reason,
 * saved time, draft kind/title, source path and a structural integrity class. Full module validation stays in
 * CheckpointRecovery.inspect (the inspector), which remains authoritative.
 */
export type RecoveryModule = 'MOTIF' | 'CANVAS' | 'PATCHBOOK' | 'Unknown';
export type CheckpointType = 'Unsaved draft of a saved record' | 'Unsaved draft of a new record' | 'Pre-save backup' | 'Recovery copy' | 'Unknown';
export type CheckpointIntegrity = 'Readable' | 'Malformed' | 'Unsupported schema' | 'Unrecognized format' | 'Too large to inspect' | 'Unreadable';
export interface CheckpointDetails {
  readonly integrity: CheckpointIntegrity; readonly problem?: string;
  readonly format?: string; readonly reason?: string; readonly type: CheckpointType;
  readonly savedAt?: string; readonly entityId?: string; readonly kind?: Entity['kind']; readonly draftTitle?: string;
  readonly sourcePath?: string; readonly invalidFields?: boolean;
}
export interface CatalogEntry {
  readonly path: string; readonly checkpointId: string; readonly folderId?: string; readonly modified: number; readonly size: number;
  readonly documentTitle?: string; readonly documentPath?: string; readonly documentKind?: Entity['kind'];
  /** Index status of the folder UUID: ready, missing, duplicate, invalid, … ('unknown' when the folder is not a UUID). */
  readonly availability: string;
  details?: CheckpointDetails;
}
export const MAX_CHECKPOINT_BYTES = 20 * 1024 * 1024;
export const moduleOf = (kind?: string): RecoveryModule => kind === 'motif' ? 'MOTIF' : kind === 'composition' ? 'CANVAS' : kind && ['patch', 'instrument', 'effects-chain'].includes(kind) ? 'PATCHBOOK' : 'Unknown';
/** Module, name, time and type as shown (best known: current record, then the checkpoint's own content). */
export const entryModule = (e: CatalogEntry): RecoveryModule => moduleOf(e.documentKind ?? e.details?.kind);
export const entryTitle = (e: CatalogEntry): string | undefined => e.documentTitle ?? e.details?.draftTitle;
export const entryTime = (e: CatalogEntry): number => { const saved = e.details?.savedAt ? Date.parse(e.details.savedAt) : NaN; return Number.isFinite(saved) ? saved : e.modified; };

const caches = new WeakMap<object, Map<string, { size: number; modified: number; details: CheckpointDetails }>>();
function classify(raw: string): CheckpointDetails {
  let value: unknown;
  try { value = JSON.parse(raw); } catch (error) { return { integrity: 'Malformed', problem: `Not valid JSON: ${messageOf(error)}`, type: 'Unknown' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { integrity: 'Malformed', problem: 'Not a recovery envelope object.', type: 'Unknown' };
  const e = value as Record<string, unknown>, format = typeof e.format === 'string' ? e.format : undefined;
  const draft = e.draft && typeof e.draft === 'object' && !Array.isArray(e.draft) ? e.draft as Record<string, unknown> : undefined;
  const reason = typeof e.reason === 'string' ? e.reason : undefined;
  const type: CheckpointType = format === 'mnemobard-editor-draft' ? typeof e.originalSource === 'string' ? 'Unsaved draft of a saved record' : e.originalSource === null ? 'Unsaved draft of a new record' : 'Unknown'
    : format === 'mnemobard-recovery' ? reason === 'before-save' ? 'Pre-save backup' : reason === 'explicit-draft' ? 'Recovery copy' : 'Unknown' : 'Unknown';
  const base = {
    format, reason, type, savedAt: typeof e.savedAt === 'string' && Number.isFinite(Date.parse(e.savedAt)) ? e.savedAt : undefined,
    entityId: typeof e.entityId === 'string' && UUID.test(e.entityId) ? e.entityId : undefined,
    kind: typeof draft?.kind === 'string' ? draft.kind as Entity['kind'] : undefined, draftTitle: typeof draft?.title === 'string' && draft.title.trim() ? draft.title : undefined,
    sourcePath: typeof e.sourcePath === 'string' ? e.sourcePath : undefined, invalidFields: typeof e.validationError === 'string' ? true : undefined,
  };
  if (format !== 'mnemobard-recovery' && format !== 'mnemobard-editor-draft') return { ...base, integrity: 'Unrecognized format', problem: 'Not a MNEMOTOAD recovery format; retained for inspection.' };
  if (e.schemaVersion !== 1) return { ...base, integrity: 'Unsupported schema', problem: `Recovery schema ${String(e.schemaVersion)} is not supported by this version; nothing was converted.` };
  if (!base.entityId || !base.savedAt || !draft) return { ...base, integrity: 'Malformed', problem: 'Identity, timestamp or draft is missing or malformed.' };
  return { ...base, integrity: 'Readable' };
}

export class RecoveryCatalog {
  private readonly cache: Map<string, { size: number; modified: number; details: CheckpointDetails }>;
  constructor(private readonly vault: VaultPort & AssetPort, private readonly index: EntityIndex) {
    let cache = caches.get(vault); if (!cache) { cache = new Map(); caches.set(vault, cache); } this.cache = cache;
  }
  /** Tier 1: every checkpoint in a documented Recovery folder (no file reads), cached details attached when still valid. */
  list(): CatalogEntry[] {
    const heads = new Map<string, { path: string; kind?: Entity['kind']; title?: string }>();
    for (const head of this.index.heads()) if (head.id) heads.set(head.id.toLowerCase(), head);
    const states = new Map<string, string>(); // one index lookup per document folder, not per checkpoint
    return this.vault.assetFiles().filter(file => file.path.includes('/Recovery/') && file.extension.toLowerCase() === 'json').map(file => this.entry(file, heads, states));
  }
  private entry(file: VaultAsset, heads: Map<string, { path: string; kind?: Entity['kind']; title?: string }>, states = new Map<string, string>()): CatalogEntry {
    const parts = file.path.split('/'), folder = parts.at(-2), folderId = folder && UUID.test(folder) ? folder : undefined;
    let status = folderId ? states.get(folderId) : undefined;
    if (folderId && status === undefined) { status = this.index.locate(folderId).status; states.set(folderId, status); }
    const state = status === undefined ? undefined : { status }, head = folderId && state?.status === 'ready' ? heads.get(folderId.toLowerCase()) : undefined;
    const cached = this.cache.get(file.path);
    return {
      path: file.path, checkpointId: file.name.replace(/\.json$/i, ''), folderId, modified: file.modified, size: file.size,
      documentTitle: head?.title, documentPath: head?.path, documentKind: head?.kind, availability: state?.status ?? 'unknown',
      details: cached && cached.size === file.size && cached.modified === file.modified ? cached.details : undefined,
    };
  }
  /** Index status of a document UUID (ready, missing, duplicate, invalid, …). */
  status(id: string): string { return this.index.locate(id).status; }
  /** Current saved title of a document UUID, when it resolves. */
  title(id: string): string | undefined { const s = this.index.locate(id); return s.status === 'ready' ? this.index.heads().find(h => h.id?.toLowerCase() === id.toLowerCase())?.title : undefined; }
  /** Saved records of `kind` that reference `id` (unsaved drafts are not indexed). */
  referencing(id: string, kind: Entity['kind']): number { return this.index.referencing(id, kind).length; }
  /** Tier 2: read one checkpoint's envelope (cached by size + modified time; never written). */
  async details(entry: CatalogEntry, signal?: AbortSignal): Promise<CheckpointDetails> {
    const cached = this.cache.get(entry.path);
    if (cached && cached.size === entry.size && cached.modified === entry.modified) return entry.details = cached.details;
    let details: CheckpointDetails;
    if (entry.size > MAX_CHECKPOINT_BYTES) details = { integrity: 'Too large to inspect', problem: 'Exceeds the 20 MiB inspection limit; the file is retained unchanged.', type: 'Unknown' };
    else {
      let raw: string | undefined;
      try { raw = await this.vault.read(entry.path); } catch (error) { checkActive(signal); details = { integrity: 'Unreadable', problem: messageOf(error), type: 'Unknown' }; }
      checkActive(signal);
      details ??= classify(raw ?? '');
    }
    this.cache.set(entry.path, { size: entry.size, modified: entry.modified, details }); entry.details = details; return details;
  }
  /** Reads details for many entries with bounded concurrency (yielding between files); progress after each. */
  async readAll(entries: readonly CatalogEntry[], signal: AbortSignal, progress: (done: number, total: number) => void, concurrency = 4): Promise<void> {
    const pending = entries.filter(e => !e.details); let next = 0, done = 0;
    const worker = async (): Promise<void> => { while (next < pending.length) { checkActive(signal); const entry = pending[next++]; if (entry) await this.details(entry, signal); progress(++done, pending.length); await new Promise(r => setTimeout(r, 0)); } };
    await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
  }
}

export type CatalogSort = 'newest' | 'oldest' | 'name';
export interface CatalogQuery {
  search?: string; module?: RecoveryModule | 'all'; type?: CheckpointType | 'all'; document?: string | 'all';
  /** Inclusive local dates (YYYY-MM-DD). */ from?: string; to?: string;
  sort?: CatalogSort; page?: number; pageSize?: number;
}
export interface CatalogPage { rows: CatalogEntry[]; total: number; page: number; pages: number; first: number; last: number; unreadExcluded: number;
  /** Search did not match these, but their names are not known until their details are read (no indexed document). */ unnamedUnmatched: number }
const dayStart = (date: string): number => new Date(`${date}T00:00:00`).getTime();
/** Search text of an entry: names, UUIDs, checkpoint id, paths and both ISO and local timestamps. */
const texts = new WeakMap<CatalogEntry, { details?: CheckpointDetails; text: string }>();
export function searchText(e: CatalogEntry): string {
  const cached = texts.get(e); if (cached && cached.details === e.details) return cached.text;
  const time = entryTime(e), d = e.details;
  const text = [entryTitle(e), d?.draftTitle, e.folderId, d?.entityId, e.checkpointId, e.path, e.documentPath, d?.sourcePath, new Date(time).toISOString(), new Date(time).toLocaleString(), entryModule(e), d?.type].filter(Boolean).join('\n').toLowerCase();
  texts.set(e, { details: d, text }); return text;
}
/**
 * Pure query over catalog entries: case-insensitive AND search over all terms, filters, deterministic sort (ties broken by
 * path), clamped pagination. A type filter can only judge checkpoints whose details were read: unread ones are excluded
 * and counted in `unreadExcluded` so the interface can say so (never a silent cap).
 */
export function queryCatalog(entries: readonly CatalogEntry[], q: CatalogQuery): CatalogPage {
  const terms = (q.search ?? '').toLowerCase().split(/\s+/).filter(Boolean), from = q.from ? dayStart(q.from) : -Infinity, to = q.to ? dayStart(q.to) + 86_400_000 : Infinity;
  let unreadExcluded = 0, unnamedUnmatched = 0;
  const matched = entries.filter(e => {
    if (q.module && q.module !== 'all' && entryModule(e) !== q.module) return false;
    if (q.document && q.document !== 'all' && (e.folderId ?? e.details?.entityId)?.toLowerCase() !== q.document.toLowerCase()) return false;
    const time = entryTime(e); if (time < from || time >= to) return false;
    if (terms.length) { const text = searchText(e); if (!terms.every(t => text.includes(t))) { if (!e.details && !e.documentTitle) unnamedUnmatched++; return false; } }
    if (q.type && q.type !== 'all') { if (!e.details) { unreadExcluded++; return false; } if (e.details.type !== q.type) return false; }
    return true;
  });
  const byName = (e: CatalogEntry): string => (entryTitle(e) ?? '￿').toLocaleLowerCase();
  matched.sort((a, b) => q.sort === 'oldest' ? entryTime(a) - entryTime(b) || a.path.localeCompare(b.path)
    : q.sort === 'name' ? byName(a).localeCompare(byName(b)) || entryTime(b) - entryTime(a) || a.path.localeCompare(b.path)
    : entryTime(b) - entryTime(a) || a.path.localeCompare(b.path));
  const pageSize = Math.max(1, q.pageSize ?? 25), pages = Math.max(1, Math.ceil(matched.length / pageSize)), page = Math.min(Math.max(0, q.page ?? 0), pages - 1);
  const rows = matched.slice(page * pageSize, page * pageSize + pageSize);
  return { rows, total: matched.length, page, pages, first: rows.length ? page * pageSize + 1 : 0, last: page * pageSize + rows.length, unreadExcluded, unnamedUnmatched };
}
