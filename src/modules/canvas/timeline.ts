import type { Composition } from '../../domain/entities';
import type { ArrangementPlan } from '../../arrangement/preflight';
import { gridTicks, snapped, type Grid } from '../../music/grid';
import { backingSize } from '../../ui/canvas-metrics';
import { LANE_GUTTER, LANE_HEIGHT, RULER, visibleClips, clipHit, timelinePoint, anchoredTimelineStart, type TimelineViewport, type ClipRect, SECTION_BAND, MARKER_BAND, STRUCTURE_HEIGHT, structureHit, tickX, type StructureHit } from './geometry';
import { orderedMarkers, orderedSections, overlaps, sectionOverlaps, type Marker, type Section } from './structure';
/** Pointer edits commit once on release; previews never edit the draft. */
export interface StructureCallbacks {
    select(kind: 'section' | 'marker', id: string): void;
    moveSection(id: string, startTick: number, endTick: number): void;
    moveMarker(id: string, tick: number): void;
    createSection(startTick: number): void;
    createMarker(tick: number): void;
}
interface StructureGesture { pointer: number; x: number; hit: StructureHit; start: number; end: number; nextStart: number; nextEnd: number; moved: boolean; valid: boolean }
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
    private playheadTick?:number;
    private selectedLane?: string;
    private fallbackPeriods = new Map<string, number>();
    private warned = new Set<string>();
    private model: Composition;
    private plan: ArrangementPlan;
    private viewportState: TimelineViewport;
    private rectangles: ClipRect[] = [];
    readonly ruler: HTMLCanvasElement;
    private rulerContext: CanvasRenderingContext2D | null;
    private structureGesture?: StructureGesture;
    private structureSelected?: { kind: 'section' | 'marker'; id: string };
    private sections: Section[] = [];
    private markers: Marker[] = [];
    private overlapping = new Set<string>();
    constructor(root: HTMLElement, model: Composition, plan: ArrangementPlan, private readonly select: (laneId: string, clipId?: string) => boolean, private readonly move: (id: string, laneId: string, start: number) => void, private readonly insert: (laneId: string, start: number) => void, private readonly status: (text: string) => void, private readonly structure: StructureCallbacks) {
        this.model = model;
        this.plan = plan;
        this.cache();
        const doc = root.ownerDocument;
        this.ruler = doc.createElement('canvas');
        this.ruler.className = 'mnemobard-structure-ruler';
        this.ruler.tabIndex = 0;
        this.ruler.setAttribute('role', 'img');
        this.ruler.setAttribute('aria-label', 'Section and marker ruler. Drag a section body to move it, its edges to resize, or a marker to reposition it. Double-click empty space to add. Use the Structure panel for keyboard and numeric editing.');
        root.append(this.ruler);
        this.rulerContext = this.ruler.getContext('2d');
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
        listen(this.ruler, 'pointerdown', e => this.structureDown(e));
        listen(this.ruler, 'pointermove', e => this.structureDrag(e));
        listen(this.ruler, 'pointerup', e => this.structureUp(e));
        listen(this.ruler, 'pointercancel', () => this.cancelStructure());
        listen(this.ruler, 'lostpointercapture', () => this.cancelStructure());
        listen(this.ruler, 'keydown', e => { if (e.key === 'Escape' && this.structureGesture) { e.preventDefault(); e.stopPropagation(); this.cancelStructure(); } });
        listen(this.ruler, 'dblclick', e => { const x = this.rulerPoint(e).x, y = this.rulerPoint(e).y; if (x < LANE_GUTTER || structureHit(this.sections, this.markers, x, y, this.viewportState)) return; const tick = Math.max(0, Math.min(this.model.data.lengthTicks, snapped(timelinePoint(x, 0, this.viewportState).tick, this.model.data.ppq, this.grid))); if (y < SECTION_BAND) this.structure.createSection(tick); else this.structure.createMarker(tick); });
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
    update(model: Composition, plan: ArrangementPlan): void { this.cancelGesture(); this.cancelStructure(); this.model = model; this.plan = plan; this.cache(); this.resize(); }
    selection(laneId?: string, clipId?: string): void { this.selectedLane = laneId; this.selectedClip = clipId; this.request(); }
    private cache(): void { this.sections = orderedSections(this.model); this.markers = orderedMarkers(this.model); this.overlapping = new Set(sectionOverlaps(this.model).flat().map(s => s.id)); this.fallbackPeriods = new Map(this.model.data.lanes.flatMap(l => l.clips.map(c => [c.id, c.reviewedLengthTicks ?? this.model.data.ppq] as const))); this.warned = new Set(this.plan.diagnostics.filter(d => d.severity === 'warning' && d.clipId).map(d => d.clipId ?? '')); }
    private resize(): void { if (!this.active)
        return; const width = Math.max(240, this.scroller.clientWidth || 800), height = this.scroller.clientHeight || 400; this.spacer.style.width = `${Math.max(width, LANE_GUTTER + this.model.data.lengthTicks / this.model.data.ppq * this.scale)}px`; this.spacer.style.height = `${Math.max(height, RULER + this.model.data.lanes.length * LANE_HEIGHT)}px`; this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`; this.ruler.style.width = `${width}px`; this.ruler.style.height = `${STRUCTURE_HEIGHT}px`; const dpr = this.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1, rulerBacking = backingSize(width, STRUCTURE_HEIGHT, dpr); this.ruler.width = rulerBacking.width; this.ruler.height = rulerBacking.height; this.rulerContext?.setTransform(rulerBacking.scale, 0, 0, rulerBacking.scale, 0, 0); const backing = backingSize(width, height, this.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1); this.canvas.width = backing.width; this.canvas.height = backing.height; this.context?.setTransform(backing.scale, 0, 0, backing.scale, 0, 0); this.viewportState = { ...this.viewportState, width, height, ppq: this.model.data.ppq, pixelsPerQuarter: this.scale }; this.scroll(); }
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
        ctx.save();
        ctx.strokeStyle = faint;
        ctx.globalAlpha = .45;
        ctx.setLineDash([3, 4]);
        for (const tick of [...this.sections.flatMap(sec => [sec.startTick, sec.endTick]), ...this.markers.map(m => m.tick)]) {
            const x = tickX(tick, v);
            if (x < LANE_GUTTER || x > v.width) continue;
            ctx.beginPath();
            ctx.moveTo(x, RULER);
            ctx.lineTo(x, v.height);
            ctx.stroke();
        }
        ctx.restore();
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
        if(this.playheadTick!==undefined){const x=LANE_GUTTER+(this.playheadTick-v.startTick)/v.ppq*this.scale;if(x>=LANE_GUTTER&&x<=v.width){ctx.strokeStyle=text;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,v.height);ctx.stroke();ctx.fillStyle=text;ctx.fillRect(x-4,0,8,6);}}
        this.drawStructure({ bg, alt, line, text, faint, accent, error });
    }
    /** Culled to the visible tick range; selection uses weight/outline/glyph, never colour alone. */
    private drawStructure(c: { bg: string; alt: string; line: string; text: string; faint: string; accent: string; error: string }): void {
        const ctx = this.rulerContext, v = this.viewportState;
        if (!ctx) return;
        const first = v.startTick, last = v.startTick + (v.width - LANE_GUTTER) / v.pixelsPerQuarter * v.ppq, g = this.structureGesture;
        ctx.clearRect(0, 0, v.width, STRUCTURE_HEIGHT);
        ctx.fillStyle = c.alt;
        ctx.fillRect(0, 0, v.width, STRUCTURE_HEIGHT);
        ctx.font = '11px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.beginPath();
        ctx.rect(LANE_GUTTER, 0, v.width - LANE_GUTTER, STRUCTURE_HEIGHT);
        ctx.clip();
        const current = this.playheadTick === undefined ? undefined : this.sections.find(s => s.startTick <= (this.playheadTick ?? -1) && (this.playheadTick ?? -1) < s.endTick)?.id;
        for (const s of this.sections) {
            const moving = g?.hit.kind === 'section' && g.hit.id === s.id && g.moved, start = moving ? g.nextStart : s.startTick, end = moving ? g.nextEnd : s.endTick;
            if (end < first || start > last) continue;
            const x = tickX(start, v), w = Math.max(2, tickX(end, v) - x), selected = this.structureSelected?.kind === 'section' && this.structureSelected.id === s.id, bad = this.overlapping.has(s.id) || (moving && !g.valid);
            ctx.globalAlpha = selected ? .55 : .28;
            ctx.fillStyle = c.accent;
            ctx.fillRect(x, 2, w, SECTION_BAND - 4);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = bad ? c.error : selected ? c.text : c.line;
            ctx.lineWidth = selected || bad ? 2 : 1;
            ctx.strokeRect(x + .5, 2.5, w - 1, SECTION_BAND - 5);
            if (s.id === current) { ctx.fillStyle = c.text; ctx.fillRect(x, SECTION_BAND - 3, w, 2); }
            ctx.fillStyle = bad ? c.error : c.text;
            ctx.font = selected ? 'bold 11px sans-serif' : '11px sans-serif';
            const labelX = Math.max(x, LANE_GUTTER) + 6;
            if (x + w - labelX > 14) ctx.fillText(`${bad ? '! ' : selected ? '▸ ' : ''}${s.label}`, labelX, SECTION_BAND / 2, x + w - labelX - 4);
        }
        ctx.font = '11px sans-serif';
        for (let i = 0; i < this.markers.length; i++) {
            const m = this.markers[i]; if (!m) continue;
            const movingId = g?.hit.kind === 'marker' && g.moved ? g.hit.id : undefined, moving = movingId === m.id, tick = moving && g ? g.nextStart : m.tick;
            let same = 1; while (!moving && this.markers[i + same]?.tick === m.tick && this.markers[i + same]?.id !== movingId) same++;
            if (tick < first - v.ppq * 64 || tick > last) { i += same - 1; continue; }
            const x = tickX(tick, v), selected = this.structureSelected?.kind === 'marker' && (this.markers.slice(i, i + same).some(n => n.id === this.structureSelected?.id)), nextX = tickX(this.markers[i + same]?.tick ?? Infinity, v);
            ctx.strokeStyle = selected ? c.text : c.faint;
            ctx.lineWidth = selected ? 2 : 1;
            ctx.beginPath(); ctx.moveTo(x, SECTION_BAND); ctx.lineTo(x, STRUCTURE_HEIGHT); ctx.stroke();
            ctx.fillStyle = selected ? c.text : c.accent;
            ctx.beginPath(); ctx.moveTo(x, SECTION_BAND + 1); ctx.lineTo(x + 7, SECTION_BAND + 5); ctx.lineTo(x, SECTION_BAND + 9); ctx.fill();
            ctx.fillStyle = c.text;
            ctx.font = selected ? 'bold 11px sans-serif' : '11px sans-serif';
            const room = Math.min(nextX, v.width) - x - 14;
            if (room > 14 && x >= LANE_GUTTER) ctx.fillText(`${m.label}${same > 1 ? ` +${same - 1}` : ''}`, x + 10, SECTION_BAND + MARKER_BAND / 2 + 1, room);
            i += same - 1;
        }
        if (this.playheadTick !== undefined) { const x = tickX(this.playheadTick, v); ctx.strokeStyle = c.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, STRUCTURE_HEIGHT); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = c.bg;
        ctx.fillRect(0, 0, LANE_GUTTER, STRUCTURE_HEIGHT);
        ctx.fillStyle = c.faint;
        ctx.fillText('SECTIONS', 12, SECTION_BAND / 2);
        ctx.fillText('MARKERS', 12, SECTION_BAND + MARKER_BAND / 2);
        ctx.strokeStyle = c.line;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, STRUCTURE_HEIGHT - .5); ctx.lineTo(v.width, STRUCTURE_HEIGHT - .5); ctx.moveTo(0, SECTION_BAND - .5); ctx.lineTo(v.width, SECTION_BAND - .5); ctx.stroke();
    }
    structureSelection(kind?: 'section' | 'marker', id?: string): void { this.structureSelected = kind && id ? { kind, id } : undefined; this.request(); }
    /** Ephemeral navigation: scrolls only; never edits. */
    revealTick(tick: number): void { this.scroller.scrollLeft = Math.max(0, tick / this.model.data.ppq * this.scale - (this.viewportState.width - LANE_GUTTER) / 3); this.scroll(); }
    private rulerPoint(e: MouseEvent): { x: number; y: number } { const r = this.ruler.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    private structureDown(e: PointerEvent): void {
        if (e.button !== 0) return;
        const { x, y } = this.rulerPoint(e), hit = structureHit(this.sections, this.markers, x, y, this.viewportState);
        if (!hit) return;
        e.preventDefault(); this.ruler.focus();
        this.structure.select(hit.kind, hit.id);
        const section = hit.kind === 'section' ? this.sections.find(s => s.id === hit.id) : undefined, marker = hit.kind === 'marker' ? this.markers.find(m => m.id === hit.id) : undefined;
        const start = section?.startTick ?? marker?.tick ?? 0, end = section?.endTick ?? start;
        this.structureGesture = { pointer: e.pointerId, x, hit, start, end, nextStart: start, nextEnd: end, moved: false, valid: true };
        this.ruler.setPointerCapture(e.pointerId);
        this.request();
    }
    private structureDrag(e: PointerEvent): void {
        const g = this.structureGesture; if (!g || g.pointer !== e.pointerId) return;
        const delta = snapped((this.rulerPoint(e).x - g.x) / this.scale * this.model.data.ppq, this.model.data.ppq, this.grid), length = this.model.data.lengthTicks;
        if (g.hit.kind === 'marker') { g.nextStart = g.nextEnd = g.start + delta; g.valid = g.nextStart >= 0 && g.nextStart <= length; }
        else {
            g.nextStart = g.hit.edge === 'end' ? g.start : g.start + delta; g.nextEnd = g.hit.edge === 'start' ? g.end : g.end + delta;
            const id = g.hit.id, clash = this.sections.find(s => s.id !== id && overlaps(s, { startTick: g.nextStart, endTick: g.nextEnd }));
            g.valid = g.nextStart >= 0 && g.nextEnd <= length && g.nextEnd > g.nextStart && !clash;
            if (clash) this.status(`Overlaps section “${clash.label}”; release cancels. Neighbours are never moved.`);
        }
        g.moved = delta !== 0;
        if (!g.valid && g.hit.kind === 'marker') this.status('Marker must stay within the composition; release cancels.');
        this.request();
    }
    private structureUp(e: PointerEvent): void {
        const g = this.structureGesture; if (!g || g.pointer !== e.pointerId) return;
        this.structureGesture = undefined;
        try {
            if (g.moved && g.valid) { if (g.hit.kind === 'marker') this.structure.moveMarker(g.hit.id, g.nextStart); else this.structure.moveSection(g.hit.id, g.nextStart, g.nextEnd); }
            else if (g.moved) this.status('Edit rejected; structure unchanged.');
        } finally { if (this.ruler.hasPointerCapture(e.pointerId)) this.ruler.releasePointerCapture(e.pointerId); this.request(); }
    }
    cancelStructure(): void { const g = this.structureGesture; this.structureGesture = undefined; if (g && this.ruler.hasPointerCapture(g.pointer)) this.ruler.releasePointerCapture(g.pointer); this.request(); }
    playhead(tick:number|undefined):void{this.playheadTick=tick;this.request();}
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
    dispose(): void { this.active = false; this.cancelGesture(); this.cancelStructure(); this.lifetime.abort(); if (this.frame !== undefined)
        cancelAnimationFrame(this.frame); this.frame = undefined; for (const fn of this.cleanups.splice(0))
        fn(); }
}
