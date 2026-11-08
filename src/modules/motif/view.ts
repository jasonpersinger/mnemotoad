import { Notice, Scope, type WorkspaceLeaf } from 'obsidian';
import { openModal } from '../../ui/modal-host';
import type { FoundationServices } from '../../application/services';
import type { Motif } from '../../domain/entities';
import { FoundationError, messageOf } from '../../domain/errors';
import { ModuleView } from '../../ui/module-view';
import { element, button } from '../../ui/dom';
import { moduleHeader, recordActions } from '../../ui/page';
import { RecoveryInspector, openModuleRecovery, recoveryLinks } from '../../ui/recovery-inspector';
import { compileSequence } from '../../music/compiler';
import { TempoMap } from '../../music/timing';
import { addNote, deleteNotes, duplicateNotes, editableMotif, gridTicks, moveNotes, sealedMotif, type Grid } from './commands';
import type { MotifSession } from './session';
import { PianoRoll } from './piano-roll';
import { NoteInspector } from './inspector';
import { MidiImportDialog, MidiExportDialog } from './midi-dialog';
import { PatchAssociation } from './patch-association';
import { transformPanel } from './transform-panel';
import { PatchbookView } from '../patchbook/view';
import { ReadyGate, type NavigationNote } from '../../application/navigation';
import { navigateTo } from '../../ui/navigate';
import { MotifLinks } from './sound-panel';

export class MotifView extends ModuleView {
  private active = false; private epoch = 0; private lifetime = new AbortController(); private cleanups: (() => void)[] = [];
  private session?: MotifSession; private unsubscribeSession?: () => void; private roll?: PianoRoll; private inspector?: NoteInspector;
  private search = ''; private selectedId?: string; private page = 0;
  private browser?: HTMLElement; private editor?: HTMLElement; private feedback?: HTMLElement; private drafts?: HTMLElement; private browserDetails?: HTMLDetailsElement;
  private saveStatus?: HTMLElement; private position?: HTMLElement; private undoButton?: HTMLButtonElement; private redoButton?: HTMLButtonElement; private historyDepth?: HTMLElement;
  private editorScope?: Scope;
  private midiDialog?: MidiImportDialog | MidiExportDialog; private patchAssociation?: PatchAssociation; private links?: MotifLinks;
  private recoveryPanel?: RecoveryInspector<Motif, MotifSession>; private recoveryRoot?: HTMLElement;
  private tickMap?: TempoMap; private animation?: number; private noteOrder?: { session: MotifSession; version: number; notes: Motif['data']['notes'] }; private statusKey = ''; private statusSession?: MotifSession;
  constructor(leaf: WorkspaceLeaf, private readonly foundation: () => FoundationServices | undefined) { super(leaf, 'motif', foundation); this.scope = new Scope(this.app.scope); }
  private get available(): FoundationServices | undefined { const services = this.foundation(); return services?.modules.enabled('motif') ? services : undefined; }
  /** 4E navigation readiness: open once onOpen (including any restored selection) has finished. */
  private readonly ready = new ReadyGate();
  private revealing = 0;
  override async onOpen(): Promise<void> { this.ready.reset(); try { await this.openView(); } finally { this.ready.open(); } }
  private async openView(): Promise<void> {
    this.release(); this.active = true; this.lifetime = new AbortController(); const root = this.contentEl; root.replaceChildren(); root.classList.add('mnemobard-module', 'mnemobard-motif');
    const services = this.available; if (!services) { element(root, 'p', 'MOTIF is disabled. Musical notes remain in the vault.'); return; }
    const { actions } = moduleHeader(root, { className: 'mnemobard-motif-heading', eyebrow: 'MNEMOBARD / COMPOSITION APPARATUS', title: 'MOTIF', tagline: 'A place for the phrase before the piece.' });
    const create = button(actions, 'New motif', () => { void this.newMotif().catch(error => this.fail(error)); }, 'mod-cta'); create.disabled = true;
    button(actions, 'Browse motifs', () => { if (this.browserDetails) this.browserDetails.open = !this.browserDetails.open; });
    button(actions, 'Motif recovery', () => this.recovery());
    button(actions, 'Import MIDI', () => { if(services.settings.readOnly)return;this.midiDialog?.close();this.midiDialog=new MidiImportDialog(this.app,services.motifs,async session=>{await this.leave();if(this.active)this.attach(session);});openModal(this.contentEl,this.midiDialog,t=>this.say(t)); });
    this.feedback = element(root, 'p', '', 'mnemobard-feedback'); this.feedback.setAttribute('role', 'status'); this.feedback.setAttribute('aria-live', 'polite');
    this.drafts = element(root, 'div', undefined, 'mnemobard-drafts');
    this.recoveryRoot = element(root, 'section', undefined, 'mnemobard-recovery');
    this.browserDetails = element(root, 'details', undefined, 'mnemobard-motif-library'); this.browserDetails.open = !this.selectedId; element(this.browserDetails, 'summary', 'Motif library');
    const label = element(this.browserDetails, 'label'); element(label, 'span', 'Search motifs'); const search = element(label, 'input'); search.type = 'search'; search.value = this.search; search.setAttribute('aria-label', 'Search motifs');
    search.addEventListener('input', () => { this.search = search.value; this.page = 0; this.renderBrowser(); this.remember(); });
    this.browser = element(this.browserDetails, 'div'); this.editor = element(root, 'section', undefined, 'mnemobard-motif-editor'); this.editor.setAttribute('aria-label', 'Motif editor');
    root.ownerDocument.defaultView?.addEventListener('blur', () => services.musical.stop(this), { signal: this.lifetime.signal });
    root.ownerDocument.defaultView?.addEventListener('pagehide', () => services.musical.stop(this), { signal: this.lifetime.signal });
    root.ownerDocument.addEventListener('visibilitychange', () => { if (root.ownerDocument.hidden) services.musical.stop(this); }, { signal: this.lifetime.signal });
    this.cleanups.push(services.index.subscribe(() => { if (this.active) { this.renderBrowser(); this.updateStatus(); this.patchAssociation?.refresh(); const s = this.session; if (s && !s.disposed) this.links?.refresh(s.draft); } }), services.musical.subscribe(() => { if (this.active) { this.updateTransport(); this.roll?.request(); } }));
    const scope = new Scope(this.scope ?? this.app.scope); this.editorScope = scope;
    const focusScope = (): void => {
      queueMicrotask(() => {
        if (!this.active) return;
        this.app.keymap.popScope(scope);
        if (this.editor?.contains(root.ownerDocument.activeElement)) this.app.keymap.pushScope(scope);
      });
    };
    root.addEventListener('focusin', focusScope, { signal: this.lifetime.signal });
    root.addEventListener('focusout', focusScope, { signal: this.lifetime.signal });
    if (scope) {
      const register = (modifiers: ('Mod' | 'Shift')[], key: string, callback: () => boolean): void => { const handler = scope.register(modifiers, key, () => { const result = callback(); if (!result) focusScope(); return result; }); this.cleanups.push(() => scope.unregister(handler)); };
      register(['Mod'], 's', () => { if (!this.editor?.contains(this.contentEl.ownerDocument.activeElement) || !this.session) return true; void this.save(); return false; });
      register(['Mod'], 'z', () => { if (!this.noteContext()) return true; this.act(() => this.session?.undo()); return false; });
      for (const [modifiers, key] of [[['Mod', 'Shift'], 'z'], [['Mod'], 'y']] as const) register([...modifiers], key, () => { if (!this.noteContext()) return true; this.act(() => this.session?.redo()); return false; });
      for (const key of ['Delete', 'Backspace']) register([], key, () => { if (!this.noteContext()) return true; this.removeNotes(); return false; });
      register(['Mod'], 'a', () => { if (!this.noteContext() || !this.session) return true; this.session.select(this.session.draft.data.notes.map(note => note.id)); this.selectionChanged(); return false; });
      for (const [key, ticks, pitch] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, 1], ['ArrowDown', 0, -1]] as const) register([], key, () => {
        if (!this.noteContext() || !this.session || !this.roll) return true;
        if (this.contentEl.ownerDocument.activeElement !== this.roll.canvas) this.navigateNote(key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1);
        else this.act(() => this.session?.edit('Nudge notes', motif => moveNotes(motif, this.session?.selected ?? new Set(), ticks * gridTicks(motif.data.ppq, this.roll?.grid ?? 'off'), pitch, sealedMotif)));
        return false;
      });
    }
    this.renderBrowser(); this.renderEditor(); const epoch = this.epoch;
    try { await services.index.start(); if (!this.active) return; create.disabled = services.settings.readOnly; this.renderBrowser(); if (this.selectedId && epoch === this.epoch) await this.select(this.selectedId); }
    catch (error) { this.fail(error); }
  }
  private noteContext(): boolean { const target = this.contentEl.ownerDocument.activeElement; return !!this.session && !!this.editor?.contains(target) && target instanceof HTMLElement && !target.matches('input,textarea,select,[contenteditable="true"]'); }
  private say(message: string): void { if (this.active && this.feedback) this.feedback.textContent = message; }
  private fail(error: unknown): void { this.say(messageOf(error)); }
  private remember(): void { if (this.active) this.app.workspace.requestSaveLayout(); }
  private renderBrowser(): void {
    const root = this.browser, services = this.available; if (!root || !services || !this.active) return; root.replaceChildren();
    const items = services.motifs.listing(this.search); element(root, 'p', `${items.length} motifs · stable identities, ordinary notes`, 'mnemobard-hint');
    for (const item of items.slice(this.page * 100, this.page * 100 + 100)) {
      const row = element(root, 'div', undefined, 'mnemobard-motif-entry');
      const open = button(row, `${item.title}${item.ambiguous ? ' · duplicate identity' : ''}`, () => { void this.select(item.id).catch(error => this.fail(error)); }); open.disabled = item.ambiguous; open.dataset.motifId = item.id; open.title = item.title;
      button(row, 'Markdown', () => this.openNote(item.path));
    }
    if (!items.length) element(root, 'p', 'No matching motifs. Create a phrase to begin.');
    if (this.page) button(root, 'Previous motifs', () => { this.page--; this.renderBrowser(); });
    if ((this.page + 1) * 100 < items.length) button(root, 'More motifs', () => { this.page++; this.renderBrowser(); });
    for (const entry of services.index.heads().filter(entry => entry.errorCode).slice(0, 10)) { element(root, 'p', `${entry.path}: ${entry.message}`, 'mnemobard-library-issues'); button(root, 'Open uneditable source', () => this.openNote(entry.path)); }
    this.renderDrafts();
  }
  private renderDrafts(): void {
    const root = this.drafts, services = this.available; if (!root || !services) return; root.replaceChildren(); const drafts = services.motifs.drafts();
    if (drafts.length) element(root, 'span', 'Pending phrases: ');
    for (const draft of drafts) button(root, draft.draftTitle || 'Untitled motif draft', () => { void this.leave().then(() => { if (this.active) this.attach(draft); }).catch(error => this.fail(error)); });
  }
  private async leave(): Promise<void> { this.available?.musical.stop(this); this.roll?.cancelGesture(); if (this.session && !this.session.disposed && this.session.dirty) await this.session.checkpoint(); }
  private async newMotif(): Promise<void> { await this.leave(); if (!this.active || this.available?.settings.readOnly) return; const session = this.available?.motifs.create(); if (session) this.attach(session); }
  private async select(id: string): Promise<void> {
    await this.leave(); const services = this.available; if (!services || !this.active) return;
    if (services.settings.readOnly) { this.fail(services.settings.diagnostic ?? Error('Settings are read-only.')); return; }
    const epoch = ++this.epoch;
    try { const session = await services.motifs.open(id, this.lifetime.signal); if (this.active && epoch === this.epoch) this.attach(session); }
    catch (error) { if (this.active && epoch === this.epoch) { this.unsubscribeSession?.(); this.unsubscribeSession = undefined; if(this.session)this.foundation()?.motifs.release(this.session,this);this.session = undefined; this.selectedId = id; this.renderEditor(); this.fail(error); } }
  }
  private attach(session: MotifSession): void {
    this.available?.musical.stop(this); this.epoch++; this.unsubscribeSession?.(); if(this.session)this.foundation()?.motifs.release(this.session,this);this.session = session;this.available?.motifs.retain(session,this); this.selectedId = session.draft.id;
    // 4G: one draft snapshot per publish, shared by every panel; musical change is detected by the session's change version
    // (incremented on every edit, undo, redo and reload) instead of serialising the whole draft on each publish.
    let lastVersion = session.changeVersion;
    this.unsubscribeSession = session.subscribe(() => { if (this.active) { const draft=session.snapshot; if (session.changeVersion !== lastVersion) { this.available?.musical.stop(this); lastVersion = session.changeVersion; } this.updateStatus(draft); this.renderDrafts(); this.inspector?.refresh(draft); this.patchAssociation?.refresh(draft); this.links?.refresh(draft); this.tickMap = new TempoMap(draft.data.ppq, [{ tick: 0, microsecondsPerQuarter: draft.data.tempoMicrosecondsPerQuarter }]); } });
    if (this.browserDetails) this.browserDetails.open = false; this.renderEditor(); this.renderDrafts(); this.say(''); this.remember();
  }
  private act(action: () => void): boolean { try { this.available?.musical.stop(this); action(); this.selectionChanged(); this.say(''); return true; } catch (error) { this.fail(error); return false; } }
  private selectionChanged(): void { this.inspector?.refresh(); this.roll?.refreshSelection(); this.updateStatus(); }
  private openNote(path: string): void { void this.app.workspace.openLinkText(path, '', true).catch(error => this.fail(error)); }
  private renderEditor(): void {
    this.roll?.dispose(); this.roll = undefined; this.inspector = undefined; this.patchAssociation = undefined; this.links = undefined;
    const root = this.editor, services = this.available; if (!root || !services || !this.active) return; root.replaceChildren();
    const session = this.session;
    if (!session) { element(root, 'h3', 'Remember a phrase.'); element(root, 'p', this.selectedId ? 'This motif is unavailable or read-only. Inspect its source in the library.' : 'Create or open a motif. Notes, timing and context stay in your vault.', 'mnemobard-hint'); if (this.selectedId) { const state = services.index.resolve(this.selectedId); if (state.status === 'invalid') button(root, 'Open original motif source', () => this.openNote(state.entry.path)); if (state.status === 'duplicate') for (const path of state.paths) button(root, `Inspect duplicate: ${path}`, () => this.openNote(path)); if (state.status === 'ready') button(root, 'Open original motif source', () => this.openNote(state.path)); } return; }
    const motif = session.draft; // 4G: the one draft snapshot every panel of this render reads (no per-panel clones)
    const header = element(root, 'div', undefined, 'mnemobard-score-heading');
    const name = this.text(header, 'Motif name', motif.title, value => session.edit('Rename motif', next => ({ ...next, title: value }), 'title')); name.classList.add('mnemobard-motif-name');
    this.saveStatus = element(header, 'p', session.status, 'mnemobard-save-status'); this.saveStatus.setAttribute('role', 'status');
    const actions = element(header, 'div', undefined, 'mnemobard-actions');
    button(actions, 'Save motif', () => { void this.save(); }, 'mod-cta');
    button(actions,'Export MIDI',()=>{if(this.editor?.querySelector('form[data-pending="true"]')){this.say('Apply or discard pending properties before choosing an export snapshot.');return;}this.midiDialog?.close();this.midiDialog=new MidiExportDialog(this.app,services.motifs,session,async()=>{const record=await services.repository.read(session.draft.id);if(record.entity.kind!=='motif')throw Error('Expected a saved motif.');return record.entity;},services.settings.current.creationRoot);openModal(this.contentEl,this.midiDialog,t=>this.say(t));});
    // 4J: secondary and destructive document actions in one disclosure (labels and handlers unchanged).
    const more = recordActions(actions);
    if (session.base) { button(more, 'Open Markdown record', () => { const state = services.index.resolve(motif.id); if (state.status === 'ready') this.openNote(state.path); }); button(more, 'Reload saved motif', () => { if (session.dirty) this.say('Save or explicitly discard this draft before reloading. Recovery is retained.'); else void this.select(motif.id).catch(error => this.fail(error)); }); }
    const discard = button(more, 'Discard draft…', () => {
      const confirm = element(root, 'div', undefined, 'mnemobard-confirm'); header.after(confirm); more.open = false; element(confirm, 'p', 'Discard the working draft and its undo history? Saved notes and checkpoints are retained.'); // 4J: shown where the action was chosen
      button(confirm, 'Keep editing', () => confirm.remove()); button(confirm, 'Confirm discard', () => { services.musical.stop(this); services.motifs.discard(session); this.unsubscribeSession?.(); this.session = undefined; this.renderEditor(); this.renderDrafts(); if (session.base) void this.select(motif.id).catch(error => this.fail(error)); });
    }); discard.classList.add('mnemobard-destructive');
    const transport = element(root, 'div', undefined, 'mnemobard-motif-transport');
    button(transport, 'Play motif', () => { void this.play(); }, 'mod-cta'); button(transport, 'Stop motif', () => services.musical.stop(this));
    this.position = element(transport, 'span', 'Stopped · 0:00'); this.position.setAttribute('aria-label', 'Musical playback position');
    element(transport, 'small', 'SINE / audition only · no patch hosting');
    this.musicalSettings(root, session, motif);
    // 4H: one toolbar with labelled groups (was three rows plus an instruction paragraph); same controls, labels and shortcuts.
    const toolbar = element(root, 'div', undefined, 'mnemobard-motif-toolbar'); toolbar.setAttribute('aria-label', 'Note editing toolbar');
    const group = (label: string): HTMLElement => { const g = element(toolbar, 'div', undefined, 'mnemobard-tool-group'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label); return g; };
    const drawing = group('Grid and drawing'), editing = group('Note editing'), view = group('Zoom and navigation');
    const grid = this.selectControl(drawing, 'Editing grid', [['quarter', '1/4'], ['eighth', '1/8'], ['sixteenth', '1/16'], ['triplet', '1/8 triplet'], ['off', 'Snap off']], 'sixteenth', value => { if (this.roll) this.roll.grid = value as Grid; this.roll?.request(); });
    const mode = this.selectControl(drawing, 'Editing mode', [['draw', 'Draw'], ['select', 'Select']], 'draw', value => { if (this.roll) this.roll.mode = value === 'draw' ? 'draw' : 'select'; });
    const duration = this.selectControl(drawing, 'New note duration', [['.25','1/16'], ['.5','1/8'], ['1','1/4'], ['2','1/2'], ['4','Whole']], '.5', value => { if (this.roll) this.roll.durationQuarters = Number(value); });
    button(editing, 'Add note', () => this.act(() => {
      const current = session.snapshot, selected = current.data.notes.find(note => session.selected.has(note.id)), tick = selected ? selected.startTick + selected.durationTicks : 0;
      let id = ''; session.edit('Add note', value => { const next = addNote(value, { pitch: selected?.pitch ?? 60, startTick: tick, durationTicks: value.data.ppq * Number(duration.value), velocity: 96 }, sealedMotif); id = next.data.notes.at(-1)?.id ?? ''; return next; }); session.select([id]);
    }));
    this.undoButton = button(editing, 'Undo', () => this.act(() => session.undo())); this.redoButton = button(editing, 'Redo', () => this.act(() => session.redo()));
    this.historyDepth = element(editing, 'span', '', 'mnemobard-history-depth'); this.historyDepth.setAttribute('aria-label', 'Undo history'); // 4I: retained depth, read-only
    button(editing, 'Delete selected', () => this.removeNotes());
    const selectionTools=element(editing,'details',undefined,'mnemobard-selection-tools');element(selectionTools,'summary','Selection actions');
    button(selectionTools, 'Duplicate selected', () => this.act(() => { const copy = duplicateNotes(session.snapshot, session.selected, sealedMotif); session.edit('Duplicate notes', () => copy.motif); session.select(copy.ids); }));
    button(selectionTools, 'Clear selection', () => { session.select([]); this.selectionChanged(); });
    button(view, 'Time −', () => this.roll?.zoom(1 / 1.25)); button(view, 'Time +', () => this.roll?.zoom(1.25)); button(view, 'Pitch −', () => this.roll?.zoomPitch(1 / 1.15)); button(view, 'Pitch +', () => this.roll?.zoomPitch(1.15));
    button(view, 'Previous note', () => this.navigateNote(-1)); button(view, 'Next note', () => this.navigateNote(1));
    transformPanel(toolbar,session,action=>this.act(action));
    const gestures = element(toolbar, 'details', undefined, 'mnemobard-roll-gestures'); element(gestures, 'summary', 'Roll gestures and keys');
    element(gestures, 'p', 'Click empty grid to draw. Drag notes; pull the right edge to resize. Shift-click selects a group. Shift-wheel scrolls time; Ctrl-wheel zooms. Exact ticks stay unchanged when the grid changes.', 'mnemobard-roll-instructions');
    const surface = element(root, 'div', undefined, 'mnemobard-roll-surface');
    this.tickMap = new TempoMap(motif.data.ppq, [{ tick: 0, microsecondsPerQuarter: motif.data.tempoMicrosecondsPerQuarter }]);
    this.roll = new PianoRoll(surface, session, motif, () => this.selectionChanged(), message => this.say(message), () => services.musical.ownedBy(this) && services.musical.state === 'playing' ? this.tickMap?.secondsToTicks(services.musical.position, this.roll?.viewport.ppq ?? motif.data.ppq) : undefined);
    this.roll.grid = grid.value as Grid; this.roll.mode = mode.value === 'draw' ? 'draw' : 'select';
    const inspector = element(root, 'section', undefined, 'mnemobard-note-inspector');
    this.inspector = new NoteInspector(inspector, session, () => { services.musical.stop(this); this.selectionChanged(); }, (id, additive) => {
      const selected = new Set(additive ? session.selected : []); if (additive && selected.has(id)) selected.delete(id); else selected.add(id); session.select(selected); this.selectionChanged(); const note = this.orderedNotes(session).find(note => note.id === id); if (note) this.roll?.reveal(note);
    }, error => this.fail(error)); this.inspector.refresh(motif);
    const patchRoot=element(root,'section');this.patchAssociation=new PatchAssociation(patchRoot,services,session,action=>this.act(action),id=>{void this.navigatePatch(id).catch(error=>this.fail(error));},motif);
    this.links=new MotifLinks(patchRoot,services,id=>{void this.openLibrary(id).catch(error=>this.fail(error));},(id,motifId)=>{void this.openCanvas(id,motifId).catch(error=>this.fail(error));});this.links.refresh(motif);
    const metadata = element(root, 'details'); element(metadata, 'summary', 'Description, tags and notes');
    this.text(metadata, 'Description', motif.description ?? '', value => session.edit('Edit description', next => ({ ...next, description: value.trim() ? value : undefined }), 'description'), true);
    this.text(metadata, 'Motif tags', motif.tags?.join(', ') ?? '', value => session.edit('Edit tags', next => ({ ...next, tags: value.split(',').map(tag => tag.trim()).filter(Boolean) }), 'tags'));
    this.text(metadata, 'User notes', motif.notes ?? '', value => session.edit('Edit user notes', next => ({ ...next, notes: value.trim() ? value : undefined }), 'notes'), true);
    if (session.recoveryPath) button(root, 'Inspect motif recovery', () => this.recovery());
    this.updateStatus(motif); this.updateTransport();
  }
  private text(parent: HTMLElement, label: string, value: string, change: (value: string) => void, multiline = false): HTMLInputElement | HTMLTextAreaElement {
    const wrapper = element(parent, 'label'); element(wrapper, 'span', label); const input = multiline ? element(wrapper, 'textarea') : element(wrapper, 'input'); input.value = value; input.setAttribute('aria-label', label);
    input.addEventListener('input', () => { try { this.available?.musical.stop(this); change(input.value); } catch (error) { this.fail(error); } }); return input;
  }
  private selectControl(parent: HTMLElement, label: string, options: string[][], initial: string, change: (value: string) => void): HTMLSelectElement {
    const wrapper = element(parent, 'label'); element(wrapper, 'span', label); const select = element(wrapper, 'select'); select.setAttribute('aria-label', label);
    for (const [value, text] of options) { const option = element(select, 'option', text); option.value = value ?? ''; } select.value = initial; select.addEventListener('change', () => change(select.value)); return select;
  }
  private musicalSettings(root: HTMLElement, session: MotifSession, motif: Motif): void {
    const details = element(root, 'details', undefined, 'mnemobard-score-settings');
    element(details, 'summary', `Musical settings · ${(60000000 / motif.data.tempoMicrosecondsPerQuarter).toFixed(1)} BPM · ${motif.data.meter.numerator}/${motif.data.meter.denominator} · PPQ ${motif.data.ppq}`);
    const form = element(details, 'form', undefined, 'mnemobard-musical-settings'); const fields = new Map<string, HTMLInputElement>();
    for (const [label, value, min, max] of [['Tempo BPM', 60000000 / motif.data.tempoMicrosecondsPerQuarter, 20, 300], ['Meter numerator', motif.data.meter.numerator, 1, 32], ['Meter denominator', motif.data.meter.denominator, 1, 32], ['PPQ', motif.data.ppq, 1, 32767], ['Length ticks', motif.data.lengthTicks, 1, 1e9]] as const) {
      const wrapper = element(form, 'label'); element(wrapper, 'span', label); const input = element(wrapper, 'input'); input.type = 'number'; input.min = String(min); input.max = String(max); input.step = label === 'Tempo BPM' ? 'any' : '1'; input.required = true; input.value = String(value); input.setAttribute('aria-label', label); fields.set(label, input); if (label === 'PPQ' && motif.data.notes.length) input.disabled = true;
    }
    const apply = element(form, 'button', 'Apply musical settings'); apply.type = 'submit';
    const pending = element(form, 'span'); pending.setAttribute('role', 'status');
    form.addEventListener('input', () => { form.dataset.pending = 'true'; pending.textContent = 'Unapplied musical settings'; });
    button(form, 'Discard settings changes', () => { delete form.dataset.pending; pending.textContent = ''; this.updateStatus(undefined, true); });
    form.addEventListener('submit', event => { event.preventDefault(); const applied = this.act(() => session.edit('Change musical settings', value => {
      const bpm = Number(fields.get('Tempo BPM')?.value), ppq = Number(fields.get('PPQ')?.value);
      if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) throw Error('Tempo must be20..300 BPM.');
      if (ppq !== value.data.ppq && value.data.notes.length) throw Error('PPQ can change only on an empty motif; existing source ticks remain exact.');
      return { ...value, data: { ...value.data, ppq, tempoMicrosecondsPerQuarter: Math.round(60000000 / bpm), meter: { ...value.data.meter, numerator: Number(fields.get('Meter numerator')?.value), denominator: Number(fields.get('Meter denominator')?.value) }, lengthTicks: Number(fields.get('Length ticks')?.value) } };
    })); if (applied) { delete form.dataset.pending; pending.textContent = ''; this.updateStatus(undefined, true); } });
    element(details, 'p', 'Apply settings explicitly. Tempo changes elapsed playback time; meter changes labels only. Existing note ticks never move. Shortening past a note is rejected. PPQ is editable only while empty.', 'mnemobard-hint');
  }
  private removeNotes(): void { const session = this.session; if (!session) return; this.act(() => session.edit('Delete notes', motif => deleteNotes(motif, session.selected, sealedMotif))); this.roll?.canvas.focus(); }
  /** 4G: notes in musical order, cached per draft change (sorting 5,000+ notes on every step dominated navigation). */
  private orderedNotes(session: MotifSession): Motif['data']['notes'] {
    if (this.noteOrder?.session !== session || this.noteOrder.version !== session.changeVersion) this.noteOrder = { session, version: session.changeVersion, notes: session.draft.data.notes.slice().sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch) };
    return this.noteOrder.notes;
  }
  private navigateNote(delta: number): void {
    const session = this.session; if (!session) return;
    const notes = this.orderedNotes(session), selected = session.selected, current = notes.findIndex(note => selected.has(note.id));
    const next = notes[(current + delta + notes.length) % notes.length]; if (!next) return; session.select([next.id]); this.selectionChanged(); this.roll?.reveal(next);
    this.inspector?.focusNote(next.id);
  }
  /** `force` re-synchronises fields after a discarded form; otherwise nothing is re-read while draft, status and index are unchanged. */
  private updateStatus(snapshot?: Motif, force = false): void {
    const session = this.session; if (!session) return;
    const key = `${session.changeVersion}:${session.status}:${this.available?.index.currentRevision ?? ''}`;
    if (!force && !snapshot && key === this.statusKey && session === this.statusSession) return; this.statusKey = key; this.statusSession = session;
    const motif=snapshot??session.draft;
    if (this.saveStatus) {
      const state = this.available?.index.locate(motif.id);
      this.saveStatus.textContent = state?.status === 'duplicate' || state?.status === 'invalid' || (state?.status === 'missing' && session.base) ? `${session.status} · source ${state.status}; saving blocked` : session.status;
    }
    const settingsSummary = this.editor?.querySelector('.mnemobard-score-settings > summary'); if (settingsSummary) settingsSummary.textContent = `Musical settings · ${(60000000 / motif.data.tempoMicrosecondsPerQuarter).toFixed(1)} BPM · ${motif.data.meter.numerator}/${motif.data.meter.denominator} · PPQ ${motif.data.ppq}`;
    if (this.undoButton) this.undoButton.disabled = !session.canUndo; if (this.redoButton) this.redoButton.disabled = !session.canRedo;
    if (this.historyDepth) { const redo = session.canRedo ? session.redoSize : 0; this.historyDepth.textContent = `${session.historySize} undo · ${redo} redo`; this.historyDepth.title = `Undo history keeps at most 100 steps within an estimated 16 MiB (now ≈ ${(session.historyBytes / 1048576).toFixed(1)} MiB; shared notes are counted once).`; }
    const values: Record<string, string> = { 'Motif name': motif.title, 'Description': motif.description ?? '', 'Motif tags': motif.tags?.join(', ') ?? '', 'User notes': motif.notes ?? '', 'Tempo BPM': String(60000000 / motif.data.tempoMicrosecondsPerQuarter), 'Meter numerator': String(motif.data.meter.numerator), 'Meter denominator': String(motif.data.meter.denominator), 'PPQ': String(motif.data.ppq), 'Length ticks': String(motif.data.lengthTicks) };
    for (const [label, value] of Object.entries(values)) { const control = this.editor?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`); if (control && control !== this.contentEl.ownerDocument.activeElement && control.closest('form')?.dataset.pending !== 'true') control.value = value; }
    const ppq = this.editor?.querySelector<HTMLInputElement>('[aria-label="PPQ"]'); if (ppq) ppq.disabled = motif.data.notes.length > 0;
  }
  /** 4E: verified navigation through the shared coordinator (latest request wins, bounded, selection checked by UUID). */
  private async navigatePatch(id:string):Promise<void>{const services=this.available;if(!services)return;const state=services.index.resolve(id);if(state.status!=='ready'||state.entity.kind!=='patch')throw Error(`Associated patch is ${state.status}; reference retained.`);await this.leave();if(!services.modules.enabled('patchbook')){this.openNote(state.path);return;}
    await services.navigation.navigate('motif','patchbook',id,{enabled:()=>services.modules.enabled('patchbook'),open:()=>services.modules.open('patchbook'),view:async()=>{const leaf=this.app.workspace.getLeavesOfType('mnemobard-patchbook')[0];await leaf?.loadIfDeferred();const view=leaf?.view;return view instanceof PatchbookView?view:undefined;}});}
  /** 4F: any PATCHBOOK record (patch, instrument, effects chain); leaving checkpoints this draft first. */
  private async openLibrary(id: string): Promise<void> { const services = this.available; if (!services) return; await this.leave(); if (!services.modules.enabled('patchbook')) { const s = services.index.resolve(id); if (s.status === 'ready') this.openNote(s.path); return; } await navigateTo(this.app, services, 'motif', 'patchbook', id); }
  /** 4F: open a composition in CANVAS and select the first clip placing this motif. */
  private async openCanvas(id: string, motifId: string): Promise<void> { const services = this.available; if (!services) return; await this.leave(); if (!services.modules.enabled('canvas')) { const s = services.index.resolve(id); if (s.status === 'ready') this.openNote(s.path); return; } await navigateTo(this.app, services, 'motif', 'canvas', id, motifId); }
  /** 4E NavigationTarget: completes only when this view displays `id`; otherwise rejects with the view's own message. */
  async reveal(id: string, signal: AbortSignal, note?: NavigationNote): Promise<void> {
    await this.ready.promise; note?.('view-ready');
    if (!this.active) throw new FoundationError('disposed', 'MOTIF closed before the motif could be shown. Nothing was selected.');
    if (signal.aborted) return;
    this.revealing++; try { await this.applyState({ selectedId: id, search: '' }); } finally { this.revealing--; }
    note?.('state-applied'); if (signal.aborted) return;
    if (!this.active) throw new FoundationError('disposed', 'MOTIF closed before the motif could be shown. Nothing was selected.');
    if (this.session?.draft.id.toLowerCase() !== id.toLowerCase()) throw new FoundationError('io', this.feedback?.textContent || 'MOTIF did not show the requested motif. Nothing else was selected.');
  }
  private async save(): Promise<void> {
    if (!this.session) return; if (this.editor?.querySelector('form[data-pending="true"]')) { this.say('Apply or discard pending note/musical properties before saving. The motif was not written.'); return; } try { await this.session.save(); if (this.active) { this.updateStatus(); this.renderBrowser(); this.say('Motif saved in the vault.'); } } catch (error) { this.fail(error); }
  }
  private async play(): Promise<void> {
    const services = this.available, session = this.session; if (!services || !session) return;
    try {
      const motif = editableMotif(session.draft), plan = compileSequence({ ppq: motif.data.ppq, lengthTicks: motif.data.lengthTicks, tempos: [{ tick: 0, microsecondsPerQuarter: motif.data.tempoMicrosecondsPerQuarter }], tracks: [{ id: motif.id, channel: motif.data.importSourceChannel ?? 0, patchId: motif.patchId, sourcePpq: motif.data.ppq, notes: motif.data.notes }] });
      await services.musical.start(this, plan); if (this.active) { this.roll?.request(); this.updateTransport(); }
    } catch (error) { this.fail(error); }
  }
  private updateTransport(): void {
    if (!this.active) return; const musical = this.available?.musical;
    if (this.position && musical) { const seconds = musical.ownedBy(this) ? musical.position : 0; this.position.textContent = `${musical.ownedBy(this) ? musical.state : 'stopped'} · ${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}${musical.diagnostic ? ' · ' + musical.diagnostic : ''}`; }
    if (musical?.ownedBy(this) && musical.state === 'playing' && this.animation === undefined) this.animation = requestAnimationFrame(() => { this.animation = undefined; this.updateTransport(); });
  }
  /** 4I: open the recovery register, optionally with one checkpoint selected (used by the other modules' registers). */
  openRecovery(path?: string): void { this.recovery(path); }
  private recovery(path?: string): void {
    const services = this.available, root = this.recoveryRoot; if (!services || !root) return; this.recoveryPanel?.dispose();
    this.recoveryPanel = new RecoveryInspector(root, { recovery: services.motifs.recovery, settings: services.settings, recover: value => services.motifs.recover(value), module: 'MOTIF', unsaved: id => services.motifs.isDirty(id),
      ...recoveryLinks(services, (module, at) => openModuleRecovery(this.app, services.modules, () => this.leave(), module, at), error => this.fail(error)) }, session => { if (this.active) { this.recoveryPanel?.dispose(); this.recoveryPanel = undefined; this.attach(session); this.say('Recovered motif loaded as an unsaved draft. Review, then explicitly Save motif.'); } }, at => this.openNote(at), path);
    button(root, 'Close motif recovery', () => { this.recoveryPanel?.dispose(); this.recoveryPanel = undefined; });
  }
  override getState(): Record<string, unknown> { return { selectedId: this.selectedId, search: this.search }; }
  /** Host restoration/state. While an explicit navigation is being applied it wins (deterministic); the call is recorded for the dev trace. */
  override async setState(value: unknown): Promise<void> {
    const target = value && typeof value === 'object' ? String((value as Record<string, unknown>).selectedId ?? '') : '';
    const navigation = this.foundation()?.navigation; navigation?.note({ request: 0, phase: this.revealing ? 'host-state-deferred' : 'host-state', from: 'motif', to: 'motif', target });
    if (this.revealing) return; await this.applyState(value);
  }
  private async applyState(value: unknown): Promise<void> { if (!value || typeof value !== 'object') return; const state = value as Record<string, unknown>; if (typeof state.search === 'string') this.search = state.search.slice(0, 1000); if (typeof state.selectedId === 'string') this.selectedId = state.selectedId; if (this.active) { const search = this.contentEl.querySelector<HTMLInputElement>('[aria-label="Search motifs"]'); if (search) search.value = this.search; this.renderBrowser(); if (this.selectedId) await this.select(this.selectedId); } }
  override release(): void {
    this.active = false; this.midiDialog?.close();this.midiDialog=undefined;if(this.session)this.foundation()?.motifs.release(this.session,this); if (this.editorScope) this.app.keymap.popScope(this.editorScope); this.editorScope = undefined; this.epoch++; this.lifetime.abort(); this.foundation()?.musical.stop(this); this.roll?.dispose(); this.roll = undefined;
    this.recoveryPanel?.dispose(); this.recoveryPanel = undefined; this.unsubscribeSession?.(); this.unsubscribeSession = undefined;
    if (this.animation !== undefined) cancelAnimationFrame(this.animation); this.animation = undefined; for (const cleanup of this.cleanups.splice(0)) cleanup(); super.release();
  }
  override async onClose(): Promise<void> { this.release(); this.contentEl.replaceChildren(); try { await this.leave(); } catch (error) { if (!this.session?.disposed) new Notice(`MOTIF checkpoint failed: ${messageOf(error)}. The working draft remains while the plugin is enabled.`); } }
}
