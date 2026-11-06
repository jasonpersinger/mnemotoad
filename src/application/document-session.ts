import type { Entity } from '../domain/entities';
import { FoundationError, messageOf } from '../domain/errors';
import type { EntityRecord } from '../storage/repository';

export interface DocumentSessionPort<T extends Entity> {
  save(base: EntityRecord | undefined, draft: T, signal: AbortSignal): Promise<EntityRecord>;
  checkpoint(draft: T, base: EntityRecord | undefined, signal: AbortSignal): Promise<string>;
}
/** Shared per-ID draft. Rendering never owns the only copy of pending edits. */
export class DocumentSession<T extends Entity> {
  private value: T;
  private revision = 0;
  private savedRevision = 0;
  private checkpointRevision = -1;
  private timer?: ReturnType<typeof setTimeout>;
  private checkpointing?: Promise<void>;
  private listeners = new Set<() => void>();
  private readonly lifetime = new AbortController();
  private closed = false;
  busy = false;
  error = '';
  recoveryPath?: string;
  base?: EntityRecord;
  constructor(draft: T, base: EntityRecord | undefined, private readonly port: DocumentSessionPort<T>, private readonly checkpointDelay = 500, private readonly accepts: (entity: Entity) => entity is T) {
    this.value = structuredClone(draft); this.base = base ? structuredClone(base) : undefined;
  }
  protected get revisionNumber(): number { return this.revision; }
  get draft(): T { return structuredClone(this.value); }
  get dirty(): boolean { return !this.base || this.revision !== this.savedRevision; }
  get disposed(): boolean { return this.closed; }
  get status(): string {
    if (this.error) return this.error;
    if (this.busy) return 'Saving…';
    if (!this.dirty) return 'Saved';
    return this.checkpointRevision === this.revision ? 'Unsaved changes · recovery copy stored' : 'Unsaved changes';
  }
  update(next: T): void {
    this.active();
    if (next.id !== this.value.id || next.kind !== this.value.kind) throw new FoundationError('invalid', 'Draft identity cannot change');
    this.value = structuredClone(next); this.revision++; this.error = '';
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.checkpoint().catch(error => { if (!this.closed) { this.error = `Recovery copy failed: ${messageOf(error)}`; this.publish(); } }); }, this.checkpointDelay);
    this.publish();
  }
  private active(): void { if (this.closed) throw new FoundationError('disposed', 'The document draft is closed. Reopen its module.'); }
  async save(): Promise<EntityRecord> {
    this.active(); if (this.busy) throw new FoundationError('conflict', 'A save is already running.');
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    const revision = this.revision, value = this.draft;
    this.busy = true; this.error = ''; this.publish();
    try {
      const record = await this.port.save(this.base, value, this.lifetime.signal);
      if (!this.accepts(record.entity) || record.entity.id !== this.value.id || record.entity.kind !== this.value.kind) throw new FoundationError('invalid', 'The saved record does not match this document draft. Inspect the note before retrying.');
      if (!this.closed) {
        this.base = structuredClone(record); this.savedRevision = revision;
        if (this.revision === revision) this.value = structuredClone(record.entity);
      }
      return record;
    } catch (error) {
      if (!this.closed) {
        this.error = `Not saved: ${messageOf(error)}`;
        try { await this.checkpoint(); }
        catch (recoveryError) { this.error += ` Recovery copy also failed: ${messageOf(recoveryError)}`; }
      }
      throw error;
    } finally { this.busy = false; if (!this.closed) this.publish(); }
  }
  async checkpoint(): Promise<void> {
    this.active();
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    while (this.checkpointing) { await this.checkpointing; if (this.closed) return; }
    if (!this.dirty || this.checkpointRevision === this.revision) return;
    const revision = this.revision, draft = this.draft, base = this.base ? structuredClone(this.base) : undefined;
    const pending = this.port.checkpoint(draft, base, this.lifetime.signal).then(path => {
      if (!this.closed) { this.recoveryPath = path; this.checkpointRevision = revision; this.publish(); }
    });
    this.checkpointing = pending;
    try { await pending; } finally { if (this.checkpointing === pending) this.checkpointing = undefined; }
  }
  subscribe(listener: () => void): () => void { this.active(); this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  reload(record: EntityRecord): void {
    this.active();
    if (this.busy || this.dirty || !this.accepts(record.entity) || record.entity.id !== this.value.id || record.entity.kind !== this.value.kind) throw new FoundationError('conflict', 'Save or explicitly discard pending edits before reloading this record.');
    this.base = structuredClone(record); this.value = structuredClone(record.entity);
    this.revision++; this.savedRevision = this.revision; this.error = ''; this.publish();
  }
  private publish(): void { for (const listener of this.listeners) listener(); }
  dispose(): void { if (this.closed) return; this.closed = true; this.lifetime.abort(); if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.listeners.clear(); }
}
