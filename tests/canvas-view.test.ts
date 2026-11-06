// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import type { FoundationServices } from '../src/application/services';
import { SettingsService } from '../src/application/settings';
import { ModuleController } from '../src/application/modules';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { ReferenceResolver } from '../src/storage/references';
import { PatchbookLibrary } from '../src/modules/patchbook/library';
import { PatchbookAssets } from '../src/modules/patchbook/assets';
import { AudioPreview } from '../src/modules/patchbook/preview';
import { PatchbookRecovery } from '../src/modules/patchbook/recovery';
import { MotifLibrary } from '../src/modules/motif/library';
import { MusicalTransport } from '../src/music/transport';
import { CanvasLibrary } from '../src/modules/canvas/library';
import { CanvasView } from '../src/modules/canvas/view';
import { MotifView } from '../src/modules/motif/view';
import { createEntity } from '../src/domain/entities';
import { MemoryVault } from './support/memory-vault';
import { installDomHelpers, Keymap } from './support/obsidian';
const cleanup: (() => void)[] = [];
beforeEach(() => { installDomHelpers(); Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null }); });
afterEach(() => { for (const fn of cleanup.splice(0))
    fn(); document.body.replaceChildren(); });
async function fixture() { const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), settings = new SettingsService({ load: async () => null, save: async () => { } }); await settings.load(); const motifs = new MotifLibrary(index, repository, vault); const services: FoundationServices = { settings, index, repository, modules: new ModuleController(settings.current.modules, { open: async () => { }, close: () => { } }), references: new ReferenceResolver(index, p => vault.exists(p)), patchbook: new PatchbookLibrary(index, repository), assets: new PatchbookAssets(vault), preview: new AudioPreview(), recovery: new PatchbookRecovery(vault, index, repository), motifs, musical: new MusicalTransport(), canvas: new CanvasLibrary(index, repository, vault, id => motifs.isDirty(id)) }; const view = new CanvasView({} as WorkspaceLeaf, () => services); document.body.append(view.contentEl); cleanup.push(() => { view.release(); services.canvas.dispose(); motifs.dispose(); services.musical.dispose(); services.patchbook.dispose(); repository.dispose(); index.dispose(); settings.dispose(); }); await (view as unknown as {
    open: () => Promise<void>;
}).open(); return { view, services, vault }; }
function click(root: HTMLElement, text: string) { const b = [...root.querySelectorAll('button')].find(b => b.textContent === text && !b.disabled); if (!b)
    throw Error('Missing button ' + text); b.click(); }
function input(root: HTMLElement, label: string, value: string) { const e = [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')].find(e => e.getAttribute('aria-label') === label); if (!e)
    throw Error('Missing input ' + label); e.value = value; e.dispatchEvent(new Event('input', { bubbles: true })); return e; }
const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };
async function start() { const f = await fixture(); click(f.view.contentEl, 'New composition'); await settle(); click(f.view.contentEl, 'Add lane'); const motif = await f.services.repository.create(createEntity('motif', 'Saved source')); click(f.view.contentEl, 'Place motif'); document.body.append((f.view as unknown as {
    picker: {
        contentEl: HTMLElement;
    };
}).picker.contentEl); return { ...f, motif }; }
it('creates/renames/reorders lanes and requires confirmation for occupied-lane deletion with Undo', async () => { const { view, services } = await fixture(); click(view.contentEl, 'New composition'); await settle(); input(view.contentEl, 'Composition name', 'Arrangement'); click(view.contentEl, 'Add lane'); input(view.contentEl, 'Lane name', 'Melody'); click(view.contentEl, 'Rename lane'); click(view.contentEl, 'Add lane'); const s = services.canvas.drafts()[0]; if (!s)
    throw Error(); const ids = s.draft.data.lanes.map(l => l.id); click(view.contentEl, 'Move lane up'); expect(s.draft.data.lanes[0]?.id).toBe(ids[1]); click(view.contentEl, 'Undo'); expect(s.draft.data.lanes[0]?.id).toBe(ids[0]); click(view.contentEl, 'Save composition'); await vi.waitFor(() => expect(view.contentEl.querySelector('.mnemobard-save-status')?.textContent).toBe('Saved')); expect(services.canvas.items('Arrangement')).toHaveLength(1); });
it('places saved motifs through preview controls then edits repeats/position/duplicate/delete/history', async () => { const { view, services, motif } = await start(); const dialog = (view as unknown as {
    picker: {
        contentEl: HTMLElement;
    };
}).picker.contentEl; const choice = dialog.querySelector<HTMLSelectElement>('[aria-label="Saved motif to place"]'); if (!choice)
    throw Error(); choice.value = motif.entity.id; choice.dispatchEvent(new Event('change')); input(dialog, 'Placement (bar:beat:tick)', '2:1:0'); input(dialog, 'Placement repetitions', '4'); click(dialog, 'Place motif clip'); const session = services.canvas.drafts()[0]; if (!session)
    throw Error(); expect(session.draft.data.lanes[0]?.clips[0]).toMatchObject({ startTick: 3840, repeatCount: 4 }); expect(JSON.stringify(session.draft)).not.toContain('durationTicks'); input(view.contentEl, 'Clip position (bar:beat:tick)', '3:1:17'); click(view.contentEl, 'Apply clip placement'); expect(session.draft.data.lanes[0]?.clips[0]?.startTick).toBe(7697); click(view.contentEl, 'Duplicate clip'); expect(session.draft.data.lanes[0]?.clips).toHaveLength(2); click(view.contentEl, 'Undo'); expect(session.draft.data.lanes[0]?.clips).toHaveLength(1); click(view.contentEl, 'Redo'); click(view.contentEl, 'Delete clip'); expect(session.draft.data.lanes[0]?.clips).toHaveLength(1); click(view.contentEl, 'Undo'); expect(session.draft.data.lanes[0]?.clips).toHaveLength(2); click(view.contentEl, 'Delete lane'); expect(session.draft.data.lanes).toHaveLength(1); click(view.contentEl, 'Confirm delete lane and clips'); expect(session.draft.data.lanes).toHaveLength(0); click(view.contentEl, 'Undo'); expect(session.draft.data.lanes).toHaveLength(1); });
it('keeps pending precise controls on source changes and blocks competing edits/saves until explicit Apply', async () => { const { view, services, motif, vault } = await start(), dialog = (view as unknown as {
    picker: {
        contentEl: HTMLElement;
    };
}).picker.contentEl, choice = dialog.querySelector<HTMLSelectElement>('[aria-label="Saved motif to place"]'); if (!choice)
    throw Error(); choice.value = motif.entity.id; choice.dispatchEvent(new Event('change')); click(dialog, 'Place motif clip'); input(view.contentEl, 'Clip repetitions', '3'); click(view.contentEl, 'Add lane'); expect(services.canvas.drafts()[0]?.draft.data.lanes).toHaveLength(1); click(view.contentEl, 'Save composition'); expect(services.canvas.items()).toHaveLength(0); vault.modify(motif.path, motif.source + '\nSource changed\n'); await services.index.settled(); expect(view.contentEl.querySelector<HTMLInputElement>('[aria-label="Clip repetitions"]')?.value).toBe('3'); click(view.contentEl, 'Apply clip placement'); expect(services.canvas.drafts()[0]?.draft.data.lanes[0]?.clips[0]?.repeatCount).toBe(3); expect(view.contentEl.textContent).toContain('Saved source changed'); });
it('uses keyboard scopes only in the editor, keeps text undo native and disposes resources on close', async () => { const { view, services } = await fixture(); click(view.contentEl, 'New composition'); await settle(); click(view.contentEl, 'Add lane'); const canvas = view.contentEl.querySelector('canvas'); canvas?.focus(); await settle(); const keymap = view.app.keymap as unknown as Keymap, scope = [...keymap.scopes][0]; expect(scope).toBeDefined(); const undo = [...scope?.handlers ?? []].find(h => h.key === 'z' && Array.isArray(h.modifiers) && h.modifiers.length === 1); if (!undo)
    throw Error(); view.contentEl.querySelector<HTMLInputElement>('[aria-label="Composition name"]')?.focus(); expect(undo.callback()).toBe(true); expect(services.canvas.drafts()[0]?.draft.data.lanes).toHaveLength(1); canvas?.focus(); expect(undo.callback()).toBe(false); expect(services.canvas.drafts()[0]?.draft.data.lanes).toHaveLength(0); const session = services.canvas.drafts()[0]; await view.onClose(); expect(keymap.scopes.size).toBe(0); expect(session?.disposed).toBe(false); expect(session?.recoveryPath).toBeDefined(); await view.onOpen(); expect(view.contentEl.textContent).toContain('Pending arrangements'); });
it('navigates a clip source through public deferred loading without consuming its unsaved draft', async () => { const { view, services, motif } = await start(), dialog = (view as unknown as {
    picker: {
        contentEl: HTMLElement;
    };
}).picker.contentEl, choice = dialog.querySelector<HTMLSelectElement>('[aria-label="Saved motif to place"]'); if (!choice)
    throw Error(); choice.value = motif.entity.id; choice.dispatchEvent(new Event('change')); click(dialog, 'Place motif clip'); const sourceView = new MotifView({} as WorkspaceLeaf, () => services); await sourceView.onOpen(); cleanup.push(() => sourceView.release()); let loads = 0; Object.assign(view.app.workspace, { getLeavesOfType: () => [{ view: sourceView, loadIfDeferred: async () => { loads++; } }] }); click(view.contentEl, 'Open source MOTIF'); await vi.waitFor(() => expect(sourceView.getState().selectedId).toBe(motif.entity.id)); expect(loads).toBe(1); expect((await services.repository.read(motif.entity.id)).source).toBe(motif.source); });
it('routing form rejects duplicate explicit assignments, restores Auto and groups each accepted preference in shared history',async()=>{
 const{view,services}=await fixture();click(view.contentEl,'New composition');await settle();click(view.contentEl,'Add lane');click(view.contentEl,'Add lane');const session=services.canvas.drafts()[0];if(!session)throw Error('Missing session');
 const select=(label:string,value:string)=>{const e=view.contentEl.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`);if(!e)throw Error('Missing select');e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));};const first=session.draft.data.lanes[0],second=session.draft.data.lanes[1];if(!first||!second)throw Error('Missing lanes');
 select('Routing lane',first.id);select('Lane MIDI channel','0');const h=session.historySize;click(view.contentEl,'Apply lane routing');expect(session.draft.data.lanes[0]?.midiChannel).toBe(0);expect(session.historySize).toBe(h+1);
 select('Routing lane',second.id);select('Lane MIDI channel','0');click(view.contentEl,'Apply lane routing');expect(session.draft.data.lanes[1]?.midiChannel).toBeUndefined();expect(view.contentEl.textContent).toContain('explicitly assigned');expect(session.historySize).toBe(h+1);click(view.contentEl,'Discard routing changes');
 select('Routing lane',first.id);select('Lane MIDI channel','');click(view.contentEl,'Apply lane routing');expect(session.draft.data.lanes[0]?.midiChannel).toBeUndefined();click(view.contentEl,'Undo');expect(session.draft.data.lanes[0]?.midiChannel).toBe(0);click(view.contentEl,'Redo');expect(session.draft.data.lanes[0]?.midiChannel).toBeUndefined();
});
it('CANVAS seek and transport inspection stay ephemeral and dispose window listeners',async()=>{
 const{view,services}=await fixture();click(view.contentEl,'New composition');await settle();const session=services.canvas.drafts()[0];if(!session)throw Error('Missing session');const history=session.historySize,draft=JSON.stringify(session.draft);input(view.contentEl,'Arrangement seek (bar:beat:tick)','2:1:0');click(view.contentEl,'Seek arrangement');click(view.contentEl,'Stop arrangement');expect(session.historySize).toBe(history);expect(JSON.stringify(session.draft)).toBe(draft);const stop=vi.spyOn(services.musical,'stop');await view.onClose();stop.mockClear();window.dispatchEvent(new Event('blur'));expect(services.musical.state).toBe('stopped');expect(stop).not.toHaveBeenCalled();
});
