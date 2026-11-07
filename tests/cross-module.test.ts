import { afterEach, describe, expect, it } from 'vitest';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { ReferenceLookup } from '../src/storage/reference-status';
import { createEntityDocument } from '../src/storage/document';
import { createEntity, type Composition, type Motif } from '../src/domain/entities';
import { MemoryVault } from './support/memory-vault';

/** Milestone 4F: reverse references and shared reference classification (read-only). */
const disposals: (() => void)[] = []; afterEach(() => { for (const fn of disposals.splice(0)) fn(); });
async function fixture() {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index); await index.start();
  disposals.push(() => { repository.dispose(); index.dispose(); });
  const instrument = await repository.create(createEntity('instrument', 'Modular voice'));
  const chain = await repository.create(createEntity('effects-chain', 'Tape and plate'));
  const patch = await repository.create({ ...createEntity('patch', 'Night choir'), instrumentId: instrument.entity.id, effectsChainIds: [chain.entity.id] });
  const motif = await repository.create({ ...createEntity('motif', 'Ascent'), patchId: patch.entity.id } as Motif);
  const base = createEntity('composition', 'Long form') as Composition, lane = { id: crypto.randomUUID(), name: 'Lead', clips: [0, 3840].map(startTick => ({ id: crypto.randomUUID(), motifId: motif.entity.id, startTick, repeatCount: 1 })) };
  const composition = await repository.create({ ...base, data: { ...base.data, lengthTicks: 960 * 4 * 16, lanes: [lane] } } as Composition);
  await index.settled();
  return { vault, index, repository, instrument, chain, patch, motif, composition };
}

describe('reverse references (parse-time index summary)', () => {
  it('finds motifs using a patch and compositions placing a motif with placement counts, without writes', async () => {
    const f = await fixture(), writes = () => f.vault.files.size; const before = writes();
    expect(f.index.referencing(f.patch.entity.id, 'motif').map(r => [r.title, r.count])).toEqual([['Ascent', 1]]);
    expect(f.index.referencing(f.motif.entity.id, 'composition').map(r => [r.title, r.count])).toEqual([['Long form', 2]]);
    expect(f.index.referencing(f.instrument.entity.id).map(r => r.title)).toEqual(['Night choir']);
    expect(f.index.outgoing(f.motif.entity.id)).toEqual([f.patch.entity.id.toLowerCase()]);
    expect(writes()).toBe(before); expect([...f.vault.files.values()].join()).toBe([...f.vault.files.values()].join());
  });
  it('stays current through modify, rename (UUID identity, reference untouched) and delete', async () => {
    const f = await fixture(), source = f.vault.files.get(f.motif.path) ?? '';
    f.vault.rename(f.motif.path, 'Elsewhere/Renamed motif.md'); await f.index.settled();
    expect(f.index.referencing(f.motif.entity.id, 'composition')).toHaveLength(1); expect(f.index.referencing(f.patch.entity.id, 'motif')[0]?.path).toBe('Elsewhere/Renamed motif.md');
    expect(f.vault.files.get('Elsewhere/Renamed motif.md')).toBe(source); expect(f.vault.files.get(f.composition.path)).toBe(f.composition.source);
    const record = await f.repository.read(f.motif.entity.id); await f.repository.save(record, { ...record.entity, patchId: undefined } as Motif); await f.index.settled();
    expect(f.index.referencing(f.patch.entity.id, 'motif')).toEqual([]);
    f.vault.files.delete(f.composition.path); f.vault.emit({ type: 'delete', path: f.composition.path }); await f.index.settled();
    expect(f.index.referencing(f.motif.entity.id, 'composition')).toEqual([]);
  });
});

describe('ReferenceLookup', () => {
  it('distinguishes valid, missing, archived, ambiguous, malformed, unsupported and wrong-kind without substituting by name', async () => {
    const f = await fixture();
    const archived = await f.repository.create({ ...createEntity('patch', 'Retired pad'), archived: true });
    const dup = createEntity('patch', 'Night choir'); await f.vault.create('A.md', createEntityDocument(dup)); await f.vault.create('B.md', createEntityDocument(dup));
    await f.vault.create('Broken.md', `---\nmnemobard_id: 00000000-0000-4000-8000-0000000000b1\nmnemobard_kind: patch\nmnemobard_schema: 1\ntitle: Broken\n---\n\`\`\`mnemobard-patch\n{ nope\n\`\`\`\n`);
    await f.vault.create('Future.md', '---\nmnemobard_id: 00000000-0000-4000-8000-0000000000f2\nmnemobard_kind: patch\nmnemobard_schema: 2\n---\n');
    await f.index.settled(); const lookup = new ReferenceLookup(f.index);
    expect(lookup.describe(f.patch.entity.id, 'patch')).toMatchObject({ status: 'ready', title: 'Night choir', message: '' });
    expect(lookup.describe(archived.entity.id, 'patch')).toMatchObject({ status: 'archived', title: 'Retired pad' });
    expect(lookup.describe('00000000-0000-4000-8000-00000000dead', 'patch')).toMatchObject({ status: 'missing' });
    expect(lookup.describe(dup.id, 'patch')).toMatchObject({ status: 'ambiguous', paths: ['A.md', 'B.md'] });
    expect(lookup.describe('00000000-0000-4000-8000-0000000000b1', 'patch').status).toMatch(/malformed/);
    expect(lookup.describe('00000000-0000-4000-8000-0000000000f2', 'patch')).toMatchObject({ status: 'unsupported' });
    expect(lookup.describe(f.motif.entity.id, 'patch')).toMatchObject({ status: 'wrong-kind', kind: 'motif' });
    // The missing ID never resolves to the similarly named duplicate "Night choir".
    expect(lookup.describe('00000000-0000-4000-8000-00000000dead', 'patch').title).toBeUndefined();
  });
});
