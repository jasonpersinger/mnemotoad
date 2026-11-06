import { afterEach, describe, expect, it } from 'vitest';
import { createEntity } from '../src/domain/entities';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { PatchbookLibrary } from '../src/modules/patchbook/library';
import { PatchbookRecovery } from '../src/modules/patchbook/recovery';
import { MemoryVault } from './support/memory-vault';
const dispose: (() => void)[] = [];
afterEach(() => { for (const close of dispose.splice(0)) close(); });
async function fixture() {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), library = new PatchbookLibrary(index, repository), recovery = new PatchbookRecovery(vault, index, repository);
  dispose.push(() => { recovery.dispose(); library.dispose(); repository.dispose(); index.dispose(); });
  const base = await repository.create(createEntity('instrument', 'Source'));
  const draft = { ...base.entity, title: 'Recovered title' }, path = await repository.saveEditorDraft(draft, base);
  return { vault, index, repository, library, recovery, base, draft, path };
}
describe('non-destructive checkpoint recovery', () => {
  it('discovers timestamp/identity and inspects without modifying either source or recovery', async () => {
    const { vault, recovery, base, path } = await fixture(), before = new Map(vault.files);
    const found = await recovery.discover(); expect(found.entries[0]).toMatchObject({ path, entityId: base.entity.id, title: 'Recovered title' }); expect(Number.isFinite(Date.parse(found.entries[0]?.timestamp ?? ''))).toBe(true);
    expect(await recovery.inspect(path)).toMatchObject({ sourceStatus: 'unchanged', originalSource: base.source, current: { source: base.source } });
    expect(vault.files).toEqual(before);
  });
  it('loads an unsaved session and saves only through explicit normal conditional persistence', async () => {
    const { vault, recovery, library, base, path } = await fixture(); const checkpoint = vault.files.get(path);
    const prepared = await recovery.prepare(await recovery.inspect(path), false), session = library.recover(prepared);
    expect(session.dirty).toBe(true); expect(vault.files.get(base.path)).toBe(base.source);
    const saved = await session.save(); expect(saved.entity.title).toBe('Recovered title'); expect(saved.entity.id).toBe(base.entity.id); expect(vault.files.get(path)).toBe(checkpoint);
  });
  it('requires explicit comparison for changed sources, and rejects a later competing edit', async () => {
    const { vault, recovery, library, repository, base, path } = await fixture();
    vault.modify(base.path, base.source + '\nExternal notes\n');
    const inspection = await recovery.inspect(path); expect(inspection.sourceStatus).toBe('changed');
    await expect(recovery.prepare(inspection, false)).rejects.toThrow('Compare both');
    const prepared = await recovery.prepare(inspection, true), session = library.recover(prepared);
    vault.modify(base.path, base.source + '\nNewer external notes\n');
    await expect(session.save()).rejects.toThrow('changed elsewhere'); expect((await repository.read(base.entity.id)).source).toContain('Newer external');
    expect(session.dirty).toBe(true); expect(vault.files.has(path)).toBe(true);
  });
  it('rechecks the reviewed current source before loading', async () => {
    const { vault, recovery, base, path } = await fixture(); vault.modify(base.path, base.source + '\nExternal\n');
    const inspection = await recovery.inspect(path); vault.modify(base.path, base.source + '\nExternal again\n');
    await expect(recovery.prepare(inspection, true)).rejects.toThrow('Compare both');
  });
  it('follows a renamed source by stable ID', async () => {
    const { vault, recovery, base, path, library } = await fixture(); vault.rename(base.path, 'Renamed.md');
    const inspection = await recovery.inspect(path); expect(inspection.current?.path).toBe('Renamed.md'); expect(inspection.sourceStatus).toBe('unchanged');
    const session = library.recover(await recovery.prepare(inspection, false)); await session.save(); expect(vault.files.get('Renamed.md')).toContain('Recovered title'); expect(vault.files.has(base.path)).toBe(false);
  });
  it('blocks duplicate/missing source identities and preserves competing unsaved sessions', async () => {
    const { vault, recovery, base, path, library } = await fixture(); vault.modify('duplicate.md', base.source);
    expect((await recovery.inspect(path)).sourceStatus).toBe('unavailable');
    vault.files.delete('duplicate.md'); vault.emit({ type: 'delete', path: 'duplicate.md' });
    const prepared = await recovery.prepare(await recovery.inspect(path), false);
    const open = await library.open(base.entity.id); open.update({ ...open.draft, title: 'Current draft' });
    expect(() => library.recover(prepared)).toThrow('unsaved session'); expect(open.draft.title).toBe('Current draft');
  });
  it('recovers new and temporarily empty drafts without writing invalid entities', async () => {
    const { vault, recovery, repository, library } = await fixture(); const draft = createEntity('instrument', '');
    const path = await repository.saveEditorDraft(draft), inspection = await recovery.inspect(path);
    expect(inspection.sourceStatus).toBe('new'); expect(inspection.draft?.title).toBe('');
    const session = library.recover(await recovery.prepare(inspection, false)); await expect(session.save()).rejects.toThrow();
    session.update({ ...session.draft, title: 'Filled in' }); await session.save(); expect(vault.files.get(path)).toContain('"title": ""');
  });
  it('supports pre-save recovery and retains malformed/future entries for safe text inspection', async () => {
    const { vault, recovery, repository, base, draft } = await fixture();
    const beforeSave = await repository.saveDraftCopy(base, draft); expect((await recovery.inspect(beforeSave)).draft?.title).toBe('Recovered title');
    for (const [name, text] of [['malformed', '{'], ['future', JSON.stringify({ format: 'mnemobard-editor-draft', schemaVersion: 999 })], ['unsafe', JSON.stringify({ format: 'mnemobard-editor-draft', schemaVersion: 1, entityId: base.entity.id, savedAt: new Date().toISOString(), originalSource: base.source, draft: { ...draft, assets: [{ role: 'audio', link: '[[../secret]]' }] } })]]) {
      const path = `MNEMOBARD/Recovery/test/${name}.json`; if (text === undefined) throw Error('Missing fixture'); vault.files.set(path, text);
      const inspection = await recovery.inspect(path); expect(inspection.sourceStatus).toBe('unreadable'); expect(inspection.raw).toBe(text); expect(inspection.draft).toBeUndefined(); expect(vault.files.get(path)).toBe(text);
    }
  });
  it('honors cancellation and does not rewrite a checkpoint changed after inspection', async () => {
    const { vault, recovery, path } = await fixture(); const inspected = await recovery.inspect(path); vault.files.set(path, inspected.raw.replace('Recovered title', 'Other draft'));
    await expect(recovery.prepare(inspected, false)).rejects.toThrow('checkpoint or source changed');
    const controller = new AbortController(); controller.abort(); await expect(recovery.discover(0, controller.signal)).rejects.toThrow('cancelled');
    recovery.dispose(); expect(() => recovery.paths()).toThrow('closed');
  });
});
