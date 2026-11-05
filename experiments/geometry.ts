/** Synthetic geometry only. Coordinates are CSS pixels; backing DPI never changes musical positions. */
export interface Region { readonly id: number; readonly start: number; readonly duration: number; readonly row: number; readonly type: 'note' | 'clip' | 'audio' | 'marker' }
export interface Viewport { readonly width: number; readonly height: number; readonly start: number; readonly row: number; readonly pixelsPerQuarter: number; readonly rowHeight: number }
export interface Rect { readonly id: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export function rectangle(region: Region, viewport: Viewport): Rect {
  return { id: region.id, x: (region.start - viewport.start) * viewport.pixelsPerQuarter, y: (region.row - viewport.row) * viewport.rowHeight, width: region.duration * viewport.pixelsPerQuarter, height: viewport.rowHeight - 2 };
}
export function visible(rect: Rect, viewport: Viewport): boolean {
  return rect.x + rect.width > 0 && rect.x < viewport.width && rect.y + rect.height > 0 && rect.y < viewport.height;
}
export function hit(rectangles: readonly Rect[], x: number, y: number): number | undefined {
  // Later draw order wins; no backing-DPI multiplier belongs in hit testing.
  for (let i = rectangles.length - 1; i >= 0; i--) {
    const rect = rectangles[i];
    if (rect && x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height) return rect.id;
  }
  return undefined;
}
export function movePreview(region: Region, dx: number, dy: number, viewport: Viewport): Region {
  return { ...region, start: Math.max(0, region.start + dx / viewport.pixelsPerQuarter), row: Math.max(0, Math.min(127, region.row + Math.round(dy / viewport.rowHeight))) };
}
export function resizePreview(region: Region, dx: number, viewport: Viewport): Region {
  return { ...region, duration: Math.max(1 / 960, region.duration + dx / viewport.pixelsPerQuarter) };
}
export function anchoredZoom(viewport: Viewport, anchorX: number, factor: number): Viewport {
  const pixelsPerQuarter = Math.max(4, Math.min(960, viewport.pixelsPerQuarter * factor));
  return { ...viewport, pixelsPerQuarter, start: viewport.start + anchorX / viewport.pixelsPerQuarter - anchorX / pixelsPerQuarter };
}
export function syntheticNotes(count: number, dense = false): Region[] {
  return Array.from({ length: count }, (_, id) => ({ id, start: dense ? (id % 128) / 8 : ((id * 37) % 4096) / 16, duration: .25 + id % 4 / 4, row: dense ? 48 + id % 24 : 36 + id * 17 % 60, type: 'note' }));
}
export function syntheticArrangement(count: number, lanes: number): Region[] {
  return Array.from({ length: count }, (_, id) => ({ id, start: Math.floor(id / lanes) * 4, duration: id % 20 === 0 ? .125 : 3.75, row: id % lanes, type: id % 20 === 0 ? 'marker' : id % 7 === 0 ? 'audio' : 'clip' }));
}
/** Static row/time-bucket index; reindex edited regions on future committed gestures. */
export class RegionIndex {
  private readonly buckets = new Map<string, Region[]>();
  constructor(regions: readonly Region[]) {
    for (const region of regions) {
      for (let bucket = Math.floor(region.start / 16); bucket <= Math.floor((region.start + region.duration) / 16); bucket++) {
        const key = `${region.row}:${bucket}`, values = this.buckets.get(key) ?? [];
        values.push(region); this.buckets.set(key, values);
      }
    }
  }
  query(viewport: Viewport): Rect[] {
    const found = new Map<number, Rect>();
    for (let row = Math.floor(viewport.row); row <= Math.ceil(viewport.row + viewport.height / viewport.rowHeight); row++) {
      for (let bucket = Math.floor(viewport.start / 16); bucket <= Math.floor((viewport.start + viewport.width / viewport.pixelsPerQuarter) / 16); bucket++) {
        for (const region of this.buckets.get(`${row}:${bucket}`) ?? []) {
          if (found.has(region.id)) continue;
          const rect = rectangle(region, viewport); if (visible(rect, viewport)) found.set(region.id, rect);
        }
      }
    }
    return [...found.values()].sort((a, b) => a.id - b.id);
  }
}
