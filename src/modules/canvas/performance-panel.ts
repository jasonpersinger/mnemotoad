import type { App } from 'obsidian';
import { openModal } from '../../ui/modal-host';
import type { Composition } from '../../domain/entities';
import type { FoundationServices } from '../../application/services';
import type { ArrangementPreparation } from '../../arrangement/preparation';
import { auditionDiagnostic } from '../../arrangement/audition';
import { element, button } from '../../ui/dom';
import { musicalPosition, positionTick } from '../../music/positions';
import { setLaneRouting } from './commands';
import type { CanvasSession } from './session';
import { ArrangementExportDialog } from './export-dialog';

/** Editor-owned controls and ephemeral state. No authoritative musical writes. */
export class CanvasPerformancePanel {
  readonly preparation: ArrangementPreparation;
  private active = true; private lifetime = new AbortController(); private cleanups: (() => void)[] = []; private animation?: number; private dialog?: ArrangementExportDialog;
  private version: number; private base?: string; private model: Composition; private tick = 0; private wasOwner = false; private playEpoch = 0; private drafts = new Map<string, number | undefined>();
  private status: HTMLElement; private position: HTMLElement; private diagnostics: HTMLElement; private routeForm: HTMLFormElement; private laneSelect: HTMLSelectElement; private channelSelect: HTMLSelectElement; private percussion: HTMLInputElement; private routeStatus: HTMLElement; private seekInput: HTMLInputElement;
  private playButton: HTMLButtonElement; private pauseButton: HTMLButtonElement; private resumeButton: HTMLButtonElement; private exportButton: HTMLButtonElement; private compileButton: HTMLButtonElement;
  private auditionIssue?: string; private checkedInput?: string;
  constructor(toolbar: HTMLElement, secondary: HTMLElement, app: App, private readonly services: FoundationServices, private readonly session: CanvasSession, private readonly owner: object, private readonly apply: (fn: () => void, form?: HTMLFormElement) => boolean, private readonly pending: () => boolean, private readonly isCurrent: () => boolean, private readonly playhead: (tick: number | undefined) => void, private readonly navigate: (lane: string, clip?: string) => void) {
    this.preparation = services.canvas.preparation(session); this.model = session.draft; this.version = session.changeVersion; this.base = session.base?.source; this.captureDraftVersions();
    toolbar.classList.add('mnemobard-arrangement-transport');
    this.compileButton = button(toolbar, 'Compile arrangement', () => { if (this.allowed()) {this.stop();void this.preparation.prepare();} });
    this.playButton = button(toolbar, 'Play arrangement', () => { void this.play(); }, 'mod-cta');
    this.pauseButton = button(toolbar, 'Pause', () => services.musical.pause(owner));
    this.resumeButton = button(toolbar, 'Resume', () => { void this.play(true); });
    button(toolbar, 'Stop arrangement', () => this.stop());
    button(toolbar, 'Return to start', () => { void this.seek(0); });
    this.position = element(toolbar, 'span', '', 'mnemobard-arrangement-position'); this.position.setAttribute('role', 'timer');
    this.status = element(toolbar, 'span', '', 'mnemobard-arrangement-state'); this.status.setAttribute('role', 'status');

    const seek = element(secondary, 'details', undefined, 'mnemobard-arrangement-seek'); element(seek, 'summary', 'Seek / export');
    const seekForm = element(seek, 'form'), label = element(seekForm, 'label'); element(label, 'span', 'Seek (bar:beat:tick)');
    this.seekInput = element(label, 'input'); this.seekInput.value = '1:1:0'; this.seekInput.setAttribute('aria-label', 'Arrangement seek (bar:beat:tick)');
    const go = element(seekForm, 'button', 'Seek arrangement'); go.type = 'submit';
    seekForm.addEventListener('submit', e => { e.preventDefault(); try { void this.seek(positionTick(this.seekInput.value, 960, this.model.data.meter)); } catch (error) { this.say(error); } });
    this.exportButton = button(seek, 'Export arrangement MIDI', () => {
      if (!this.allowed()) return;
      this.dialog?.close(); this.dialog = new ArrangementExportDialog(app, this.preparation, services.settings.current.creationRoot, () => this.allowed() && this.preparation.state === 'ready',()=>this.active); openModal(this.status, this.dialog, t => this.say(t));
    });
    const routing = element(secondary, 'details', undefined, 'mnemobard-arrangement-routing'); element(routing, 'summary', 'MIDI routing');
    element(routing, 'p', 'Auto is derived, not saved as a channel. Explicit assignments stay unique. Note-only sharing requires matching patch context and separated same-pitch track lifetimes; channel10 is percussion. PATCHBOOK sounds are not reproduced.', 'mnemobard-hint');
    this.routeForm = element(routing, 'form');
    const laneLabel = element(this.routeForm, 'label'); element(laneLabel, 'span', 'Lane'); this.laneSelect = element(laneLabel, 'select'); this.laneSelect.setAttribute('aria-label', 'Routing lane');
    const channelLabel = element(this.routeForm, 'label'); element(channelLabel, 'span', 'MIDI channel'); this.channelSelect = element(channelLabel, 'select'); this.channelSelect.setAttribute('aria-label', 'Lane MIDI channel');
    element(this.channelSelect, 'option', 'Auto · verified allocation').value = ''; for (let i = 0; i < 16; i++) element(this.channelSelect, 'option', `${i + 1}${i === 9 ? ' · percussion' : ''}`).value = String(i);
    const percussionLabel = element(this.routeForm, 'label',undefined,'mnemobard-route-percussion'); this.percussion = element(percussionLabel, 'input'); this.percussion.type = 'checkbox'; this.percussion.setAttribute('aria-label', 'Percussion on channel10'); element(percussionLabel, 'span', 'Percussion (explicit channel10)');
    const routeApply = element(this.routeForm, 'button', 'Apply lane routing'); routeApply.type = 'submit';
    button(this.routeForm, 'Discard routing changes', () => { delete this.routeForm.dataset.pending; this.routeStatus.textContent = ''; this.routingValues(); this.statusUpdate(); });
    this.routeStatus = element(this.routeForm, 'span'); this.routeStatus.setAttribute('role', 'status');
    const mark = () => { this.routeForm.dataset.pending = 'true'; this.routeStatus.textContent = 'Unapplied routing preferences'; this.statusUpdate(); };
    this.channelSelect.addEventListener('change', mark); this.percussion.addEventListener('change', mark);
    this.laneSelect.addEventListener('change', () => {
      if (this.routeForm.dataset.pending === 'true') { this.routeStatus.textContent = 'Apply/discard routing changes before choosing another lane.'; this.laneSelect.value = this.routeForm.dataset.lane ?? ''; return; } this.routingValues();
    });
    this.routeForm.addEventListener('submit', e => {
      e.preventDefault(); const success = this.apply(() => this.session.edit('Lane MIDI routing', c => setLaneRouting(c, this.laneSelect.value, this.channelSelect.value === '' ? undefined : Number(this.channelSelect.value), this.percussion.checked)), this.routeForm);
      if (success) { delete this.routeForm.dataset.pending; this.routingValues(); this.routeStatus.textContent = 'Routing preference applied; compile again.'; }
      else this.routeStatus.textContent = 'Routing conflict or invalid preference. Arrangement unchanged; inspect the message above, then correct or discard this form.';
      this.statusUpdate();
    });
    const details = element(secondary, 'details', undefined, 'mnemobard-arrangement-compilation'); element(details, 'summary', 'Compilation / export diagnostics'); this.diagnostics = element(details, 'div');
    button(details, 'Cancel compilation / export', () => { this.stop(); this.preparation.invalidate('Operation cancelled. Submitted binary I/O cannot be rolled back.'); });
    this.cleanups.push(this.preparation.subscribe(() => { if (this.active) { this.renderDiagnostics(); this.statusUpdate(); } }), services.musical.subscribe(() => { if (this.active) this.statusUpdate(); }));
    const stop = () => this.stop(), window = toolbar.ownerDocument.defaultView;
    window?.addEventListener('blur', stop, { signal: this.lifetime.signal }); window?.addEventListener('pagehide', stop, { signal: this.lifetime.signal }); toolbar.ownerDocument.addEventListener('visibilitychange', () => { if (toolbar.ownerDocument.hidden) this.stop(); }, { signal: this.lifetime.signal });
    this.refreshRouting(); this.renderDiagnostics(); this.statusUpdate();
  }
  private allowed(): boolean { if (!this.active || this.pending() || !this.isCurrent()) { this.status.textContent = 'Apply/discard pending controls and focus CANVAS before this operation.'; return false; } return true; }
  private say(error: unknown): void { if (this.active) this.status.textContent = error instanceof Error ? error.message : String(error); }
  private captureDraftVersions(): void { for (const id of new Set(this.model.data.lanes.flatMap(l => l.clips.map(c => c.motifId.toLowerCase())))) this.drafts.set(id, this.services.motifs.draftRevision(id)); }
  refresh(): void {
    if (!this.active) return;
    const changed = this.version !== this.session.changeVersion || this.base !== this.session.base?.source;
    if (changed) {
      const baseChanged = this.base !== this.session.base?.source; this.version = this.session.changeVersion; this.base = this.session.base?.source; this.model = this.session.draft;
      // 4D: organizational edits (sections/markers/references/prose) keep compiled notes and playback; musical edits invalidate.
      if (!this.preparation.musicallyCurrent(this.model)) this.invalidate('Musical arrangement changed (clips, lanes, routing, tempo/meter or sources); compile again.');
      else if (baseChanged && this.preparation.state === 'ready') void this.preparation.adoptSavedBase();
      else if (baseChanged && this.preparation.state !== 'idle' && this.preparation.state !== 'invalidated') this.invalidate('Composition save base changed during compilation; compile again.');
      this.refreshRouting();
    }
    if (this.session.error.startsWith('Not saved') && this.preparation.prepared) this.invalidate('Protected Save failed/conflicted; resolve the source before compiling.');
    const snapshot = this.preparation.captured;
    if (snapshot) {
      for (const d of snapshot.documents) { const state = this.services.canvas.sources.get(d.id); if (state.status !== 'ready' || state.source.revision !== d.revision) { this.invalidate(`Saved motif is changed/${state.status}. Review its revision and compile again.`); break; } }
      const prepared = this.preparation.prepared;
      // 4E: a clean session is refreshed by the freshness watcher (then classified musical vs organizational above);
      // with unsaved edits the external change stays a protected conflict, so the compiled base is no longer trusted.
      if (prepared?.baseRevision && !this.session.busy && this.session.dirty) { const head = this.services.index.heads().find(h => h.id === this.model.id.toLowerCase()); if (!head || head.revision !== prepared.baseRevision) this.invalidate('Saved composition changed externally while you have unsaved edits. Resolve the conflict, then compile again.'); }
      if (this.session.freshness.state === 'unavailable') this.invalidate('The composition note is unavailable (deleted, invalid or ambiguous). Your draft is kept; compile again once the note is restored.');
    }
    let draftChanged = false; for (const [id, old] of this.drafts) { const next = this.services.motifs.draftRevision(id); if (next !== old && this.services.motifs.isDirty(id)) draftChanged = true; }
    this.drafts.clear(); this.captureDraftVersions();
    if (draftChanged && this.preparation.captured) this.invalidate('Referenced MOTIF working draft changed. Saved notes remain authoritative; compile again to audition the reviewed saved state.');
    this.statusUpdate();
  }
  private invalidate(message: string): void { if (this.preparation.state !== 'idle' && this.preparation.state !== 'invalidated') { this.stop(); this.preparation.invalidate(message); } }
  /** 4D: the routing form element, placed by the view into the lane inspector context (moved, never duplicated). */
  get routing(): HTMLFormElement { return this.routeForm; }
  /** Point the routing form at a lane unless it holds unapplied changes. */
  routeLane(id: string): void { if (this.routeForm.dataset.pending === 'true' || this.laneSelect.value === id) return; this.laneSelect.value = id; this.routingValues(); }
  /** Channel chosen by the last verified compilation (display only). */
  compiledChannel(id: string): string | undefined { const lane = this.preparation.prepared?.arrangement.lanes.find(l => l.id === id); return lane ? lane.channel === undefined ? 'None (no notes)' : `Channel ${lane.channel + 1}` : undefined; }
  private refreshRouting(): void { if (this.routeForm.dataset.pending === 'true') return; const previous = this.laneSelect.value; this.laneSelect.replaceChildren(); for (const lane of this.model.data.lanes) element(this.laneSelect, 'option', lane.name).value = lane.id; this.laneSelect.value = this.model.data.lanes.some(l => l.id === previous) ? previous : this.model.data.lanes[0]?.id ?? ''; this.routingValues(); }
  private routingValues(): void { const lane = this.model.data.lanes.find(l => l.id === this.laneSelect.value); this.channelSelect.value = lane?.midiChannel === undefined ? '' : String(lane.midiChannel); this.percussion.checked = lane?.percussion === true; this.routeForm.dataset.lane = lane?.id ?? ''; }
  private renderDiagnostics(): void {
    this.diagnostics.replaceChildren(); if(this.preparation.state==='error'){const details=this.diagnostics.closest('details');if(details)details.open=true;} const prepared = this.preparation.prepared;
    if (prepared) {
      element(this.diagnostics, 'p', `Ready · ${prepared.arrangement.expandedNotes} notes / ${prepared.arrangement.events.length} events · endpoint ${musicalPosition(prepared.arrangement.lengthTicks, 960, this.model.data.meter)} (${prepared.arrangement.lengthTicks} ticks)`);
      element(this.diagnostics, 'p', `Verified input ${prepared.arrangement.inputRevision}`, 'mnemobard-hint'); const list = element(this.diagnostics, 'ul', undefined, 'mnemobard-route-result');
      for (const lane of prepared.arrangement.lanes) element(list, 'li', `${lane.name}: ${lane.explicit ? 'Explicit' : 'Auto'} ${lane.channel === undefined ? 'silent lane' : 'channel ' + (lane.channel + 1)} · ${lane.notes.length} notes`);
      if (this.checkedInput !== prepared.arrangement.inputRevision) { this.checkedInput = prepared.arrangement.inputRevision; this.auditionIssue = auditionDiagnostic(prepared.arrangement); } if (this.auditionIssue) element(this.diagnostics, 'p', this.auditionIssue);
    }
    for (const d of this.preparation.diagnostics.slice(0, 100)) {
      const p = element(this.diagnostics, 'p', `${d.severity.toUpperCase()}: ${d.message}`); p.dataset.compileDiagnostic = d.code;
      if (d.laneId) button(p, 'Show affected clip/lane', () => this.navigate(d.laneId ?? '', d.clipId));
      if(d.startTick!==undefined&&d.endTick!==undefined)element(p,'small',`Position ${musicalPosition(d.startTick,960,this.model.data.meter)}–${musicalPosition(d.endTick,960,this.model.data.meter)} · repetition ${(d.conflict?.repetition??0)+1} conflict${d.conflict?' with '+d.conflict.laneName:''}`);
      if (d.noteId) element(p, 'small', `Source note ${d.noteId} · clip ${d.clipId} · motif ${d.motifId}`);
    }
    if (this.preparation.diagnostics.length > 100) element(this.diagnostics, 'p', `${this.preparation.diagnostics.length - 100} further context diagnostics; select a clip for its references.`);
  }
  private statusUpdate(): void {
    if (!this.active) return; const player = this.services.musical, owned = player.ownedBy(this.owner);
    if (owned) { this.tick = Math.max(0, Math.min(this.model.data.lengthTicks, Math.floor(player.position * 960 * 1000000 / this.model.data.tempoMicrosecondsPerQuarter + 1e-7))); this.wasOwner = true; }
    else if (this.wasOwner) { this.tick = player.state === 'stopped' ? Math.min(this.model.data.lengthTicks, Math.round(player.position * 960 * 1000000 / this.model.data.tempoMicrosecondsPerQuarter)) : 0; this.wasOwner = false; }
    const busy = ['resolving', 'compiling', 'exporting'].includes(this.preparation.state), ready = this.preparation.state === 'ready';
    this.compileButton.disabled = busy || this.services.settings.readOnly; this.playButton.disabled = !ready || !!this.auditionIssue; this.pauseButton.disabled = !owned || player.state !== 'playing'; this.resumeButton.disabled = !owned || player.state !== 'paused' || !ready; this.exportButton.disabled = !ready;
    this.position.textContent = `${musicalPosition(this.tick, 960, this.model.data.meter)} · ${(60000000 / this.model.data.tempoMicrosecondsPerQuarter).toFixed(1)} BPM`;
    const diagnostic=player.diagnosticFor(this.owner),state = `${owned ? player.state : this.preparation.state}${diagnostic ? ' · ' + diagnostic : ''}`; if (this.status.textContent !== state) this.status.textContent = state;
    this.playhead(this.tick);
    if (owned && player.state === 'playing' && this.animation === undefined) this.animation = requestAnimationFrame(() => { this.animation = undefined; this.statusUpdate(); });
    else if ((!owned || player.state !== 'playing') && this.animation !== undefined) { cancelAnimationFrame(this.animation); this.animation = undefined; }
  }
  private async play(resume = false): Promise<void> {
    if (!this.allowed() || !this.preparation.prepared || this.auditionIssue) return; const epoch = ++this.playEpoch;
    try {
      await this.preparation.verifyPrepared(); if (!this.active || epoch !== this.playEpoch || !this.isCurrent()) return; const player = this.services.musical;
      if (resume && player.ownedBy(this.owner) && player.state === 'paused') await player.resume(this.owner);
      else { if (this.tick >= this.model.data.lengthTicks) this.tick = 0; await player.start(this.owner, this.preparation.prepared.arrangement, this.tick / 960 * this.model.data.tempoMicrosecondsPerQuarter / 1000000); }
      if (!this.active || epoch !== this.playEpoch) player.stop(this.owner); else this.statusUpdate();
    } catch (error) { if (this.active && epoch === this.playEpoch) { this.services.musical.stop(this.owner); this.preparation.invalidate(error instanceof Error?error.message:String(error)); this.say(error); } }
  }
  private async seek(tick: number): Promise<void> {
    if (!this.allowed()) return; if (!Number.isSafeInteger(tick) || tick < 0 || tick > this.model.data.lengthTicks) { this.say('Seek is outside the composition length.'); return; } this.playEpoch++;
    try { if (this.services.musical.ownedBy(this.owner)) await this.services.musical.seek(this.owner, tick / 960 * this.model.data.tempoMicrosecondsPerQuarter / 1000000); this.tick = tick; this.statusUpdate(); }
    catch (error) { this.services.musical.stop(this.owner); this.say(error); }
  }
  get currentTick(): number { return this.tick; }
  /** 4C navigation: stop any owned audition, then place the stopped playhead. Never starts playback or edits. */
  locate(tick: number): void { if (!this.active) return; if (this.services.musical.ownedBy(this.owner)) this.stop(); this.tick = Math.max(0, Math.min(this.model.data.lengthTicks, Math.round(tick))); this.statusUpdate(); }
  stop(): void { this.playEpoch++; this.services.musical.stop(this.owner); this.tick = 0; if (this.active) this.statusUpdate(); }
  dispose(): void { this.active = false; this.playEpoch++; this.dialog?.close(); this.preparation.dispose(); this.services.musical.stop(this.owner); this.lifetime.abort(); if (this.animation !== undefined) cancelAnimationFrame(this.animation); for (const fn of this.cleanups.splice(0)) fn(); this.playhead(undefined); }
}
