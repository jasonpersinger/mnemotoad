import { ENTITY_KINDS, type Entity } from '../domain/entities';
import { FoundationError, checkActive, messageOf } from '../domain/errors';
import { vaultPath } from '../domain/paths';
import { uuid, validateEntity } from '../domain/validation';
import { createEntityDocument, parseEntityDocument, updateEntityDocument, type ParsedDocument } from './document';
import { EntityIndex } from './index';
import type { VaultPort } from './vault-port';

export interface EntityRecord extends ParsedDocument { path: string }
export class EntityRepository {
  private closed = false;
  private queues = new Map<string, Promise<unknown>>();
  constructor(private readonly vault: VaultPort, readonly index: EntityIndex, private readonly root = 'MNEMOBARD', private readonly writable: () => boolean = () => true) {
    vaultPath(root);
    if (root.split('/').some(segment => segment.startsWith('.'))) throw new FoundationError('invalid', 'Use a visible content folder outside hidden vault configuration.');
  }
  private active(signal?: AbortSignal): void { checkActive(signal, this.closed); }
  private canWrite(signal?: AbortSignal): void {
    this.active(signal);
    if (!this.writable()) throw new FoundationError('unsupported-schema', 'Settings are read-only. Repair the original settings before creating or updating records.');
  }
  private async serial<T>(id: string, action: () => Promise<T>): Promise<T> {
    const preceding = this.queues.get(id) ?? Promise.resolve();
    const operation = preceding.catch(() => { /* A rejected prior write must not poison the queue. */ }).then(action);
    this.queues.set(id, operation);
    try { return await operation; } finally { if (this.queues.get(id) === operation) this.queues.delete(id); }
  }
  async read(id: string, signal?: AbortSignal): Promise<EntityRecord> {
    this.active(signal); await this.index.start(); this.active(signal);
    const state = this.index.locate(id);
    if (state.status === 'missing') throw new FoundationError('missing', 'Entity not found. Relink the reference or restore its note.');
    if (state.status === 'duplicate') throw new FoundationError('duplicate', `Multiple notes have this ID: ${state.paths.join(', ')}. Resolve the duplicate first.`);
    if (state.status === 'invalid') throw state.entry.error ?? new FoundationError('invalid', `Repair ${state.entry.path} in the note editor.`);
    let source: string;
    try { source = await this.vault.read(state.path); }
    catch (cause) { throw new FoundationError('io', `Could not read ${state.path}. Check the vault and retry.`, { path: state.path, cause }); }
    this.active(signal);
    const parsed = parseEntityDocument(source);
    if (!parsed || parsed.entity.id.toLowerCase() !== id.toLowerCase()) throw new FoundationError('conflict', 'The file identity changed. Refresh the record before editing.', { path: state.path });
    return { ...parsed, path: state.path };
  }
  async create(value: Entity, signal?: AbortSignal): Promise<EntityRecord> {
    const entity = validateEntity(value); this.canWrite(signal);
    return this.serial(entity.id.toLowerCase(), async () => {
      this.canWrite(signal); await this.index.start(); this.canWrite(signal);
      if (this.index.locate(entity.id).status !== 'missing') throw new FoundationError('duplicate', 'This entity ID already exists. Create a new identity for a deliberate copy.');
      const directory = `${this.root}/${{ patch: 'Patches', motif: 'Motifs', composition: 'Compositions', instrument: 'Instruments', 'effects-chain': 'Effects Chains' }[entity.kind]}`;
      await this.vault.ensureFolder(directory, () => this.active(signal)); this.active(signal);
      const title = entity.title.normalize('NFC').replace(/[^\p{L}\p{N} _-]/gu, '-').trim().slice(0, 60) || 'Untitled';
      const source = createEntityDocument(entity);
      const path = await this.createUnique(directory, `${title}-${entity.id.slice(0, 8)}`, 'md', source, signal);
      await this.index.refresh(path); this.active(signal);
      if (this.index.locate(entity.id).status === 'duplicate') throw new FoundationError('duplicate', `Created ${path}, but another note now has this ID. Both files were retained. Resolve the duplicate.`, { path });
      return { path, source, entity };
    });
  }
  private async createUnique(directory: string, stem: string, extension: string, source: string, signal?: AbortSignal): Promise<string> {
    for (let attempt = 0; attempt < 16; attempt++) {
      this.active(signal);
      const path = vaultPath(`${directory}/${stem}${attempt ? '-' + crypto.randomUUID() : ''}.${extension}`);
      if (this.vault.exists(path)) continue;
      try { await this.vault.create(path, source); return path; }
      catch (cause) {
        // A concurrent creator can occupy this path; a partially successful own
        // write must be reported instead of treating its bytes as a collision.
        throw new FoundationError('io', `Create did not confirm success at ${path}. Inspect this path before retrying.`, { path, cause });
      }
    }
    throw new FoundationError('io', 'Could not allocate a new collision-free vault path.');
  }
  private async recovery(base: EntityRecord, draft: Entity, candidate: string, reason: string, signal?: AbortSignal): Promise<string> {
    this.active(signal); const directory = `${this.root}/Recovery/${base.entity.id}`;
    await this.vault.ensureFolder(directory, () => this.active(signal)); this.active(signal);
    const text = JSON.stringify({ format: 'mnemobard-recovery', schemaVersion: 1, entityId: base.entity.id,
      sourcePath: base.path, savedAt: new Date().toISOString(), reason, originalSource: base.source, draft,
      candidateSource: candidate }, null, 2) + '\n';
    return this.createUnique(directory, crypto.randomUUID(), 'json', text, signal);
  }
  async saveDraftCopy(base: EntityRecord, draft: Entity, signal?: AbortSignal): Promise<string> {
    this.canWrite(signal); validateEntity(draft);
    const candidate = updateEntityDocument(base.source, base.source, draft);
    return this.recovery(base, draft, candidate, 'explicit-draft', signal);
  }
  /** Append-only recovery for an editor draft, including temporarily invalid form values.
   * Never replaces an entity. A confirmed checkpoint is recoverable JSON, not a saved record.
   */
  async saveEditorDraft(value: Entity, base?: EntityRecord, signal?: AbortSignal): Promise<string> {
    this.canWrite(signal);
    const draft = structuredClone(value), snapshot = base ? structuredClone(base) : undefined;
    uuid(draft.id);
    if (!ENTITY_KINDS.includes(draft.kind) || draft.schemaVersion !== 1 || (snapshot && (snapshot.entity.id !== draft.id || snapshot.entity.kind !== draft.kind))) {
      throw new FoundationError('invalid', 'A recovery draft must retain its supported identity and kind.');
    }
    let candidateSource: string | null = null, validationError: string | undefined;
    try { candidateSource = snapshot ? updateEntityDocument(snapshot.source, snapshot.source, draft) : createEntityDocument(draft); }
    catch (error) {
      if (!(error instanceof FoundationError) || error.code !== 'invalid') throw error;
      validationError = error.message;
    }
    const text = JSON.stringify({ format: 'mnemobard-editor-draft', schemaVersion: 1, entityId: draft.id,
      sourcePath: snapshot?.path ?? null, savedAt: new Date().toISOString(), originalSource: snapshot?.source ?? null,
      draft, candidateSource, ...(validationError ? { validationError } : {}) }, null, 2) + '\n';
    const directory = `${this.root}/Recovery/${draft.id}`;
    await this.vault.ensureFolder(directory, () => this.active(signal)); this.active(signal);
    return this.createUnique(directory, crypto.randomUUID(), 'json', text, signal);
  }
  async save(base: EntityRecord, value: Entity, signal?: AbortSignal): Promise<EntityRecord> {
    // Freeze caller-owned draft and source before asynchronous/queued work.
    const snapshot = structuredClone(base), next = validateEntity(value);
    const candidate = updateEntityDocument(snapshot.source, snapshot.source, next); this.canWrite(signal);
    return this.serial(snapshot.entity.id.toLowerCase(), async () => {
      this.active(signal); const fresh = await this.read(snapshot.entity.id, signal); this.active(signal);
      if (fresh.source !== snapshot.source) throw new FoundationError('conflict', 'The note changed elsewhere. Read the latest record or save a recovery copy.', { path: fresh.path });
      if (candidate === fresh.source) return fresh;
      const backup = await this.recovery({ ...snapshot, path: fresh.path }, next, candidate, 'before-save', signal);
      try {
        this.active(signal);
        const source = await this.vault.process(fresh.path, current => {
          this.active(signal);
          // This callback runs synchronously inside public Vault.process.
          if (current !== snapshot.source) throw new FoundationError('conflict', 'The note changed during save. Compare your draft with the current note.');
          return candidate;
        });
        this.active(signal);
        const parsed = parseEntityDocument(source);
        if (!parsed) throw new FoundationError('invalid', 'The saved note could not be parsed.');
        await this.index.refresh(fresh.path); this.active(signal);
        return { ...parsed, path: fresh.path };
      } catch (cause) {
        throw new FoundationError(cause instanceof FoundationError ? cause.code : 'io',
          `Save did not confirm success: ${messageOf(cause)}. Inspect the current note before retrying. Original and draft are in ${backup}.`,
          { path: fresh.path, recoveryPath: backup, cause });
      }
    });
  }
  dispose(): void { this.closed = true; }
}
