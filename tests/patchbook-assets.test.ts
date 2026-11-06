import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/domain/entities';
import { PatchbookAssets, MAX_IMPORT_BYTES, MAX_PREVIEW_BYTES } from '../src/modules/patchbook/assets';
import { MemoryVault, deferred } from './support/memory-vault';
function fixture() {
  const vault = new MemoryVault(), assets = new PatchbookAssets(vault);
  vault.binaries.set('Samples/tone.wav', new Uint8Array([1, 2, 3]).buffer);
  return { vault, assets };
}
const external = () => ({ name: 'tone.wav', size: 3, type: 'audio/wav', arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer });
describe('vault asset associations', () => {
  it('selects any portable file type and removes only its association', () => {
    const { vault, assets } = fixture(); vault.binaries.set('Presets/unknown.xyz', new ArrayBuffer(1));
    expect(assets.files('unknown')[0]?.path).toBe('Presets/unknown.xyz');
    const reference = assets.reference('Presets/unknown.xyz', 'preset');
    const record = createEntity('instrument', 'Instrument'); record.extra.custom = 'preserved';
    const linked = assets.associate(record, reference);
    expect(linked.assets).toEqual([reference]); expect(record.assets).toBeUndefined();
    expect(assets.remove(linked, 0)).toMatchObject({ assets: [], id: record.id, extra: { custom: 'preserved' } });
    expect(vault.binaries.has('Presets/unknown.xyz')).toBe(true);
  });
  it('diagnoses missing and unsafe references without throwing in the browser', () => {
    const { assets } = fixture();
    expect(assets.status({ role: 'audio', link: '[[missing.wav]]' }).status).toBe('missing');
    for (const link of ['[[../private.wav]]', 'file:///secret.wav', '[[/tmp/file]]']) expect(assets.status({ role: 'audio', link }).status).toBe('invalid');
    expect(() => assets.reference('missing.wav', 'audio')).toThrow('no longer exists');
  });
  it('requires an explicitly selected replacement and supports public rename resolution', () => {
    const { vault } = fixture(); const assets = new PatchbookAssets(vault, path => path === 'old.wav' ? 'Samples/tone.wav' : null);
    const old = { role: 'audio' as const, link: '[[old.wav]]' };
    expect(assets.status(old).status).toBe('valid');
    const record = createEntity('patch', 'Patch'); record.assets = [{ ...old, link: '[[missing.wav]]' }];
    expect(assets.associate(record, assets.reference('Samples/tone.wav', 'audio'), 0).assets?.[0]?.link).toBe('[[Samples/tone.wav]]');
    expect(record.assets[0]?.link).toBe('[[missing.wav]]');
  });
  it('loads preview resources only on explicit request and enforces size/role limits', () => {
    const { vault, assets } = fixture(); let resources = 0; vault.resource = path => { resources++; return `app://local/${path}`; };
    const reference = assets.reference('Samples/tone.wav', 'audio'); assets.files(); assets.status(reference); expect(resources).toBe(0);
    expect(assets.preview(reference).url).toContain('app://'); expect(resources).toBe(1);
    const info = vault.fileInfo.bind(vault); vault.fileInfo = path => { const found = info(path); return found ? { ...found, size: MAX_PREVIEW_BYTES + 1 } : undefined; };
    expect(() => assets.preview(reference)).toThrow('250 MiB');
    expect(() => assets.preview({ ...reference, role: 'preset' })).toThrow('audio association');
  });
});
describe('explicit non-destructive external import', () => {
  it('copies exact bytes and chooses a unique path on collision, preserving originals', async () => {
    const { vault, assets } = fixture(), source = external(), original = await source.arrayBuffer();
    const first = await assets.import(source, 'Samples', true), second = await assets.import(source, 'Samples', true);
    expect(first.path).not.toBe('Samples/tone.wav'); expect(second.path).not.toBe(first.path);
    expect(vault.binaries.get('Samples/tone.wav')).toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(vault.binaries.get(first.path)).toEqual(original); expect(await source.arrayBuffer()).toEqual(original);
  });
  it.each(['../outside', '/tmp', 'Assets/../../x', '.obsidian', 'Assets/../x', 'Assets\\x', 'Assets/.hidden'])('rejects unsafe destination %s before reading or writing', async directory => {
    const { vault, assets } = fixture(); let reads = 0;
    await expect(assets.import({ ...external(), arrayBuffer: async () => { reads++; return new ArrayBuffer(3); } }, directory, true)).rejects.toThrow();
    expect(reads).toBe(0); expect(vault.binaries.size).toBe(1);
  });
  it('requires confirmation, respects cancellation before/after reading and read-only mode', async () => {
    const { vault, assets } = fixture(), signal = new AbortController();
    await expect(assets.import(external(), 'Assets', false)).rejects.toThrow('cancelled');
    signal.abort(); await expect(assets.import(external(), 'Assets', true, signal.signal)).rejects.toThrow('cancelled');
    const waiting = deferred<ArrayBuffer>(), controller = new AbortController();
    const operation = assets.import({ ...external(), arrayBuffer: () => waiting.promise }, 'Assets', true, controller.signal);
    controller.abort(); waiting.resolve(new ArrayBuffer(3)); await expect(operation).rejects.toThrow('cancelled');
    await expect(new PatchbookAssets(vault, undefined, () => false).import(external(), 'Assets', true)).rejects.toThrow('read-only');
    expect(vault.binaries.size).toBe(1);
  });
  it.each(['before', 'after'] as const)('reports uncertain write failure %s without retry/deletion or association', async failure => {
    const { vault, assets } = fixture(); vault.failBinary = failure;
    await expect(assets.import(external(), 'Assets', true)).rejects.toMatchObject({ importedPath: 'Assets/tone.wav' });
    expect(vault.binaries.has('Assets/tone.wav')).toBe(failure === 'after'); expect(vault.binaries.has('Samples/tone.wav')).toBe(true);
  });
  it('retains an already copied file when cancellation arrives during the write', async () => {
    const { vault, assets } = fixture(), controller = new AbortController(), write = vault.createBinary.bind(vault);
    vault.createBinary = async (path, bytes) => { await write(path, bytes); controller.abort(); };
    await expect(assets.import(external(), 'Assets', true, controller.signal)).rejects.toMatchObject({ importedPath: 'Assets/tone.wav' });
    expect(vault.binaries.has('Assets/tone.wav')).toBe(true);
  });
  it('rejects oversized, changed, empty and unsafe filenames', async () => {
    const { assets } = fixture();
    for (const change of [{ size: MAX_IMPORT_BYTES + 1 }, { size: 0 }, { size: 4 }, { name: '../x.wav' }, { name: 'bad:name' }]) await expect(assets.import({ ...external(), ...change }, 'Assets', true)).rejects.toThrow();
    assets.dispose(); expect(() => assets.files()).toThrow('closed');
  });
});
