import { Modal, type App } from 'obsidian';
import { element, button } from '../../ui/dom';
import { messageOf } from '../../domain/errors';
import { musicalPosition } from '../../music/positions';
import { musicalDuration } from '../../music/durations';
import { noteExtent, type ReviewToken, type SourceReviewItem } from '../../arrangement/source-review';
import type { CanvasLibrary } from './library';
import type { CanvasSession } from './session';

const MAX_ROWS = 100;
const short = (revision?: string): string => revision ? revision.slice(0, 12) : 'never reviewed';
const sameToken = (a?: ReviewToken, b?: ReviewToken): boolean => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

/**
 * 4G "Review changed sources": one saved motif at a time, its acknowledged vs current saved revision, every affected
 * placement, and one explicit, confirmed, undoable acknowledgement of all of them. Re-renders live while open (index and
 * draft changes); a confirmation whose reviewed state changed is withdrawn rather than applied.
 */
export class SourceReviewModal extends Modal {
  private active = false; private cleanups: (() => void)[] = []; private selected?: string; private confirming?: ReviewToken;
  private notice = ''; private noticeKind: 'status' | 'alert' = 'status'; private working = false; private scheduled = false;
  private extents = new Map<string, { revision: string; extent?: { first: number; last: number } }>();
  constructor(app: App, private readonly library: CanvasLibrary, private readonly session: CanvasSession, preselect: string | undefined,
    private readonly blocked: () => string | undefined, private readonly openMotif: (id: string) => void, private readonly done: (message: string) => void) {
    super(app); this.selected = preselect?.toLowerCase();
  }
  override onOpen(): void {
    this.active = true; this.contentEl.classList.add('mnemobard-source-review');
    const later = () => { if (!this.active || this.scheduled) return; this.scheduled = true; queueMicrotask(() => { this.scheduled = false; if (this.active) this.render(); }); };
    this.cleanups.push(this.library.index.subscribe(later), this.session.subscribe(later));
    this.render();
  }
  override onClose(): void { this.active = false; for (const fn of this.cleanups.splice(0)) fn(); this.contentEl.replaceChildren(); }
  private say(text: string, kind: 'status' | 'alert' = 'status'): void { this.notice = text; this.noticeKind = kind; }
  private render(): void {
    const root = this.contentEl, focus = root.ownerDocument.activeElement?.getAttribute('aria-label') ?? root.ownerDocument.activeElement?.textContent; root.replaceChildren();
    element(root, 'h2', 'Review changed sources');
    if (this.session.disposed) { element(root, 'p', 'The composition editor closed. Nothing was acknowledged.'); return; }
    const items = this.library.reviewItems(this.session, this.selected), c = this.session.draft, meter = c.data.meter;
    const item = items.find(i => i.motifId.toLowerCase() === this.selected) ?? items.find(i => i.placements.length) ?? items[0];
    this.selected = item?.motifId.toLowerCase();
    // A confirmation is only valid for exactly the state that was reviewed.
    if (this.confirming && !this.working) { let now: ReviewToken | undefined; try { now = item ? this.library.reviewToken(this.session, item) : undefined; } catch { now = undefined; } if (!sameToken(now, this.confirming)) { this.confirming = undefined; this.say('The review changed while it was open (the motif, its placements or the composition changed). Check it again before acknowledging.', 'alert'); } }
    element(root, 'p', 'Clips refer to saved motifs by stable identity and remember which saved revision you last acknowledged. Acknowledging records the current saved revision on the clips. It never changes the motif, its notes, clip positions, repetitions or routing, and it does not save the composition.', 'mnemobard-hint');
    const status = element(root, 'p', this.notice, 'mnemobard-review-notice'); status.setAttribute('role', this.noticeKind); status.hidden = !this.notice;
    const pending = items.filter(i => i.placements.length);
    if (!pending.length) {
      element(root, 'p', 'No changed sources. Every clip acknowledges the current saved revision of its motif. Compile the arrangement when you are ready.', 'mnemobard-review-empty');
      button(root, 'Close review', () => this.close(), 'mod-cta'); return;
    }
    const list = element(root, 'div', undefined, 'mnemobard-review-sources'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Changed sources');
    element(list, 'p', `${pending.length} changed source${pending.length === 1 ? '' : 's'} · choose one to review`, 'mnemobard-region-label');
    for (const i of pending) {
      const b = button(list, `${i.title} · ${i.placements.length} placement${i.placements.length === 1 ? '' : 's'} · ${i.eligible ? 'ready to acknowledge' : 'blocked'}`, () => { if (this.working) return; this.selected = i.motifId.toLowerCase(); this.confirming = undefined; this.say(''); this.render(); });
      b.setAttribute('aria-pressed', String(i === item)); b.dataset.reviewMotif = i.motifId; b.title = i.title;
    }
    if (item) this.detail(root, item, meter, c.data.lengthTicks);
    if (focus) [...root.querySelectorAll<HTMLElement>('button,summary')].find(e => e.getAttribute('aria-label') === focus || e.textContent === focus)?.focus();
  }
  private detail(root: HTMLElement, item: SourceReviewItem, meter: { numerator: number; denominator: number }, length: number): void {
    const box = element(root, 'section', undefined, 'mnemobard-review-detail'); box.setAttribute('aria-label', `Review of ${item.title}`); box.dataset.reviewStatus = item.eligible ? 'eligible' : 'blocked';
    element(box, 'h3', item.title);
    const identity = element(box, 'details', undefined, 'mnemobard-ref-id'); element(identity, 'summary', 'Stable source identity');
    element(identity, 'p', `Motif UUID ${item.motifId}${item.paths.length ? ` · ${item.paths.join(', ')}` : ''}`);
    // Before/after: only what is actually recorded. The previous revision's notes were never stored.
    const source = item.source, previousPeriods = [...new Set(item.placements.map(p => p.previousPeriodTicks))], previousTitles = [...new Set(item.placements.map(p => p.previousTitle).filter(Boolean))], previousPaths = [...new Set(item.placements.map(p => p.previousPath).filter(Boolean))];
    const dur = (ticks?: number) => ticks === undefined ? 'not recorded' : musicalDuration(ticks, 960, meter);
    let extent: { first: number; last: number } | undefined;
    if (source) { const cached = this.extents.get(source.id); if (cached?.revision === source.revision) extent = cached.extent; else { const state = this.library.index.resolve(source.id); extent = state.status === 'ready' && state.entity.kind === 'motif' ? noteExtent(state.entity.data.notes) : undefined; this.extents.set(source.id, { revision: source.revision, extent }); } }
    const sourcePosition = (tick: number) => source ? musicalPosition(tick, source.ppq, source.meter) : String(tick);
    const table = element(box, 'table', undefined, 'mnemobard-review-compare'); table.setAttribute('aria-label', 'Acknowledged and current saved revision');
    const head = element(element(table, 'thead'), 'tr'); for (const h of ['', 'Last acknowledged', 'Current saved']) element(head, 'th', h);
    const body = element(table, 'tbody');
    const row = (label: string, before: string, after: string, raw?: string) => { const tr = element(body, 'tr'); element(tr, 'th', label); element(tr, 'td', before); element(tr, 'td', after); if (raw) tr.title = raw; };
    row('Revision', item.previousRevisions.map(short).join(', '), short(source?.revision), `Full SHA-256: ${item.previousRevisions.map(r => r ?? 'never reviewed').join(', ')} → ${source?.revision ?? 'unavailable'}`);
    row('Name', previousTitles.join(', ') || 'not recorded', source?.title ?? 'unavailable');
    row('Note location', previousPaths.join(', ') || 'not recorded', source?.path ?? (item.paths.join(', ') || 'unavailable'));
    row('Length per repetition', previousPeriods.map(dur).join(', '), item.placements[0]?.periodTicks === undefined ? 'not calculable' : dur(item.placements[0].periodTicks), `Arrangement ticks: ${previousPeriods.map(p => p ?? '?').join(', ')} → ${item.placements[0]?.periodTicks ?? '?'}`);
    row('Notes', 'not recorded', source ? `${source.noteCount}` : 'unavailable');
    row('PPQ', 'not recorded', source ? `${source.ppq}${source.ppq === 960 ? '' : ' (converted exactly to 960)'}` : 'unavailable');
    row('Tempo · meter', 'not recorded', source ? `${(60000000 / source.tempo).toFixed(1)} BPM · ${source.meter.numerator}/${source.meter.denominator}` : 'unavailable');
    row('Note range', 'not recorded', extent ? `${sourcePosition(extent.first)} – ${sourcePosition(extent.last)} (source bar:beat:tick)` : source ? 'no notes (the full length is a rest)' : 'unavailable');
    element(box, 'p', 'Only the previous revision’s fingerprint, name, location and length per repetition are kept. Its notes were never stored, so a note-by-note comparison is not possible. Open the motif to inspect its current notes.', 'mnemobard-hint');
    button(box, 'Open motif in MOTIF', () => { this.close(); this.openMotif(item.motifId); });
    const timing = element(box, 'p', `Timing: ${item.timing.message}`); timing.dataset.timing = item.timing.ok ? 'compatible' : 'incompatible';
    if (source && (source.tempo !== this.session.draft.data.tempoMicrosecondsPerQuarter)) element(box, 'p', 'The motif’s own tempo differs from the composition; the composition tempo interprets its ticks (unchanged by acknowledgement).', 'mnemobard-hint');
    if (item.blockers.length) { const blockers = element(box, 'ul', undefined, 'mnemobard-review-blockers'); blockers.setAttribute('role', 'alert'); for (const b of item.blockers) element(blockers, 'li', b); }
    // Affected placements: musical positions and durations first; raw ticks in titles and the advanced list.
    const placements = element(box, 'details', undefined, 'mnemobard-review-placements'); placements.open = item.placements.length <= 24;
    element(placements, 'summary', `Affected placements · ${item.placements.length}${item.placements.some(p => !p.eligible) ? ` · ${item.placements.filter(p => !p.eligible).length} blocked` : ''}`);
    const grid = element(placements, 'table', undefined, 'mnemobard-review-clips'); grid.setAttribute('aria-label', 'Affected placements');
    const gh = element(element(grid, 'thead'), 'tr'); for (const h of ['Lane', 'Clip', 'Position', 'Repeats', 'Before', 'After', 'Status']) element(gh, 'th', h);
    const gb = element(grid, 'tbody');
    for (const p of item.placements.slice(0, MAX_ROWS)) {
      const tr = element(gb, 'tr'); tr.dataset.clipId = p.clipId; tr.dataset.eligible = String(p.eligible);
      element(tr, 'td', `${p.laneIndex + 1}. ${p.laneName}`); element(tr, 'td', p.label); element(tr, 'td', musicalPosition(p.startTick, 960, meter)); element(tr, 'td', `×${p.repeatCount}`);
      element(tr, 'td', dur(p.previousDurationTicks)); element(tr, 'td', p.durationTicks === undefined ? 'not calculable' : dur(p.durationTicks));
      element(tr, 'td', p.eligible ? 'Eligible' : `Blocked · ${p.reason ?? ''}`);
      tr.title = `Start ${p.startTick} · before ${p.previousDurationTicks ?? '?'} · after ${p.durationTicks ?? '?'} ticks${p.endTick !== undefined ? ` · ends ${p.endTick} of ${length}` : ''}`;
    }
    if (item.placements.length > MAX_ROWS) element(placements, 'p', `${item.placements.length - MAX_ROWS} more placements are not listed; acknowledgement covers all ${item.placements.length}.`, 'mnemobard-hint');
    const raw = element(placements, 'details', undefined, 'mnemobard-review-raw'); element(raw, 'summary', 'Raw ticks (advanced)');
    element(raw, 'pre', item.placements.slice(0, MAX_ROWS).map(p => `${p.clipId}  start ${p.startTick}  ×${p.repeatCount}  period ${p.previousPeriodTicks ?? '?'} → ${p.periodTicks ?? '?'}  end ${p.endTick ?? '?'}`).join('\n'));
    // Explicit two-step action.
    const actions = element(box, 'div', undefined, 'mnemobard-review-actions');
    if (!this.confirming || this.confirming.motifId.toLowerCase() !== item.motifId.toLowerCase()) {
      const go = button(actions, `Acknowledge this source for all ${item.placements.length} eligible clip${item.placements.length === 1 ? '' : 's'}`, () => this.prepare(item), 'mod-cta');
      go.disabled = !item.eligible || this.working;
      if (!item.eligible) element(actions, 'p', item.blockers.length ? 'Blocked: resolve the conditions above first.' : 'Blocked: every affected placement must be eligible; nothing is acknowledged partially. Fix the blocked clips, or review eligible clips one at a time in the clip inspector.', 'mnemobard-hint');
      else element(actions, 'p', 'Single clips can still be acknowledged one at a time in the clip inspector.', 'mnemobard-hint');
      return;
    }
    const lanes = [...new Set(item.placements.map(p => p.laneName))];
    const confirm = element(actions, 'div', undefined, 'mnemobard-confirm'); confirm.setAttribute('role', 'alertdialog'); confirm.setAttribute('aria-label', 'Confirm acknowledgement');
    element(confirm, 'p', `Record revision ${short(item.source?.revision)} of “${item.title}” for ${item.placements.length} clip${item.placements.length === 1 ? '' : 's'} on ${lanes.length === 1 ? 'lane' : 'lanes'} ${lanes.join(', ')}?`);
    element(confirm, 'p', 'Notes, positions, repetitions, lanes and routing do not change. The composition is not saved. Undo reverts all of them in one step. The saved motif is checked again before anything is recorded.', 'mnemobard-hint');
    const yes = button(confirm, 'Confirm acknowledgement', () => { void this.commit(); }, 'mod-cta'); yes.disabled = this.working;
    button(confirm, 'Back to review', () => { this.confirming = undefined; this.say(''); this.render(); });
  }
  private prepare(item: SourceReviewItem): void {
    const reason = this.blocked(); if (reason) { this.say(reason, 'alert'); this.render(); return; }
    try { this.confirming = this.library.reviewToken(this.session, item); this.say(''); }
    catch (error) { this.say(messageOf(error), 'alert'); }
    this.render(); this.contentEl.querySelector<HTMLElement>('.mnemobard-confirm button')?.focus();
  }
  private async commit(): Promise<void> {
    const token = this.confirming; if (!token || this.working) return;
    const reason = this.blocked(); if (reason) { this.say(reason, 'alert'); this.render(); return; }
    this.working = true; this.say('Checking the saved motif and the composition…'); this.render();
    try {
      const count = await this.library.reviewAll(this.session, token);
      const message = `Acknowledged revision ${short(token.revision)} for ${count} clip${count === 1 ? '' : 's'}. Compile again before playback or export; Undo reverts this in one step.`;
      this.confirming = undefined; this.selected = undefined; this.say(message); this.done(message);
    } catch (error) { this.confirming = undefined; this.say(messageOf(error), 'alert'); }
    finally { this.working = false; if (this.active) this.render(); }
  }
}
