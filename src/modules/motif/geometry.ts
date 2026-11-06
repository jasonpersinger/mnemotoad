import type { Note } from '../../domain/entities';
export const PITCH_GUTTER = 56, RULER_HEIGHT = 28;
export interface RollViewport { width: number; height: number; startTick: number; topPitch: number; pixelsPerQuarter: number; rowHeight: number; ppq: number }
export interface NoteRect { id: string; x: number; y: number; width: number; height: number; note: Note }
export function noteRect(note: Note, view: RollViewport): NoteRect {
  return { id: note.id, note, x: PITCH_GUTTER + (note.startTick - view.startTick) / view.ppq * view.pixelsPerQuarter,
    y: RULER_HEIGHT + (view.topPitch - note.pitch) * view.rowHeight + 2, width: Math.max(2, note.durationTicks / view.ppq * view.pixelsPerQuarter), height: view.rowHeight - 4 };
}
export function gridPoint(x: number, y: number, view: RollViewport): { tick: number; pitch: number } {
  return { tick: view.startTick + (x - PITCH_GUTTER) / view.pixelsPerQuarter * view.ppq, pitch: Math.ceil(view.topPitch - (y - RULER_HEIGHT) / view.rowHeight) };
}
export function noteHit(rects: readonly NoteRect[], x: number, y: number): NoteRect | undefined {
  return rects.slice().reverse().find(rect => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height);
}
export function anchoredStart(view: RollViewport, nextPixels: number, anchorX: number): number {
  return Math.max(0, view.startTick + (anchorX - PITCH_GUTTER) * view.ppq * (1 / view.pixelsPerQuarter - 1 / nextPixels));
}
export { backingSize } from '../../ui/canvas-metrics';
/** Per-pitch sorted intervals with prefix-end lookup; no fixed-duration bucket explosion. */
export class NoteIndex {
  private rows = new Map<number, { note: Note; end: number }[]>();
  constructor(notes: readonly Note[]) {
    const grouped = new Map<number, Note[]>();
    for (const note of notes) { const row = grouped.get(note.pitch) ?? []; row.push(note); grouped.set(note.pitch, row); }
    for (const [pitch, notes] of grouped) {
      let end = 0; this.rows.set(pitch, notes.slice().sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id)).map(note => { end = Math.max(end, note.startTick + note.durationTicks); return { note, end }; }));
    }
  }
  query(view: RollViewport): NoteRect[] {
    const result: NoteRect[] = [], right = view.startTick + Math.max(0, view.width - PITCH_GUTTER) / view.pixelsPerQuarter * view.ppq;
    const bottom = view.topPitch - (view.height - RULER_HEIGHT) / view.rowHeight;
    for (let pitch = Math.min(127, Math.ceil(view.topPitch)); pitch >= Math.max(0, Math.floor(bottom)); pitch--) {
      const row = this.rows.get(pitch); if (!row) continue;
      let low = 0, high = row.length;
      while (low < high) { const mid = (low + high) >>> 1; if ((row[mid]?.end ?? 0) <= view.startTick) low = mid + 1; else high = mid; }
      for (let i = low; i < row.length; i++) {
        const item = row[i]; if (!item || item.note.startTick >= right) break;
        if (item.note.startTick + item.note.durationTicks > view.startTick) { const rect = noteRect(item.note, view); if (rect.y + rect.height > RULER_HEIGHT && rect.y < view.height) result.push(rect); }
      }
    }
    return result;
  }
}
