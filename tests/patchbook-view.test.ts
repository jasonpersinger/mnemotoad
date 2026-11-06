// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import type { FoundationServices } from '../src/application/services';
import { SettingsService } from '../src/application/settings';
import { ModuleController } from '../src/application/modules';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { ReferenceResolver } from '../src/storage/references';
import { PatchbookLibrary } from '../src/modules/patchbook/library';
import { PatchbookView } from '../src/modules/patchbook/view';
import { createEntity } from '../src/domain/entities';
import { installDomHelpers, Scope as MockScope } from './support/obsidian';
import { MemoryVault, deferred } from './support/memory-vault';
import { PatchbookAssets } from '../src/modules/patchbook/assets';
import { AudioPreview } from '../src/modules/patchbook/preview';
import { MotifLibrary } from '../src/modules/motif/library';
import { MusicalTransport } from '../src/music/transport';
import { PatchbookRecovery } from '../src/modules/patchbook/recovery';
const cleanup: (() => void)[] = [];
beforeEach(() => installDomHelpers());
afterEach(() => { for (const close of cleanup.splice(0)) close(); document.body.replaceChildren(); });
async function fixture() {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), library = new PatchbookLibrary(index, repository);
  const settings = new SettingsService({ load: async () => null, save: async () => {} }); await settings.load();
  const services: FoundationServices = { repository, index, patchbook: library, references: new ReferenceResolver(index, p => vault.exists(p)), settings,
    motifs: new MotifLibrary(index, repository, vault), musical: new MusicalTransport(), assets: new PatchbookAssets(vault), preview: new AudioPreview(), recovery: new PatchbookRecovery(vault, index, repository),
    modules: new ModuleController(settings.current.modules, { open: async () => {}, close: () => {} }) };
  const view = new PatchbookView({} as WorkspaceLeaf, () => services); document.body.append(view.contentEl);
  cleanup.push(() => { view.release(); library.dispose(); repository.dispose(); index.dispose(); settings.dispose(); });
  await view.onOpen(); return { view, vault, services, library, repository, index };
}
async function settle() { await new Promise(resolve => setTimeout(resolve, 0)); await new Promise(resolve => setTimeout(resolve, 0)); }
function click(root: HTMLElement, text: string) {
  const target = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === text); if (!target) throw Error(`Missing button ${text}`); target.click();
}
function input(root: HTMLElement, label: string, value: string) {
  const target = [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')].find(e => e.getAttribute('aria-label') === label); if (!target) throw Error(`Missing input ${label}`);
  target.value = value; target.dispatchEvent(new Event('input', { bubbles: true })); return target;
}
describe('PATCHBOOK workspace interactions', () => {
  it('creates a useful instrument through the actual labeled form', async () => {
    const { view, library } = await fixture(); click(view.contentEl, 'New instrument'); await settle();
    input(view.contentEl, 'Name', 'Ink synthesizer'); input(view.contentEl, 'Instrument type', 'Software synthesizer'); input(view.contentEl, 'Manufacturer / developer', 'Workshop');
    click(view.contentEl, 'Save record'); await settle();
    expect(library.query({ kind: 'instrument' })[0]?.entity).toMatchObject({ title: 'Ink synthesizer', manufacturer: 'Workshop', instrumentType: 'Software synthesizer' });
    expect(view.contentEl.textContent).toContain('Record saved'); expect(view.contentEl.querySelector('form')).toBeNull();
  });
  it('keeps field focus and typed values through index updates', async () => {
    const { view, repository } = await fixture(); click(view.contentEl, 'New instrument'); await settle(); const name = input(view.contentEl, 'Name', 'Unfinished'); name.focus();
    await repository.create(createEntity('instrument', 'External record')); await settle();
    expect(document.activeElement).toBe(name); expect(name.value).toBe('Unfinished'); expect(view.contentEl.querySelector('form')).not.toBeNull();
  });
  it('searches/filters without replacing the search control and persists valid workspace hints', async () => {
    const { view, repository } = await fixture(); await repository.create(createEntity('instrument', 'Ink')); await repository.create(createEntity('instrument', 'Brass')); await settle();
    click(view.contentEl, 'Instruments'); await settle(); const search = input(view.contentEl, 'Search register', 'Ink'); search.focus();
    expect(view.contentEl.querySelectorAll('.mnemobard-record-list li')).toHaveLength(1); expect(document.activeElement).toBe(search);
    const state = view.getState(); expect(state.search).toBe('Ink'); await view.setState({ ...state, search: 'Brass' });
    expect(search.value).toBe('Brass'); expect(view.contentEl.querySelector('.mnemobard-record-list')?.textContent).toContain('Brass');
  });
  it('retains and checkpoints a dirty draft across register navigation and view closure', async () => {
    const { view, library, vault } = await fixture(); click(view.contentEl, 'New instrument'); await settle(); input(view.contentEl, 'Name', 'Unpublished idea');
    click(view.contentEl, 'Patches'); await settle(); const draft = library.getDrafts()[0]; expect(draft?.draft.title).toBe('Unpublished idea');
    expect(draft?.recoveryPath && vault.files.has(draft.recoveryPath)).toBe(true); await view.onClose(); expect(draft?.disposed).toBe(false);
    await view.onOpen(); expect(view.contentEl.textContent).toContain('Unpublished idea');
  });
  it('shows malformed/future records as inspectable diagnostics', async () => {
    const { view, repository, vault, index } = await fixture(); const record = await repository.create(createEntity('instrument', 'Future'));
    vault.modify(record.path, record.source.replace('mnemobard_schema: 1', 'mnemobard_schema: 2')); await index.settled(); await settle();
    expect(view.contentEl.textContent).toContain('unreadable record'); expect(view.contentEl.textContent).toContain('Unsupported');
    expect(view.contentEl.querySelector('form')).toBeNull();
  });
  it('restores disabled leaves without registering an active editor or losing data', async () => {
    const { view, services, repository, vault } = await fixture(); const record = await repository.create(createEntity('instrument', 'Retained'));
    services.modules.setEnabled('patchbook', false); await view.onClose(); await view.onOpen();
    expect(view.contentEl.textContent).toContain('disabled'); expect(view.contentEl.querySelector('input')).toBeNull(); expect(vault.files.get(record.path)).toBe(record.source);
  });
  it('keeps invalid reference drafts editable without rendering unsafe links or calling the validated resolver', async () => {
    const { view, library } = await fixture(); click(view.contentEl, 'New instrument'); await settle();
    input(view.contentEl, 'Name', 'Unfinished references'); input(view.contentEl, 'External references (http/https, one per line)', 'javascript:alert(1)');
    input(view.contentEl, 'Preset files', '../outside.preset'); click(view.contentEl, 'Keep draft & close form'); await settle();
    expect(view.contentEl.textContent).toContain('needs attention'); expect(view.contentEl.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(library.getDrafts()[0]?.draft.externalReferences).toEqual(['javascript:alert(1)']);
    click(view.contentEl, 'Continue editing draft'); expect(view.contentEl.querySelector('form')).not.toBeNull();
  });
  it('removes scoped keyboard bindings on close and registers only one after reopening', async () => {
    const { view } = await fixture(), scope = view.scope as unknown as MockScope;
    expect(scope.handlers.size).toBe(1); await view.onClose(); expect(scope.handlers.size).toBe(0);
    await view.onOpen(); expect(scope.handlers.size).toBe(1); view.release(); expect(scope.handlers.size).toBe(0);
  });
  it('shows existing UUID associations consistently regardless of hexadecimal case', async () => {
    const { view, repository } = await fixture();
    const instrument = await repository.create({ ...createEntity('instrument', 'Uppercase instrument'), id: crypto.randomUUID().toUpperCase() });
    const chain = await repository.create({ ...createEntity('effects-chain', 'Uppercase chain'), id: crypto.randomUUID().toUpperCase() });
    const patch = await repository.create({ ...createEntity('patch', 'Mixed references'), instrumentId: instrument.entity.id.toLowerCase(), effectsChainIds: [chain.entity.id] }); await settle();
    view.contentEl.querySelector<HTMLButtonElement>(`[data-record-id="${patch.entity.id}"]`)?.click(); await settle(); click(view.contentEl, 'Edit record');
    expect(view.contentEl.querySelector<HTMLSelectElement>('select[aria-label="Instrument"]')?.selectedOptions[0]?.textContent).toBe('Uppercase instrument');
    expect(view.contentEl.querySelector<HTMLInputElement>('input[aria-label="Effects chain: Uppercase chain"]')?.checked).toBe(true);
  });
});

it('selects an existing vault asset, persists it and removes association without deleting bytes', async () => {
  const { view, vault, library } = await fixture(); vault.binaries.set('Assets/native.wav', new ArrayBuffer(8));
  click(view.contentEl, 'New instrument'); await settle(); input(view.contentEl, 'Name', 'Asset owner');
  click(view.contentEl, 'Select vault asset'); click(view.contentEl, 'Assets/native.wav');
  expect(view.contentEl.textContent).toContain('Asset association is unsaved'); click(view.contentEl, 'Save record'); await settle();
  expect(library.query({ kind: 'instrument' })[0]?.entity.assets).toEqual([{ role: 'audio', link: '[[Assets/native.wav]]' }]);
  click(view.contentEl, 'Manage assets'); click(view.contentEl, 'Remove association'); click(view.contentEl, 'Save record'); await settle();
  expect(library.query({ kind: 'instrument' })[0]?.entity.assets ?? []).toEqual([]); expect(vault.binaries.has('Assets/native.wav')).toBe(true);
});
it('repairs an explicitly chosen missing reference while retaining unknown metadata and prose', async () => {
  const { view, vault, repository } = await fixture(); vault.binaries.set('Assets/replacement.preset', new ArrayBuffer(8));
  const entity = createEntity('instrument', 'Repair owner'); entity.assets = [{ role: 'preset', link: '[[Assets/missing.preset]]' }]; entity.extra.custom = 'keep';
  const record = await repository.create(entity); vault.modify(record.path, record.source + '\nUser prose\n');
  await settle(); await view.setState({ kind: 'instrument', selectedId: entity.id });
  expect(view.contentEl.textContent).toContain('missing reference'); click(view.contentEl, 'Manage assets'); click(view.contentEl, 'Repair reference'); click(view.contentEl, 'Assets/replacement.preset'); click(view.contentEl, 'Save record'); await settle();
  const saved = await repository.read(entity.id); expect(saved.entity.assets).toEqual([{ role: 'preset', link: '[[Assets/replacement.preset]]' }]); expect(saved.source).toContain('User prose'); expect(saved.entity.extra.custom).toBe('keep');
});
it('discovers and loads recovery only by explicit action before normal Save', async () => {
  const { view, vault, repository } = await fixture(); const base = await repository.create(createEntity('instrument', 'Recovery owner'));
  await repository.saveEditorDraft({ ...base.entity, title: 'Recovered through UI' }, base);
  await settle(); click(view.contentEl, 'Recovery register'); await settle();
  const checkpoint = [...view.contentEl.querySelectorAll<HTMLButtonElement>('.mnemobard-recovery-row button')].find(button => button.textContent?.startsWith('Recovered through UI'));
  if (!checkpoint) throw Error('Recovery checkpoint missing'); checkpoint.click(); await settle();
  expect(view.contentEl.textContent).toContain('Authoritative source unchanged'); expect(vault.files.get(base.path)).toBe(base.source);
  click(view.contentEl, 'Load draft without saving'); await settle(); expect(view.contentEl.querySelector<HTMLInputElement>('[aria-label="Name"]')?.value).toBe('Recovered through UI'); expect(vault.files.get(base.path)).toBe(base.source);
  click(view.contentEl, 'Save record'); await settle(); expect((await repository.read(base.entity.id)).entity.title).toBe('Recovered through UI');
});
it('shows invalid asset diagnostics safely and releases asset listeners on view close', async () => {
  const { view, vault } = await fixture(); const before = vault.listeners.size;
  click(view.contentEl, 'New instrument'); await settle(); expect(vault.listeners.size).toBe(before + 1);
  input(view.contentEl, 'Name', 'Invalid asset'); input(view.contentEl, 'Preset files', '../outside'); expect(view.contentEl.textContent).toContain('invalid reference');
  await view.onClose(); expect(vault.listeners.size).toBe(before); expect(view.contentEl.children.length).toBe(0);
});

it('cancels a pending import when a different asset picker opens', async () => {
  const { view, vault, library } = await fixture(); click(view.contentEl, 'New instrument'); await settle(); input(view.contentEl, 'Name', 'Import cancellation'); click(view.contentEl, 'Import local file');
  const waiting = deferred<ArrayBuffer>(), control = view.contentEl.querySelector<HTMLInputElement>('[aria-label="Local file"]'); if (!control) throw Error('Missing file input');
  Object.defineProperty(control, 'files', { value: [{ name: 'cancelled.wav', size: 3, type: 'audio/wav', arrayBuffer: () => waiting.promise }] }); control.dispatchEvent(new Event('change'));
  click(view.contentEl, 'Confirm copy into vault'); click(view.contentEl, 'Select vault asset'); waiting.resolve(new ArrayBuffer(3)); await settle();
  expect(vault.binaries.size).toBe(0); expect(library.getDrafts()[0]?.draft.assets).toBeUndefined();
});
it('retains an already submitted import after cancellation without associating it', async () => {
  const { view, vault, library } = await fixture(); click(view.contentEl, 'New instrument'); await settle(); input(view.contentEl, 'Name', 'Partial import'); click(view.contentEl, 'Import local file');
  const waiting = deferred(), original = vault.createBinary.bind(vault); vault.createBinary = async (path, bytes) => { await waiting.promise; await original(path, bytes); };
  const control = view.contentEl.querySelector<HTMLInputElement>('[aria-label="Local file"]'); if (!control) throw Error('Missing file input');
  Object.defineProperty(control, 'files', { value: [{ name: 'retained.wav', size: 3, type: 'audio/wav', arrayBuffer: async () => new ArrayBuffer(3) }] }); control.dispatchEvent(new Event('change'));
  click(view.contentEl, 'Confirm copy into vault'); await settle(); click(view.contentEl, 'Cancel import'); waiting.resolve(); await settle();
  expect(vault.binaries.has('MNEMOBARD/Assets/retained.wav')).toBe(true); expect(library.getDrafts()[0]?.draft.assets).toBeUndefined(); expect(view.contentEl.textContent).toContain('complete or partial copy');
});

it('provides its key scope before the host activates or opens the view', () => {
  const view = new PatchbookView({} as WorkspaceLeaf, () => undefined);
  expect(view.scope).toBeInstanceOf(MockScope); view.release();
});
