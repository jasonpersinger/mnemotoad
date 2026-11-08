// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Composition, Motif } from '../src/domain/entities';
import { VIEW_TYPES } from '../src/application/modules';
import { defaultSettings, parseSettings } from '../src/application/settings';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { RecoveryCatalog } from '../src/storage/recovery-catalog';
import { contentRevision } from '../src/storage/content-revision';
import { compileArrangement } from '../src/arrangement/compiler';
import { MODULE_LABELS } from '../src/ui/module-view';
import { MemoryVault } from './support/memory-vault';

/**
 * MNEMOTOAD release candidate: the public name changed, the technical identity did not. These tests pin every retained
 * identifier and prove that records, settings and checkpoints written by MNEMOBARD 0.1.0 still load unchanged.
 */
const json = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const LEGACY = 'tests/fixtures/legacy-mnemobard';
const closers: (() => void)[] = []; afterEach(() => { for (const close of closers.splice(0)) close(); });

describe('plugin identity', () => {
  it('keeps plugin ID mnemobard while presenting the MNEMOTOAD name, with consistent versions', () => {
    const manifest = json('manifest.json'), pkg = json('package.json'), versions = json('versions.json');
    expect(manifest.id).toBe('mnemobard');
    expect(manifest.name).toBe('MNEMOTOAD');
    expect(String(manifest.description)).toMatch(/^Remember what you've yet to compose\./);
    expect(manifest.version).toBe(pkg.version);
    expect(versions[String(manifest.version)]).toBe(manifest.minAppVersion);
    expect(manifest.isDesktopOnly).toBe(true);
  });
  it('keeps the workspace view types, so saved layouts reopen the same views', () => {
    expect(VIEW_TYPES).toEqual({ patchbook: 'mnemobard-patchbook', motif: 'mnemobard-motif', canvas: 'mnemobard-canvas' });
    expect(MODULE_LABELS).toEqual({ patchbook: 'PATCHBOOK', motif: 'MOTIF', canvas: 'CANVAS' });
  });
  it('limits the old spelling in source string literals to the documented retained identifiers', () => {
    const files: string[] = [], walk = (dir: string): void => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
    walk('src');
    const found = new Set<string>();
    for (const file of files) for (const m of readFileSync(file, 'utf8').matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*MNEMOBARD(?:(?!\1)[^\\\n]|\\.)*)\1/g)) found.add(m[2] ?? '');
    // Vault storage roots (settings defaults, repository fallback) and the MIDI conductor track name (golden bytes).
    const history = [...found].filter(text => text.startsWith('Formerly MNEMOBARD: ')); // the settings About note explains the rename
    expect(history).toHaveLength(1);
    expect([...found].filter(text => !history.includes(text)).sort()).toEqual(['MNEMOBARD', 'MNEMOBARD conductor', 'MNEMOBARD/Assets']);
  });
});

describe('settings and storage paths', () => {
  it('keeps the established content and asset folders as defaults', () => {
    expect(defaultSettings()).toMatchObject({ creationRoot: 'MNEMOBARD', assetDirectory: 'MNEMOBARD/Assets' });
  });
  it('loads a MNEMOBARD 0.1.0 data.json unchanged (no reset, no path migration)', () => {
    const saved = { schemaVersion: 1, creationRoot: 'MNEMOBARD', modules: { patchbook: true, motif: false, canvas: true }, assetDirectory: 'MNEMOBARD/Assets' };
    expect(parseSettings(structuredClone(saved))).toEqual(saved);
    const custom = { ...saved, creationRoot: 'Music/Ideas', assetDirectory: 'Music/Ideas/Audio' };
    expect(parseSettings(structuredClone(custom))).toEqual(custom);
  });
});

describe('records written by MNEMOBARD 0.1.0', () => {
  async function legacyVault() {
    const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index);
    closers.push(() => { repository.dispose(); index.dispose(); });
    const paths = json(`${LEGACY}/vault-paths.json`) as Record<string, string>;
    for (const [path, file] of Object.entries(paths)) vault.files.set(path, readFileSync(`${LEGACY}/${file}`, 'utf8'));
    await index.start();
    return { vault, index, repository, paths };
  }
  const ID = { patch: 'c91043cb-071d-4c39-bb90-add7e3aca71a', choir: '2c32b39c-eaf9-4824-8f75-e416ebe061dc', pulse: 'b7ad0be6-5caa-4a99-a35e-373ad3231ac7', composition: '452c1f43-d87c-4197-a07b-693f4b5040ad' };

  it('index, resolve and keep their cross-module references', async () => {
    const { index } = await legacyVault();
    for (const id of Object.values(ID)) expect(index.locate(id).status).toBe('ready');
    const choir = index.resolve(ID.choir); expect(choir.status === 'ready' && (choir.entity as Motif).patchId).toBe(ID.patch);
    expect(index.referencing(ID.patch, 'motif').map(e => e.id)).toContain(ID.choir);
    expect(index.referencing(ID.choir, 'composition').map(e => e.id)).toContain(ID.composition);
  });
  it('still match their saved source revisions, so CANVAS raises no spurious source review', async () => {
    const { vault, index } = await legacyVault();
    const composition = index.resolve(ID.composition); if (composition.status !== 'ready') throw Error('composition');
    for (const clip of (composition.entity as Composition).data.lanes.flatMap(l => l.clips)) {
      expect(await contentRevision(vault.files.get(clip.sourcePath ?? '') ?? '')).toBe(clip.sourceRevision);
    }
  });
  it('compile deterministically from the saved sources', async () => {
    const { vault, index } = await legacyVault();
    const composition = index.resolve(ID.composition); if (composition.status !== 'ready') throw Error('composition');
    const sources = await Promise.all([ID.choir, ID.pulse].map(async id => {
      const r = index.resolve(id); if (r.status !== 'ready') throw Error(id); const text = vault.files.get(r.path) ?? '';
      return { motif: r.entity as Motif, revision: await contentRevision(text), textBytes: text.length };
    }));
    const a = compileArrangement(composition.entity as Composition, sources, 'f'.repeat(64)), b = compileArrangement(composition.entity as Composition, sources, 'f'.repeat(64));
    expect(a.ok ? [] : a.diagnostics).toEqual([]); expect(a).toEqual(b); // compiled result carries exact BigInt timing
  });
  it('save in place with their keys, unknown fields and file path preserved', async () => {
    const { vault, repository, paths } = await legacyVault();
    const base = await repository.read(ID.patch), path = Object.keys(paths).find(p => p.includes('Night choir'));
    const saved = await repository.save(base, { ...base.entity, title: 'Night choir (renamed in MNEMOTOAD)' });
    expect(saved.path).toBe(path);
    expect(saved.source).toMatch(/^---\nmnemobard_id: c91043cb-071d-4c39-bb90-add7e3aca71a\nmnemobard_kind: patch\nmnemobard_schema: 1\n/);
    expect(saved.source).toContain('mnemobard_instrument_id: f1a50e2c-091e-480c-87b3-0216def1beb3');
    expect(vault.files.get(path ?? '')).toBe(saved.source);
  });
  it('keep their recovery checkpoints readable and correctly classified', async () => {
    const { vault, index } = await legacyVault();
    const catalog = new RecoveryCatalog(vault, index), entry = catalog.list().find(e => e.path.endsWith('4c9956f9-88d2-4328-b33d-d824e77cfc9f.json'));
    if (!entry) throw Error('checkpoint not catalogued');
    const details = await catalog.details(entry);
    expect(details.integrity).toBe('Readable'); expect(details.type).toBe('Pre-save backup'); expect(details.kind).toBe('patch');
  });
});
