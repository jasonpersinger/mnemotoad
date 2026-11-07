import { Notice, Scope, type WorkspaceLeaf } from 'obsidian';
import { openModal } from '../../ui/modal-host';
import { ReadyGate, type NavigationNote } from '../../application/navigation';
import { FoundationError } from '../../domain/errors';
import { navigateTo } from '../../ui/navigate';
import { referenceRow } from '../../ui/reference-row';
import { ReferenceLookup } from '../../storage/reference-status';
import { ModuleView } from '../../ui/module-view';
import { element, button } from '../../ui/dom';
import type { FoundationServices } from '../../application/services';
import type { Composition } from '../../domain/entities';
import { messageOf } from '../../domain/errors';
import { RecoveryInspector } from '../../ui/recovery-inspector';
import { diagnosticText, type ArrangementPlan } from '../../arrangement/preflight';
import { musicalPosition } from '../../music/positions';
import type { Meter } from '../../domain/entities';
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
const SEVERITY = { error: 'Blocks compile/export', warning: 'Can continue · review', info: 'Note' } as const;
/** What resolves each preflight diagnostic (4D diagnostic usability). */
const DIAGNOSTIC_ACTION: Partial<Record<string, string>> = {
    missing: 'Restore the motif note (UUID unchanged) or delete the clip.', duplicate: 'Open both notes and give one a new identity outside CANVAS.', malformed: 'Open the source Markdown and repair it.',
    unreviewed: 'Select the clip → Review saved source → Acknowledge.', changed: 'Select the clip → Review saved source → Acknowledge the new revision.', moved: 'Optional: acknowledge to refresh the path hint.',
    'unsaved-source': 'Save the MOTIF to include its edits.', 'inexact-timing': 'Use a source with compatible PPQ/length or remove the clip.', 'beyond-end': 'Extend the composition length or move the clip.', 'clip-overlap': 'Move a clip or compile to check exact collisions.',
};
/** Documented keyboard interactions (also shown in the "Timeline gestures and keys" disclosure). */
export const CANVAS_KEYS = Object.freeze([
    '[ / ] · previous / next section (playhead-relative, no wrap, never starts playback)',
    ', / . · previous / next marker (markers sharing a position are visited in name order)',
    'Escape · cancel a drag, otherwise clear the selection and return focus to the timeline',
    'Tab · move between timeline, structure ruler, inspector and tools; keys are ignored while typing in a field',
]);
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
    /** 4E freshness indicator (toolbar) and banner (only when there is something to act on). */
    private freshnessStatus?: HTMLElement;
    private freshnessBanner?: HTMLElement;
    private freshnessKey = '';
    private pending?: HTMLElement;
    private inspector?: HTMLElement;
    /** 4D contextual inspector: exactly one of empty/clip/lane/structure is visible. Selection is ephemeral (no history). */
    private context?: { header: HTMLElement; empty: HTMLElement; lane: HTMLElement; structure: HTMLElement };
    private contextKind: 'none' | 'clip' | 'lane' | 'structure' = 'none';
    private laneFocus = false;
    private laneHome?: Comment;
    private routeHome?: Comment;
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
    /** Meter of the draft snapshot the current plan was built from (avoids another session.draft clone per refresh). */
    private planMeter?: Meter;
    private draftEpoch = 0;
    private editorScope?: Scope;
    constructor(leaf: WorkspaceLeaf, private readonly foundation: () => FoundationServices | undefined) { super(leaf, 'canvas', foundation); this.scope = new Scope(this.app.scope); }
    private get available(): FoundationServices | undefined { const s = this.foundation(); return s?.modules.enabled('canvas') ? s : undefined; }
    /** 4F navigation target: opened once onOpen (including a restored composition) has finished. */
    private readonly ready = new ReadyGate();
    private revealing = 0;
    override async onOpen(): Promise<void> { this.ready.reset(); try { await this.openView(); } finally { this.ready.open(); } }
    /** Opens (or keeps) composition `id`, then selects `focus` (a clip ID, or the first clip using that motif ID). Never discards a draft: leaving checkpoints, pending forms refuse. */
    async reveal(id: string, signal: AbortSignal, note?: NavigationNote, focus?: string): Promise<void> {
        await this.ready.promise; note?.('view-ready');
        if (!this.active) throw new FoundationError('disposed', 'CANVAS closed before the composition could be shown. Nothing was selected.');
        if (signal.aborted) return;
        // A session disposed underneath the view (e.g. discarded elsewhere) is never reused: reopen it from the vault.
        this.revealing++; try { if (!this.session || this.session.disposed || this.session.draft.id.toLowerCase() !== id.toLowerCase()) await this.openComposition(id); } finally { this.revealing--; }
        note?.('state-applied'); if (signal.aborted) return;
        const session = this.session;
        if (!this.active || !session || session.disposed || session.draft.id.toLowerCase() !== id.toLowerCase()) throw new FoundationError('io', this.feedback?.textContent || 'CANVAS did not open the requested composition. Nothing else was selected.');
        if (!focus) return;
        const target = focus.toLowerCase(), lanes = session.draft.data.lanes, clip = lanes.flatMap(l => l.clips).find(c => c.id.toLowerCase() === target) ?? lanes.flatMap(l => l.clips).find(c => c.motifId.toLowerCase() === target);
        const lane = clip && lanes.find(l => l.clips.some(c => c.id === clip.id));
        if (clip && lane && this.select(lane.id, clip.id)) this.timeline?.reveal(clip.id);
    }
    private async openView(): Promise<void> {
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
        const keys = (e: KeyboardEvent) => this.keyboard(e); this.contentEl.addEventListener('keydown', keys); this.cleanup.push(() => this.contentEl.removeEventListener('keydown', keys));
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
        open.disabled = item.ambiguous; open.title = item.title ?? '';
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
        this.freshnessStatus = undefined;
        this.freshnessBanner = undefined;
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
        // 4F hierarchy: A composition header · B transport · C arrangement (workspace toolbar + sticky timeline, kept a direct child so it
        // stays pinned) · D contextual inspector · then secondary tools. Same controls and labels as 4E, regrouped.
        const compositionHeader = element(root, 'section', undefined, 'mnemobard-canvas-header'); compositionHeader.setAttribute('aria-label', 'Composition');
        const title = element(compositionHeader, 'label', undefined, 'mnemobard-canvas-title');
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
        const bar = element(compositionHeader, 'div', undefined, 'mnemobard-canvas-toolbar');
        const editBar = root.ownerDocument.createElement('div'); editBar.className = 'mnemobard-canvas-edit-bar'; editBar.setAttribute('aria-label', 'Arrangement editing');
        button(bar, 'Save composition', () => { void this.save(); }, 'mod-cta');
        this.saveStatus = element(bar, 'span', session.status, 'mnemobard-save-status');
        this.saveStatus.setAttribute('role', 'status');
        this.freshnessStatus = element(bar, 'span', '', 'mnemobard-freshness');
        this.freshnessStatus.setAttribute('role', 'status');
        button(editBar, 'Add lane', () => this.act(() => { const count = session.draft.data.lanes.length; session.edit('Add lane', c => addLane(c, `Lane ${count + 1}`)); session.selectedLane = session.draft.data.lanes.at(-1)?.id; session.selectedClip = undefined; }));
        button(editBar, 'Place motif', () => this.chooseMotif());
        this.undoButton = button(editBar, 'Undo', () => this.act(() => session.undo()));
        this.redoButton = button(editBar, 'Redo', () => this.act(() => session.redo()));
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
        this.freshnessBanner = element(root, 'div', undefined, 'mnemobard-freshness-banner');
        this.freshnessBanner.hidden = true; this.freshnessKey = '';
        const transport = element(root, 'section', undefined, 'mnemobard-canvas-transport'); transport.setAttribute('aria-label', 'Transport');
        const performanceToolbar=element(transport,'div');
        this.musicalSettings(transport, session);
        const workspaceBar = element(root, 'div', undefined, 'mnemobard-canvas-workspace-bar'); workspaceBar.setAttribute('aria-label', 'Arrangement tools'); workspaceBar.append(editBar);
        const tools = element(workspaceBar, 'div', undefined, 'mnemobard-canvas-navigation');
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
        const planDraft = session.draft;
        this.plan = s.canvas.plan(planDraft);
        this.planMeter = planDraft.data.meter;
        this.planKey = `${session.changeVersion}:${s.index.currentRevision}:${this.draftEpoch}`;
        const surface = element(root, 'div', undefined, 'mnemobard-arrangement-surface');
        this.timeline = new ArrangementTimeline(surface, session.draft, this.plan, (lane, id) => this.select(lane, id), (id, lane, start) => this.act(() => { const current = findClip(session.draft, id).clip; s.canvas.move(session, id, lane, start, current.repeatCount, current.label); }), (lane, start) => this.chooseMotif(lane, start), text => this.say(text), {
            select: (kind, id) => { if (this.hasPending()) { this.say('Apply or discard pending properties before selecting another item.'); return; } this.structurePanel?.select(kind, id); },
            moveSection: (id, startTick, endTick) => { this.act(() => session.edit('Move section', c => updateSection(c, id, { startTick, endTick }))); },
            moveMarker: (id, tick) => { this.act(() => session.edit('Move marker', c => updateMarker(c, id, { tick }))); },
            createSection: start => { this.act(() => { const c = session.draft, m = c.data.meter, bar = c.data.ppq * 4 / m.denominator * m.numerator, next = orderedSections(c).find(x => x.startTick > start)?.startTick ?? c.data.lengthTicks, id = crypto.randomUUID(); session.edit('Add section', x => addSection(x, { label: `Section ${c.data.sections.length + 1}`, startTick: start, endTick: Math.min(start + bar * 4, next) }, id)); this.structurePanel?.select('section', id); }); },
            createMarker: tick => { this.act(() => { const id = crypto.randomUUID(); session.edit('Add marker', x => addMarker(x, { label: `Marker ${x.data.markers.length + 1}`, tick }, id)); this.structurePanel?.select('marker', id); }); },
        });
        this.timeline.selection(session.selectedLane, session.selectedClip);
        const gestures = element(root, 'details', undefined, 'mnemobard-canvas-gestures');
        element(gestures, 'summary', 'Timeline gestures and keys');
        element(gestures, 'p', 'Drag clips to move · double-click empty time to place · Ctrl/Cmd-wheel zoom · Shift-wheel scroll. Saved motifs are live references; no source notes are copied. Section/marker ruler: drag to move, drag section edges to resize, double-click to add.', 'mnemobard-hint');
        const keyList = element(gestures, 'ul', undefined, 'mnemobard-canvas-keys');
        for (const line of CANVAS_KEYS) element(keyList, 'li', line);
        const context = element(root, 'section', undefined, 'mnemobard-canvas-context');
        context.setAttribute('aria-label', 'Selection inspector');
        const header = element(context, 'div', undefined, 'mnemobard-context-header');
        header.setAttribute('role', 'status');
        const empty = element(context, 'p', 'Nothing selected. Choose a clip, lane, section, marker or recording reference; Previous/Next buttons and [ ] , . keys navigate.', 'mnemobard-hint mnemobard-context-empty');
        this.inspector = element(context, 'section', undefined, 'mnemobard-canvas-inspector');
        const structureEditor = element(context, 'div', undefined, 'mnemobard-context-structure');
        this.context = { header, empty, lane: element(context, 'div', undefined, 'mnemobard-context-lane'), structure: structureEditor };
        this.contextKind = 'none'; this.laneFocus = false;
        const secondaryTools = element(root, 'div', undefined, 'mnemobard-canvas-tools');
        element(secondaryTools, 'p', 'More tools', 'mnemobard-region-label');
        const structureRoot = element(secondaryTools, 'div');
        this.laneRoot = element(secondaryTools, 'section', undefined, 'mnemobard-canvas-lane-manager');
        this.laneHome = root.ownerDocument.createComment('lane manager home'); this.laneRoot.after(this.laneHome);
        const secondary=element(secondaryTools,'section',undefined,'mnemobard-canvas-performance');
        this.performancePanel=new CanvasPerformancePanel(performanceToolbar,secondary,this.app,s,session,this,(fn,form)=>this.act(fn,form),()=>this.hasPending(),()=>this.active&&this.app.workspace.activeLeaf===this.leaf,tick=>this.timeline?.playhead(tick),(lane,clip)=>{if(this.select(lane,clip)&&clip)this.timeline?.reveal(clip);});
        this.routeHome = root.ownerDocument.createComment('routing home'); this.performancePanel.routing.before(this.routeHome);
        this.structurePanel = new CanvasStructurePanel(structureRoot, { library: s.canvas, session, act: (fn, form) => this.act(fn, form), locate: tick => { this.timeline?.revealTick(tick); this.performancePanel?.locate(tick); }, highlight: (kind, id) => this.timeline?.structureSelection(kind, id), open: path => this.openMarkdown(path), sourcePath: () => session.base?.path ?? '', cursorTick: () => this.performancePanel?.currentTick ?? 0, readOnly: () => s.settings.readOnly, blocked: () => this.hasPending(), selected: kind => this.structureSelected(kind) }, structureEditor);
        this.clipRegister = element(secondaryTools, 'details', undefined, 'mnemobard-canvas-clip-register');
        element(this.clipRegister, 'summary', 'Clip list · keyboard alternative');
        const diagnostics = element(secondaryTools, 'details', undefined, 'mnemobard-canvas-diagnostics');
        element(diagnostics, 'summary', 'Arrangement diagnostics');
        this.diagnostics = element(diagnostics, 'div');
        const notes = element(secondaryTools, 'details');
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
        const draft = session.draft;
        this.plan = s.canvas.plan(draft);
        this.planMeter = draft.data.meter;
        this.timeline?.update(draft, this.plan);
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
        this.renderFreshness(session);
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
    /** 4E: compact indicator always; banner only for refresh notices, conflicts and unavailable notes. Destructive choices need confirmation. */
    private renderFreshness(session: CanvasSession): void {
        const status = this.freshnessStatus, banner = this.freshnessBanner; if (!status || !banner)
            return;
        const f = session.freshness, dirty = session.dirty, list = (areas: string[]) => areas.length ? areas.join(', ') : 'formatting only';
        const text = !session.base ? 'New composition · not yet saved' : f.state === 'checking' ? 'External update detected · checking the note…' : f.state === 'conflict' ? 'Note changed elsewhere · your edits are kept · Save blocked' : f.state === 'unavailable' ? 'Note unavailable · draft kept · Save blocked' : f.state === 'refreshed' && !dirty ? `Refreshed from the note · ${f.musical ? 'compile again' : 'compilation kept'}` : dirty ? 'Unsaved edits · note unchanged on disk' : 'Matches the saved note';
        status.textContent = text; status.dataset.freshness = f.state;
        const key = JSON.stringify([f, dirty, session.draft.id]); if (key === this.freshnessKey)
            return;
        this.freshnessKey = key; banner.replaceChildren(); banner.dataset.freshness = f.state;
        banner.hidden = !(f.state === 'unavailable' || (f.state === 'conflict' && !f.kept) || (f.state === 'refreshed' && !dirty));
        if (banner.hidden)
            return;
        const openNote = (path?: string) => { const state = this.available?.index.resolve(session.draft.id), target = path ?? (state?.status === 'ready' ? state.path : session.base?.path); if (target) button(banner, 'Open composition Markdown', () => this.openMarkdown(target)); };
        const recovery = () => button(banner, 'Store recovery copy and open recovery', () => { void session.checkpoint().then(() => { if (this.active) { this.recovery(); this.say(session.recoveryPath ? `Recovery copy stored: ${session.recoveryPath}` : 'Draft matches the last recovery copy.'); } }).catch(e => this.fail(e)); });
        if (f.state === 'refreshed') {
            element(banner, 'p', `“${session.draft.title}” was updated from its note, changed elsewhere (${list(f.areas)}). ${f.musical ? 'The musical arrangement changed: compile again before playback or export.' : 'Only organizational details changed: the compiled arrangement and playback were kept.'} No undo step was added; earlier undo history described the previous note.`);
            return;
        }
        if (f.state === 'unavailable') {
            element(banner, 'p', f.message); banner.setAttribute('role', 'alert'); openNote(f.path); recovery();
            return;
        }
        if (f.state !== 'conflict')
            return;
        banner.setAttribute('role', 'alert');
        element(banner, 'p', `“${session.draft.title}” changed in its note while you have unsaved edits. Your arrangement draft, undo history and recovery copies are kept; Save is blocked so neither version is overwritten.${f.rename ? ' This change is only a recording rename: use “Adopt rename and keep my edits” under Recording references.' : ''}`);
        const details = element(banner, 'details'); element(details, 'summary', 'Review external changes');
        element(details, 'p', `Changed elsewhere: ${list(f.areas)}. ${f.musical ? 'Includes musical changes (clips, lanes, routing, tempo/meter or unknown fields).' : 'Organizational details only (no musical change).'}`);
        openNote();
        button(banner, 'Keep working draft', () => session.setFreshness({ ...f, kept: true }));
        recovery();
        button(banner, 'Reload note version…', () => {
            if (banner.querySelector('.mnemobard-confirm'))
                return;
            const confirm = element(banner, 'div', undefined, 'mnemobard-confirm');
            element(confirm, 'p', 'Discard your unsaved arrangement edits and load the note as it is now? A recovery copy of your draft is stored first; the undo history of this draft ends.');
            button(confirm, 'Keep my edits', () => confirm.remove());
            button(confirm, 'Store recovery copy, discard edits and reload', () => { void this.discardAndReload(session).catch(e => this.fail(e)); }, 'mod-warning');
        });
    }
    /** Explicit, confirmed: checkpoint first (aborts on failure), then discard the draft and open the authoritative note. */
    private async discardAndReload(session: CanvasSession): Promise<void> {
        const s = this.available; if (!s || this.session !== session)
            return;
        if (this.hasPending())
            throw Error('Apply or discard pending properties first. Nothing was discarded.');
        await session.checkpoint();
        if (!this.active || this.session !== session)
            return;
        const copy = session.recoveryPath, id = session.draft.id;
        this.sessionUnsubscribe?.(); this.sessionUnsubscribe = undefined; s.canvas.discard(session); this.session = undefined; this.renderEditor(); this.renderDrafts();
        await this.openComposition(id);
        this.say(`Reloaded the note version.${copy ? ` Your previous draft is in ${copy}.` : ''}`);
    }
    private renderSelection(force = false): void { const s = this.available, session = this.session; if (!s || !session || !this.inspector || !this.laneRoot || !this.plan)
        return; if (!force && this.hasPending())
        return; const focused = this.contentEl.ownerDocument.activeElement, restore = focused instanceof HTMLElement && (this.inspector.contains(focused) || this.laneRoot.contains(focused) || this.clipRegister?.contains(focused)), focusLabel = focused?.getAttribute('aria-label'), focusClip = focused?.getAttribute('data-clip-id'), focusText = focused?.tagName === 'BUTTON' ? focused.textContent : undefined; const c = session.draft; if (!c.data.lanes.some(l => l.id === session.selectedLane))
        session.selectedLane = c.data.lanes[0]?.id; if (!c.data.lanes.some(l => l.clips.some(clip => clip.id === session.selectedClip)))
        session.selectedClip = undefined; this.renderLanes(); clipInspector(this.inspector, session, s.canvas, this.plan, (fn, form) => this.act(fn, form), () => this.renderSelection(true), id => { void this.openMotif(id).catch(e => this.fail(e)); }); this.renderClipSources(c); this.placeContext(); this.renderRegister(); this.timeline?.selection(session.selectedLane, session.selectedClip); if (restore && !focused?.isConnected) {
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
        buttonNode.dataset.clipId = clip.id; buttonNode.title = `${clip.title} · lane ${clip.laneIndex + 1}`;
        buttonNode.setAttribute('aria-pressed', String(clip.id === session.selectedClip));
    } if (this.clipPage)
        button(root, 'Previous clip page', () => { this.clipPage--; this.renderRegister(); }); if ((this.clipPage + 1) * 50 < clips.length)
        button(root, 'More clips', () => { this.clipPage++; this.renderRegister(); }); }
    private renderDiagnostics(): void { if (!this.diagnostics || !this.plan)
        return; this.diagnostics.replaceChildren(); const plan = this.plan, meter = this.planMeter; for (const d of plan.diagnostics.slice(0, 100)) {
        // 4D: musical names and positions first; UUIDs only as advanced detail (title attribute).
        const clip = d.clipId ? plan.clips.find(c => c.id === d.clipId) : undefined, where = clip && meter ? `${clip.title} · lane ${clip.laneIndex + 1} · ${musicalPosition(clip.startTick, 960, meter)}` : '';
        const row = element(this.diagnostics, 'div', undefined, 'mnemobard-diagnostic-row'); row.dataset.diagnostic = d.code; row.dataset.severity = d.severity;
        element(row, 'p', `${SEVERITY[d.severity]}${where ? ' · ' + where : ''}: ${diagnosticText(d)}${DIAGNOSTIC_ACTION[d.code] ? ' ' + DIAGNOSTIC_ACTION[d.code] : ''}`);
        if (d.clipId || d.motifId) row.title = [d.clipId && `Clip ${d.clipId}`, d.motifId && `Motif ${d.motifId}`].filter(Boolean).join(' · ');
        if (clip) button(row, 'Select clip', () => { if (this.select(clip.laneId, clip.id)) { this.timeline?.reveal(clip.id); this.inspector?.querySelector<HTMLElement>('input,button')?.focus(); } });
    } if (this.plan.diagnostics.length > 100)
        element(this.diagnostics, 'p', `${this.plan.diagnostics.length - 100} further diagnostics; select a clip for its full detail.`); const summary = this.diagnostics.parentElement?.querySelector('summary'); if (summary)
        summary.textContent = `Arrangement diagnostics · ${this.plan.diagnostics.filter(d => d.severity === 'error').length} errors / ${this.plan.diagnostics.filter(d => d.severity === 'warning').length} warnings`; }
    private select(lane: string, clip?: string): boolean { if (this.hasPending()) {
        this.say('Apply or discard pending clip/lane settings before selecting another item.');
        return false;
    } if (!this.session)
        return false; if (this.structurePanel && !this.structurePanel.clear())
        return false; this.laneFocus = !clip; this.session.selectedLane = lane; this.session.selectedClip = clip; this.renderSelection(true); this.timeline?.selection(lane, clip); return true; }
    /** Structure panel callback: a section/marker/reference selection replaces the clip/lane context (ephemeral). */
    private structureSelected(kind: string | undefined): void { const session = this.session; if (!session)
        return; if (kind) {
        session.selectedClip = undefined;
        this.laneFocus = false;
        this.timeline?.selection(session.selectedLane, undefined);
        this.renderRegister();
    } this.placeContext(); }
    /** Shows exactly one inspector context. Moves (never duplicates) the lane manager and routing form so their state and labels are preserved. */
    private placeContext(): void { const ctx = this.context, session = this.session; if (!ctx || !session || !this.inspector)
        return; const structure = this.structurePanel?.selection, kind = structure ? 'structure' : session.selectedClip ? 'clip' : this.laneFocus && session.selectedLane ? 'lane' : 'none';
        this.contextKind = kind; ctx.empty.hidden = kind !== 'none'; this.inspector.hidden = kind !== 'clip'; ctx.structure.hidden = kind !== 'structure'; ctx.lane.hidden = kind !== 'lane';
        ctx.header.textContent = kind === 'none' ? 'Inspector' : `Inspector · ${kind === 'structure' ? structure?.kind === 'reference' ? 'Recording reference' : structure?.kind === 'section' ? 'Section' : 'Marker' : kind === 'clip' ? 'Clip' : 'Lane'}`;
        const routing = this.performancePanel?.routing;
        if (kind === 'lane') {
            const c = session.draft, lane = c.data.lanes.find(l => l.id === session.selectedLane), index = c.data.lanes.findIndex(l => l.id === session.selectedLane);
            const facts = ctx.lane.querySelector<HTMLElement>('.mnemobard-context-facts') ?? element(ctx.lane, 'dl', undefined, 'mnemobard-context-facts');
            ctx.lane.prepend(facts); facts.replaceChildren();
            if (lane) for (const [term, detail] of [['Lane', `${index + 1}. ${lane.name}`], ['Clips', String(lane.clips.length)], ['Routing', lane.midiChannel === undefined ? 'Auto (derived at compile)' : `Channel ${lane.midiChannel + 1}${lane.percussion ? ' · percussion' : ''} (explicit)`], ['Compiled channel', this.performancePanel?.compiledChannel(lane.id) ?? 'Not compiled']] as const) { element(facts, 'dt', term); element(facts, 'dd', detail); }
            if (this.laneRoot && this.laneRoot.parentElement !== ctx.lane) ctx.lane.append(this.laneRoot);
            const laneRoot = this.laneRoot, details = laneRoot?.querySelector('details'); if (laneRoot && details && laneRoot.dataset.context !== 'true') { laneRoot.dataset.wasOpen = String(details.open); laneRoot.dataset.context = 'true'; details.open = true; }
            if (routing && lane) { this.performancePanel?.routeLane(lane.id); if (routing.parentElement !== ctx.lane) ctx.lane.append(routing); }
        }
        else {
            if (this.laneRoot && this.laneHome && this.laneRoot.parentElement === ctx.lane) { this.laneHome.before(this.laneRoot); const details = this.laneRoot.querySelector('details'); if (details) details.open = this.laneRoot.dataset.wasOpen === 'true'; delete this.laneRoot.dataset.context; }
            if (routing && this.routeHome && routing.parentElement === ctx.lane) this.routeHome.after(routing);
        } }
    /** Documented CANVAS keys; never with modifiers (no Obsidian conflicts) and never while typing in a field. */
    private keyboard(e: KeyboardEvent): void { if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !this.session)
        return; const target = e.target instanceof HTMLElement ? e.target : undefined; if (target?.closest('input,textarea,select,[contenteditable="true"],.modal'))
        return; const steps: Record<string, () => void> = { '[': () => this.structurePanel?.step('section', -1), ']': () => this.structurePanel?.step('section', 1), ',': () => this.structurePanel?.step('marker', -1), '.': () => this.structurePanel?.step('marker', 1) };
        const step = steps[e.key]; if (step) {
        e.preventDefault();
        if (this.hasPending()) { this.say('Apply or discard pending properties before navigating.'); return; }
        step();
        return;
    } if (e.key === 'Escape') {
        // Always consumed inside CANVAS (as in 4C): an unhandled Escape reaches Obsidian and moves the active leaf away.
        e.preventDefault();
        e.stopPropagation();
        if (this.contextKind !== 'none')
            this.clearSelection();
    } }
    /** Escape: back to the empty inspector; focus returns to the timeline. No data or history change. */
    private clearSelection(): void { const session = this.session; if (!session)
        return; if (this.hasPending()) {
        this.say('Apply or discard pending properties first.');
        return;
    } if (this.structurePanel && !this.structurePanel.clear())
        return; session.selectedClip = undefined; this.laneFocus = false; this.renderSelection(true); this.timeline?.canvas.focus(); }
    private chooseMotif(laneId = this.session?.selectedLane, start = 0): void { if (this.hasPending()) {
        this.say('Apply or discard pending properties before placement.');
        return;
    } const session = this.session, s = this.available; if (!session || !s)
        return; if (!laneId) {
        this.say('Add/select a lane before placing a motif.');
        return;
    } this.picker?.close(); this.picker = new ArrangementMotifPicker(this.app, s.canvas, session, laneId, start, () => { session.selectedLane = laneId; session.selectedClip = session.draft.data.lanes.find(l => l.id === laneId)?.clips.at(-1)?.id; this.refreshScene(); this.renderSelection(true); }); openModal(this.contentEl, this.picker, t => this.say(t)); }
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
    /** 4F: the selected clip's source motif and sound associations (read-only lookups; navigating away checkpoints the draft). */
    private renderClipSources(c: Composition): void {
        const s = this.available, session = this.session, root = this.inspector, id = session?.selectedClip; if (!s || !session || !root || !id)
            return;
        const lane = c.data.lanes.find(l => l.clips.some(x => x.id === id)), clip = lane?.clips.find(x => x.id === id); if (!lane || !clip)
            return;
        const lookup = new ReferenceLookup(s.index), box = element(root, 'section', undefined, 'mnemobard-ref-group'); box.setAttribute('aria-label', 'Source and sound'); element(box, 'h4', 'Source and sound');
        const source = s.canvas.sources.get(clip.motifId), notes = this.plan?.diagnostics.filter(d => d.clipId === id && ['changed', 'unreviewed', 'unsaved-source', 'moved'].includes(d.code)).map(d => diagnosticText(d)) ?? [];
        const motif = lookup.describe(clip.motifId, 'motif'), library = (target: string) => ({ label: 'Open in PATCHBOOK', run: () => { void this.openPatchbook(target).catch(e => this.fail(e)); } });
        referenceRow(box, 'Motif', motif, { label: 'Open in MOTIF', run: () => { void this.openMotif(clip.motifId).catch(e => this.fail(e)); } }, notes.length ? notes.join(' ') : source.status === 'ready' ? `${source.source.noteCount} notes` : undefined);
        const sound = (patchId: string, role: string): void => {
            const patch = lookup.describe(patchId, 'patch'); referenceRow(box, role, patch, library(patchId));
            if (patch.status !== 'ready' && patch.status !== 'archived')
                return;
            const state = s.index.resolve(patchId); if (state.status !== 'ready' || state.entity.kind !== 'patch')
                return;
            if (state.entity.instrumentId) referenceRow(box, 'Instrument', lookup.describe(state.entity.instrumentId, 'instrument'), library(state.entity.instrumentId));
            else if (state.entity.instrument) element(box, 'p', `Instrument (text only): ${state.entity.instrument}`, 'mnemobard-hint');
            for (const chain of state.entity.effectsChainIds ?? []) referenceRow(box, 'Effects chain', lookup.describe(chain, 'effects-chain'), library(chain));
        };
        const motifPatch = motif.status === 'ready' || motif.status === 'archived' ? s.index.outgoing(clip.motifId)[0] : undefined;
        if (motifPatch) sound(motifPatch, 'Motif patch');
        else if (motif.status === 'ready') element(box, 'p', 'This motif has no PATCHBOOK sound association. Associate one in MOTIF.', 'mnemobard-hint');
        if (lane.patchId) sound(lane.patchId, 'Lane patch');
        element(box, 'p', 'Sound associations are context only: sine audition and MIDI export do not reproduce PATCHBOOK sounds.', 'mnemobard-hint');
    }
    private async openPatchbook(id: string): Promise<void> { await this.leave(); const s = this.available; if (!s)
        return; if (!s.modules.enabled('patchbook')) { const state = s.index.resolve(id); if (state.status === 'ready') this.openMarkdown(state.path); return; }
        await navigateTo(this.app, s, 'canvas', 'patchbook', id); }
    private async openMotif(id: string): Promise<void> { await this.leave(); const s = this.available; if (!s)
        return; const source = s.index.resolve(id); if (source.status !== 'ready' || source.entity.kind !== 'motif')
        throw Error(`Source is ${source.status}; clip remains. Inspect/restore the original note.`); if (!s.modules.enabled('motif')) {
        this.openMarkdown(source.path);
        return;
    } // 4E: verified navigation (latest request wins, bounded, displayed UUID checked); failures surface here, CANVAS stays as is.
        await s.navigation.navigate('canvas', 'motif', id, { enabled: () => s.modules.enabled('motif'), open: () => s.modules.open('motif'), view: async () => { const leaf = this.app.workspace.getLeavesOfType('mnemobard-motif')[0]; await leaf?.loadIfDeferred(); return leaf?.view instanceof MotifView ? leaf.view : undefined; } }); }
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
    override async setState(value: unknown): Promise<void> { const target = value && typeof value === 'object' ? String((value as Record<string, unknown>).selectedId ?? '') : ''; this.foundation()?.navigation.note({ request: 0, phase: this.revealing ? 'host-state-deferred' : 'host-state', from: 'canvas', to: 'canvas', target }); if (this.revealing)
        return; await this.applyState(value); }
    private async applyState(value: unknown): Promise<void> { if (!value || typeof value !== 'object')
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
