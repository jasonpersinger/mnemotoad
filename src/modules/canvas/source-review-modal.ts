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
    this.active = true; this.contentEl.classList.add('mnemobard-source-review'); this.modalEl.classList.add('mnemobard-wide-modal'); // 4H: room for the placement table
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
    element(root, 'p', 'Acknowledging records the current saved revision of one motif on its clips. It never changes the motif, notes, positions, repetitions or routing, and it does not save the composition.', 'mnemobard-hint');
    const status = element(root, 'p', this.notice, 'mnemobard-review-notice'); status.setAttribute('role', this.noticeKind); status.hidden = !this.notice;
    const pending = items.filter(i => i.placements.length);
    if (!pending.length) {
      element(root, 'p', 'No changed sources. Every clip acknowledges the current saved revision of its motif. Compile the arrangement when you are ready.', 'mnemobard-review-empty');
      const actions = element(root, 'div', undefined, 'mnemobard-review-actions'); button(actions, 'Close review', () => this.close(), 'mod-cta'); return;
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
  /**
   * 4H hierarchy: Summary (what changed, how many clips, can it be acknowledged) → Changes (recorded before/after, collapsed)
   * → Affected placements → Technical details (identity, full revisions, raw ticks, collapsed). The action footer stays
   * visible at the bottom of the scrolling modal (position: sticky, in normal flow, so it never covers content).
   */
  private detail(root: HTMLElement, item: SourceReviewItem, meter: { numerator: number; denominator: number }, length: number): void {
    const box = element(root, 'section', undefined, 'mnemobard-review-detail'); box.setAttribute('aria-label', `Review of ${item.title}`); box.dataset.reviewStatus = item.eligible ? 'eligible' : 'blocked';
    const source = item.source, previousPeriods = [...new Set(item.placements.map(p => p.previousPeriodTicks))], previousTitles = [...new Set(item.placements.map(p => p.previousTitle).filter(Boolean))], previousPaths = [...new Set(item.placements.map(p => p.previousPath).filter(Boolean))];
    const dur = (ticks?: number) => ticks === undefined ? 'not recorded' : musicalDuration(ticks, 960, meter);
    const lanes = [...new Set(item.placements.map(p => p.laneName))], count = item.placements.length, currentPeriod = item.placements[0]?.periodTicks;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    // Summary
    const summary = element(box, 'div', undefined, 'mnemobard-review-summary'); summary.setAttribute('role', 'group'); summary.setAttribute('aria-label', 'Summary');
    element(summary, 'h3', item.title);
    const facts = element(summary, 'dl'), fact = (term: string, value: string): HTMLElement => { element(facts, 'dt', term); return element(facts, 'dd', value); };
    const acknowledged = item.previousRevisions.filter((r): r is string => !!r);
    fact('Revision', acknowledged.length ? `Changed since it was last acknowledged · ${[...new Set(acknowledged.map(short))].join(', ')} → ${short(source?.revision)}` : `Never acknowledged · current ${short(source?.revision)}`);
    fact('Affected clips', `${plural(count, 'clip')} on ${lanes.length === 1 ? 'lane' : 'lanes'} ${lanes.join(', ')}`);
    const periodsBefore = previousPeriods.map(dur).join(', '), periodNow = currentPeriod === undefined ? 'not calculable' : dur(currentPeriod);
    fact('Length per repetition', periodsBefore === periodNow ? `${periodNow} (unchanged)` : `${periodsBefore} → ${periodNow}`);
    const blocked = item.placements.filter(p => !p.eligible).length;
    fact('Status', item.eligible ? 'Ready to acknowledge' : blocked ? `Blocked · ${plural(blocked, 'clip')} cannot be acknowledged` : 'Blocked').dataset.status = item.eligible ? 'eligible' : 'blocked';
    if (item.blockers.length) { const blockers = element(summary, 'ul', undefined, 'mnemobard-review-blockers'); blockers.setAttribute('role', 'alert'); for (const b of item.blockers) element(blockers, 'li', b); }
    button(summary, 'Open motif in MOTIF', () => { this.close(); this.openMotif(item.motifId); });
    // Changes: only what is actually recorded. The previous revision's notes were never stored.
    const changes = element(box, 'details', undefined, 'mnemobard-review-changes'); element(changes, 'summary', 'Changes · last acknowledged and current saved revision');
    let extent: { first: number; last: number } | undefined;
    if (source) { const cached = this.extents.get(source.id); if (cached?.revision === source.revision) extent = cached.extent; else { const state = this.library.index.resolve(source.id); extent = state.status === 'ready' && state.entity.kind === 'motif' ? noteExtent(state.entity.data.notes) : undefined; this.extents.set(source.id, { revision: source.revision, extent }); } }
    const sourcePosition = (tick: number) => source ? musicalPosition(tick, source.ppq, source.meter) : String(tick);
    const table = element(changes, 'table', undefined, 'mnemobard-review-compare'); table.setAttribute('aria-label', 'Acknowledged and current saved revision');
    const head = element(element(table, 'thead'), 'tr'); for (const h of ['', 'Last acknowledged', 'Current saved']) element(head, 'th', h);
    const body = element(table, 'tbody');
    const row = (label: string, before: string, after: string, raw?: string) => { const tr = element(body, 'tr'); element(tr, 'th', label); element(tr, 'td', before); element(tr, 'td', after); if (raw) tr.title = raw; };
    row('Revision', item.previousRevisions.map(short).join(', '), short(source?.revision), `Full SHA-256: ${item.previousRevisions.map(r => r ?? 'never reviewed').join(', ')} → ${source?.revision ?? 'unavailable'}`);
    row('Name', previousTitles.join(', ') || 'not recorded', source?.title ?? 'unavailable');
    row('Note location', previousPaths.join(', ') || 'not recorded', source?.path ?? (item.paths.join(', ') || 'unavailable'));
    row('Length per repetition', periodsBefore, periodNow, `Arrangement ticks: ${previousPeriods.map(p => p ?? '?').join(', ')} → ${currentPeriod ?? '?'}`);
    row('Notes', 'not recorded', source ? `${source.noteCount}` : 'unavailable');
    row('PPQ', 'not recorded', source ? `${source.ppq}${source.ppq === 960 ? '' : ' (converted exactly to 960)'}` : 'unavailable');
    row('Tempo · meter', 'not recorded', source ? `${(60000000 / source.tempo).toFixed(1)} BPM · ${source.meter.numerator}/${source.meter.denominator}` : 'unavailable');
    row('Note range', 'not recorded', extent ? `${sourcePosition(extent.first)} – ${sourcePosition(extent.last)} (source bar:beat:tick)` : source ? 'no notes (the full length is a rest)' : 'unavailable');
    element(changes, 'p', 'Only the previous revision’s fingerprint, name, location and length per repetition are kept. Its notes were never stored, so a note-by-note comparison is not possible. Open the motif to inspect its current notes.', 'mnemobard-hint');
    const timing = element(changes, 'p', `Timing: ${item.timing.message}`); timing.dataset.timing = item.timing.ok ? 'compatible' : 'incompatible';
    if (source && (source.tempo !== this.session.draft.data.tempoMicrosecondsPerQuarter)) element(changes, 'p', 'The motif’s own tempo differs from the composition; the composition tempo interprets its ticks (unchanged by acknowledgement).', 'mnemobard-hint');
    // Affected placements: musical positions and durations; raw ticks in row titles and the technical details.
    const placements = element(box, 'details', undefined, 'mnemobard-review-placements'); placements.open = count <= 8;
    element(placements, 'summary', `Affected placements · ${count}${blocked ? ` · ${blocked} blocked` : ''}`);
    const grid = element(placements, 'table', undefined, 'mnemobard-review-clips'); grid.setAttribute('aria-label', 'Affected placements');
    const headers = ['Lane', 'Clip', 'Position', 'Repetitions', 'Duration before', 'Duration now', 'Eligibility'] as const;
    const gh = element(element(grid, 'thead'), 'tr'); for (const h of headers) element(gh, 'th', h);
    const gb = element(grid, 'tbody');
    for (const p of item.placements.slice(0, MAX_ROWS)) {
      const tr = element(gb, 'tr'); tr.dataset.clipId = p.clipId; tr.dataset.eligible = String(p.eligible);
      // data-label names each cell where narrow layouts hide the header row (CSS ::before).
      [`${p.laneIndex + 1}. ${p.laneName}`, p.label, musicalPosition(p.startTick, 960, meter), `×${p.repeatCount}`, dur(p.previousDurationTicks), p.durationTicks === undefined ? 'not calculable' : dur(p.durationTicks), p.eligible ? 'Eligible' : `Blocked · ${p.reason ?? ''}`]
        .forEach((text, i) => { element(tr, 'td', text).dataset.label = headers[i]; });
      tr.title = `Start ${p.startTick} · before ${p.previousDurationTicks ?? '?'} · after ${p.durationTicks ?? '?'} ticks${p.endTick !== undefined ? ` · ends ${p.endTick} of ${length}` : ''}`;
    }
    if (count > MAX_ROWS) element(placements, 'p', `${count - MAX_ROWS} more placements are not listed; acknowledgement covers all ${count}.`, 'mnemobard-hint');
    // Technical details: stable identity, full revisions and raw ticks.
    const advanced = element(box, 'details', undefined, 'mnemobard-review-advanced'); element(advanced, 'summary', 'Technical details');
    element(advanced, 'p', `Motif UUID ${item.motifId}${item.paths.length ? ` · ${item.paths.join(', ')}` : ''}`);
    element(advanced, 'p', `Revisions (SHA-256): ${item.previousRevisions.map(r => r ?? 'never reviewed').join(', ')} → ${source?.revision ?? 'unavailable'}`);
    element(advanced, 'pre', item.placements.slice(0, MAX_ROWS).map(p => `${p.clipId}  start ${p.startTick}  ×${p.repeatCount}  period ${p.previousPeriodTicks ?? '?'} → ${p.periodTicks ?? '?'}  end ${p.endTick ?? '?'}`).join('\n'));
    // Explicit two-step action in a footer that stays reachable without scrolling back.
    const actions = element(root, 'div', undefined, 'mnemobard-review-actions'); actions.setAttribute('role', 'group'); actions.setAttribute('aria-label', 'Review actions');
    if (!this.confirming || this.confirming.motifId.toLowerCase() !== item.motifId.toLowerCase()) {
      const go = button(actions, `Acknowledge this source for all ${count} eligible clip${count === 1 ? '' : 's'}`, () => this.prepare(item), 'mod-cta');
      go.disabled = !item.eligible || this.working;
      button(actions, 'Close review', () => this.close());
      if (!item.eligible) element(actions, 'p', item.blockers.length ? 'Blocked: resolve the conditions in the summary first.' : 'Blocked: every affected placement must be eligible; nothing is acknowledged partially. Fix the blocked clips, or review eligible clips one at a time in the clip inspector.', 'mnemobard-hint');
      else element(actions, 'p', 'Single clips can still be acknowledged one at a time in the clip inspector.', 'mnemobard-hint');
      return;
    }
    const confirm = element(actions, 'div', undefined, 'mnemobard-confirm'); confirm.setAttribute('role', 'alertdialog'); confirm.setAttribute('aria-label', 'Confirm acknowledgement');
    element(confirm, 'p', `Record revision ${short(item.source?.revision)} of “${item.title}” for ${plural(count, 'clip')} on ${lanes.length === 1 ? 'lane' : 'lanes'} ${lanes.join(', ')}?`);
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
