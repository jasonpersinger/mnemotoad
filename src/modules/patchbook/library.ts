import { createEntity, isLibraryEntity, type LibraryEntity, type LibraryKind, type Patch } from '../../domain/entities';
import { checkActive, FoundationError } from '../../domain/errors';
import { assetLink } from '../../domain/paths';
import type { EntityIndex } from '../../storage/index';
import type { EntityRecord, EntityRepository } from '../../storage/repository';
import { queryLibrary, type LibraryItem, type LibraryQuery } from './query';
import { LibrarySession } from './session';

export class PatchbookLibrary {
  private closed = false;
  private sessions = new Map<string, LibrarySession>();
  constructor(readonly index: EntityIndex, private readonly repository: EntityRepository) {}
  items(): LibraryItem[] {
    const entries = this.index.all(), byId = new Map<string, number>(), instruments = new Map<string, string>();
    for (const entry of entries) if (entry.id) byId.set(entry.id, (byId.get(entry.id) ?? 0) + 1);
    for (const entry of entries) if (entry.entity?.kind === 'instrument' && entry.id && byId.get(entry.id) === 1) instruments.set(entry.id, entry.entity.title);
    return entries.filter(entry => entry.entity && isLibraryEntity(entry.entity)).map(entry => {
      const entity = entry.entity;
      if (!entity || !isLibraryEntity(entity)) throw new FoundationError('invalid', 'Library index entry changed');
      return { entity, path: entry.path, ambiguous: (byId.get(entity.id.toLowerCase()) ?? 0) > 1,
        ...(entity.kind === 'patch' ? { instrumentName: instruments.get(entity.instrumentId?.toLowerCase() ?? '') ?? entity.instrument } : {}) };
    });
  }
  query(query: LibraryQuery): LibraryItem[] { return queryLibrary(this.items(), query); }
  related(id: string): LibraryItem[] {
    const key = id.toLowerCase();
    return this.items().filter(({ entity }) => entity.kind === 'patch' && (entity.instrumentId?.toLowerCase() === key || entity.effectsChainIds?.some(ref => ref.toLowerCase() === key)));
  }
  private session(draft: LibraryEntity, base?: EntityRecord): LibrarySession {
    const session = new LibrarySession(draft, base, {
      save: (record, value, signal) => this.persist(record, value, signal),
      checkpoint: (value, record, signal) => this.repository.saveEditorDraft(value, record, signal),
    });
    this.sessions.set(draft.id.toLowerCase(), session); return session;
  }
  create(kind: LibraryKind): LibrarySession {
    checkActive(undefined, this.closed);
    if ([...this.sessions.values()].filter(s => s.dirty).length >= 20) throw new FoundationError('invalid', 'Save or discard an existing draft before opening more than 20 drafts.');
    const entity = createEntity(kind, '');
    if (entity.kind === 'patch') entity.instrument = '';
    return this.session(entity);
  }
  async open(id: string, signal?: AbortSignal): Promise<LibrarySession> {
    checkActive(signal, this.closed);
    const existing = this.sessions.get(id.toLowerCase());
    if (existing?.dirty) return existing;
    const record = await this.repository.read(id, signal); checkActive(signal, this.closed);
    if (!isLibraryEntity(record.entity)) throw new FoundationError('wrong-kind', 'Open this record in its own module; PATCHBOOK manages library records only.');
    const current = this.sessions.get(id.toLowerCase());
    if (current?.dirty) return current;
    if (current && !current.disposed) { current.reload(record); return current; }
    return this.session(record.entity, record);
  }
  getDrafts(): LibrarySession[] { return [...this.sessions.values()].filter(s => s.dirty); }
  private target(id: string, kind: LibraryKind): { entity: LibraryEntity; path: string } {
    const target = this.index.resolve(id);
    if (target.status !== 'ready') throw new FoundationError(target.status === 'invalid' ? 'invalid' : target.status, `Association ${id} is ${target.status}; repair or choose another record.`);
    if (!isLibraryEntity(target.entity) || target.entity.kind !== kind || target.entity.archived) throw new FoundationError('wrong-kind', `Choose an active ${kind} record.`);
    return { entity: target.entity, path: target.path };
  }
  private associate(patch: Patch, base?: EntityRecord): Patch {
    const previous = base?.entity.kind === 'patch' ? base.entity : undefined;
    if (patch.instrumentId) {
      const state = this.index.resolve(patch.instrumentId);
      if (state.status === 'ready' && state.entity.kind === 'instrument' && !state.entity.archived) {
        patch.instrument = state.entity.title; patch.instrumentLink = assetLink(`[[${state.path}]]`);
      } else if (patch.instrumentId.toLowerCase() !== previous?.instrumentId?.toLowerCase()) this.target(patch.instrumentId, 'instrument');
    } else delete patch.instrumentLink;
    if (patch.effectsChainIds) {
      const links = patch.effectsChainIds.map(id => {
        const state = this.index.resolve(id);
        if (state.status === 'ready' && state.entity.kind === 'effects-chain' && !state.entity.archived) return assetLink(`[[${state.path}]]`);
        const old = previous?.effectsChainIds?.findIndex(item => item.toLowerCase() === id.toLowerCase()) ?? -1;
        if (old >= 0) return previous?.effectsChainLinks?.[old];
        return assetLink(`[[${this.target(id, 'effects-chain').path}]]`);
      });
      if (links.every((link): link is string => typeof link === 'string')) patch.effectsChainLinks = links;
      else delete patch.effectsChainLinks;
    }
    else delete patch.effectsChainLinks;
    return patch;
  }
  private async persist(base: EntityRecord | undefined, value: LibraryEntity, signal: AbortSignal): Promise<EntityRecord> {
    checkActive(signal, this.closed); await this.index.start(); checkActive(signal, this.closed);
    const entity = value.kind === 'patch' ? this.associate(structuredClone(value), base) : value;
    return base ? this.repository.save(base, entity, signal) : this.repository.create(entity, signal);
  }
  async archive(base: EntityRecord, archived: boolean, confirmed: boolean): Promise<EntityRecord> {
    checkActive(undefined, this.closed);
    if (!confirmed) throw new FoundationError('cancelled', 'Confirm library removal before archiving. No data changed.');
    if (!isLibraryEntity(base.entity)) throw new FoundationError('wrong-kind', 'Only library records can be archived here.');
    const session = this.sessions.get(base.entity.id.toLowerCase());
    if (session?.dirty) throw new FoundationError('conflict', 'Save or discard this draft before changing archive state.');
    const result = await this.repository.save(base, { ...base.entity, archived });
    session?.dispose(); this.sessions.delete(base.entity.id.toLowerCase()); return result;
  }
  discard(session: LibrarySession): void { session.dispose(); this.sessions.delete(session.draft.id.toLowerCase()); }
  async checkpointAll(): Promise<void> { for (const session of this.getDrafts()) await session.checkpoint(); }
  dispose(): void { this.closed = true; for (const session of this.sessions.values()) session.dispose(); this.sessions.clear(); }
}
