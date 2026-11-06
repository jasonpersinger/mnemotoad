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
import { MemoryVault } from './support/memory-vault';
const cleanup: (() => void)[] = [];
beforeEach(() => installDomHelpers());
afterEach(() => { for (const close of cleanup.splice(0)) close(); document.body.replaceChildren(); });
async function fixture() {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), library = new PatchbookLibrary(index, repository);
  const settings = new SettingsService({ load: async () => null, save: async () => {} }); await settings.load();
  const services: FoundationServices = { repository, index, patchbook: library, references: new ReferenceResolver(index, p => vault.exists(p)), settings,
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
