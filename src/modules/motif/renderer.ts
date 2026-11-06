import type { Motif } from '../../domain/entities';
import { noteName } from './commands';
import { NoteIndex, PITCH_GUTTER, RULER_HEIGHT, type RollViewport, type NoteRect } from './geometry';
export interface RollColors { background: string; alternate: string; line: string; text: string; faint: string; accent: string; onAccent: string }
export function rollColors(root: HTMLElement): RollColors {
  const style = getComputedStyle(root), get = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  return { background: get('--background-primary', '#202020'), alternate: get('--background-secondary', '#292929'), line: get('--background-modifier-border', '#555'), text: get('--text-normal', '#ddd'), faint: get('--text-muted', '#aaa'), accent: get('--interactive-accent', '#987ce6'), onAccent: get('--text-on-accent', '#fff') };
}
/** CSS-pixel submission; caller scales the backing store for DPI once. */
export function renderRoll(context: CanvasRenderingContext2D, motif: Motif, index: NoteIndex, view: RollViewport,
  selected: ReadonlySet<string>, colors: RollColors, gridStep: number, playhead?: number, preview: readonly NoteRect[] = []): NoteRect[] {
  const { width, height, rowHeight, pixelsPerQuarter, ppq } = view;
  context.clearRect(0, 0, width, height); context.fillStyle = colors.background; context.fillRect(0, 0, width, height);
  context.font = '12px sans-serif'; context.textBaseline = 'middle';
  const black = new Set([1, 3, 6, 8, 10]);
  for (let pitch = Math.min(127, Math.ceil(view.topPitch)); pitch >= Math.max(0, Math.floor(view.topPitch - height / rowHeight)); pitch--) {
    const y = RULER_HEIGHT + (view.topPitch - pitch) * rowHeight;
    if (black.has(pitch % 12)) { context.fillStyle = colors.alternate; context.fillRect(0, y, width, rowHeight); }
    context.strokeStyle = colors.line; context.lineWidth = .5; context.beginPath(); context.moveTo(0, y + rowHeight); context.lineTo(width, y + rowHeight); context.stroke();
  }
  context.save(); context.beginPath(); context.rect(PITCH_GUTTER, RULER_HEIGHT, width - PITCH_GUTTER, height - RULER_HEIGHT); context.clip();
  const beat = ppq * 4 / motif.data.meter.denominator, bar = beat * motif.data.meter.numerator;
  const minimum = ppq * 8 / pixelsPerQuarter, step = gridStep * Math.max(1, Math.ceil(minimum / gridStep));
  // Musical beat lines stay exact; fine grid lines are culled when below8CSSpx.
  for (const spacing of [step, beat, bar]) {
    if (spacing / ppq * pixelsPerQuarter < 6) continue;
    for (let tick = Math.floor(view.startTick / spacing) * spacing; tick < view.startTick + width / pixelsPerQuarter * ppq; tick += spacing) {
      const x = PITCH_GUTTER + (tick - view.startTick) / ppq * pixelsPerQuarter;
      context.strokeStyle = colors.line; context.lineWidth = spacing === bar ? 1.8 : spacing === beat ? .9 : .4; context.beginPath(); context.moveTo(x, RULER_HEIGHT); context.lineTo(x, height); context.stroke();
    }
  }
  const rectangles = index.query(view);
  const draw = (rect: NoteRect, ghost = false): void => {
    context.globalAlpha = ghost ? .5 : .6 + .4 * rect.note.velocity / 127; context.fillStyle = colors.accent;
    context.fillRect(rect.x, rect.y, rect.width, rect.height); context.globalAlpha = 1;
    context.strokeStyle = selected.has(rect.id) ? colors.text : colors.faint; context.lineWidth = selected.has(rect.id) ? 2.5 : .6;
    context.strokeRect(rect.x + .5, rect.y + .5, Math.max(1, rect.width - 1), rect.height - 1);
    if (selected.has(rect.id)) { context.fillStyle = colors.text; context.fillRect(rect.x + 3, rect.y + 3, 3, 3); }
    if (rect.width > 42) { context.fillStyle = colors.onAccent; context.fillText(noteName(rect.note.pitch), rect.x + 7, rect.y + rect.height / 2, rect.width - 10); }
  };
  for (const rect of rectangles) draw(rect); for (const rect of preview) draw(rect, true);
  if (playhead !== undefined) { const x = PITCH_GUTTER + (playhead - view.startTick) / ppq * pixelsPerQuarter; context.strokeStyle = colors.text; context.lineWidth = 2; context.beginPath(); context.moveTo(x, RULER_HEIGHT); context.lineTo(x, height); context.stroke(); }
  context.restore();
  context.fillStyle = colors.alternate; context.fillRect(0, 0, PITCH_GUTTER, height); context.fillRect(0, 0, width, RULER_HEIGHT);
  context.fillStyle = colors.faint;
  for (let pitch = Math.min(127, Math.ceil(view.topPitch)); pitch >= Math.max(0, Math.floor(view.topPitch - height / rowHeight)); pitch--) {
    const y = RULER_HEIGHT + (view.topPitch - pitch) * rowHeight + rowHeight / 2;
    if (y > RULER_HEIGHT) context.fillText(noteName(pitch), 9, y);
  }
  for (let tick = Math.floor(view.startTick / bar) * bar; tick < view.startTick + width / pixelsPerQuarter * ppq; tick += bar) {
    const x = PITCH_GUTTER + (tick - view.startTick) / ppq * pixelsPerQuarter;
    if (x >= PITCH_GUTTER) { context.fillStyle = colors.text; context.fillText(String(Math.round(tick / bar) + 1), x + 5, RULER_HEIGHT / 2); }
  }
  context.fillStyle = colors.faint; context.fillText('PITCH', 6, RULER_HEIGHT / 2);
  return rectangles;
}
