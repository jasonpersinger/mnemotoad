import { it, expect } from 'vitest';
import { createEntity } from '../src/domain/entities';
import { createEntityDocument } from '../src/storage/document';
import { EntityIndex } from '../src/storage/index';
import { ReferenceResolver } from '../src/storage/references';
import { MemoryVault, deferred } from './support/memory-vault';

it('indexes only the changed file after startup and coalesces superseded modifications', async () => {
  const vault = new MemoryVault();
  for (let i=0; i<30; i++) vault.files.set(`${i}.md`, createEntityDocument(createEntity('patch', `P${i}`)));
  const index = new EntityIndex(vault); await index.start(); vault.reads = [];
  for (let i=0; i<20; i++) vault.modify('0.md', vault.files.get('0.md') ?? '');
  await index.settled(); expect(vault.reads).toEqual(['0.md']); index.dispose(); expect(vault.listeners.size).toBe(0);
});
it('does not publish an obsolete read after rename/delete/disposal', async () => {
  const vault = new MemoryVault(), e = createEntity('patch', 'P'), wait = deferred();
  vault.files.set('A.md', createEntityDocument(e)); vault.delayRead = () => wait.promise;
  const index = new EntityIndex(vault), startup = index.start(); await Promise.resolve();
  vault.files.delete('A.md'); vault.emit({ type: 'delete', path: 'A.md' }); wait.resolve(); await startup;
  expect(index.resolve(e.id).status).toBe('missing'); index.dispose();
  expect(index.all()).toEqual([]); expect(vault.listeners.size).toBe(0);
});
it('handles a folder rename and preserves duplicate identity diagnostics', async () => {
  const vault = new MemoryVault(), e = createEntity('motif', 'M'); vault.files.set('Old/M.md', createEntityDocument(e));
  const index = new EntityIndex(vault); await index.start();
  const content = vault.files.get('Old/M.md') ?? ''; vault.files.delete('Old/M.md'); vault.files.set('New/M.md', content);
  vault.emit({ type: 'rename', folder: true, oldPath: 'Old', path: 'New' }); await index.settled();
  expect(index.resolve(e.id)).toMatchObject({ status: 'ready', path: 'New/M.md' });
  await vault.create('Copy.md', content); await index.settled(); expect(index.resolve(e.id).status).toBe('duplicate'); index.dispose();
});
it('reports missing, wrong-kind, duplicate, mismatched-link and asset references without modifying data', async () => {
  const vault = new MemoryVault(), patch = createEntity('patch', 'P'), motif = createEntity('motif', 'M');
  if (motif.kind !== 'motif') throw Error(); motif.patchId = patch.id; motif.patchLink = '[[Patch.md]]';
  const index = new EntityIndex(vault); await index.start(); const resolver = new ReferenceResolver(index, p => vault.exists(p), () => 'Other.md');
  expect(resolver.diagnostics(motif)[0]?.code).toBe('missing');
  await vault.create('Patch.md', createEntityDocument(patch)); await index.settled();
  expect(resolver.diagnostics(motif)[0]?.code).toBe('link-mismatch');
  motif.patchId = motif.id; await vault.create('Motif.md', createEntityDocument(motif)); await index.settled();
  expect(resolver.diagnostics(motif).map(d => d.code)).toContain('wrong-kind');
  await vault.create('Copy.md', createEntityDocument(motif)); await index.settled();
  expect(resolver.diagnostics(motif)[0]?.code).toBe('duplicate');
  motif.assets = [{ role: 'audio', link: '[[Assets/missing.wav]]' }];
  expect(resolver.diagnostics(motif).map(d => d.field)).toContain('audio'); index.dispose();
});
it('bounds startup read concurrency to four', async () => {
  const vault = new MemoryVault(), wait = deferred(); let active=0, maximum=0;
  for (let i=0;i<12;i++) vault.files.set(`${i}.md`, '# Not an entity');
  vault.delayRead = async () => { active++; maximum=Math.max(maximum,active); await wait.promise; active--; };
  const index = new EntityIndex(vault), startup=index.start(); await Promise.resolve(); await Promise.resolve();
  expect(maximum).toBe(4); wait.resolve(); await startup; index.dispose();
});
it('preserves typed diagnostics and identity for a quoted ID with a future schema', async () => {
  const vault=new MemoryVault(),e=createEntity('patch','P');
  vault.files.set('P.md', createEntityDocument(e).replace('mnemobard_id:', '"mnemobard_id":').replace('mnemobard_schema: 1','mnemobard_schema: 9'));
  const index=new EntityIndex(vault); await index.start();
  expect(index.resolve(e.id).status).toBe('invalid'); expect(index.all()[0]?.error?.code).toBe('unsupported-schema'); index.dispose();
});
it('releases listeners and prevents a pending startup read from publishing after disposal',async()=>{
  const vault=new MemoryVault(),e=createEntity('patch','P'),wait=deferred();vault.files.set('P.md',createEntityDocument(e));vault.delayRead=()=>wait.promise;
  const index=new EntityIndex(vault);let publishes=0;index.subscribe(()=>publishes++);const startup=index.start();await Promise.resolve();index.dispose();wait.resolve();await startup;
  expect(publishes).toBe(0);expect(index.all()).toEqual([]);expect(vault.listeners.size).toBe(0);
});
it('keeps a known identity diagnosable after a transient read failure',async()=>{
  const vault=new MemoryVault(),e=createEntity('patch','P');vault.files.set('P.md',createEntityDocument(e));const index=new EntityIndex(vault);await index.start();
  vault.delayRead=async()=>{throw Error('Temporarily unavailable');};await index.refresh('P.md');
  expect(index.resolve(e.id).status).toBe('invalid');expect(index.all()[0]?.error?.code).toBe('io');
  vault.delayRead=undefined;await index.refresh('P.md');expect(index.resolve(e.id).status).toBe('ready');index.dispose();
});

it('4E: ofKind clones only the requested kinds; heads() carries error codes for issue lists without cloning entities', async () => {
  const { EntityIndex: Index } = await import('../src/storage/index'); const { createEntityDocument: doc } = await import('../src/storage/document'); const { createEntity: make } = await import('../src/domain/entities'); const { MemoryVault: Vault } = await import('./support/memory-vault');
  const vault = new Vault(), index = new Index(vault);
  for (const [kind, title] of [['motif', 'M'], ['patch', 'P'], ['composition', 'C'], ['instrument', 'I']] as const) await vault.create(`${title}.md`, doc(make(kind, title)));
  await vault.create('Broken.md', '---\nmnemobard_id: 00000000-0000-4000-8000-000000000bad\nmnemobard_kind: motif\nmnemobard_schema: 2\n---\n');
  await index.start();
  expect(index.ofKind('motif').map(e => e.entity?.title)).toEqual(['M']); expect(index.ofKind('instrument', 'patch', 'effects-chain').map(e => e.entity?.kind).sort()).toEqual(['instrument', 'patch']);
  const issues = index.heads().filter(h => h.errorCode); expect(issues).toHaveLength(1); expect(issues[0]).toMatchObject({ path: 'Broken.md', errorCode: 'unsupported-schema' }); expect(issues[0]?.message).toContain('schema');
  index.dispose();
});
