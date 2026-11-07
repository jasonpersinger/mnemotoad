// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import type { FoundationServices } from '../src/application/services';
import { NavigationCoordinator } from '../src/application/navigation';
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
import { addSection as addSection4d, updateSection as updateSection4d, addMarker as addMarker4d } from '../src/modules/canvas/structure';
import type { ArrangementPreparation } from '../src/arrangement/preparation';
import { MemoryVault } from './support/memory-vault';
import { updateEntityDocument } from '../src/storage/document';
import { contentRevision } from '../src/storage/content-revision';
import type { Composition } from '../src/domain/entities';
import { installDomHelpers, Keymap } from './support/obsidian';
const cleanup: (() => void)[] = [];
beforeEach(() => { installDomHelpers(); Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null }); });
afterEach(() => { for (const fn of cleanup.splice(0))
    fn(); document.body.replaceChildren(); });
async function fixture() { const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), settings = new SettingsService({ load: async () => null, save: async () => { } }); await settings.load(); const motifs = new MotifLibrary(index, repository, vault); const services: FoundationServices = { navigation: new NavigationCoordinator(), settings, index, repository, modules: new ModuleController(settings.current.modules, { open: async () => { }, close: () => { } }), references: new ReferenceResolver(index, p => vault.exists(p)), patchbook: new PatchbookLibrary(index, repository), assets: new PatchbookAssets(vault), preview: new AudioPreview(), recovery: new PatchbookRecovery(vault, index, repository), motifs, musical: new MusicalTransport(), canvas: new CanvasLibrary(index, repository, vault, id => motifs.isDirty(id)) }; const view = new CanvasView({} as WorkspaceLeaf, () => services); document.body.append(view.contentEl); cleanup.push(() => { view.release(); services.canvas.dispose(); motifs.dispose(); services.musical.dispose(); services.patchbook.dispose(); repository.dispose(); index.dispose(); settings.dispose(); }); await (view as unknown as {
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
    throw Error('No session'); /* 4D: selected-item editors render in the shared inspector, so query the editor region (lists + inspector). */ const panel = f.view.contentEl.querySelector<HTMLElement>('.mnemobard-canvas-editor'); if (!panel?.querySelector('.mnemobard-canvas-structure'))
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
    /* 4E: the add form is built when its disclosure opens (as a user opens it). */ const add = [...panel.querySelectorAll('details')].find(d => d.querySelector(':scope > summary')?.textContent === 'Add recording reference'); if (!add) throw Error('add disclosure'); expect(add.querySelector('select')).toBeNull(); add.open = true; add.dispatchEvent(new Event('toggle'));
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
it('4D: organizational edits keep prepared playback; musical edits stop and invalidate', async () => {
    const { view, services, motif } = await start(); (view as unknown as { picker?: { close: () => void } }).picker?.close(); await services.index.settled();
    const session = services.canvas.drafts()[0]; if (!session) throw Error('session'); const lane = session.draft.data.lanes[0]; if (!lane) throw Error('lane');
    services.canvas.place(session, lane.id, motif.entity.id, 0, 1); session.edit('section', c => addSection4d(c, { label: 'Intro', startTick: 0, endTick: 3840 }, '00000000-0000-4000-8000-00000000c001'));
    const panel = (view as unknown as { performancePanel: { preparation: ArrangementPreparation; stop: () => void } }).performancePanel, prep = panel.preparation;
    const capture = await services.canvas.capture.capture(session.draft), state = prep as unknown as { state: string; prepared: unknown };
    state.prepared = { capture, arrangement: {}, bytes: new Uint8Array([1]), metrics: { compileMs: 0, serializeMs: 0 } }; state.state = 'ready';
    const stop = vi.spyOn(panel, 'stop'), history = session.historySize;
    session.edit('Rename section', c => updateSection4d(c, '00000000-0000-4000-8000-00000000c001', { label: 'Verse' })); await settle();
    session.edit('Add marker', c => addMarker4d(c, { label: 'Cue', tick: 960 })); await settle();
    expect(stop).not.toHaveBeenCalled(); expect(prep.state).toBe('ready'); expect(session.historySize).toBe(history + 2);
    const clip = session.draft.data.lanes[0]?.clips[0]; if (!clip) throw Error('clip');
    services.canvas.move(session, clip.id, lane.id, 960, 1); await settle();
    expect(stop).toHaveBeenCalled(); expect(prep.state).toBe('invalidated'); expect(prep.prepared).toBeUndefined();
});
const contextKind = (view: CanvasView) => { const ctx = view.contentEl.querySelector('.mnemobard-canvas-context'); if (!ctx) throw Error('context'); const shown = [['none', '.mnemobard-context-empty'], ['clip', '.mnemobard-canvas-inspector'], ['lane', '.mnemobard-context-lane'], ['structure', '.mnemobard-context-structure']].filter(([, sel]) => !(ctx.querySelector<HTMLElement>(sel ?? '')?.hidden)).map(([k]) => k); return shown; };
const key = (target: HTMLElement, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
it('4D: one selection-driven inspector context; selection never edits or adds history; tools are moved, not duplicated', async () => {
    const { view, services, motif } = await start(); (view as unknown as { picker?: { close: () => void } }).picker?.close(); await services.index.settled();
    const s = services.canvas.drafts()[0]; if (!s) throw Error('session'); const lane = s.draft.data.lanes[0]; if (!lane) throw Error('lane');
    services.canvas.place(s, lane.id, motif.entity.id, 0, 1); s.edit('section', c => addSection4d(c, { label: 'Intro', startTick: 3840, endTick: 7680 }, '00000000-0000-4000-8000-00000000d001')); await settle();
    const root = view.contentEl, history = s.historySize, draft = JSON.stringify(s.draft), clip = s.draft.data.lanes[0]?.clips[0]; if (!clip) throw Error('clip');
    click(root, 'Next clip'); expect(contextKind(view)).toEqual(['clip']); expect(root.querySelector('.mnemobard-context-header')?.textContent).toBe('Inspector · Clip');
    choose(root, 'Selected lane', lane.id); expect(contextKind(view)).toEqual(['lane']);
    const laneCtx = root.querySelector('.mnemobard-context-lane'); expect(laneCtx?.querySelector('[aria-label="Routing lane"]')).toBeTruthy(); expect(laneCtx?.querySelector('[aria-label="Lane name"]')).toBeTruthy(); expect(laneCtx?.textContent).toContain('Auto (derived at compile)');
    expect(root.querySelectorAll('[aria-label="Routing lane"]')).toHaveLength(1); expect(root.querySelectorAll('[aria-label="Lane name"]')).toHaveLength(1);
    click(root, 'Next section'); expect(contextKind(view)).toEqual(['structure']); expect(s.selectedClip).toBeUndefined();
    expect(root.querySelector('.mnemobard-canvas-tools [aria-label="Routing lane"]')).toBeTruthy(); expect(root.querySelector('.mnemobard-context-structure [aria-label="Section name"]')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Section · Intro');
    click(root, 'Next clip'); expect(contextKind(view)).toEqual(['clip']); expect(root.querySelector('.mnemobard-context-structure')?.children.length).toBe(0);
    key(root.querySelector('canvas') as HTMLElement, 'Escape'); expect(contextKind(view)).toEqual(['none']); expect(s.selectedClip).toBeUndefined();
    expect(s.historySize).toBe(history); expect(JSON.stringify(s.draft)).toBe(draft);
});
it('4D: documented keys navigate structure without history, ignore typing, and respect pending forms', async () => {
    const { s, panel, view } = await structureView(); for (const [name, at] of [['Choir', '3:1:0'], ['Build', '3:1:0']] as const) { input(panel, 'New marker name', name); input(panel, 'New marker position (bar:beat:tick)', at); submit(panel, 'Add marker'); }
    s.edit('section', c => addSection4d(c, { label: 'Verse', startTick: 15360, endTick: 19200 })); await settle(); const history = s.historySize;
    const canvas = view.contentEl.querySelector('canvas') as HTMLElement; key(canvas, '.'); expect(document.activeElement?.textContent).toBe('Marker · Build'); key(document.activeElement as HTMLElement, '.'); expect(document.activeElement?.textContent).toBe('Marker · Choir');
    key(document.activeElement as HTMLElement, '.'); expect(view.contentEl.querySelector('.mnemobard-context-structure .mnemobard-structure-status')?.textContent).toBe('Already at the last marker.');
    key(canvas, ']'); expect(document.activeElement?.textContent).toBe('Section · Verse'); expect(s.historySize).toBe(history);
    const field = input(view.contentEl, 'Section name', 'Typing ] here'); const typed = new KeyboardEvent('keydown', { key: ',', bubbles: true, cancelable: true }); field.dispatchEvent(typed); expect(typed.defaultPrevented).toBe(false); expect(view.contentEl.querySelector('.mnemobard-context-header')?.textContent).toBe('Inspector · Section');
    key(canvas, ','); expect(view.contentEl.querySelector('.mnemobard-context-header')?.textContent).toBe('Inspector · Section'); key(canvas, 'Escape'); expect(contextKind(view)).toEqual(['structure']);
    click(view.contentEl, 'Discard'); key(canvas, 'Escape'); expect(contextKind(view)).toEqual(['none']); expect(document.activeElement).toBe(view.contentEl.querySelector('canvas:not(.mnemobard-structure-ruler)')); expect(s.historySize).toBe(history);
});
it('4D: offers an explicit rename adoption for provable link-only conflicts and explains hidden unlinkable recordings', async () => {
    const { s, panel, vault, services } = await structureView(); const bytes = new Uint8Array([7, 7]).buffer;
    await vault.createBinary('Field/take.wav', bytes); await vault.createBinary('Field/odd#1.wav', bytes); await services.index.settled();
    services.canvas.addRecording(s, { label: 'Take', path: 'Field/take.wav' }); await s.save(); await settle();
    /* 4E: lazily built add form */ const add = [...panel.querySelectorAll('details')].find(d => d.querySelector(':scope > summary')?.textContent === 'Add recording reference'); if (add) { add.open = true; add.dispatchEvent(new Event('toggle')); }
    expect(panel.querySelector<HTMLElement>('[data-unlinkable]')?.textContent).toContain('1 audio file(s) hidden');
    s.edit('unsaved', c => addSection4d(c, { label: 'Unsaved', startTick: 0, endTick: 960 })); const path = s.base?.path ?? '';
    const moved = vault.binaries.get('Field/take.wav'); vault.binaries.delete('Field/take.wav'); if (moved) vault.binaries.set('Field/take-2.wav', moved);
    expect(panel.querySelector('[data-rename-offer]')).toBeNull();
    vault.modify(path, (vault.files.get(path) ?? '').replace('[[Field/take.wav]]', '[[Field/take-2.wav]]')); await services.index.settled();
    await vi.waitFor(() => expect(panel.querySelector('[data-rename-offer]')?.textContent).toContain('“Field/take.wav” → “Field/take-2.wav”'), { timeout: 2000 });
    click(panel, 'Adopt rename and keep my edits'); await vi.waitFor(() => expect(s.draft.data.audioRefs[0]?.path).toBe('Field/take-2.wav'));
    await s.save(); expect(vault.files.get(path)).toContain('Unsaved'); expect(vault.binaries.get('Field/take-2.wav')).toBe(moved);
});
it('4D: diagnostics name the musical object and position, state blocking impact, and navigate to the clip', async () => {
    const { view, services, motif, vault } = await start(); (view as unknown as { picker?: { close: () => void } }).picker?.close(); await services.index.settled();
    const s = services.canvas.drafts()[0]; if (!s) throw Error('session'); const lane = s.draft.data.lanes[0]; if (!lane) throw Error('lane');
    services.canvas.place(s, lane.id, motif.entity.id, 3840, 1); const clip = s.draft.data.lanes[0]?.clips[0]; if (!clip) throw Error('clip');
    vault.files.delete(motif.path); await services.index.refresh(motif.path); s.edit('touch', c => ({ ...c, title: 'Touched' })); await settle();
    const row = view.contentEl.querySelector<HTMLElement>('.mnemobard-canvas-diagnostics [data-diagnostic="missing"]'); if (!row) throw Error('row');
    expect(row.textContent).toContain('Blocks compile/export'); expect(row.textContent).toContain('2:1:0'); expect(row.textContent).toContain('Restore the motif note');
    expect(row.textContent).not.toContain(clip.id.slice(0, 8)); expect(row.title).toContain(clip.id);
    const history = s.historySize; click(row, 'Select clip'); expect(s.selectedClip).toBe(clip.id); expect(contextKind(view)).toEqual(['clip']); expect(s.historySize).toBe(history);
});
it('4D: Escape inside CANVAS never propagates to the host, even with nothing selected', async () => {
    const { view } = await structureView(); const canvas = view.contentEl.querySelector<HTMLElement>('canvas:not(.mnemobard-structure-ruler)'); if (!canvas) throw Error('canvas');
    const host = vi.fn(); document.addEventListener('keydown', host); try { key(canvas, 'Escape'); expect(contextKind(view)).toEqual(['none']); expect(host).not.toHaveBeenCalled(); } finally { document.removeEventListener('keydown', host); }
});
it('4E: a refused modal (stale active document) leaves no pending state, keeps the draft, and works on retry; disposal closes an open dialog', async () => {
    const { view, services } = await fixture(); click(view.contentEl, 'New composition'); await settle(); click(view.contentEl, 'Add lane');
    const session = services.canvas.drafts()[0]; if (!session) throw Error('session'); const draft = JSON.stringify(session.draft), history = session.historySize;
    const host = globalThis as { activeDocument?: Document }, previous = host.activeDocument; host.activeDocument = document.implementation.createHTMLDocument('closed popout');
    try {
        click(view.contentEl, 'Place motif');
        const picker = (view as unknown as { picker?: { contentEl: HTMLElement } }).picker;
        expect(view.contentEl.querySelector('.mnemobard-feedback')?.textContent).toContain('closed window'); expect(picker?.contentEl.childElementCount).toBe(0);
        expect(view.contentEl.querySelector('form[data-pending="true"]')).toBeNull(); expect(JSON.stringify(session.draft)).toBe(draft); expect(session.historySize).toBe(history);
    } finally { host.activeDocument = previous; }
    click(view.contentEl, 'Place motif'); const opened = (view as unknown as { picker?: { contentEl: HTMLElement; onClose: () => void } }).picker; expect(opened?.contentEl.childElementCount).toBeGreaterThan(0);
    const closed = vi.spyOn(opened as { onClose: () => void }, 'onClose'); await view.onClose(); expect(closed).toHaveBeenCalled(); expect((view as unknown as { picker?: unknown }).picker).toBeUndefined();
});

/** 4E: a saved composition with one placed clip and a section, plus a ready (fake-compiled) preparation bound to the saved base. */
async function freshView() {
    const { view, services, motif, vault } = await start(); (view as unknown as { picker?: { close: () => void } }).picker?.close(); await services.index.settled();
    const session = services.canvas.drafts()[0]; if (!session) throw Error('session'); const lane = session.draft.data.lanes[0]; if (!lane) throw Error('lane');
    services.canvas.place(session, lane.id, motif.entity.id, 0, 1); session.edit('section', c => addSection4d(c, { label: 'Intro', startTick: 0, endTick: 3840 }, '00000000-0000-4000-8000-00000000d001'));
    click(view.contentEl, 'Save composition'); await vi.waitFor(() => expect(session.dirty).toBe(false)); await services.index.settled(); await settle();
    const panel = (view as unknown as { performancePanel: { preparation: ArrangementPreparation; stop: () => void } }).performancePanel, prep = panel.preparation;
    const capture = await services.canvas.capture.capture(session.draft), base = session.base?.source ?? '', state = prep as unknown as { state: string; prepared: unknown };
    state.prepared = { capture, arrangement: { lanes: [], events: [], expandedNotes: 0, lengthTicks: 3840, inputRevision: 'fake', diagnostics: [] }, bytes: new Uint8Array([1, 2, 3]), baseSource: base, baseRevision: await contentRevision(base), metrics: { compileMs: 0, serializeMs: 0 } }; state.state = 'ready';
    const path = session.base?.path ?? '', external = (change: (c: Composition) => Composition) => { const current = vault.files.get(path) ?? '', disk = services.index.resolve(session.draft.id); if (disk.status !== 'ready') throw Error('disk'); vault.modify(path, updateEntityDocument(current, current, change(disk.entity as Composition))); };
    return { view, services, vault, session, panel, prep, lane, path, external, stop: vi.spyOn(panel, 'stop') };
}
const freshness = (view: CanvasView) => view.contentEl.querySelector<HTMLElement>('.mnemobard-freshness');
const banner = (view: CanvasView) => view.contentEl.querySelector<HTMLElement>('.mnemobard-freshness-banner');
it('4E: a clean metadata-only external edit refreshes the view, keeps compiled playback and the selection, and adds no undo step', async () => {
    const f = await freshView(); expect(freshness(f.view)?.textContent).toBe('Matches the saved note');
    const clip = f.session.draft.data.lanes[0]?.clips[0]; if (!clip) throw Error('clip'); click(f.view.contentEl, `${clip ? f.view.contentEl.querySelector<HTMLButtonElement>(`[data-clip-id="${clip.id}"]`)?.textContent ?? '' : ''}`);
    const history = f.session.historySize;
    f.external(c => updateSection4d(c, '00000000-0000-4000-8000-00000000d001', { label: 'Verse from elsewhere' })); await f.services.index.settled();
    await vi.waitFor(() => expect(f.session.freshness.state).toBe('refreshed')); await settle(); expect([f.prep.state, f.prep.diagnostics]).toEqual(['ready', []]); await vi.waitFor(() => expect(f.prep.prepared && (f.prep.prepared as { baseSource?: string }).baseSource).toBe(f.session.base?.source));
    expect(f.prep.state).toBe('ready'); expect(f.stop).not.toHaveBeenCalled(); expect(f.session.historySize).toBeLessThanOrEqual(history); expect(f.session.selectedClip).toBe(clip.id);
    expect(freshness(f.view)?.textContent).toBe('Refreshed from the note · compilation kept'); expect(banner(f.view)?.hidden).toBe(false); expect(banner(f.view)?.textContent).toContain('sections');
    expect(f.view.contentEl.querySelector('.mnemobard-canvas-structure')?.textContent).toContain('Verse from elsewhere');
    f.session.edit('Mine', c => addMarker4d(c, { label: 'Cue', tick: 960 })); await settle(); expect(freshness(f.view)?.textContent).toBe('Unsaved edits · note unchanged on disk'); expect(banner(f.view)?.hidden).toBe(true);
});
it('4E: a clean musical external edit refreshes and stops/invalidates the compilation', async () => {
    const f = await freshView(); f.external(c => ({ ...c, data: { ...c.data, tempoMicrosecondsPerQuarter: 400000 } })); await f.services.index.settled();
    await vi.waitFor(() => expect(f.prep.state).toBe('invalidated')); expect(f.stop).toHaveBeenCalled(); expect(f.prep.prepared).toBeUndefined();
    expect(freshness(f.view)?.textContent).toBe('Refreshed from the note · compile again'); expect(f.session.draft.data.tempoMicrosecondsPerQuarter).toBe(400000);
});
it('4E: a dirty session shows a conflict with safe choices; reload requires confirmation and stores a recovery copy first', async () => {
    const f = await freshView(); f.session.edit('Mine', c => updateSection4d(c, '00000000-0000-4000-8000-00000000d001', { label: 'My verse' })); const history = f.session.historySize;
    f.external(c => ({ ...c, notes: 'Edited in another app' })); await f.services.index.settled(); await vi.waitFor(() => expect(f.session.freshness.state).toBe('conflict')); await settle();
    expect(freshness(f.view)?.textContent).toBe('Note changed elsewhere · your edits are kept · Save blocked'); expect(banner(f.view)?.getAttribute('role')).toBe('alert');
    expect(banner(f.view)?.textContent).toContain('description, tags and notes'); expect(f.session.draft.data.sections[0]?.label).toBe('My verse'); expect(f.session.historySize).toBe(history);
    expect(f.prep.state).toBe('invalidated');
    const root = banner(f.view); if (!root) throw Error('banner');
    click(root, 'Keep working draft'); await settle(); expect(banner(f.view)?.hidden).toBe(true); expect(freshness(f.view)?.textContent).toContain('Save blocked');
    click(f.view.contentEl, 'Save composition'); await vi.waitFor(() => expect(f.view.contentEl.querySelector('.mnemobard-feedback')?.textContent).toContain('changed elsewhere')); expect(f.vault.files.get(f.path)).toContain('Edited in another app');
    f.session.setFreshness({ ...(f.session.freshness as { state: 'conflict'; areas: string[]; musical: boolean; rename: boolean }), kept: false }); await settle();
    const live = banner(f.view); if (!live) throw Error('banner'); click(live, 'Reload note version…'); expect(live.textContent).toContain('Discard your unsaved arrangement edits'); click(live, 'Keep my edits'); expect(f.session.draft.data.sections[0]?.label).toBe('My verse');
    click(live, 'Reload note version…'); click(live, 'Store recovery copy, discard edits and reload');
    await vi.waitFor(() => expect(f.view.contentEl.querySelector('.mnemobard-feedback')?.textContent).toContain('Reloaded the note version'));
    const fresh = f.services.canvas.drafts()[0] ?? (f.view as unknown as { session?: { draft: Composition; dirty: boolean } }).session; expect(fresh?.draft.notes).toBe('Edited in another app'); expect(fresh?.draft.data.sections[0]?.label).toBe('Intro');
    expect([...f.vault.files.keys()].some(p => p.startsWith('MNEMOBARD/Recovery/') && (f.vault.files.get(p) ?? '').includes('My verse'))).toBe(true);
});
it('4E perf: the add-reference form (vault scan, section/marker options) is built only while its disclosure is open, and stays open across selection renders', async () => {
    const { s, panel, view } = await structureView(); s.edit('Sections', c => addSection4d(addSection4d(c, { label: 'A', startTick: 0, endTick: 960 }, '00000000-0000-4000-8000-0000000e0001'), { label: 'B', startTick: 960, endTick: 1920 }, '00000000-0000-4000-8000-0000000e0002')); await settle();
    const disclosure = () => [...panel.querySelectorAll('details')].find(d => d.querySelector(':scope > summary')?.textContent === 'Add recording reference');
    const library = (view as unknown as { available: FoundationServices }).available.canvas, scans = vi.spyOn(library, 'recordingCandidates');
    click(view.contentEl, 'Next section'); click(view.contentEl, 'Next section'); expect(disclosure()?.querySelector('select')).toBeNull(); expect(scans).not.toHaveBeenCalled();
    const add = disclosure(); if (!add) throw Error('add'); add.open = true; add.dispatchEvent(new Event('toggle')); expect(scans).toHaveBeenCalledTimes(1); expect(add.querySelectorAll('select[aria-label="Associated section"] option').length).toBeGreaterThanOrEqual(2);
    click(view.contentEl, 'Previous section'); expect(disclosure()?.open).toBe(true); expect(disclosure()?.querySelector('select[aria-label="Recording file"]')).not.toBeNull();
});
it('4F: compile status says what the compilation matches (saved / unsaved draft / stale) and never looks current when stale', async () => {
    const f = await freshView(), status = () => f.view.contentEl.querySelector<HTMLElement>('.mnemobard-arrangement-state');
    (f.view as unknown as { refreshScene: () => void }).refreshScene(); expect(status()?.textContent).toBe('Compiled · matches the saved composition'); expect(status()?.dataset.state).toBe('ready');
    f.session.edit('Mine', c => addMarker4d(c, { label: 'Cue', tick: 960 })); await settle(); expect(status()?.textContent).toBe('Compiled · matches this unsaved draft');
    const clip = f.session.draft.data.lanes[0]?.clips[0]; if (!clip) throw Error('clip'); f.services.canvas.move(f.session, clip.id, f.lane.id, 960, 1); await settle();
    expect(status()?.textContent).toBe('Stale · compile again'); expect(status()?.dataset.state).toBe('invalidated'); expect(status()?.title).toContain('MIDI export use exactly this compilation');
});
it('4F: the clip inspector shows source and sound by name; a missing source stays visible, explained and recoverable', async () => {
    const { view, services, motif, vault } = await start(); (view as unknown as { picker?: { close: () => void } }).picker?.close(); await services.index.settled();
    const session = services.canvas.drafts()[0]; if (!session) throw Error('session'); const lane = session.draft.data.lanes[0]; if (!lane) throw Error('lane');
    services.canvas.place(session, lane.id, motif.entity.id, 0, 1); const clip = session.draft.data.lanes[0]?.clips[0]; if (!clip) throw Error('clip');
    click(view.contentEl, 'Next clip'); const inspector = () => view.contentEl.querySelector<HTMLElement>('.mnemobard-canvas-inspector');
    expect(inspector()?.querySelector('[aria-label="Source and sound"]')?.textContent).toContain('Saved source'); expect(inspector()?.textContent).toContain('no PATCHBOOK sound association');
    vault.files.delete(motif.path); vault.emit({ type: 'delete', path: motif.path }); await services.index.settled(); await settle();
    click(view.contentEl, 'Next clip');
    const row = inspector()?.querySelector<HTMLElement>('.mnemobard-ref-row'); expect(row?.dataset.refStatus).toBe('missing'); expect(row?.textContent).toContain('restore the note');
    expect(row?.querySelector('code')?.textContent).toBe(motif.entity.id); expect(session.draft.data.lanes[0]?.clips[0]?.motifId).toBe(motif.entity.id);
});
it('4F §8.2: an external change to PATCHBOOK patch metadata (sound context only) keeps the compilation and refreshes nothing in the composition', async () => {
    const f = await freshView(), patch = await f.services.repository.create(createEntity('patch', 'Context pad')); await f.services.index.settled(); await settle();
    const before = f.session.base?.source; f.vault.modify(patch.path, (f.vault.files.get(patch.path) ?? '').replace('Context pad', 'Context pad (edited elsewhere)')); await f.services.index.settled(); await settle();
    expect(f.prep.state).toBe('ready'); expect(f.stop).not.toHaveBeenCalled(); expect(f.session.base?.source).toBe(before); expect(f.session.freshness.state).toBe('current');
});
it('4G: changed sources point to one batch review (banner, diagnostics, inspector) and the status names what blocks compiling', async () => {
    const { view, services } = await fixture(); click(view.contentEl, 'New composition'); await settle(); click(view.contentEl, 'Add lane');
    const m = createEntity('motif', 'Alpha'); m.data = { ...m.data, ppq: 960, lengthTicks: 3840, notes: [{ id: 'n', pitch: 60, startTick: 0, durationTicks: 960, velocity: 80 }] };
    const saved = await services.repository.create(m), internal = view as unknown as { session: import('../src/modules/canvas/session').CanvasSession; reviewModal?: { contentEl: HTMLElement } };
    const session = internal.session, lane = session.draft.data.lanes[0]?.id ?? '';
    services.canvas.place(session, lane, saved.entity.id, 0, 1); services.canvas.place(session, lane, saved.entity.id, 7680, 2); await settle();
    const state = () => view.contentEl.querySelector('.mnemobard-arrangement-state')?.textContent, banner = () => view.contentEl.querySelector<HTMLElement>('.mnemobard-review-banner');
    expect(state()).toBe('Ready to compile'); expect(banner()?.hidden).toBe(true);
    const draft = await services.motifs.open(saved.entity.id); draft.edit('Longer', x => ({ ...x, data: { ...x.data, lengthTicks: 7680 } })); await draft.save(); services.motifs.discard(draft); await services.index.settled(); await settle();
    expect(banner()?.hidden).toBe(false); expect(banner()?.textContent).toContain('1 saved source has changed');
    expect(state()).toBe('Source review required · 1 motif');
    expect([...view.contentEl.querySelectorAll('.mnemobard-diagnostic-row[data-diagnostic="changed"] button')].some(b => b.textContent === 'Review changed sources')).toBe(true);
    click(view.contentEl, 'Review changed sources');
    const modal = internal.reviewModal?.contentEl; if (!modal) throw Error('review modal');
    expect(modal.textContent).toContain('Alpha · 2 placements · ready to acknowledge');
    expect(modal.querySelector('.mnemobard-review-compare')?.textContent).toContain('1 bar'); // previous length per repetition, musical
    expect(modal.querySelector('.mnemobard-review-compare')?.textContent).toContain('2 bars'); // current
    [...modal.querySelectorAll('button')].find(b => b.textContent?.startsWith('Acknowledge this source'))?.click();
    [...modal.querySelectorAll('button')].find(b => b.textContent === 'Confirm acknowledgement')?.click();
    await vi.waitFor(() => expect(view.contentEl.querySelector('.mnemobard-feedback')?.textContent).toContain('Acknowledged revision'));
    expect(banner()?.hidden).toBe(true); expect(state()).toBe('Ready to compile');
    click(view.contentEl, 'Undo'); await settle(); expect(banner()?.hidden).toBe(false); expect(state()).toBe('Source review required · 1 motif');
    click(view.contentEl, 'Redo'); await settle(); expect(banner()?.hidden).toBe(true);
    expect(session.draft.data.lanes[0]?.clips.map(c => [c.startTick, c.repeatCount])).toEqual([[0, 1], [7680, 2]]); // positions/repeats untouched
});
