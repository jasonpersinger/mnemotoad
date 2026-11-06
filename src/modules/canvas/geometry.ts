import type { ArrangementPlan, ResolvedClip } from '../../arrangement/preflight';
export const LANE_GUTTER = 172, RULER = 32, LANE_HEIGHT = 64;
export interface TimelineViewport {
    width: number;
    height: number;
    startTick: number;
    scrollY: number;
    pixelsPerQuarter: number;
    ppq: number;
}
export interface ClipRect {
    x: number;
    y: number;
    width: number;
    height: number;
    clip: ResolvedClip;
}
export function timelinePoint(x: number, y: number, v: TimelineViewport): {
    tick: number;
    laneIndex: number;
} { return { tick: v.startTick + (x - LANE_GUTTER) / v.pixelsPerQuarter * v.ppq, laneIndex: Math.floor((y - RULER + v.scrollY) / LANE_HEIGHT) }; }
export function clipRectangle(clip: ResolvedClip, v: TimelineViewport, fallbackPeriod = 960): ClipRect { const period = clip.periodTicks ?? fallbackPeriod; return { x: LANE_GUTTER + (clip.startTick - v.startTick) / v.ppq * v.pixelsPerQuarter, y: RULER + clip.laneIndex * LANE_HEIGHT - v.scrollY + 10, width: Math.max(8, (clip.durationTicks ?? period * clip.repeatCount) / v.ppq * v.pixelsPerQuarter), height: 44, clip }; }
export function visibleClips(plan: ArrangementPlan, v: TimelineViewport, fallback: (id: string) => number = () => 960): ClipRect[] { return plan.clips.map(c => clipRectangle(c, v, fallback(c.id))).filter(r => r.x + r.width > LANE_GUTTER && r.x < v.width && r.y + r.height > RULER && r.y < v.height); }
export function clipHit(rectangles: readonly ClipRect[], x: number, y: number): ClipRect | undefined { return [...rectangles].reverse().find(r => x >= Math.max(LANE_GUTTER, r.x) && x < r.x + r.width && y >= Math.max(RULER, r.y) && y < r.y + r.height); }
export function anchoredTimelineStart(v: TimelineViewport, nextScale: number, anchor: number): number { return Math.max(0, v.startTick + (anchor - LANE_GUTTER) * v.ppq * (1 / v.pixelsPerQuarter - 1 / nextScale)); }
/** 4C structure ruler: a separate fixed canvas above the scroller sharing this viewport's X transform. */
export const SECTION_BAND = 22, MARKER_BAND = 20, STRUCTURE_HEIGHT = SECTION_BAND + MARKER_BAND;
export function tickX(tick: number, v: TimelineViewport): number { return LANE_GUTTER + (tick - v.startTick) / v.ppq * v.pixelsPerQuarter; }
export type StructureHit = { kind: 'section'; id: string; edge: 'start' | 'end' | 'body' } | { kind: 'marker'; id: string };
interface Span { id: string; startTick: number; endTick: number }
interface Point { id: string; tick: number }
/** Edge zones lie inside a section, so touching neighbours never compete for one pixel. */
export function structureHit(sections: readonly Span[], markers: readonly Point[], x: number, y: number, v: TimelineViewport, edge = 6): StructureHit | undefined {
    if (x < LANE_GUTTER || y < 0 || y >= STRUCTURE_HEIGHT) return undefined;
    if (y < SECTION_BAND) {
        for (const s of sections) {
            const start = tickX(s.startTick, v), end = tickX(s.endTick, v), zone = Math.min(edge, (end - start) / 3);
            if (x < start || x >= end) continue;
            return { kind: 'section', id: s.id, edge: x - start < zone ? 'start' : end - x <= zone ? 'end' : 'body' };
        }
        return undefined;
    }
    let best: Point | undefined, distance = 6;
    for (const m of markers) { const d = Math.abs(tickX(m.tick, v) - x); if (d <= distance) { best = m; distance = d; } }
    return best ? { kind: 'marker', id: best.id } : undefined;
}
