import { describe, expect, it } from 'vitest';
import { anchoredZoom, hit, movePreview, rectangle, RegionIndex, resizePreview, syntheticNotes, visible, type Viewport } from '../experiments/geometry';
const viewport: Viewport = { width: 960, height: 360, start: 0, row: 48, pixelsPerQuarter: 60, rowHeight: 15 };
describe('experimental shared grid geometry', () => {
  it.each([100, 1000, 5000, 20000])('indexed culling agrees with a linear reference at %i notes', count => {
    const notes = syntheticNotes(count), indexed = new RegionIndex(notes);
    for (const start of [0, .5, 16, 128]) {
      const view = { ...viewport, start };
      expect(indexed.query(view)).toEqual(notes.map(note => rectangle(note, view)).filter(rect => visible(rect, view)));
    }
  });
  it('uses half-open hit bounds and topmost draw order without DPI coupling', () => {
    const rect = { id: 1, x: 10, y: 10, width: 20, height: 10 };
    expect(hit([rect], 30, 12)).toBeUndefined();
    expect(hit([rect, { ...rect, id: 2 }], 10, 10)).toBe(2);
  });
  it('keeps the zoom anchor fixed and previews move/resize without altering original', () => {
    const region = { id: 1, start: 2, duration: 1, row: 60, type: 'note' as const };
    const zoom = anchoredZoom(viewport, 120, 2);
    expect(zoom.start + 120 / zoom.pixelsPerQuarter).toBe(viewport.start + 120 / viewport.pixelsPerQuarter);
    expect(movePreview(region, 60, 15, viewport)).toEqual({ ...region, start: 3, row: 61 });
    expect(resizePreview(region, -120, viewport).duration).toBe(1 / 960);
    expect(region.duration).toBe(1);
  });
});
