import type { Motif, Note } from '../../domain/entities';
import { messageOf } from '../../domain/errors';
import { addNote, gridTicks, moveNotes, resizeNotes, snapped, type Grid } from './commands';
import { NoteIndex, anchoredStart, backingSize, gridPoint, noteHit, noteRect, PITCH_GUTTER, RULER_HEIGHT, type NoteRect, type RollViewport } from './geometry';
import { renderRoll, rollColors } from './renderer';
import type { MotifSession } from './session';
interface Gesture { pointerId: number; x: number; y: number; resize: boolean; moved: boolean; deltaTick: number; deltaPitch: number; ids: ReadonlySet<string>; notes: Note[] }
export class PianoRoll {
  readonly canvas: HTMLCanvasElement;
  readonly scroller: HTMLElement;
  grid: Grid = 'sixteenth'; mode: 'draw' | 'select' = 'draw'; durationQuarters = .5;
  private model: Motif; private index: NoteIndex; private rectangles: NoteRect[] = []; private gesture?: Gesture;
  private preview: NoteRect[] = []; private context: CanvasRenderingContext2D | null;
  private frame?: number; private active = true; private pixels = 80; private rowHeight = 20;
  private readonly spacer: HTMLElement; private readonly lifetime = new AbortController(); private readonly cleanups: (() => void)[] = [];
  private view: RollViewport;
  /** `snapshot`: the caller's current draft copy (4G: avoids another full clone while the editor renders). */
  constructor(root: HTMLElement, readonly session: MotifSession, snapshot: Motif, private readonly selectionChanged: () => void, private readonly status: (message: string) => void, private readonly playhead: () => number | undefined) {
    const doc = root.ownerDocument;
    this.model = snapshot; this.index = new NoteIndex(this.model.data.notes);
    this.scroller = doc.createElement('div'); this.scroller.className = 'mnemobard-roll-scroll'; root.append(this.scroller);
    this.spacer = doc.createElement('div'); this.spacer.className = 'mnemobard-roll-space'; this.scroller.append(this.spacer);
    this.canvas = doc.createElement('canvas'); this.canvas.className = 'mnemobard-piano-roll'; this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Piano roll. Draw on empty space, drag notes, resize their right edge. Use the note list for keyboard editing.'); this.spacer.append(this.canvas);
    this.context = this.canvas.getContext('2d');
    this.view = { width: 600, height: 360, startTick: 0, topPitch: 72, ppq: this.model.data.ppq, pixelsPerQuarter: this.pixels, rowHeight: this.rowHeight };
    this.resize(); this.scroller.scrollTop = (127 - 72) * this.rowHeight; this.scroll();
    const listen = <K extends keyof HTMLElementEventMap>(node: HTMLElement, type: K, callback: (event: HTMLElementEventMap[K]) => void): void => { node.addEventListener(type, callback, { signal: this.lifetime.signal }); };
    listen(this.scroller, 'scroll', () => { this.cancelGesture(); this.scroll(); });
    listen(this.canvas, 'pointerdown', event => this.down(event)); listen(this.canvas, 'pointermove', event => this.move(event));
    listen(this.canvas, 'pointerup', event => this.up(event)); listen(this.canvas, 'pointercancel', () => this.cancelGesture()); listen(this.canvas, 'lostpointercapture', () => this.cancelGesture());
    this.scroller.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); this.zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - this.canvas.getBoundingClientRect().left); }
      else if (event.shiftKey && !event.deltaX) { event.preventDefault(); this.scroller.scrollLeft += event.deltaY; }
    }, { passive: false, signal: this.lifetime.signal });
    listen(this.canvas, 'keydown', event => { if (event.key === 'Escape') { this.cancelGesture(); session.select([]); this.selectionChanged(); this.request(); } });
    this.canvas.ownerDocument.defaultView?.addEventListener('resize', () => this.resize(), { signal: this.lifetime.signal });
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => this.resize()); observer?.observe(this.scroller); if (observer) this.cleanups.push(() => observer.disconnect());
    const theme = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => this.request()); theme?.observe(doc.body, { attributes: true, attributeFilter: ['class', 'style'] }); if (theme) this.cleanups.push(() => theme.disconnect());
    this.cleanups.push(session.subscribe(() => { this.cancelGesture(); this.model = session.draft; this.index = new NoteIndex(this.model.data.notes); this.resize(); }));
    if (!this.context) this.status('Canvas is unavailable; use the numeric note list.');
    this.request();
  }
  get viewport(): RollViewport { return { ...this.view }; }
  get visibleCount(): number { return this.rectangles.length; }
  private resize(): void {
    if (!this.active) return;
    const width = Math.max(180, this.scroller.clientWidth || 600), height = this.scroller.clientHeight || 360;
    this.spacer.style.width = `${Math.max(width, PITCH_GUTTER + this.model.data.lengthTicks / this.model.data.ppq * this.pixels)}px`;
    this.spacer.style.height = `${RULER_HEIGHT + 128 * this.rowHeight}px`;
    this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    const size = backingSize(width, height, this.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1);
    this.canvas.width = size.width; this.canvas.height = size.height; this.context?.setTransform(size.scale, 0, 0, size.scale, 0, 0);
    this.view = { ...this.view, width, height, ppq: this.model.data.ppq, pixelsPerQuarter: this.pixels, rowHeight: this.rowHeight }; this.scroll();
  }
  private scroll(): void { this.view.startTick = this.scroller.scrollLeft / this.pixels * this.model.data.ppq; this.view.topPitch = 127 - this.scroller.scrollTop / this.rowHeight; this.request(); }
  zoom(factor: number, anchor = (this.view.width + PITCH_GUTTER) / 2): void {
    this.cancelGesture(); const next = Math.max(16, Math.min(320, this.pixels * factor)), start = anchoredStart(this.view, next, anchor);
    this.pixels = next; this.resize(); this.scroller.scrollLeft = start / this.model.data.ppq * next; this.scroll();
  }
  zoomPitch(factor: number): void {
    this.cancelGesture(); const center = this.view.topPitch - (this.view.height - RULER_HEIGHT) / this.rowHeight / 2;
    this.rowHeight = Math.max(14, Math.min(36, this.rowHeight * factor)); this.resize();
    this.scroller.scrollTop = (127 - center - (this.view.height - RULER_HEIGHT) / this.rowHeight / 2) * this.rowHeight; this.scroll();
  }
  reveal(note: Note): void { this.scroller.scrollLeft = Math.max(0, note.startTick / this.model.data.ppq * this.pixels - (this.view.width - PITCH_GUTTER) / 3); this.scroller.scrollTop = Math.max(0, (127 - note.pitch) * this.rowHeight - (this.view.height - RULER_HEIGHT) / 2); this.scroll(); }
  request(): void { if (this.active && this.context && this.frame === undefined) this.frame = requestAnimationFrame(() => { this.frame = undefined; this.draw(); }); }
  draw(): void {
    if (!this.active || !this.context) return;
    const backing = backingSize(this.view.width, this.view.height, this.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1);
    if (this.canvas.width !== backing.width || this.canvas.height !== backing.height) this.resize();
    const playhead = this.playhead();
    let step = this.model.data.ppq; try { step = gridTicks(this.model.data.ppq, this.grid); } catch { /* unsupported grid is diagnosed when an edit is requested */ }
    this.rectangles = renderRoll(this.context, this.model, this.index, this.view, this.session.selected, rollColors(this.canvas), step, playhead, this.preview);
    if (playhead !== undefined) this.request();
  }
  refreshSelection(): void { this.request(); }
  private point(event: PointerEvent): { x: number; y: number } { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  private down(event: PointerEvent): void {
    if (event.button !== 0 || !this.active) return;
    const { x, y } = this.point(event); if (x < PITCH_GUTTER || y < RULER_HEIGHT) return;
    event.preventDefault(); this.canvas.focus();
    const hit = noteHit(this.index.query(this.view), x, y), modifier = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!hit) {
      if (this.mode === 'select') { if (!modifier) this.session.select([]); this.selectionChanged(); this.request(); return; }
      try {
        const point = gridPoint(x, y, this.view), tick = snapped(point.tick, this.model.data.ppq, this.grid), duration = this.model.data.ppq * this.durationQuarters;
        let id = ''; this.session.edit('Add note', motif => { const next = addNote(motif, { pitch: point.pitch, startTick: tick, durationTicks: duration, velocity: 96 }); id = next.data.notes.at(-1)?.id ?? ''; return next; });
        this.session.select([id]); this.selectionChanged(); this.request();
      } catch (error) { this.status(messageOf(error)); }
      return;
    }
    const selected = new Set(this.session.selected);
    if (modifier) { if (selected.has(hit.id)) selected.delete(hit.id); else selected.add(hit.id); }
    else if (!selected.has(hit.id)) { selected.clear(); selected.add(hit.id); }
    this.session.select(selected); this.selectionChanged(); this.request();
    if (!selected.has(hit.id)) return;
    this.gesture = { pointerId: event.pointerId, x, y, resize: x >= hit.x + hit.width - Math.min(7, hit.width / 3), moved: false, deltaTick: 0, deltaPitch: 0, ids: selected, notes: this.model.data.notes.filter(note => selected.has(note.id)) };
    this.canvas.setPointerCapture(event.pointerId);
  }
  private move(event: PointerEvent): void {
    const gesture = this.gesture; if (!gesture || gesture.pointerId !== event.pointerId) return;
    const { x, y } = this.point(event);
    try {
      const tick = snapped((x - gesture.x) / this.pixels * this.model.data.ppq, this.model.data.ppq, this.grid), pitch = gesture.resize ? 0 : -Math.round((y - gesture.y) / this.rowHeight);
      const notes = gesture.notes.map(note => gesture.resize ? { ...note, durationTicks: note.durationTicks + tick } : { ...note, startTick: note.startTick + tick, pitch: note.pitch + pitch });
      if (notes.some(note => note.pitch < 0 || note.pitch > 127 || note.startTick < 0 || note.durationTicks < 1 || note.startTick + note.durationTicks > this.model.data.lengthTicks)) throw Error('Move/resize exceeds musical bounds; release cancels this gesture.');
      gesture.deltaTick = tick; gesture.deltaPitch = pitch; gesture.moved = tick !== 0 || pitch !== 0;
      this.preview = notes.map(note => noteRect(note, this.view)); this.request();
    } catch (error) { gesture.moved = false; this.preview = []; this.status(messageOf(error)); this.request(); }
  }
  private up(event: PointerEvent): void {
    const gesture = this.gesture; if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.gesture = undefined; this.preview = [];
    try {
      if (gesture.moved) this.session.edit(gesture.resize ? 'Resize notes' : 'Move notes', motif => gesture.resize ? resizeNotes(motif, gesture.ids, gesture.deltaTick) : moveNotes(motif, gesture.ids, gesture.deltaTick, gesture.deltaPitch));
      this.selectionChanged();
    } catch (error) { this.status(messageOf(error)); }
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); this.request();
  }
  cancelGesture(): void { const gesture = this.gesture; this.gesture = undefined; this.preview = []; if (gesture && this.canvas.hasPointerCapture(gesture.pointerId)) this.canvas.releasePointerCapture(gesture.pointerId); this.request(); }
  dispose(): void { this.active = false; this.cancelGesture(); this.lifetime.abort(); if (this.frame !== undefined) cancelAnimationFrame(this.frame); this.frame = undefined; for (const cleanup of this.cleanups.splice(0)) cleanup(); }
}
