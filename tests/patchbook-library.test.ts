import { beforeEach, describe, expect, it } from 'vitest';
import { createEntity } from '../src/domain/entities';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { ReferenceResolver } from '../src/storage/references';
import { PatchbookLibrary } from '../src/modules/patchbook/library';
import { MemoryVault } from './support/memory-vault';

function setup() { const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), library = new PatchbookLibrary(index, repository); return { vault, index, repository, library }; }
let h: ReturnType<typeof setup>;
beforeEach(() => { h = setup(); });
async function instrument(name = 'Ink synth') { return h.repository.create({ ...createEntity('instrument', name), manufacturer: 'Workshop', instrumentType: 'Software synthesizer', platform: 'VST3', tags: ['digital'] }); }
async function patch(name: string, instrumentId?: string) {
  const session = h.library.create('patch'); const draft = session.draft;
  if (draft.kind !== 'patch') throw Error();
  session.update({ ...draft, title: name, instrument: 'Fallback', ...(instrumentId ? { instrumentId } : {}) }); return session.save();
}
describe('production library application and persistence', () => {
  it('creates an instrument, named chain and linked patch through one repository', async () => {
    const i = await instrument(), chain = h.library.create('effects-chain');
    const c = chain.draft; if (c.kind !== 'effects-chain') throw Error();
    chain.update({ ...c, title: 'Air chain', steps: [{ id: 'one', name: 'EQ', parameterNotes: 'Low shelf -3dB' }] }); const saved = await chain.save();
    const session = h.library.create('patch'), p = session.draft; if (p.kind !== 'patch') throw Error();
    session.update({ ...p, title: 'Dusk', instrumentId: i.entity.id, effectsChainIds: [saved.entity.id] }); const record = await session.save();
    expect(record.entity).toMatchObject({ instrument: 'Ink synth', instrumentId: i.entity.id, instrumentLink: `[[${i.path}]]`, effectsChainIds: [saved.entity.id], effectsChainLinks: [`[[${saved.path}]]`] });
    expect(h.library.related(i.entity.id).map(item => item.entity.id)).toEqual([record.entity.id]);
    expect(h.library.related(saved.entity.id)).toHaveLength(1); h.library.dispose();
  });
  it('searches related instrument names, metadata and custom properties with combined filters and stable sorting', async () => {
    const i = await instrument(), a = await patch('Glass', i.entity.id), b = await patch('Brass', i.entity.id);
    await h.repository.save(a, { ...a.entity, tags: ['soft'], extra: { technique: 'granular' }, ...(a.entity.kind === 'patch' ? { category: 'Pad', character: 'hushed' } : {}) });
    expect(h.library.query({ kind: 'patch', search: 'Ink granular', instrumentId: i.entity.id, tag: 'SOFT', category: 'pad' }).map(item => item.entity.id)).toEqual([a.entity.id]);
    expect(h.library.query({ kind: 'patch', sort: 'title-desc' }).map(item => item.entity.title)).toEqual(['Glass', 'Brass']);
    expect(h.library.query({ kind: 'patch', search: 'missing' })).toEqual([]);
    expect(h.library.query({ kind: 'instrument', sort: 'manufacturer' })).toHaveLength(1); expect(b.entity.id).not.toBe(a.entity.id); h.library.dispose();
  });
  it('retains stable links after file renames without automatic source rewrites', async () => {
    const i = await instrument(), p = await patch('Dusk', i.entity.id), before = h.vault.files.get(p.path);
    h.vault.rename(i.path, 'Elsewhere/Renamed instrument.md'); await h.index.settled();
    expect(h.library.query({ kind: 'patch' })[0]?.instrumentName).toBe('Ink synth'); expect(h.vault.files.get(p.path)).toBe(before);
    const session = await h.library.open(p.entity.id); session.update({ ...session.draft, notes: 'Later' }); const result = await session.save();
    expect(result.entity).toMatchObject({ instrumentLink: '[[Elsewhere/Renamed instrument.md]]' }); h.library.dispose();
  });
  it('blocks duplicate-ID editing and new missing/wrong-kind references', async () => {
    const i = await instrument(); h.vault.modify('Copied.md', i.source); await h.index.settled();
    expect(h.library.query({ kind: 'instrument' }).every(item => item.ambiguous)).toBe(true);
    await expect(h.library.open(i.entity.id)).rejects.toMatchObject({ code: 'duplicate' });
    await expect(patch('Missing', crypto.randomUUID())).rejects.toMatchObject({ code: 'missing' }); h.library.dispose();
  });
  it('keeps unchanged missing references while editing other metadata and reports them', async () => {
    const missing = crypto.randomUUID(); const p = await h.repository.create({ ...createEntity('patch', 'Old'), instrumentId: missing, effectsChainIds: [crypto.randomUUID()] });
    const session = await h.library.open(p.entity.id); session.update({ ...session.draft, notes: 'Keep the link for repair' }); const result = await session.save();
    expect(result.entity).toMatchObject({ instrumentId: missing });
    const refs = new ReferenceResolver(h.index, path => h.vault.exists(path)); expect(refs.diagnostics(result.entity).filter(d => d.code === 'missing')).toHaveLength(2); h.library.dispose();
  });
  it('rejects external source changes and preserves original prose plus conflicting draft', async () => {
    const p = await patch('Before'), session = await h.library.open(p.entity.id);
    session.update({ ...session.draft, title: 'Draft title' }); const external = p.source + '\nExternal prose\n'; h.vault.modify(p.path, external); await h.index.settled();
    await expect(session.save()).rejects.toMatchObject({ code: 'conflict' }); expect(h.vault.files.get(p.path)).toBe(external); expect(session.draft.title).toBe('Draft title');
    expect(session.recoveryPath && h.vault.files.get(session.recoveryPath)).toContain('Draft title'); h.library.dispose();
  });
  it('preserves temporarily invalid new draft values in readable recovery JSON without creating a record', async () => {
    const session = h.library.create('instrument'); session.update({ ...session.draft, title: '', notes: 'Do not lose this' });
    await session.checkpoint(); expect(h.library.query({ kind: 'instrument' })).toHaveLength(0);
    const snapshot = JSON.parse(h.vault.files.get(session.recoveryPath ?? '') ?? '{}') as { draft: { notes: string }; candidateSource: unknown; validationError: string };
    expect(snapshot.draft.notes).toBe('Do not lose this'); expect(snapshot.candidateSource).toBeNull(); expect(snapshot.validationError).toContain('title'); h.library.dispose();
  });
  it('requires confirmation for reversible removal, keeps notes/IDs/references and supports restore', async () => {
    const i = await instrument(), p = await patch('Dusk', i.entity.id);
    await expect(h.library.archive(i, true, false)).rejects.toMatchObject({ code: 'cancelled' }); expect(h.vault.files.get(i.path)).toBe(i.source);
    const archived = await h.library.archive(i, true, true); expect(h.library.query({ kind: 'instrument' })).toHaveLength(0);
    expect(h.library.query({ kind: 'instrument', archived: 'archived' })).toHaveLength(1); expect(h.vault.files.has(i.path)).toBe(true);
    const resolver = new ReferenceResolver(h.index, path => h.vault.exists(path)); expect(resolver.diagnostics(p.entity).some(d => d.code === 'archived')).toBe(true);
    expect((await h.library.archive(archived, false, true)).entity.id).toBe(i.entity.id); expect(h.library.query({ kind: 'instrument' })).toHaveLength(1); h.library.dispose();
  });
  it('rejects stale archive attempts and never cascades to referencing patches', async () => {
    const i = await instrument(), p = await patch('Dusk', i.entity.id); const external = i.source + '\nExternal edit'; h.vault.modify(i.path, external); await h.index.settled();
    await expect(h.library.archive(i, true, true)).rejects.toMatchObject({ code: 'conflict' }); expect(h.vault.files.get(i.path)).toBe(external); expect(h.vault.files.get(p.path)).toBe(p.source); h.library.dispose();
  });
  it('keeps malformed and future records read-only and discoverable as diagnostics', async () => {
    const i = await instrument(); h.vault.modify(i.path, i.source.replace('mnemobard_schema: 1', 'mnemobard_schema: 99')); await h.index.settled();
    expect(h.library.query({ kind: 'instrument' })).toEqual([]); await expect(h.library.open(i.entity.id)).rejects.toMatchObject({ code: 'unsupported-schema' });
    expect(h.index.all()[0]?.error?.code).toBe('unsupported-schema'); h.library.dispose();
  });
  it('exposes checkpoint/write failures without losing the in-memory draft', async () => {
    const i = await instrument(), session = await h.library.open(i.entity.id); session.update({ ...session.draft, title: 'Changed' }); h.vault.failCreate = () => true;
    await expect(session.save()).rejects.toMatchObject({ code: 'io' }); expect(session.draft.title).toBe('Changed'); expect(h.vault.files.get(i.path)).toBe(i.source);
    await expect(session.checkpoint()).rejects.toThrow(); h.library.dispose();
  });
  it('shares one draft across consumers and disposes pending work/listeners', async () => {
    const i = await instrument(), one = await h.library.open(i.entity.id), two = await h.library.open(i.entity.id); expect(one).toBe(two);
    one.update({ ...one.draft, notes: 'Shared edit' }); expect(two.draft.notes).toBe('Shared edit');
    h.library.dispose(); expect(one.disposed).toBe(true); expect(() => one.update(one.draft)).toThrow('closed'); await expect(h.library.open(i.entity.id)).rejects.toMatchObject({ code: 'disposed' });
  });
  it('rejects an oversized serialized record before creating an unreadable authoritative note', async () => {
    await expect(h.repository.create({ ...createEntity('instrument', 'Too large'), platform: 'x'.repeat(8 * 1024 * 1024) })).rejects.toMatchObject({ code: 'invalid' });
    expect(h.vault.files.size).toBe(0); h.library.dispose();
  });
});

it('invalidates cached queries on updates, renames and duplicates, while isolating caller mutations', async () => {
  const base = await instrument('Cached instrument'); const first = h.library.query({ kind: 'instrument' });
  const exposed = first[0]; if (!exposed) throw Error('Missing fixture'); exposed.entity.title = 'Caller corruption';
  expect(h.library.query({ kind: 'instrument' })[0]?.entity.title).toBe('Cached instrument');
  h.vault.rename(base.path, 'Renamed cached.md'); await h.index.settled(); expect(h.library.query({ kind: 'instrument' })[0]?.path).toBe('Renamed cached.md');
  const saved = await h.repository.save(await h.repository.read(base.entity.id), { ...base.entity, title: 'Updated cached instrument' });
  expect(h.library.query({ kind: 'instrument', search: 'updated' })).toHaveLength(1);
  h.vault.modify('Duplicate cached.md', saved.source); await h.index.settled();
  expect(h.library.query({ kind: 'instrument' }).every(item => item.ambiguous)).toBe(true);
  h.library.dispose(); h.repository.dispose(); h.index.dispose();
});
