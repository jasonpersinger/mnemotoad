import type { Composition } from '../../domain/entities';
import type { ArrangementPlan } from '../../arrangement/preflight';
import { gridTicks, snapped, type Grid } from '../../music/grid';
import { backingSize } from '../../ui/canvas-metrics';
import { LANE_GUTTER, LANE_HEIGHT, RULER, visibleClips, clipHit, timelinePoint, anchoredTimelineStart, type TimelineViewport, type ClipRect } from './geometry';
interface Gesture {
    pointer: number;
    x: number;
    y: number;
    clipId: string;
    start: number;
    lane: number;
    period: number;
    repeat: number;
    nextStart: number;
    nextLane: number;
    moved: boolean;
    valid: boolean;
}
export class ArrangementTimeline {
    readonly canvas: HTMLCanvasElement;
    readonly scroller: HTMLElement;
    grid: Grid = 'sixteenth';
    private readonly spacer: HTMLElement;
    private context: CanvasRenderingContext2D | null;
    private lifetime = new AbortController();
    private cleanups: (() => void)[] = [];
    private frame?: number;
    private active = true;
    private scale = 48;
    private gesture?: Gesture;
    private selectedClip?: string;
    private selectedLane?: string;
    private fallbackPeriods = new Map<string, number>();
    private warned = new Set<string>();
    private model: Composition;
    private plan: ArrangementPlan;
    private viewportState: TimelineViewport;
    private rectangles: ClipRect[] = [];
    constructor(root: HTMLElement, model: Composition, plan: ArrangementPlan, private readonly select: (laneId: string, clipId?: string) => boolean, private readonly move: (id: string, laneId: string, start: number) => void, private readonly insert: (laneId: string, start: number) => void, private readonly status: (text: string) => void) {
        this.model = model;
        this.plan = plan;
        this.cache();
        const doc = root.ownerDocument;
        this.scroller = doc.createElement('div');
        this.scroller.className = 'mnemobard-arrangement-scroll';
        root.append(this.scroller);
        this.spacer = doc.createElement('div');
        this.spacer.className = 'mnemobard-arrangement-space';
        this.scroller.append(this.spacer);
        this.canvas = doc.createElement('canvas');
        this.canvas.className = 'mnemobard-arrangement-canvas';
        this.canvas.tabIndex = 0;
        this.canvas.setAttribute('aria-label', 'Arrangement timeline. Select or drag clips. Use lane and clip controls for keyboard placement. Double-click empty time to place a motif.');
        this.spacer.append(this.canvas);
        this.context = this.canvas.getContext('2d');
        this.viewportState = { width: 800, height: 400, startTick: 0, scrollY: 0, pixelsPerQuarter: this.scale, ppq: model.data.ppq };
        const listen = <K extends keyof HTMLElementEventMap>(node: HTMLElement, type: K, fn: (event: HTMLElementEventMap[K]) => void) => node.addEventListener(type, fn, { signal: this.lifetime.signal });
        listen(this.scroller, 'scroll', () => { this.cancelGesture(); this.scroll(); });
        listen(this.canvas, 'pointerdown', e => this.down(e));
        listen(this.canvas, 'pointermove', e => this.drag(e));
        listen(this.canvas, 'pointerup', e => this.up(e));
        listen(this.canvas, 'pointercancel', () => this.cancelGesture());
        listen(this.canvas, 'lostpointercapture', () => this.cancelGesture());
        listen(this.canvas, 'keydown', e => { if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.cancelGesture();
            this.request();
        } });
        listen(this.canvas, 'dblclick', e => { const { x, y } = this.point(e), p = timelinePoint(x, y, this.viewportState), lane = this.model.data.lanes[p.laneIndex]; if (x >= LANE_GUTTER && y >= RULER && lane && !clipHit(this.rectangles, x, y))
            this.insert(lane.id, Math.max(0, snapped(p.tick, this.model.data.ppq, this.grid))); });
        this.scroller.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - this.canvas.getBoundingClientRect().left);
        }
        else if (e.shiftKey && !e.deltaX) {
            e.preventDefault();
            this.scroller.scrollLeft += e.deltaY;
        } }, { passive: false, signal: this.lifetime.signal });
        const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => this.resize());
        resize?.observe(this.scroller);
        if (resize)
            this.cleanups.push(() => resize.disconnect());
        const theme = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => this.request());
        theme?.observe(doc.body, { attributes: true, attributeFilter: ['class', 'style'] });
        if (theme)
            this.cleanups.push(() => theme.disconnect());
        doc.defaultView?.addEventListener('resize', () => this.resize(), { signal: this.lifetime.signal });
        this.resize();
    }
    get viewport(): TimelineViewport { return { ...this.viewportState }; }
    get visibleCount(): number { return this.rectangles.length; }
    update(model: Composition, plan: ArrangementPlan): void { this.cancelGesture(); this.model = model; this.plan = plan; this.cache(); this.resize(); }
    selection(laneId?: string, clipId?: string): void { this.selectedLane = laneId; this.selectedClip = clipId; this.request(); }
    private cache(): void { this.fallbackPeriods = new Map(this.model.data.lanes.flatMap(l => l.clips.map(c => [c.id, c.reviewedLengthTicks ?? this.model.data.ppq] as const))); this.warned = new Set(this.plan.diagnostics.filter(d => d.severity === 'warning' && d.clipId).map(d => d.clipId ?? '')); }
    private resize(): void { if (!this.active)
        return; const width = Math.max(240, this.scroller.clientWidth || 800), height = this.scroller.clientHeight || 400; this.spacer.style.width = `${Math.max(width, LANE_GUTTER + this.model.data.lengthTicks / this.model.data.ppq * this.scale)}px`; this.spacer.style.height = `${Math.max(height, RULER + this.model.data.lanes.length * LANE_HEIGHT)}px`; this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`; const backing = backingSize(width, height, this.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1); this.canvas.width = backing.width; this.canvas.height = backing.height; this.context?.setTransform(backing.scale, 0, 0, backing.scale, 0, 0); this.viewportState = { ...this.viewportState, width, height, ppq: this.model.data.ppq, pixelsPerQuarter: this.scale }; this.scroll(); }
    private scroll(): void { this.viewportState.startTick = this.scroller.scrollLeft / this.scale * this.model.data.ppq; this.viewportState.scrollY = this.scroller.scrollTop; this.request(); }
    zoom(factor: number, anchor = (this.viewportState.width + LANE_GUTTER) / 2): void { this.cancelGesture(); const next = Math.max(8, Math.min(192, this.scale * factor)), start = anchoredTimelineStart(this.viewportState, next, anchor); this.scale = next; this.resize(); this.scroller.scrollLeft = start / this.model.data.ppq * next; this.scroll(); }
    reveal(id: string): void { const clip = this.plan.clips.find(c => c.id === id); if (!clip)
        return; this.scroller.scrollLeft = Math.max(0, clip.startTick / this.model.data.ppq * this.scale - (this.viewportState.width - LANE_GUTTER) / 3); this.scroller.scrollTop = Math.max(0, clip.laneIndex * LANE_HEIGHT - LANE_HEIGHT); this.scroll(); }
    request(): void { if (this.active && this.context && this.frame === undefined)
        this.frame = requestAnimationFrame(() => { this.frame = undefined; this.draw(); }); }
    draw(): void {
        const ctx = this.context;
        if (!ctx || !this.active)
            return;
        const v = this.viewportState, size = backingSize(v.width, v.height, this.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1);
        if (size.width !== this.canvas.width || size.height !== this.canvas.height)
            this.resize();
        const css = getComputedStyle(this.canvas), color = (key: string, fallback: string) => css.getPropertyValue(key).trim() || fallback, bg = color('--background-primary', '#19181d'), alt = color('--background-secondary', '#24222b'), line = color('--background-modifier-border', '#3d3948'), text = color('--text-normal', '#e5e0eb'), faint = color('--text-muted', '#aaa2b7'), accent = color('--interactive-accent', '#987bd0'), onAccent = color('--text-on-accent', '#fff'), error = color('--text-error', '#d67878');
        ctx.clearRect(0, 0, v.width, v.height);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, v.width, v.height);
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'middle';
        for (const [index, lane] of this.model.data.lanes.entries()) {
            const y = RULER + index * LANE_HEIGHT - v.scrollY;
            if (y + LANE_HEIGHT < RULER || y > v.height)
                continue;
            ctx.fillStyle = lane.id === this.selectedLane ? alt : index % 2 ? alt : bg;
            ctx.fillRect(LANE_GUTTER, y, v.width - LANE_GUTTER, LANE_HEIGHT);
            ctx.strokeStyle = line;
            ctx.beginPath();
            ctx.moveTo(0, y + LANE_HEIGHT);
            ctx.lineTo(v.width, y + LANE_HEIGHT);
            ctx.stroke();
        }
        const beat = v.ppq * 4 / this.model.data.meter.denominator, bar = beat * this.model.data.meter.numerator;
        let step = gridTicks(v.ppq, this.grid);
        while (step / v.ppq * v.pixelsPerQuarter < 9)
            step *= 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(LANE_GUTTER, RULER, v.width - LANE_GUTTER, v.height - RULER);
        ctx.clip();
        for (let tick = Math.max(0, Math.floor(v.startTick / step) * step); tick < v.startTick + v.width / v.pixelsPerQuarter * v.ppq; tick += step) {
            const x = LANE_GUTTER + (tick - v.startTick) / v.ppq * v.pixelsPerQuarter;
            ctx.strokeStyle = line;
            ctx.globalAlpha = tick % bar === 0 ? 1 : tick % beat === 0 ? .65 : .3;
            ctx.lineWidth = tick % bar === 0 ? 1.5 : 1;
            ctx.beginPath();
            ctx.moveTo(x, RULER);
            ctx.lineTo(x, v.height);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const fallback = (id: string) => this.fallbackPeriods.get(id) ?? v.ppq;
        this.rectangles = visibleClips(this.plan, v, fallback).sort((a, b) => Number(a.clip.id === this.selectedClip) - Number(b.clip.id === this.selectedClip));
        const paint = (r: ClipRect, ghost = false) => {
            const bad = r.clip.diagnostics.some(d => d.severity === 'error'), warn = this.warned.has(r.clip.id), selected = r.clip.id === this.selectedClip;
            ctx.globalAlpha = ghost ? .5 : 1;
            ctx.fillStyle = bad ? alt : accent;
            ctx.fillRect(r.x, r.y, r.width, r.height);
            ctx.strokeStyle = bad ? error : selected ? text : line;
            ctx.lineWidth = selected ? 3 : 1;
            ctx.strokeRect(r.x + 1, r.y + 1, Math.max(1, r.width - 2), r.height - 2);
            ctx.fillStyle = bad ? error : onAccent;
            const label = `${selected ? '▸ ' : ''}${bad ? '! ' : warn ? '△ ' : ''}${r.clip.title} ×${r.clip.repeatCount}`;
            if (r.width > 32)
                ctx.fillText(label, r.x + 8, r.y + 14, Math.max(1, r.width - 14));
            if (r.width > 80)
                ctx.fillText(bad ? 'unresolved · last reviewed extent' : `${r.clip.periodTicks} ticks / repeat`, r.x + 8, r.y + 31, r.width - 14);
            if (r.clip.periodTicks) {
                const spacing = r.clip.periodTicks / v.ppq * v.pixelsPerQuarter, first = Math.max(1, Math.ceil((LANE_GUTTER - r.x) / spacing)), last = Math.min(r.clip.repeatCount - 1, first + 255, Math.ceil((v.width - r.x) / spacing));
                ctx.strokeStyle = onAccent;
                ctx.globalAlpha = .3;
                for (let i = first; i <= last; i++) {
                    const x = r.x + i * spacing;
                    ctx.beginPath();
                    ctx.moveTo(x, r.y + 3);
                    ctx.lineTo(x, r.y + r.height - 3);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
        };
        for (const rect of this.rectangles)
            paint(rect);
        if (this.gesture?.moved) {
            const original = this.rectangles.find(r => r.clip.id === this.gesture?.clipId);
            if (original) {
                const g = this.gesture;
                paint({ ...original, x: LANE_GUTTER + (g.nextStart - v.startTick) / v.ppq * this.scale, y: RULER + g.nextLane * LANE_HEIGHT - v.scrollY + 10 }, true);
            }
        }
        ctx.restore();
        ctx.fillStyle = alt;
        ctx.fillRect(0, 0, LANE_GUTTER, v.height);
        ctx.fillRect(0, 0, v.width, RULER);
        ctx.fillStyle = faint;
        ctx.fillText('LANE / SOURCE', 12, RULER / 2);
        for (const [index, lane] of this.model.data.lanes.entries()) {
            const y = RULER + index * LANE_HEIGHT - v.scrollY;
            if (y < RULER - LANE_HEIGHT || y > v.height)
                continue;
            ctx.fillStyle = lane.id === this.selectedLane ? accent : text;
            ctx.font = lane.id === this.selectedLane ? 'bold 12px sans-serif' : '12px sans-serif';
            if (y + 24 > RULER)
                ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${lane.name}`, 12, y + 24, LANE_GUTTER - 20);
            ctx.font = '11px sans-serif';
            ctx.fillStyle = faint;
            if (y + 44 > RULER)
                ctx.fillText(`${lane.clips.length} clips`, 38, y + 44);
        }
        ctx.font = '12px sans-serif';
        ctx.fillStyle = text;
        const barStep = bar / v.ppq * this.scale < 30 ? Math.ceil(30 / (bar / v.ppq * this.scale)) : 1;
        for (let tick = Math.floor(v.startTick / (bar * barStep)) * bar * barStep; tick < v.startTick + v.width / this.scale * v.ppq; tick += bar * barStep) {
            const x = LANE_GUTTER + (tick - v.startTick) / v.ppq * this.scale;
            if (x >= LANE_GUTTER)
                ctx.fillText(String(Math.round(tick / bar) + 1), x + 5, RULER / 2);
        }
    }
    private point(e: MouseEvent): {
        x: number;
        y: number;
    } { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    private down(e: PointerEvent): void { if (e.button !== 0)
        return; const { x, y } = this.point(e); if (y < RULER)
        return; this.canvas.focus(); e.preventDefault(); const p = timelinePoint(x, y, this.viewportState), lane = this.model.data.lanes[p.laneIndex]; if (!lane)
        return; const hit = x >= LANE_GUTTER ? clipHit(this.rectangles, x, y) : undefined; if (!this.select(lane.id, hit?.clip.id))
        return; if (hit && hit.clip.periodTicks) {
        const c = hit.clip;
        this.gesture = { pointer: e.pointerId, x, y, clipId: c.id, start: c.startTick, lane: c.laneIndex, period: c.periodTicks ?? 960, repeat: c.repeatCount, nextStart: c.startTick, nextLane: c.laneIndex, moved: false, valid: true };
        this.canvas.setPointerCapture(e.pointerId);
    } this.request(); }
    private drag(e: PointerEvent): void { const g = this.gesture; if (!g || g.pointer !== e.pointerId)
        return; const { x, y } = this.point(e), delta = snapped((x - g.x) / this.scale * this.model.data.ppq, this.model.data.ppq, this.grid); g.nextStart = g.start + delta; g.nextLane = g.lane + Math.round((y - g.y) / LANE_HEIGHT); g.valid = g.nextStart >= 0 && g.nextStart + g.period * g.repeat <= this.model.data.lengthTicks && g.nextLane >= 0 && g.nextLane < this.model.data.lanes.length; g.moved = delta !== 0 || g.nextLane !== g.lane; if (!g.valid)
        this.status('Placement exceeds time/lane bounds; release cancels the drag.'); this.request(); }
    private up(e: PointerEvent): void { const g = this.gesture; if (!g || g.pointer !== e.pointerId)
        return; this.gesture = undefined; try {
        const lane = this.model.data.lanes[g.nextLane];
        if (g.valid && g.moved && lane)
            this.move(g.clipId, lane.id, g.nextStart);
    }
    finally {
        if (this.canvas.hasPointerCapture(e.pointerId))
            this.canvas.releasePointerCapture(e.pointerId);
        this.request();
    } }
    cancelGesture(): void { const g = this.gesture; this.gesture = undefined; if (g && this.canvas.hasPointerCapture(g.pointer))
        this.canvas.releasePointerCapture(g.pointer); this.request(); }
    dispose(): void { this.active = false; this.cancelGesture(); this.lifetime.abort(); if (this.frame !== undefined)
        cancelAnimationFrame(this.frame); this.frame = undefined; for (const fn of this.cleanups.splice(0))
        fn(); }
}
