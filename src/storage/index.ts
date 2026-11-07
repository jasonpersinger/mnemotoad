import type { Entity } from '../domain/entities';
import { contentRevision } from './content-revision';
import { FoundationError, messageOf } from '../domain/errors';
import { entityIdentityHint, parseEntityDocument } from './document';
import type { VaultChange, VaultPort } from './vault-port';

export interface IndexEntry { path: string; id?: string; entity?: Entity; error?: FoundationError; revision?: string }
/** 4F: lowercased UUIDs this saved record references (lanes/clips/patch/instrument/chains) → occurrence count. Derived at parse time; never persisted. */
export type ReferenceLinks = ReadonlyMap<string, number>;
export interface ReferencingRecord { path: string; id: string; kind: Entity['kind']; title: string; count: number; archived: boolean }
/** Library records carry `archived`; motifs may carry the extension flag the CANVAS source catalog honours. */
function archivedEntity(entity: Entity | undefined): boolean | undefined { if (!entity) return undefined; return ('archived' in entity && entity.archived === true) || entity.extra?.mnemobard_archived === true; }
function linksOf(entity: Entity): ReferenceLinks {
  const links = new Map<string, number>(), add = (id: string | undefined) => { if (id) links.set(id.toLowerCase(), (links.get(id.toLowerCase()) ?? 0) + 1); };
  if (entity.kind === 'motif') add(entity.patchId);
  else if (entity.kind === 'patch') { add(entity.instrumentId); entity.effectsChainIds?.forEach(add); }
  else if (entity.kind === 'composition') for (const lane of entity.data.lanes) { add(lane.patchId); for (const clip of lane.clips) add(clip.motifId); }
  return links;
}
export type Resolution = { status: 'missing'; id: string } | { status: 'duplicate'; id: string; paths: string[] } |
  { status: 'invalid'; entry: IndexEntry } | { status: 'ready'; path: string; entity: Entity };
/** 4G: a Resolution without the entity (status/path checks must not clone large musical arrays). */
export type Location = Exclude<Resolution, { status: 'ready' }> | { status: 'ready'; path: string };

export class EntityIndex {
  private entries = new Map<string, IndexEntry>();
  private links = new Map<string, ReferenceLinks>();
  private versions = new Map<string, number>();
  private tail: Promise<void> = Promise.resolve();
  private unsubscribe?: () => void;
  private listeners = new Set<() => void>();
  private closed = false;
  private started = false;
  private revision = 0;
  get currentRevision(): number { return this.revision; }
  constructor(private readonly vault: VaultPort) {}

  start(): Promise<void> {
    if (this.closed) return Promise.reject(new FoundationError('disposed', 'Entity index is closed.'));
    if (!this.started) {
      this.started = true;
      this.unsubscribe = this.vault.subscribe(change => this.onChange(change));
      this.enqueue(this.vault.markdownPaths());
    }
    return this.settled();
  }
  private onChange(change: VaultChange): void {
    if (this.closed) return;
    if (change.type === 'delete' || change.type === 'rename') {
      const old = change.oldPath ?? change.path;
      for (const path of new Set([...this.entries.keys(), ...this.versions.keys()])) {
        if (path === old || (change.folder && path.startsWith(old + '/'))) {
          this.versions.set(path, (this.versions.get(path) ?? 0) + 1); this.entries.delete(path); this.links.delete(path);
        }
      }
      this.publish();
    }
    if (change.type !== 'delete') this.enqueue(change.folder ? this.vault.markdownPaths().filter(p => p.startsWith(change.path + '/')) : [change.path]);
  }
  private enqueue(paths: string[]): void {
    const requests = [...new Set(paths)].filter(p => p.endsWith('.md')).map(path => {
      const version = (this.versions.get(path) ?? 0) + 1; this.versions.set(path, version); return { path, version };
    });
    if (!requests.length || this.closed) return;
    this.tail = this.tail.then(async () => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < requests.length && !this.closed) {
          const request = requests[cursor++]; if (!request) return;
          const { path, version } = request;
          if (this.versions.get(path) !== version) continue;
          let entry: IndexEntry | undefined, source: string | undefined;
          try {
            if (this.vault.exists(path)) {
              source = await this.vault.read(path);
              const parsed = parseEntityDocument(source);
              if (parsed) entry = { path, id: parsed.entity.id.toLowerCase(), entity: parsed.entity, ...(['motif','composition'].includes(parsed.entity.kind)?{revision:await contentRevision(source)}:{}) };
            }
          } catch (error) {
            const hint = source === undefined ? this.entries.get(path)?.id : entityIdentityHint(source);
            entry = { path, ...(hint ? { id: hint } : {}),
              error: error instanceof FoundationError ? error : new FoundationError('io', `Cannot read ${path}: ${messageOf(error)}`, { path, cause: error }) };
          }
          if (this.closed || this.versions.get(path) !== version) continue;
          if (entry) this.entries.set(path, entry); else this.entries.delete(path);
          if (entry?.entity) this.links.set(path, linksOf(entry.entity)); else this.links.delete(path);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, requests.length) }, worker));
      if (!this.closed) this.publish();
    });
  }
  async settled(): Promise<void> {
    let observed: Promise<void>;
    do { observed = this.tail; await observed; } while (observed !== this.tail);
  }
  async refresh(path: string): Promise<void> { this.enqueue([path]); await this.settled(); }
  resolve(id: string): Resolution {
    const found = this.locate(id);
    if (found.status !== 'ready') return found;
    const entity = this.entries.get(found.path)?.entity;
    return entity ? { status: 'ready', path: found.path, entity: structuredClone(entity) } : { status: 'missing', id };
  }
  /** 4G: same classification as resolve() without cloning the entity (status, path and duplicate checks). */
  locate(id: string): Location {
    const found = [...this.entries.values()].filter(e => e.id === id.toLowerCase());
    if (found.length === 0) return { status: 'missing', id };
    if (found.length > 1) return { status: 'duplicate', id, paths: found.map(e => e.path).sort() };
    const entry = found[0];
    if (!entry) return { status: 'missing', id };
    if (!entry.entity || entry.error) return { status: 'invalid', entry: cloneEntry(entry) };
    return { status: 'ready', path: entry.path };
  }
  /** Scalar metadata only: consumers can invalidate caches without cloning musical arrays. */
  heads(): {path:string;id?:string;kind?:Entity['kind'];title?:string;revision?:string;errorCode?:FoundationError['code'];message?:string;archived?:boolean}[]{
    return [...this.entries.values()].map(e=>({path:e.path,id:e.id,kind:e.entity?.kind,title:e.entity?.title,revision:e.revision,errorCode:e.error?.code,message:e.error?.message,archived:archivedEntity(e.entity)}));
  }
  /**
   * 4F reverse references: saved records whose parsed data references `id`, with occurrence counts (e.g. clip placements).
   * Reads the parse-time link summaries only — no entity cloning, no I/O, no writes.
   */
  referencing(id: string, kind?: Entity['kind']): ReferencingRecord[] {
    const target = id.toLowerCase(), out: ReferencingRecord[] = [];
    for (const [path, links] of this.links) {
      const count = links.get(target), entry = this.entries.get(path), entity = entry?.entity;
      if (!count || !entity || !entry.id || (kind && entity.kind !== kind)) continue;
      out.push({ path, id: entity.id, kind: entity.kind, title: entity.title, count, archived: archivedEntity(entity) === true });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path));
  }
  /** 4F forward references of a saved record (e.g. a motif's patch) from the same parse-time summary; no cloning. */
  outgoing(id: string): string[] { const target = id.toLowerCase(); for (const [path, links] of this.links) if (this.entries.get(path)?.id === target) return [...links.keys()]; return []; }
  all(): IndexEntry[] { return [...this.entries.values()].map(cloneEntry); }
  /** 4E: clone only entries of these kinds (all() clones every entity, e.g. large compositions, on each index publish). */
  ofKind(...kinds: Entity['kind'][]): IndexEntry[] { return [...this.entries.values()].filter(e => !!e.entity && kinds.includes(e.entity.kind)).map(cloneEntry); }
  subscribe(listener: () => void): () => void { if (this.closed) return () => {}; this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish(): void { if (!this.closed) { this.revision++; for (const listener of this.listeners) listener(); } }
  dispose(): void { this.closed = true; this.unsubscribe?.(); this.listeners.clear(); this.entries.clear(); this.versions.clear(); this.links.clear(); }
}

function cloneEntry(entry: IndexEntry): IndexEntry {
  return { path: entry.path, ...(entry.revision?{revision:entry.revision}:{}), ...(entry.id ? { id: entry.id } : {}),
    ...(entry.entity ? { entity: structuredClone(entry.entity) } : {}),
    ...(entry.error ? { error: new FoundationError(entry.error.code, entry.error.message, { ...entry.error.context }) } : {}) };
}
