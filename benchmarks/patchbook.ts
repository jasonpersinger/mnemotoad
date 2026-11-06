/** Synthetic in-memory vault benchmark, run under Node and native Obsidian CDP.
 * Measures production parser/index/query/repository/resolver, not filesystem IO.
 */
import { createEntity } from '../src/domain/entities';
import { createEntityDocument } from '../src/storage/document';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { PatchbookLibrary } from '../src/modules/patchbook/library';
import { PatchbookAssets } from '../src/modules/patchbook/assets';
import { MemoryVault } from '../tests/support/memory-vault';
const id = (i: number): string => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
function stats(values: number[]) { const sorted = values.slice().sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] }; }
export async function runLibraryBenchmark() {
  const results = [];
  for (const count of [100, 1000, 5000]) {
    const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), library = new PatchbookLibrary(index, repository);
    const instrument = createEntity('instrument', 'Synthetic synthesizer'); instrument.id = id(1);
    vault.files.set('Library/Instrument.md', createEntityDocument(instrument));
    for (let i = 2; i <= count; i++) {
      const entity = createEntity('patch', `Sound ${String(i).padStart(5, '0')}`); entity.id = id(i); entity.instrumentId = id(1); entity.instrument = instrument.title;
      entity.category = i % 3 === 0 ? 'Texture' : 'Keys'; entity.tags = [i % 2 === 0 ? 'bright' : 'dark']; entity.description = 'Synthetic scalability fixture';
      entity.assets = [{ role: 'audio', link: '[[Assets/tone.wav]]' }, { role: 'image', link: '[[Assets/panel.png]]' }, { role: 'preset', link: '[[Assets/unknown.patch]]' }];
      vault.files.set(`Library/Patch-${i}.md`, createEntityDocument(entity));
    }
    const assetMap = new Map(['tone.wav', 'panel.png', 'unknown.patch'].map(name => [`Assets/${name}`, { path: `Assets/${name}`, name, extension: name.split('.').at(-1) ?? '', modified: 1, size: 100 }]));
    vault.fileInfo = path => assetMap.get(path);
    const assets = new PatchbookAssets(vault); const start = performance.now(); await index.start(); const indexingMs = performance.now() - start;
    const measure = (operation: () => unknown) => {
      for (let i = 0; i < 3; i++) operation();
      const times = []; for (let i = 0; i < 25; i++) { const now = performance.now(); operation(); times.push(performance.now() - now); } return stats(times);
    };
    const search = measure(() => library.query({ kind: 'patch', search: 'bright texture' }));
    const filtering = measure(() => library.query({ kind: 'patch', instrumentId: id(1), category: 'Texture', tag: 'bright' }));
    const sorting = measure(() => library.query({ kind: 'patch', sort: 'title-desc' }));
    const navigation = []; for (let i = 0; i < 25; i++) { const now = performance.now(); await repository.read(id(Math.max(2, count - i))); navigation.push(performance.now() - now); }
    const sample = (await repository.read(id(count))).entity;
    const references = measure(() => sample.assets?.forEach(reference => assets.status(reference)));
    results.push({ records: count, indexingMs, search, filtering, sorting, navigation: stats(navigation), assetResolution3: references });
    library.dispose(); assets.dispose(); repository.dispose(); index.dispose();
  }
  return { methodology: 'In-memory synthetic VaultPort; production codec/index/query/repository/asset resolver. Fixture generation excluded; query warmup3, samples25; no disk IO, DOM or decoding.', results };
}
