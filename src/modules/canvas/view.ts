import { Notice, Scope, type WorkspaceLeaf } from 'obsidian';
import { ModuleView } from '../../ui/module-view';
import { element, button } from '../../ui/dom';
import type { FoundationServices } from '../../application/services';
import type { Composition } from '../../domain/entities';
import { messageOf } from '../../domain/errors';
import { RecoveryInspector } from '../../ui/recovery-inspector';
import { diagnosticText, type ArrangementPlan } from '../../arrangement/preflight';
import { gridTicks, type Grid } from '../../music/grid';
import { MotifView } from '../motif/view';
import { CanvasSession } from './session';
import { addLane, renameLane, reorderLane, deleteLane, deleteClip, findClip } from './commands';
import { ArrangementTimeline } from './timeline';
import { ArrangementMotifPicker } from './motif-picker';
import { clipInspector } from './inspector';
import { CanvasPerformancePanel } from './performance-panel';
import { CanvasStructurePanel } from './structure-panel';
import { addMarker, addSection, orderedSections, updateMarker, updateSection } from './structure';
export class CanvasView extends ModuleView {
    private active = false;
    private epoch = 0;
    private lifetime = new AbortController();
    private cleanup: (() => void)[] = [];
    private session?: CanvasSession;
    private sessionUnsubscribe?: () => void;
    private timeline?: ArrangementTimeline;
    private performancePanel?:CanvasPerformancePanel;
    private structurePanel?: CanvasStructurePanel;
    private picker?: ArrangementMotifPicker;
    private recoveryPanel?: RecoveryInspector<Composition, CanvasSession>;
    private recoveryRoot?: HTMLElement;
    private editor?: HTMLElement;
    private browser?: HTMLElement;
    private feedback?: HTMLElement;
    private saveStatus?: HTMLElement;
    private pending?: HTMLElement;
    private inspector?: HTMLElement;
    private laneRoot?: HTMLElement;
    private diagnostics?: HTMLElement;
    private clipRegister?: HTMLElement;
    private undoButton?: HTMLButtonElement;
    private redoButton?: HTMLButtonElement;
    private selectedId?: string;
    private search = '';
    private browserPage = 0;
    private clipPage = 0;
    private plan?: ArrangementPlan;
    private planKey = '';
    private draftEpoch = 0;
    private editorScope?: Scope;
    constructor(leaf: WorkspaceLeaf, private readonly foundation: () => FoundationServices | undefined) { super(leaf, 'canvas', foundation); this.scope = new Scope(this.app.scope); }
    private get available(): FoundationServices | undefined { const s = this.foundation(); return s?.modules.enabled('canvas') ? s : undefined; }
    override async onOpen(): Promise<void> {
        this.release();
        this.active = true;
        this.lifetime = new AbortController();
        const root = this.contentEl;
        root.replaceChildren();
        root.classList.add('mnemobard-module', 'mnemobard-canvas');
        const s = this.available;
        if (!s) {
            element(root, 'p', 'CANVAS is disabled. Composition records remain in the vault.');
            return;
        }
        const top = element(root, 'header', undefined, 'mnemobard-canvas-heading');
        element(top, 'p', 'MNEMOBARD / ARRANGEMENT REGISTER', 'mnemobard-eyebrow');
        element(top, 'h2', 'CANVAS');
        const actions = element(top, 'div', undefined, 'mnemobard-actions');
        const create = button(actions, 'New composition', () => { void this.create().catch(e => this.fail(e)); }, 'mod-cta');
        create.disabled = true;
        button(actions, 'Browse compositions', () => { const details = this.browser?.closest('details'); if (details)
            details.open = !details.open; });
        button(actions, 'Composition recovery', () => this.recovery());
        this.feedback = element(root, 'p', '', 'mnemobard-feedback');
        this.feedback.setAttribute('role', 'status');
        this.feedback.setAttribute('aria-live', 'polite');
        this.pending = element(root, 'div', undefined, 'mnemobard-drafts');
        this.recoveryRoot = element(root, 'section');
        const details = element(root, 'details', undefined, 'mnemobard-canvas-library');
        details.open = !this.selectedId;
        element(details, 'summary', 'Composition library');
        const label = element(details, 'label');
        element(label, 'span', 'Find composition');
        const search = element(label, 'input');
        search.type = 'search';
        search.value = this.search;
        search.setAttribute('aria-label', 'Find composition');
        search.addEventListener('input', () => { this.search = search.value; this.browserPage = 0; this.renderBrowser(); this.remember(); });
        this.browser = element(details, 'div');
        this.editor = element(root, 'section', undefined, 'mnemobard-canvas-editor');
        this.editor.setAttribute('aria-label', 'Composition editor');
        this.cleanup.push(s.index.subscribe(() => { if (this.active) {
            this.renderBrowser();
            this.refreshScene();
        } }), s.motifs.subscribeDrafts(() => { if (this.active) {
            this.draftEpoch++;
            this.refreshScene();
        } }));
        if(typeof this.app.workspace.on==='function'){const event=this.app.workspace.on('active-leaf-change',leaf=>{if(leaf!==this.leaf)this.performancePanel?.stop();});this.cleanup.push(()=>this.app.workspace.offref(event));}
        this.bindKeys();
        this.renderBrowser();
        this.renderEditor();
        try {
            await s.index.start();
            if (!this.active)
                return;
            create.disabled = s.settings.readOnly;
            this.renderBrowser();
            if (this.selectedId)
                await this.openComposition(this.selectedId);
        }
        catch (e) {
            this.fail(e);
        }
    }
    private say(text: string): void { if (this.active && this.feedback)
        this.feedback.textContent = text; }
    private fail(error: unknown): void { this.say(messageOf(error)); }
    private remember(): void { if (this.active)
        this.app.workspace.requestSaveLayout(); }
    private hasPending(except?: HTMLFormElement): boolean { return [...this.editor?.querySelectorAll<HTMLFormElement>('form[data-pending="true"]') ?? []].some(f => f !== except); }
    private act(action: () => void, form?: HTMLFormElement): boolean { if (this.hasPending(form)) {
        this.say('Apply or discard pending properties first. Arrangement unchanged.');
        return false;
    } try {
        action();
        this.refreshScene();
        this.renderSelection(true);
        this.say('');
        return true;
    }
    catch (e) {
        this.fail(e);
        return false;
    } }
    private async leave(): Promise<void> { if (this.hasPending())
        throw Error('Apply or discard pending properties before switching. Checkpoints contain applied draft values only.'); this.timeline?.cancelGesture(); if (this.session?.dirty && !this.session.disposed)
        await this.session.checkpoint(); }
    private async create(): Promise<void> { await this.leave(); if (!this.active || this.available?.settings.readOnly)
        return; const s = this.available?.canvas.create(); if (s)
        this.attach(s); }
    private async openComposition(id: string): Promise<void> { await this.leave(); const s = this.available; if (!s || !this.active)
        return; const epoch = ++this.epoch; try {
        if (s.settings.readOnly)
            throw Error('Repair read-only settings before editing.');
        const session = await s.canvas.open(id, this.lifetime.signal);
        if (this.active && epoch === this.epoch)
            this.attach(session);
    }
    catch (e) {
        if (this.active && epoch === this.epoch) {
            this.sessionUnsubscribe?.();
            if (this.session)
                s.canvas.release(this.session, this);
            this.session = undefined;
            this.selectedId = id;
            this.renderEditor();
            this.fail(e);
        }
    } }
    private attach(session: CanvasSession): void { this.epoch++; this.sessionUnsubscribe?.(); if (this.session)
        this.foundation()?.canvas.release(this.session, this); this.session = session; this.available?.canvas.retain(session, this); this.selectedId = session.draft.id; session.selectedLane ??= session.draft.data.lanes[0]?.id; this.planKey = ''; this.sessionUnsubscribe = session.subscribe(() => { if (this.active) {
        this.refreshScene();
        this.renderDrafts();
    } }); const details = this.browser?.closest('details'); if (details)
        details.open = false; this.renderEditor(); this.renderDrafts(); this.say(''); this.remember(); }
    private renderBrowser(): void { const root = this.browser, s = this.available; if (!root || !s || !this.active)
        return; root.replaceChildren(); const items = s.canvas.items(this.search); element(root, 'p', `${items.length} compositions · live saved motifs, ordinary Markdown`, 'mnemobard-hint'); for (const item of items.slice(this.browserPage * 100, this.browserPage * 100 + 100)) {
        const row = element(root, 'div', undefined, 'mnemobard-canvas-entry');
        const open = button(row, `${item.title}${item.ambiguous ? ' · duplicate UUID' : ''}`, () => { if (item.id)
            void this.openComposition(item.id).catch(e => this.fail(e)); });
        open.disabled = item.ambiguous;
        button(row, 'Markdown', () => this.openMarkdown(item.path));
    } if (this.browserPage)
        button(root, 'Previous compositions', () => { this.browserPage--; this.renderBrowser(); }); if ((this.browserPage + 1) * 100 < items.length)
        button(root, 'More compositions', () => { this.browserPage++; this.renderBrowser(); }); for (const head of s.index.heads().filter(h => h.errorCode).slice(0, 10)) {
        element(root, 'p', `${head.path}: ${head.message}`);
        button(root, 'Inspect uneditable record', () => this.openMarkdown(head.path));
    } this.renderDrafts(); }
    private renderDrafts(): void { const root = this.pending, s = this.available; if (!root || !s)
        return; root.replaceChildren(); const drafts = s.canvas.drafts(); if (drafts.length)
        element(root, 'span', 'Pending arrangements: '); for (const draft of drafts)
        button(root, draft.draft.title || 'Untitled draft', () => { void this.leave().then(() => { if (this.active)
            this.attach(draft); }).catch(e => this.fail(e)); }); }
    private renderEditor(): void {
        this.performancePanel?.dispose();this.performancePanel=undefined;this.structurePanel?.dispose();this.structurePanel=undefined;
        this.timeline?.dispose();
        this.timeline = undefined;
        const root = this.editor, s = this.available;
        if (!root || !s)
            return;
        root.replaceChildren();
        this.saveStatus = undefined;
        this.inspector = undefined;
        this.laneRoot = undefined;
        this.clipRegister = undefined;
        this.diagnostics = undefined;
        const session = this.session;
        if (!session) {
            element(root, 'h3', 'A place for the piece.');
            element(root, 'p', this.selectedId ? 'Composition unavailable/read-only. Inspect its original Markdown or recovery.' : 'Create a composition, then place and review saved musical fragments. Compile for verified MIDI export and sine audition.', 'mnemobard-hint');
            if (this.selectedId) {
                const state = s.index.resolve(this.selectedId);
                if (state.status === 'ready')
                    button(root, 'Open original composition', () => this.openMarkdown(state.path));
                if (state.status === 'invalid')
                    button(root, 'Open original composition', () => this.openMarkdown(state.entry.path));
                if (state.status === 'duplicate')
                    for (const path of state.paths)
                        button(root, 'Inspect duplicate composition', () => this.openMarkdown(path));
            }
            return;
        }
        const title = element(root, 'label', undefined, 'mnemobard-canvas-title');
        element(title, 'span', 'Composition name');
        const input = element(title, 'input');
        input.value = session.draft.title;
        input.setAttribute('aria-label', 'Composition name');
        input.addEventListener('input', () => { try {
            session.edit('Rename composition', c => ({ ...c, title: input.value }), 'title');
        }
        catch (e) {
            this.fail(e);
        } });
        const bar = element(root, 'div', undefined, 'mnemobard-canvas-toolbar');
        button(bar, 'Save composition', () => { void this.save(); }, 'mod-cta');
        this.saveStatus = element(bar, 'span', session.status, 'mnemobard-save-status');
        this.saveStatus.setAttribute('role', 'status');
        button(bar, 'Add lane', () => this.act(() => { const count = session.draft.data.lanes.length; session.edit('Add lane', c => addLane(c, `Lane ${count + 1}`)); session.selectedLane = session.draft.data.lanes.at(-1)?.id; session.selectedClip = undefined; }));
        button(bar, 'Place motif', () => this.chooseMotif());
        this.undoButton = button(bar, 'Undo', () => this.act(() => session.undo()));
        this.redoButton = button(bar, 'Redo', () => this.act(() => session.redo()));
        const more = element(bar, 'details', undefined, 'mnemobard-canvas-more');
        element(more, 'summary', 'Record actions');
        if (session.base)
            button(more, 'Open composition Markdown', () => { const state = s.index.resolve(session.draft.id); if (state.status === 'ready')
                this.openMarkdown(state.path); });
        button(more, 'Reload saved composition', () => { if (session.dirty)
            this.say('Save or explicitly discard the working draft before reload.');
        else
            void this.openComposition(session.draft.id).catch(e => this.fail(e)); });
        button(more, 'Discard arrangement draft…', () => { const confirm = element(root, 'div', undefined, 'mnemobard-confirm'); element(confirm, 'p', 'Discard the working arrangement and its in-memory history? Saved files and checkpoints remain.'); button(confirm, 'Keep arrangement', () => confirm.remove()); button(confirm, 'Confirm discard arrangement', () => { this.sessionUnsubscribe?.(); s.canvas.discard(session); this.session = undefined; this.renderEditor(); this.renderDrafts(); if (session.base)
            void this.openComposition(session.draft.id).catch(e => this.fail(e)); }); });
        const performanceToolbar=element(root,'div');
        this.musicalSettings(root, session);
        const tools = element(root, 'div', undefined, 'mnemobard-canvas-navigation');
        const gridLabel = element(tools, 'label');
        element(gridLabel, 'span', 'Placement grid');
        const grid = element(gridLabel, 'select');
        grid.setAttribute('aria-label', 'Placement grid');
        for (const [value, text] of [['quarter', '1/4'], ['eighth', '1/8'], ['sixteenth', '1/16'], ['triplet', '1/8 triplet'], ['off', 'Snap off']]) {
            const option = element(grid, 'option', text);
            option.value = value ?? '';
        }
        grid.value = 'sixteenth';
        grid.addEventListener('change', () => { if (this.timeline)
            this.timeline.grid = grid.value as Grid; });
        button(tools, 'Time −', () => this.timeline?.zoom(1 / 1.25));
        button(tools, 'Time +', () => this.timeline?.zoom(1.25));
        button(tools, 'Previous clip', () => this.nextClip(-1));
        button(tools, 'Next clip', () => this.nextClip(1));
        button(tools, 'Previous section', () => this.structurePanel?.step('section', -1));
        button(tools, 'Next section', () => this.structurePanel?.step('section', 1));
        button(tools, 'Previous marker', () => this.structurePanel?.step('marker', -1));
        button(tools, 'Next marker', () => this.structurePanel?.step('marker', 1));
        this.plan = s.canvas.plan(session.draft);
        this.planKey = `${session.changeVersion}:${s.index.currentRevision}:${this.draftEpoch}`;
        const surface = element(root, 'div', undefined, 'mnemobard-arrangement-surface');
        this.timeline = new ArrangementTimeline(surface, session.draft, this.plan, (lane, id) => this.select(lane, id), (id, lane, start) => this.act(() => { const current = findClip(session.draft, id).clip; s.canvas.move(session, id, lane, start, current.repeatCount, current.label); }), (lane, start) => this.chooseMotif(lane, start), text => this.say(text), {
            select: (kind, id) => { this.structurePanel?.select(kind, id); },
            moveSection: (id, startTick, endTick) => { this.act(() => session.edit('Move section', c => updateSection(c, id, { startTick, endTick }))); },
            moveMarker: (id, tick) => { this.act(() => session.edit('Move marker', c => updateMarker(c, id, { tick }))); },
            createSection: start => { this.act(() => { const c = session.draft, m = c.data.meter, bar = c.data.ppq * 4 / m.denominator * m.numerator, next = orderedSections(c).find(x => x.startTick > start)?.startTick ?? c.data.lengthTicks, id = crypto.randomUUID(); session.edit('Add section', x => addSection(x, { label: `Section ${c.data.sections.length + 1}`, startTick: start, endTick: Math.min(start + bar * 4, next) }, id)); this.structurePanel?.select('section', id); }); },
            createMarker: tick => { this.act(() => { const id = crypto.randomUUID(); session.edit('Add marker', x => addMarker(x, { label: `Marker ${x.data.markers.length + 1}`, tick }, id)); this.structurePanel?.select('marker', id); }); },
        });
        this.timeline.selection(session.selectedLane, session.selectedClip);
        element(root, 'p', 'Drag clips to move · double-click empty time to place · Ctrl/Cmd-wheel zoom · Shift-wheel scroll. Saved motifs are live references; no source notes are copied. Section/marker ruler: drag to move, drag section edges to resize, double-click to add.', 'mnemobard-hint');
        const structureRoot = element(root, 'div');
        this.laneRoot = element(root, 'section', undefined, 'mnemobard-canvas-lane-manager');
        this.inspector = element(root, 'section', undefined, 'mnemobard-canvas-inspector');
        const secondary=element(root,'section',undefined,'mnemobard-canvas-performance');
        this.performancePanel=new CanvasPerformancePanel(performanceToolbar,secondary,this.app,s,session,this,(fn,form)=>this.act(fn,form),()=>this.hasPending(),()=>this.active&&this.app.workspace.activeLeaf===this.leaf,tick=>this.timeline?.playhead(tick),(lane,clip)=>{if(this.select(lane,clip)&&clip)this.timeline?.reveal(clip);});
        this.structurePanel = new CanvasStructurePanel(structureRoot, { library: s.canvas, session, act: (fn, form) => this.act(fn, form), locate: tick => { this.timeline?.revealTick(tick); this.performancePanel?.locate(tick); }, highlight: (kind, id) => this.timeline?.structureSelection(kind, id), open: path => this.openMarkdown(path), sourcePath: () => session.base?.path ?? '', cursorTick: () => this.performancePanel?.currentTick ?? 0, readOnly: () => s.settings.readOnly });
        this.clipRegister = element(root, 'details', undefined, 'mnemobard-canvas-clip-register');
        element(this.clipRegister, 'summary', 'Clip list · keyboard alternative');
        const diagnostics = element(root, 'details', undefined, 'mnemobard-canvas-diagnostics');
        element(diagnostics, 'summary', 'Arrangement diagnostics');
        this.diagnostics = element(diagnostics, 'div');
        const notes = element(root, 'details');
        element(notes, 'summary', 'Description, tags and notes');
        for (const [label, key] of [['Description', 'description'], ['Composition tags', 'tags'], ['Composition notes', 'notes']] as const) {
            const wrap = element(notes, 'label');
            element(wrap, 'span', label);
            const control = key === 'tags' ? element(wrap, 'input') : element(wrap, 'textarea');
            control.setAttribute('aria-label', label);
            control.value = key === 'tags' ? session.draft.tags?.join(', ') ?? '' : session.draft[key] ?? '';
            control.addEventListener('input', () => { try {
                session.edit(`Edit ${key}`, c => ({ ...c, [key]: key === 'tags' ? control.value.split(',').map(v => v.trim()).filter(Boolean) : control.value.trim() ? control.value : undefined }), key);
            }
            catch (e) {
                this.fail(e);
            } });
        }
        this.refreshScene();
        this.renderSelection(true);
    }
    private musicalSettings(root: HTMLElement, session: CanvasSession): void { const details = element(root, 'details', undefined, 'mnemobard-canvas-settings'); element(details, 'summary', 'Composition settings'); const form = element(details, 'form'); const fields = new Map<string, HTMLInputElement>(), c = session.draft; for (const [label, value, min, max] of [['Composition tempo BPM', 60000000 / c.data.tempoMicrosecondsPerQuarter, 20, 300], ['Composition meter numerator', c.data.meter.numerator, 1, 32], ['Composition meter denominator', c.data.meter.denominator, 1, 32], ['Composition length ticks', c.data.lengthTicks, 1, 960 * 4096]] as const) {
        const wrap = element(form, 'label');
        element(wrap, 'span', label);
        const input = element(wrap, 'input');
        input.type = 'number';
        input.value = String(value);
        input.min = String(min);
        input.max = String(max);
        input.step = label.includes('BPM') ? 'any' : '1';
        input.required = true;
        input.setAttribute('aria-label', label);
        fields.set(label, input);
    } const submit = element(form, 'button', 'Apply composition settings'); submit.type = 'submit'; const pending = element(form, 'span'); pending.setAttribute('role', 'status'); form.addEventListener('input', () => { form.dataset.pending = 'true'; pending.textContent = 'Unapplied composition settings'; }); button(form, 'Discard composition settings', () => { delete form.dataset.pending; pending.textContent = ''; this.updateStatus(); }); form.addEventListener('submit', e => { e.preventDefault(); this.act(() => { const bpm = Number(fields.get('Composition tempo BPM')?.value); if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300)
        throw Error('Tempo must be20..300 quarter-note BPM.'); session.edit('Composition settings', value => { const next = { ...value, data: { ...value.data, tempoMicrosecondsPerQuarter: Math.round(60000000 / bpm), meter: { ...value.data.meter, numerator: Number(fields.get('Composition meter numerator')?.value), denominator: Number(fields.get('Composition meter denominator')?.value) }, lengthTicks: Number(fields.get('Composition length ticks')?.value) } }; if (this.available?.canvas.plan(next).diagnostics.some(d => d.code === 'beyond-end'))
        throw Error('Length would exclude a resolved clip. Extend or edit placements explicitly.'); return next; }); delete form.dataset.pending; pending.textContent = ''; }, form); }); element(details, 'p', 'PPQ960 is fixed for schema1 arrangements. Tempo/meter reinterpret the composition timeline; source motifs stay unchanged. No tempo/meter maps. Compile for derived routing and note-only playback/export.', 'mnemobard-hint'); }
    private refreshScene(): void { const s = this.available, session = this.session; if (!this.active || !s || !session || session.disposed)
        return; this.performancePanel?.refresh();this.updateStatus(); const key = `${session.changeVersion}:${s.index.currentRevision}:${this.draftEpoch}`; if (key !== this.planKey) {
        this.planKey = key;
        this.plan = s.canvas.plan(session.draft);
        this.timeline?.update(session.draft, this.plan);
        this.structurePanel?.refresh();
        this.renderSelection();
    } this.timeline?.selection(session.selectedLane, session.selectedClip); this.renderDiagnostics(); }
    private updateStatus(): void {
        const session = this.session;
        if (!session)
            return;
        const c = session.draft;
        if (this.saveStatus) {
            const state = session.base ? this.available?.index.resolve(c.id) : undefined;
            this.saveStatus.textContent = state && state.status !== 'ready' ? `${session.status} · composition source ${state.status}; Save protected` : session.status;
        }
        if (this.undoButton)
            this.undoButton.disabled = !session.canUndo;
        if (this.redoButton)
            this.redoButton.disabled = !session.canRedo;
        const summary = this.editor?.querySelector('.mnemobard-canvas-settings > summary');
        if (summary)
            summary.textContent = `${(60000000 / c.data.tempoMicrosecondsPerQuarter).toFixed(1)} BPM · ${c.data.meter.numerator}/${c.data.meter.denominator} · PPQ960 · ${c.data.lanes.length} lanes`;
        const values: Record<string, string> = { 'Composition name': c.title, 'Description': c.description ?? '', 'Composition tags': c.tags?.join(', ') ?? '', 'Composition notes': c.notes ?? '', 'Composition tempo BPM': String(60000000 / c.data.tempoMicrosecondsPerQuarter), 'Composition meter numerator': String(c.data.meter.numerator), 'Composition meter denominator': String(c.data.meter.denominator), 'Composition length ticks': String(c.data.lengthTicks) };
        for (const [label, value] of Object.entries(values)) {
            const input = this.editor?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
            if (input && input !== this.contentEl.ownerDocument.activeElement && input.closest('form')?.dataset.pending !== 'true')
                input.value = value;
        }
    }
    private renderSelection(force = false): void { const s = this.available, session = this.session; if (!s || !session || !this.inspector || !this.laneRoot || !this.plan)
        return; if (!force && this.hasPending())
        return; const focused = this.contentEl.ownerDocument.activeElement, restore = focused instanceof HTMLElement && (this.inspector.contains(focused) || this.laneRoot.contains(focused) || this.clipRegister?.contains(focused)), focusLabel = focused?.getAttribute('aria-label'), focusClip = focused?.getAttribute('data-clip-id'), focusText = focused?.tagName === 'BUTTON' ? focused.textContent : undefined; const c = session.draft; if (!c.data.lanes.some(l => l.id === session.selectedLane))
        session.selectedLane = c.data.lanes[0]?.id; if (!c.data.lanes.some(l => l.clips.some(clip => clip.id === session.selectedClip)))
        session.selectedClip = undefined; this.renderLanes(); clipInspector(this.inspector, session, s.canvas, this.plan, (fn, form) => this.act(fn, form), () => this.renderSelection(true), id => { void this.openMotif(id).catch(e => this.fail(e)); }); this.renderRegister(); this.timeline?.selection(session.selectedLane, session.selectedClip); if (restore && !focused?.isConnected) {
        const target = [...this.editor?.querySelectorAll<HTMLElement>('input,select,button') ?? []].find(e => focusClip ? e.dataset.clipId === focusClip : focusLabel ? e.getAttribute('aria-label') === focusLabel : focusText ? e.textContent === focusText : false);
        (target ?? this.timeline?.canvas)?.focus();
    } }
    private renderLanes(): void { const root = this.laneRoot, session = this.session; if (!root || !session)
        return; const expanded = root.querySelector('details')?.open ?? false; root.replaceChildren(); const c = session.draft, details = element(root, 'details'); details.open = expanded; element(details, 'summary', 'Lane management'); const label = element(details, 'label'); element(label, 'span', 'Selected lane'); const choice = element(label, 'select'); choice.setAttribute('aria-label', 'Selected lane'); for (const [index, lane] of c.data.lanes.entries()) {
        const option = element(choice, 'option', `${index + 1}. ${lane.name}`);
        option.value = lane.id;
    } choice.value = session.selectedLane ?? ''; choice.addEventListener('change', () => this.select(choice.value)); const lane = c.data.lanes.find(l => l.id === session.selectedLane); if (!lane) {
        element(details, 'p', 'Add a lane before placing motifs.');
        return;
    } const form = element(details, 'form'), nameLabel = element(form, 'label'); element(nameLabel, 'span', 'Lane name'); const input = element(nameLabel, 'input'); input.value = lane.name; input.required = true; input.setAttribute('aria-label', 'Lane name'); const submit = element(form, 'button', 'Rename lane'); submit.type = 'submit'; form.addEventListener('input', () => { form.dataset.pending = 'true'; }); form.addEventListener('submit', e => { e.preventDefault(); this.act(() => { session.edit('Rename lane', c => renameLane(c, lane.id, input.value)); delete form.dataset.pending; }, form); }); button(form, 'Discard lane changes', () => { delete form.dataset.pending; this.renderSelection(true); }); button(details, 'Move lane up', () => this.act(() => session.edit('Reorder lane', c => reorderLane(c, lane.id, -1)))); button(details, 'Move lane down', () => this.act(() => session.edit('Reorder lane', c => reorderLane(c, lane.id, 1)))); button(details, 'Delete lane', () => { if (this.hasPending()) {
        this.say('Apply or discard pending fields first.');
        return;
    } if (!lane.clips.length) {
        this.act(() => session.edit('Delete lane', c => deleteLane(c, lane.id, true)));
        return;
    } const confirm = element(details, 'div', undefined, 'mnemobard-confirm'); element(confirm, 'p', `Delete ${lane.name} and its ${lane.clips.length} clips? This is undoable. Sources/files remain unchanged.`); button(confirm, 'Keep lane', () => confirm.remove()); button(confirm, 'Confirm delete lane and clips', () => this.act(() => session.edit('Delete lane and clips', c => deleteLane(c, lane.id, true)))); }); }
    private renderRegister(): void { const root = this.clipRegister, session = this.session; if (!root || !session || !this.plan)
        return; const open = (root as HTMLDetailsElement).open; root.replaceChildren(); element(root, 'summary', 'Clip list · keyboard alternative'); (root as HTMLDetailsElement).open = open; const clips = this.plan.clips; this.clipPage = Math.min(this.clipPage, Math.max(0, Math.ceil(clips.length / 50) - 1)); for (const clip of clips.slice(this.clipPage * 50, this.clipPage * 50 + 50)) {
        const buttonNode = button(root, `${clip.title} · lane ${clip.laneIndex + 1} · tick ${clip.startTick} · ×${clip.repeatCount}${clip.diagnostics.length ? ' · diagnostics' : ''}`, () => { this.select(clip.laneId, clip.id); this.timeline?.reveal(clip.id); });
        buttonNode.dataset.clipId = clip.id;
        buttonNode.setAttribute('aria-pressed', String(clip.id === session.selectedClip));
    } if (this.clipPage)
        button(root, 'Previous clip page', () => { this.clipPage--; this.renderRegister(); }); if ((this.clipPage + 1) * 50 < clips.length)
        button(root, 'More clips', () => { this.clipPage++; this.renderRegister(); }); }
    private renderDiagnostics(): void { if (!this.diagnostics || !this.plan)
        return; this.diagnostics.replaceChildren(); for (const d of this.plan.diagnostics.slice(0, 100)) {
        const row = element(this.diagnostics, 'p', `${d.severity.toUpperCase()}${d.clipId ? ' · ' + d.clipId.slice(0, 8) : ''}: ${diagnosticText(d)}`);
        row.dataset.diagnostic = d.code;
    } if (this.plan.diagnostics.length > 100)
        element(this.diagnostics, 'p', `${this.plan.diagnostics.length - 100} further diagnostics; select a clip for its full detail.`); const summary = this.diagnostics.parentElement?.querySelector('summary'); if (summary)
        summary.textContent = `Arrangement diagnostics · ${this.plan.diagnostics.filter(d => d.severity === 'error').length} errors / ${this.plan.diagnostics.filter(d => d.severity === 'warning').length} warnings`; }
    private select(lane: string, clip?: string): boolean { if (this.hasPending()) {
        this.say('Apply or discard pending clip/lane settings before selecting another item.');
        return false;
    } if (!this.session)
        return false; this.session.selectedLane = lane; this.session.selectedClip = clip; this.renderSelection(true); this.timeline?.selection(lane, clip); return true; }
    private chooseMotif(laneId = this.session?.selectedLane, start = 0): void { if (this.hasPending()) {
        this.say('Apply or discard pending properties before placement.');
        return;
    } const session = this.session, s = this.available; if (!session || !s)
        return; if (!laneId) {
        this.say('Add/select a lane before placing a motif.');
        return;
    } this.picker?.close(); this.picker = new ArrangementMotifPicker(this.app, s.canvas, session, laneId, start, () => { session.selectedLane = laneId; session.selectedClip = session.draft.data.lanes.find(l => l.id === laneId)?.clips.at(-1)?.id; this.refreshScene(); this.renderSelection(true); }); this.picker.open(); }
    private nextClip(delta: number): void { const session = this.session, clips = this.plan?.clips; if (!session || !clips?.length)
        return; const index = clips.findIndex(c => c.id === session.selectedClip), next = clips[(index + delta + clips.length) % clips.length]; if (next && this.select(next.laneId, next.id)) {
        this.clipPage = Math.floor(clips.indexOf(next) / 50);
        this.renderRegister();
        if (this.clipRegister)
            (this.clipRegister as HTMLDetailsElement).open = true;
        this.timeline?.reveal(next.id);
        [...this.clipRegister?.querySelectorAll<HTMLElement>('[data-clip-id]') ?? []].find(e => e.dataset.clipId === next.id)?.focus();
    } }
    private async save(): Promise<void> { if (this.hasPending()) {
        this.say('Apply or discard pending properties before Save.');
        return;
    } try {
        await this.session?.save();
        if (this.active) {
            this.refreshScene();
            this.renderBrowser();
            this.say('Composition saved. Source motif files were not rewritten.');
        }
    }
    catch (e) {
        this.fail(e);
    } }
    private openMarkdown(path: string): void { void this.app.workspace.openLinkText(path, '', true).catch(e => this.fail(e)); }
    private async openMotif(id: string): Promise<void> { await this.leave(); const s = this.available; if (!s)
        return; const source = s.index.resolve(id); if (source.status !== 'ready' || source.entity.kind !== 'motif')
        throw Error(`Source is ${source.status}; clip remains. Inspect/restore the original note.`); if (!s.modules.enabled('motif')) {
        this.openMarkdown(source.path);
        return;
    } await s.modules.open('motif'); const leaf = this.app.workspace.getLeavesOfType('mnemobard-motif')[0]; await leaf?.loadIfDeferred(); if (!this.active)
        return; if (!(leaf?.view instanceof MotifView))
        throw Error('MOTIF view is not ready; reopen it or inspect its Markdown.'); await leaf.view.setState({ selectedId: id }); }
    private recovery(): void { const s = this.available, root = this.recoveryRoot; if (!s || !root)
        return; this.recoveryPanel?.dispose(); this.recoveryPanel = new RecoveryInspector(root, { recovery: s.canvas.recovery, settings: s.settings, recover: v => s.canvas.recover(v) }, session => { if (this.active) {
        this.recoveryPanel?.dispose();
        this.recoveryPanel = undefined;
        this.attach(session);
        this.say('Recovered arrangement is unsaved. Review, then explicitly Save composition.');
    } }, path => this.openMarkdown(path)); button(root, 'Close composition recovery', () => { this.recoveryPanel?.dispose(); this.recoveryPanel = undefined; }); }
    private bindKeys(): void {
        const scope = new Scope(this.scope ?? this.app.scope);
        this.editorScope = scope;
        const sync = () => queueMicrotask(() => { if (!this.active)
            return; this.app.keymap.popScope(scope); if (this.editor?.contains(this.contentEl.ownerDocument.activeElement))
            this.app.keymap.pushScope(scope); });
        this.contentEl.addEventListener('focusin', sync, { signal: this.lifetime.signal });
        this.contentEl.addEventListener('focusout', sync, { signal: this.lifetime.signal });
        const context = () => { const target = this.contentEl.ownerDocument.activeElement; return !!this.session && !!this.editor?.contains(target) && target instanceof HTMLElement && !target.matches('input,textarea,select,[contenteditable="true"]'); };
        const bind = (mods: ('Mod' | 'Shift')[], key: string, fn: () => void, check = context) => { const handler = scope.register(mods, key, () => { if (!check())
            return true; fn(); sync(); return false; }); this.cleanup.push(() => scope.unregister(handler)); };
        bind(['Mod'], 's', () => { void this.save(); }, () => !!this.session && !!this.editor?.contains(this.contentEl.ownerDocument.activeElement));
        bind(['Mod'], 'z', () => this.act(() => this.session?.undo()));
        bind(['Mod', 'Shift'], 'z', () => this.act(() => this.session?.redo()));
        bind(['Mod'], 'y', () => this.act(() => this.session?.redo()));
        const musical = () => context() && (this.contentEl.ownerDocument.activeElement === this.timeline?.canvas || this.contentEl.ownerDocument.activeElement?.hasAttribute('data-clip-id') === true);
        for (const key of ['Delete', 'Backspace'])
            bind([], key, () => this.act(() => { if (this.session?.selectedClip)
                this.session.edit('Delete clip', c => deleteClip(c, this.session?.selectedClip ?? '')); }), musical);
        bind(['Mod'], 'd', () => this.act(() => { if (this.session?.selectedClip)
            this.available?.canvas.duplicate(this.session, this.session.selectedClip); }), musical);
        for (const [key, direction] of [['ArrowLeft', -1], ['ArrowRight', 1]] as const)
            bind([], key, () => this.act(() => { const s = this.session; if (!s?.selectedClip)
                return; const current = findClip(s.draft, s.selectedClip); this.available?.canvas.move(s, s.selectedClip, current.lane.id, current.clip.startTick + direction * gridTicks(960, this.timeline?.grid ?? 'quarter'), current.clip.repeatCount, current.clip.label); }), () => musical() && this.contentEl.ownerDocument.activeElement === this.timeline?.canvas);
    }
    override getState(): Record<string, unknown> { return { selectedId: this.selectedId, search: this.search }; }
    override async setState(value: unknown): Promise<void> { if (!value || typeof value !== 'object')
        return; const state = value as Record<string, unknown>; if (typeof state.search === 'string')
        this.search = state.search.slice(0, 1000); if (typeof state.selectedId === 'string')
        this.selectedId = state.selectedId; if (this.active) {
        this.renderBrowser();
        if (this.selectedId)
            await this.openComposition(this.selectedId);
    } }
    override release(): void { this.active = false; this.epoch++; this.lifetime.abort(); this.picker?.close(); this.picker = undefined; this.performancePanel?.dispose();this.performancePanel=undefined;this.structurePanel?.dispose();this.structurePanel=undefined;this.timeline?.dispose(); this.timeline = undefined; this.recoveryPanel?.dispose(); this.recoveryPanel = undefined; this.sessionUnsubscribe?.(); this.sessionUnsubscribe = undefined; if (this.session)
        this.foundation()?.canvas.release(this.session, this); if (this.editorScope)
        this.app.keymap.popScope(this.editorScope); this.editorScope = undefined; for (const fn of this.cleanup.splice(0))
        fn(); super.release(); }
    override async onClose(): Promise<void> { const pending = this.hasPending(); this.release(); this.contentEl.replaceChildren(); try {
        if (this.session?.dirty && !this.session.disposed)
            await this.session.checkpoint();
        if (pending)
            new Notice('Unapplied CANVAS controls were not part of the draft. Applied changes remain in the session/checkpoint.');
    }
    catch (e) {
        if (!this.session?.disposed)
            new Notice(`Arrangement checkpoint failed: ${messageOf(e)}. Working draft remains while the plugin is enabled.`);
    } }
}
