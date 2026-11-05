import { beforeEach, afterEach, it, expect } from 'vitest';
import { createEntity } from '../src/domain/entities';
import { FoundationError } from '../src/domain/errors';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { MemoryVault } from './support/memory-vault';
import { createEntityDocument } from '../src/storage/document';

let vault: MemoryVault, index: EntityIndex, repository: EntityRepository;
beforeEach(() => { vault = new MemoryVault(); index = new EntityIndex(vault); repository = new EntityRepository(vault, index); });
afterEach(() => { repository.dispose(); index.dispose(); });
it('creates every kind and updates through one repository with byte-preserved writing', async () => {
  for (const kind of ['patch', 'motif', 'composition'] as const) {
    const entity = createEntity(kind, 'One');
    const created = await repository.create(entity); vault.modify(created.path, created.source + '\nPrivate **writing**.\n');
    const base = await repository.read(entity.id), next = { ...base.entity, title: 'Two' };
    const saved = await repository.save(base, next);
    expect(saved.entity.title).toBe('Two'); expect(saved.entity.id).toBe(entity.id);
    expect(saved.source).toContain('Private **writing**.');
    expect((await repository.read(entity.id)).source).toBe(saved.source);
  }
  expect([...vault.files.keys()].filter(p => p.endsWith('.json'))).toHaveLength(3);
});
it('does not overwrite a colliding pathname', async () => {
  const e = createEntity('patch', 'Same'), collision = `MNEMOBARD/Patches/Same-${e.id.slice(0,8)}.md`;
  vault.files.set(collision, '# Existing ordinary note');
  const created = await repository.create(e);
  expect(created.path).not.toBe(collision); expect(vault.files.get(collision)).toBe('# Existing ordinary note');
});
it('serializes same-ID creates and rejects duplicates including copies made externally', async () => {
  const e = createEntity('patch', 'One');
  const results = await Promise.allSettled([repository.create(e), repository.create(e)]);
  expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  await vault.create('Duplicate.md', createEntityDocument(e)); await index.settled();
  await expect(repository.read(e.id)).rejects.toMatchObject({ code: 'duplicate' });
});
it('resolves identity after file rename without renaming any entity ID', async () => {
  const e = createEntity('motif', 'One'), base = await repository.create(e);
  vault.rename(base.path, 'Moved motif.md'); await index.settled();
  expect((await repository.read(e.id)).path).toBe('Moved motif.md');
  const saved = await repository.save(base, { ...e, title: 'Still me' });
  expect(saved.path).toBe('Moved motif.md'); expect(saved.entity.id).toBe(e.id);
});
it('rejects malformed and future records, retaining their original bytes', async () => {
  const e = createEntity('motif', 'One'), base = await repository.create(e);
  for (const broken of [base.source.replace('"notes": []', '"notes": [broken]'), base.source.replace('mnemobard_schema: 1', 'mnemobard_schema: 5')]) {
    vault.modify(base.path, broken); await index.settled();
    await expect(repository.read(e.id)).rejects.toBeInstanceOf(FoundationError);
    await expect(repository.save(base, { ...e, title: 'No overwrite' })).rejects.toBeInstanceOf(FoundationError);
    expect(vault.files.get(base.path)).toBe(broken);
  }
});
it('detects external changes before a save and retains an explicit draft copy', async () => {
  const base = await repository.create(createEntity('patch', 'One'));
  vault.modify(base.path, base.source + '\nExternal edit.');
  const draft = { ...base.entity, title: 'Unsaved draft' };
  await expect(repository.save(base, draft)).rejects.toMatchObject({ code: 'conflict' });
  const path = await repository.saveDraftCopy(base, draft);
  const recovery = JSON.parse(vault.files.get(path) ?? '{}');
  expect(recovery.originalSource).toBe(base.source); expect(recovery.draft.title).toBe('Unsaved draft');
  expect(vault.files.get(base.path)).toContain('External edit.');
});
it('checks current bytes again inside process after backup creation', async () => {
  const base = await repository.create(createEntity('patch', 'One'));
  vault.beforeProcess = path => { vault.files.set(path, base.source + '\nRacing external edit'); };
  await expect(repository.save(base, { ...base.entity, title: 'Draft' })).rejects.toMatchObject({ code: 'conflict', context: { recoveryPath: expect.stringContaining('/Recovery/') } });
  expect(vault.files.get(base.path)).toContain('Racing external edit');
});
it.each(['before', 'after'] as const)('reports %s-commit failure, retaining original and candidate in recovery', async failure => {
  const base = await repository.create(createEntity('patch', 'One')); vault.failProcess = failure;
  let caught: unknown;
  try { await repository.save(base, { ...base.entity, title: 'Two' }); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(FoundationError); if (!(caught instanceof FoundationError)) throw Error();
  const backup = JSON.parse(vault.files.get(caught.context.recoveryPath ?? '') ?? '{}');
  expect(backup.originalSource).toBe(base.source); expect(backup.candidateSource).toContain('title: Two');
  expect(vault.files.get(base.path)).toBe(failure === 'before' ? base.source : backup.candidateSource);
});
it('aborts replacement if recovery creation fails', async () => {
  const base = await repository.create(createEntity('patch', 'One')); vault.failCreate = p => p.includes('/Recovery/');
  await expect(repository.save(base, { ...base.entity, title: 'Two' })).rejects.toMatchObject({ code: 'io' });
  expect(vault.files.get(base.path)).toBe(base.source);
});
it('does not conceal creation failures or overwrite existing source', async () => {
  vault.failCreate = () => true;
  await expect(repository.create(createEntity('patch', 'One'))).rejects.toMatchObject({ code: 'io' }); expect(vault.files.size).toBe(0);
});
it('rejects a queued stale save and permits a later save with a fresh base', async () => {
  const base = await repository.create(createEntity('patch', 'One'));
  const results = await Promise.allSettled([repository.save(base, { ...base.entity, title: 'Two' }), repository.save(base, { ...base.entity, title: 'Three' })]);
  expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
  const fresh = await repository.read(base.entity.id);
  expect((await repository.save(fresh, { ...fresh.entity, title: 'Four' })).entity.title).toBe('Four');
});
it('freezes a caller draft at submission rather than during its queued write', async () => {
  const base = await repository.create(createEntity('patch', 'One')), draft = { ...base.entity, title: 'Two' };
  const saving = repository.save(base, draft); draft.title = 'Later';
  expect((await saving).entity.title).toBe('Two');
});
it('cancels before commit and preserves the original when disposed during recovery', async () => {
  const base = await repository.create(createEntity('patch', 'One')), abort = new AbortController(); abort.abort();
  await expect(repository.save(base, { ...base.entity, title: 'Two' }, abort.signal)).rejects.toMatchObject({ code: 'cancelled' });
  vault.failCreate = path => { if (path.includes('/Recovery/')) repository.dispose(); return false; };
  await expect(repository.save(base, { ...base.entity, title: 'Two' })).rejects.toMatchObject({ code: 'disposed' });
  expect(vault.files.get(base.path)).toBe(base.source);
});
it('no-op save preserves source bytes without creating recovery files', async () => {
  const base = await repository.create(createEntity('patch', 'One'));
  expect((await repository.save(base, base.entity)).source).toBe(base.source);
  expect([...vault.files.keys()].filter(p => p.endsWith('.json'))).toHaveLength(0);
});
