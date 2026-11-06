import { createEntity, type Motif } from '../../domain/entities';
import { checkActive, FoundationError } from '../../domain/errors';
import type { EntityIndex } from '../../storage/index';
import type { EntityRecord, EntityRepository } from '../../storage/repository';
import { CheckpointRecovery, type RecoveredDraft } from '../../storage/recovery';
import type { AssetPort } from '../../storage/asset-port';
import type { VaultPort } from '../../storage/vault-port';
import { object, validateEntity } from '../../domain/validation';
import { MotifSession } from './session';
import { editableMotif } from './commands';
export class MotifLibrary {
  private sessions = new Map<string, MotifSession>(); private closed = false;
  readonly recovery: CheckpointRecovery<Motif>;
  constructor(readonly index: EntityIndex, private readonly repository: EntityRepository, vault: VaultPort & AssetPort) {
    this.recovery = new CheckpointRecovery(vault, index, repository, raw => {
      const fields = object(raw, 'motif recovery'), title = fields.title;
      const entity = validateEntity({ ...fields, title: title === '' ? 'Untitled recovery' : title });
      if (entity.kind !== 'motif') throw new FoundationError('wrong-kind', 'This checkpoint belongs to another module.');
      if (title === '') entity.title = ''; return editableMotif(entity);
    });
  }
  items(search = ''): { path: string; entity: Motif; ambiguous: boolean }[] {
    const entries = this.index.all();
    return entries.flatMap(entry => entry.entity?.kind === 'motif' && entry.entity.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ? [{ path: entry.path, entity: entry.entity, ambiguous: this.index.resolve(entry.entity.id).status !== 'ready' }] : [])
      .sort((a, b) => a.entity.title.localeCompare(b.entity.title) || a.entity.id.localeCompare(b.entity.id));
  }
  drafts(): MotifSession[] { return [...this.sessions.values()].filter(session => session.dirty); }
  private session(draft: Motif, base?: EntityRecord): MotifSession {
    if (this.drafts().length >= 20) throw new FoundationError('invalid', 'Save or discard an existing draft before opening more than20 drafts.');
    const session = new MotifSession(draft, base, {
      save: (original, next, signal) => original ? this.repository.save(original, editableMotif(next), signal) : this.repository.create(editableMotif(next), signal),
      checkpoint: (next, original, signal) => this.repository.saveEditorDraft(next, original, signal),
    }); this.sessions.set(draft.id.toLowerCase(), session); return session;
  }
  create(): MotifSession { checkActive(undefined, this.closed); const value = createEntity('motif', 'Untitled motif'); value.data.lengthTicks = 15360; return this.session(value); }
  async open(id: string, signal?: AbortSignal): Promise<MotifSession> {
    checkActive(signal, this.closed); const existing = this.sessions.get(id.toLowerCase()); if (existing?.dirty) return existing;
    const record = await this.repository.read(id, signal); checkActive(signal, this.closed);
    if (record.entity.kind !== 'motif') throw new FoundationError('wrong-kind', 'Choose a motif record.'); editableMotif(record.entity);
    const current = this.sessions.get(id.toLowerCase()); if (current?.dirty) return current;
    if (current && !current.disposed) { current.reload(record); return current; } return this.session(record.entity, record);
  }
  recover(value: RecoveredDraft<Motif>): MotifSession {
    checkActive(undefined, this.closed); const existing = this.sessions.get(value.draft.id.toLowerCase());
    if (existing?.dirty || existing?.busy) throw new FoundationError('conflict', 'Save or explicitly discard the current motif draft before recovering.');
    existing?.dispose(); const session = this.session(value.draft, value.base); session.update(value.draft); session.recoveryPath = value.checkpoint; return session;
  }
  discard(session: MotifSession): void { session.dispose(); this.sessions.delete(session.draft.id.toLowerCase()); }
  async checkpointAll(): Promise<void> { for (const session of this.drafts()) await session.checkpoint(); }
  dispose(): void { this.closed = true; this.recovery.dispose(); for (const session of this.sessions.values()) session.dispose(); this.sessions.clear(); }
}
