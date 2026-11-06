// @vitest-environment jsdom
import { beforeEach, it, expect } from 'vitest';
import type { App } from 'obsidian';
import MnemobardPlugin from '../src/main';
import { ModuleView } from '../src/ui/module-view';
import { MnemobardSettingTab } from '../src/settings';
import { installDomHelpers, TFile, TFolder } from './support/obsidian';
import { createEntity } from '../src/domain/entities';
import { MemoryVault } from './support/memory-vault';
import { ObsidianVaultPort } from '../src/platform/obsidian-vault';

beforeEach(() => installDomHelpers());
function host() {
  const memory = new MemoryVault(), listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const leaves: { type: string; view?: ModuleView; detached: boolean; detach: () => void; setViewState: (state: {type:string}) => Promise<void> }[] = [];
  const native = {
    getMarkdownFiles: () => memory.markdownPaths().map(p => new TFile(p)),
    getAbstractFileByPath: (path: string) => memory.files.has(path) ? new TFile(path) : memory.folders.has(path) ? new TFolder(path) : null,
    read: (file: TFile) => memory.read(file.path),
    create: async (path: string, source: string) => { await memory.create(path, source); return new TFile(path); },
    createFolder: async (path: string) => { await memory.ensureFolder(path); return new TFolder(path); },
    process: (file: TFile, fn: (s:string)=>string) => memory.process(file.path, fn),
    on: (event: string, callback: (...args: unknown[]) => void) => { const set=listeners.get(event) ?? new Set(); set.add(callback); listeners.set(event,set); return { event, callback }; },
    offref: (ref: { event: string; callback: (...args: unknown[]) => void }) => { listeners.get(ref.event)?.delete(ref.callback); },
  };
  memory.subscribe(change => { for (const callback of listeners.get(change.type) ?? []) callback(new TFile(change.path), change.oldPath); });
  const workspace = {
    onLayoutReady: (fn: () => void) => { fn(); },
    getLeavesOfType: (type: string) => leaves.filter(l => !l.detached && l.type === type),
    revealLeaf: async () => {},
    getLeaf: () => {
      const leaf = { type: '', detached: false, view: undefined as ModuleView | undefined,
        detach() { this.detached=true; void this.view?.onClose(); },
        async setViewState(state: {type:string}) {
          this.type=state.type;
          const factory = (plugin as unknown as { views: Map<string,(leaf:unknown)=>ModuleView> }).views.get(state.type);
          if (!factory) throw Error('Missing factory'); this.view=factory(this); await this.view.onOpen();
        },
      }; leaves.push(leaf); return leaf;
    },
  };
  const app = { vault: native, workspace, metadataCache: { getFirstLinkpathDest: () => null } };
  const plugin = new MnemobardPlugin(app as unknown as App, { id: 'mnemobard', name: 'MNEMOBARD', version: '0.1.0', minAppVersion: '1.14.4', author: 'MNEMOBARD', description: 'Foundation' });
  return { plugin, memory, native, workspace, leaves, listeners, mock: plugin as unknown as import('./support/obsidian').Plugin };
}

it('registers commands/views/settings and creates all three real shell classes', async () => {
  const h = host(); await h.plugin.onload();
  expect(h.mock.commands.map(c => c.id)).toEqual(['open-patchbook','open-motif','open-canvas']); expect(h.mock.views.size).toBe(3);
  for (const module of ['patchbook','motif','canvas'] as const) await h.plugin.services?.modules.open(module);
  expect(h.leaves).toHaveLength(3);
  for (const leaf of h.leaves) {
    if (leaf.type === 'mnemobard-patchbook') { expect(leaf.view?.contentEl.textContent).toContain('Begin with an instrument'); expect(leaf.view?.contentEl.querySelector('input[type="search"]')).not.toBeNull(); }
    else expect(leaf.view?.contentEl.textContent).toContain('Under development');
  }
  expect(h.mock.tabs[0]).toBeInstanceOf(MnemobardSettingTab); (h.mock.tabs[0] as MnemobardSettingTab).display();
  await h.plugin.services?.index.settled(); h.mock.unload(); expect(h.mock.views.size).toBe(0); expect(h.mock.commands).toHaveLength(0); expect(h.mock.tabs).toHaveLength(0);
  expect([...h.listeners.values()].reduce((n,s)=>n+s.size,0)).toBe(0);
  expect(h.leaves.every(l => !l.detached)).toBe(true);
  await h.plugin.onload(); expect(h.mock.commands).toHaveLength(3); expect(h.mock.views.size).toBe(3); h.mock.unload();
});
it('persists module disable, closes that interface, preserves data and restores disabled leaves safely', async () => {
  const h = host(); await h.plugin.onload(); await h.plugin.services?.modules.open('motif');
  const record = await h.plugin.services?.repository.create(createEntity('motif','Stored'));
  await h.plugin.setModule('motif', false);
  expect(h.leaves[0]?.detached).toBe(true); expect(h.mock.commands.find(c => c.id === 'open-motif')?.checkCallback(true)).toBe(false);
  expect(record && h.memory.files.get(record.path)).toBe(record?.source);
  h.mock.unload(); await h.plugin.onload(); expect(h.plugin.services?.modules.enabled('motif')).toBe(false);
  const leaf = h.workspace.getLeaf(); await leaf.setViewState({type:'mnemobard-motif'});
  expect(leaf.view?.contentEl.textContent).toContain('disabled'); h.mock.unload();
});
it('adapts the actual public VaultPort signatures for conditional writes', async () => {
  const h=host(), port=new ObsidianVaultPort(h.native as unknown as App['vault']);
  await port.ensureFolder('Content/Patches'); await port.create('Content/Patches/A.md','old');
  expect(await port.process('Content/Patches/A.md', source => source+' new')).toBe('old new');
  expect(port.markdownPaths()).toEqual(['Content/Patches/A.md']);
  expect(() => port.read('../private.md')).toThrow();
});
it('blocks all repository writes when newer settings were loaded', async () => {
  const h=host();h.mock.savedData={schemaVersion:2,custom:'retain'};await h.plugin.onload();
  await expect(h.plugin.services?.repository.create(createEntity('patch','No write'))).rejects.toMatchObject({code:'unsupported-schema'});
  expect(h.memory.files.size).toBe(0);expect(h.mock.savedData).toEqual({schemaVersion:2,custom:'retain'});h.mock.unload();
});
it('stops additional public folder creation operations after cancellation', async () => {
  const h=host();let active=true;const create=h.native.createFolder;
  h.native.createFolder=async path=>{const result=await create(path);active=false;return result;};
  const port=new ObsidianVaultPort(h.native as unknown as App['vault']);
  await expect(port.ensureFolder('A/B/C',()=>{if(!active)throw Error('Cancelled');})).rejects.toThrow('Cancelled');
  expect([...h.memory.folders]).toEqual(['A']);
});
