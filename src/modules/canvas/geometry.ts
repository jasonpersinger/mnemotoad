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
