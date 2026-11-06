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
function choose(root: HTMLElement, label: string, value: string) { const e = [...root.querySelectorAll<HTMLSelectElement>('select')].find(e => e.getAttribute('aria-label') === label); if (!e)
    throw Error('Missing select ' + label); e.value = value; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
function submit(root: HTMLElement, text: string) { const b = [...root.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(b => b.textContent === text); if (!b)
    throw Error('Missing submit ' + text); b.form?.requestSubmit(b); }
async function structureView() { const f = await fixture(); click(f.view.contentEl, 'New composition'); await settle(); const s = f.services.canvas.drafts()[0] ?? [...(f.services.canvas as unknown as { sessions: Map<string, import('../src/modules/canvas/session').CanvasSession> }).sessions.values()][0]; if (!s)
    throw Error('No session'); const panel = f.view.contentEl.querySelector<HTMLElement>('.mnemobard-canvas-structure'); if (!panel)
    throw Error('No structure panel'); return { ...f, s, panel }; }
it('creates, edits, rejects overlapping and deletes sections from the keyboard panel with one Undo step each', async () => { const { s, panel } = await structureView(); const before = s.historySize;
    input(panel, 'New section name', 'Introduction'); input(panel, 'New section start (bar:beat:tick)', '1:1:0'); input(panel, 'New section end (bar:beat:tick)', '5:1:0'); submit(panel, 'Add section');
    expect(s.draft.data.sections).toMatchObject([{ label: 'Introduction', startTick: 0, endTick: 15360 }]); expect(s.historySize).toBe(before + 1);
    input(panel, 'New section name', 'Clash'); input(panel, 'New section start (bar:beat:tick)', '4:1:0'); input(panel, 'New section end (bar:beat:tick)', '8:1:0'); submit(panel, 'Add section');
    expect(panel.querySelector('.mnemobard-structure-status')?.textContent).toContain('Overlaps section “Introduction”'); expect(s.draft.data.sections).toHaveLength(1); expect(s.historySize).toBe(before + 1);
    click(panel, 'Discard');
    input(panel, 'Section name', 'Prelude'); input(panel, 'Section end (bar:beat:tick)', '3:1:0'); submit(panel, 'Apply section');
    expect(s.draft.data.sections[0]).toMatchObject({ label: 'Prelude', endTick: 7680 });
    click(panel, 'Delete section'); expect(s.draft.data.sections).toEqual([]); s.undo(); expect(s.draft.data.sections[0]?.label).toBe('Prelude'); });
it('navigates markers without history entries and keeps duplicate-position markers distinct', async () => { const { s, panel, view } = await structureView();
    for (const [name, at] of [['Choir', '3:1:0'], ['Build', '3:1:0'], ['Ending', '9:1:0']] as const) { input(panel, 'New marker name', name); input(panel, 'New marker position (bar:beat:tick)', at); submit(panel, 'Add marker'); }
    expect(s.draft.data.markers).toHaveLength(3); const history = s.historySize, labels = () => [...panel.querySelectorAll<HTMLButtonElement>('.mnemobard-structure-list button[data-structure-id]')].map(b => b.textContent);
    expect(labels()).toEqual(['Build', 'Choir', 'Ending']);
    click(view.contentEl, 'Next marker'); click(view.contentEl, 'Next marker'); click(view.contentEl, 'Previous marker');
    expect(s.historySize).toBe(history); expect(s.dirty).toBe(true);
    const pressed = panel.querySelector<HTMLButtonElement>('button[aria-pressed="true"]'); expect(pressed?.textContent).toBeTruthy(); expect(document.activeElement === pressed || panel.contains(document.activeElement)).toBe(true);
    input(panel, 'Marker position (bar:beat:tick)', '4:2:0'); submit(panel, 'Apply marker'); expect(s.historySize).toBe(history + 1); });
it('adds, annotates, warns about missing and removes recording references without touching files', async () => { const { s, panel, vault } = await structureView(); const bytes = new Uint8Array([1, 2, 3]).buffer; await vault.createBinary('Field/station.wav', bytes); await vault.createBinary('Field/notes.pdf', bytes);
    input(panel, 'New section name', 'Theme A'); submit(panel, 'Add section');
    await new Promise(r => setTimeout(r, 200));
    const options = [...panel.querySelectorAll<HTMLSelectElement>('select[aria-label="Recording file"] option')].map(o => o.value); expect(options).toContain('Field/station.wav'); expect(options).not.toContain('Field/notes.pdf');
    choose(panel, 'Recording file', 'Field/station.wav'); input(panel, 'Reference description', 'Platform ambience'); choose(panel, 'Associated section', s.draft.data.sections[0]?.id ?? ''); submit(panel, 'Add recording reference');
    expect(s.draft.data.audioRefs[0]).toMatchObject({ label: 'station', path: 'Field/station.wav', description: 'Platform ambience', sectionId: s.draft.data.sections[0]?.id });
    expect(panel.textContent).toContain('Section: Theme A'); expect(panel.querySelector('[data-recording-state="available"]')).toBeTruthy();
    vault.binaries.delete('Field/station.wav'); vault.emit({ type: 'delete', path: 'Field/station.wav' }); await new Promise(r => setTimeout(r, 200));
    expect(panel.querySelector('[data-recording-state="missing"]')?.textContent).toContain('reference is preserved'); expect(s.draft.data.audioRefs).toHaveLength(1);
    await vault.createBinary('Field/station.wav', bytes);
    click(panel, 'station'); click(panel, 'Remove reference'); expect(panel.textContent).toContain('is not deleted or changed'); click(panel, 'Remove reference only');
    expect(s.draft.data.audioRefs).toEqual([]); expect(new Uint8Array(vault.binaries.get('Field/station.wav') ?? new ArrayBuffer(0))).toEqual(new Uint8Array(bytes)); expect(vault.reads.filter(p => !p.endsWith('.md'))).toEqual([]); });
it('releases the structure panel file subscription when the view closes', async () => { const { view, vault } = await structureView(); const before = vault.listeners.size; await view.onClose(); expect(vault.listeners.size).toBeLessThan(before); });
it('steps markers relative to the playhead, reaching each duplicate-position marker without wrap-around', async () => { const { s, panel, view } = await structureView();
    for (const [name, at] of [['A', '2:1:0'], ['B', '3:1:0'], ['C', '3:1:0'], ['D', '5:1:0']] as const) { input(panel, 'New marker name', name); input(panel, 'New marker position (bar:beat:tick)', at); submit(panel, 'Add marker'); }
    const perf = (view as unknown as { performancePanel: { locate(t: number): void; currentTick: number } }).performancePanel, pressed = () => panel.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.textContent;
    perf.locate(0); click(view.contentEl, 'Next marker'); expect(pressed()).toBe('A'); click(view.contentEl, 'Next marker'); expect(pressed()).toBe('B'); click(view.contentEl, 'Next marker'); expect(pressed()).toBe('C'); expect(perf.currentTick).toBe(7680);
    perf.locate(16000); click(view.contentEl, 'Previous marker'); expect(pressed()).toBe('D');
    click(view.contentEl, 'Next marker'); expect(pressed()).toBe('D'); expect(panel.querySelector('.mnemobard-structure-status')?.textContent).toContain('last marker'); expect(s.draft.data.markers).toHaveLength(4); });
it('pages long structure lists at 50 rows and follows keyboard selection across pages', async () => { const { s, panel, view } = await structureView();
    s.edit('Bulk markers', c => ({ ...c, data: { ...c.data, markers: Array.from({ length: 60 }, (_, i) => ({ id: `m${String(i).padStart(2, '0')}`, label: `Cue ${i + 1}`, tick: (i + 1) * 960 })) } }));
    click(view.contentEl, 'Undo'); click(view.contentEl, 'Redo');
    const rows = () => [...panel.querySelectorAll('.mnemobard-structure-group')[1]?.querySelectorAll('button[data-structure-id]') ?? []].map(b => b.textContent);
    expect(rows()).toHaveLength(50); expect(panel.textContent).toContain('Showing 1–50 of 60 markers');
    click(panel, 'More markers'); expect(rows()).toHaveLength(10); expect(rows()[0]).toBe('Cue 51');
    click(panel, 'Previous markers page'); expect(rows()[0]).toBe('Cue 1');
    const perf = (view as unknown as { performancePanel: { locate(t: number): void } }).performancePanel; perf.locate(54 * 960); click(view.contentEl, 'Next marker');
    expect(panel.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Cue 55'); expect(rows()[0]).toBe('Cue 51'); });
