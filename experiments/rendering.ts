import { anchoredZoom, hit, movePreview, rectangle, RegionIndex, resizePreview, syntheticArrangement, syntheticNotes, type Rect, type Region, type Viewport } from './geometry';

export type RenderMode = 'dom-all' | 'svg-all' | 'dom-culled' | 'canvas-culled';
interface Distribution { median: number; p95: number; max: number }
export const distribution = (values: readonly number[]): Distribution => {
  const ordered = [...values].sort((a, b) => a - b);
  return { median: ordered[Math.floor(ordered.length / 2)] ?? 0, p95: ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * .95))] ?? 0, max: ordered.at(-1) ?? 0 };
};
export interface RenderResult {
  label: string; mode: RenderMode; count: number; dpr: number; indexMs: number; initialMs: number;
  redrawMs: Distribution; scrollMs: Distribution; zoomMs: Distribution; interactionWorkMs: Distribution;
  frameIntervalsMs: Distribution; visible: number; nodes: number; backingBytes: number; heapDeltaBytes?: number;
}
function heapBytes(): number | undefined {
  return (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
}
const frame = (signal?: AbortSignal): Promise<number> => new Promise((resolve, reject) => {
  signal?.throwIfAborted();
  const abort = (): void => { cancelAnimationFrame(id); reject(new Error('Rendering experiment cancelled')); };
  const id = requestAnimationFrame(time => { signal?.removeEventListener('abort', abort); resolve(time); });
  signal?.addEventListener('abort', abort, { once: true });
});

/** Real browser fixture. No persistent edits; selection/drag/resize are ephemeral probes. */
export class GridProbe {
  readonly surface: HTMLDivElement;
  private readonly index: RegionIndex;
  private readonly elements = new Map<number, HTMLElement | SVGRectElement>();
  private readonly svg?: SVGSVGElement;
  private readonly canvas?: HTMLCanvasElement;
  private readonly context?: CanvasRenderingContext2D;
  readonly indexMs: number;
  rectangles: Rect[] = [];
  selected?: number;
  private currentViewport: Viewport;
  private preview?: Rect;
  private readonly removeListeners: (() => void)[] = [];
  readonly inputFeedbackMs: number[] = [];
  constructor(host: HTMLElement, readonly regions: readonly Region[], readonly mode: RenderMode, readonly viewport: Viewport, readonly dpr: number) {
    this.currentViewport = viewport;
    const begin = performance.now(); this.index = new RegionIndex(regions); this.indexMs = performance.now() - begin;
    const doc = host.ownerDocument;
    this.surface = doc.createElement('div'); host.append(this.surface);
    Object.assign(this.surface.style, { position: 'relative', overflow: 'hidden', width: `${viewport.width}px`, height: `${viewport.height}px`, background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', backgroundImage: 'linear-gradient(var(--background-modifier-border) 1px, transparent 1px)', backgroundSize: `100% ${viewport.rowHeight}px` });
    this.surface.tabIndex = 0; this.surface.setAttribute('role', 'group'); this.surface.setAttribute('aria-label', 'Experimental musical grid; use adjacent numeric controls for accessible preview');
    if (mode === 'canvas-culled') {
      this.canvas = doc.createElement('canvas'); this.canvas.width = Math.round(viewport.width * dpr); this.canvas.height = Math.round(viewport.height * dpr);
      this.canvas.style.width = `${viewport.width}px`; this.canvas.style.height = `${viewport.height}px`; this.surface.append(this.canvas);
      this.context = this.canvas.getContext('2d') ?? undefined;
      if (!this.context) throw new Error('Canvas 2D unavailable');
    } else if (mode === 'svg-all') {
      this.svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); this.svg.setAttribute('width', String(viewport.width)); this.svg.setAttribute('height', String(viewport.height)); this.surface.append(this.svg);
    }
    let gesture: { region: Region; x: number; y: number; resize: boolean } | undefined;
    const feedback = (event: Event): void => { this.render(this.currentViewport); this.inputFeedbackMs.push(performance.now() - event.timeStamp); };
    const down = (event: PointerEvent): void => {
      const bounds = this.surface.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      this.selected = hit(this.rectangles, x, y);
      const region = this.regions.find(item => item.id === this.selected), rect = this.rectangles.find(item => item.id === this.selected);
      if (region && rect) { gesture = { region, x, y, resize: x > rect.x + rect.width - 4 }; this.surface.setPointerCapture(event.pointerId); }
      this.preview = undefined; this.surface.focus(); feedback(event);
    };
    const move = (event: PointerEvent): void => {
      if (!gesture) return;
      const bounds = this.surface.getBoundingClientRect(), dx = event.clientX - bounds.left - gesture.x, dy = event.clientY - bounds.top - gesture.y;
      this.preview = rectangle(gesture.resize ? resizePreview(gesture.region, dx, this.currentViewport) : movePreview(gesture.region, dx, dy, this.currentViewport), this.currentViewport); feedback(event);
    };
    const up = (): void => { gesture = undefined; };
    const key = (event: KeyboardEvent): void => {
      const region = this.regions.find(item => item.id === this.selected);
      if (!region || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const dx = (event.key === 'ArrowLeft' ? -1 : 1) * this.currentViewport.pixelsPerQuarter / 4;
      this.preview = rectangle(event.shiftKey ? resizePreview(region, dx, this.currentViewport) : movePreview(region, dx, 0, this.currentViewport), this.currentViewport); feedback(event);
    };
    this.surface.addEventListener('pointerdown', down); this.surface.addEventListener('pointermove', move); this.surface.addEventListener('pointerup', up); this.surface.addEventListener('pointercancel', up); this.surface.addEventListener('keydown', key);
    this.removeListeners.push(() => { this.surface.removeEventListener('pointerdown', down); this.surface.removeEventListener('pointermove', move); this.surface.removeEventListener('pointerup', up); this.surface.removeEventListener('pointercancel', up); this.surface.removeEventListener('keydown', key); });
  }
  render(viewport: Viewport): void {
    this.currentViewport = viewport;
    this.rectangles = this.index.query(viewport);
    const originals = this.mode.endsWith('-all') ? this.regions.map(region => rectangle(region, viewport)) : this.rectangles;
    const rectangles = this.preview ? originals.map(rect => rect.id === this.preview?.id ? this.preview : rect).filter((rect): rect is Rect => rect !== undefined) : originals;
    const context = this.context;
    if (context) {
      context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); context.clearRect(0, 0, viewport.width, viewport.height);
      const style = this.surface.ownerDocument.defaultView?.getComputedStyle(this.surface);
      context.fillStyle = style?.getPropertyValue('--interactive-accent').trim() || '#777';
      for (const rect of rectangles) {
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        if (rect.id === this.selected) { context.strokeStyle = style?.getPropertyValue('--text-normal').trim() || '#fff'; context.strokeRect(rect.x, rect.y, rect.width, rect.height); }
      }
    } else {
      const retained = new Set<number>();
      for (const rect of rectangles) {
        retained.add(rect.id);
        let element = this.elements.get(rect.id);
        if (!element) {
          element = this.svg ? this.surface.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect') : this.surface.ownerDocument.createElement('div');
          if (!this.svg) Object.assign(element.style, { position: 'absolute', background: 'var(--interactive-accent)' });
          (this.svg ?? this.surface).append(element); this.elements.set(rect.id, element);
        }
        if (this.svg) {
          for (const [key, value] of Object.entries({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })) element.setAttribute(key, String(value));
          element.setAttribute('fill', 'var(--interactive-accent)');
        } else Object.assign(element.style, { transform: `translate(${rect.x}px,${rect.y}px)`, width: `${rect.width}px`, height: `${rect.height}px` });
      }
      for (const [id, element] of this.elements) if (!retained.has(id)) { element.remove(); this.elements.delete(id); }
    }
    // Force layout; measures scripting/layout submission, not GPU presentation or audible latency.
    this.surface.getBoundingClientRect();
  }
  get nodeCount(): number { return this.surface.querySelectorAll('*').length + 1; }
  get backingBytes(): number { return this.canvas ? this.canvas.width * this.canvas.height * 4 : 0; }
  dispose(): void { for (const remove of this.removeListeners) remove(); this.surface.remove(); this.elements.clear(); this.rectangles = []; }
}

export async function benchmarkCase(host: HTMLElement, label: string, regions: readonly Region[], mode: RenderMode, dpr = devicePixelRatio, signal?: AbortSignal): Promise<RenderResult> {
  signal?.throwIfAborted();
  const viewport: Viewport = { width: 960, height: 360, start: 0, row: label.startsWith('arrangement') ? 0 : 48, pixelsPerQuarter: 60, rowHeight: label.startsWith('arrangement') ? 30 : 15 };
  const heap = heapBytes(), begin = performance.now(), probe = new GridProbe(host, regions, mode, viewport, dpr);
  try {
    probe.render(viewport);
    const initialMs = performance.now() - begin, redraw: number[] = [], scroll: number[] = [], zoom: number[] = [], interaction: number[] = [], intervals: number[] = [];
    for (let i = 0; i < 5; i++) probe.render(viewport);
    for (let i = 0; i < 30; i++) { const start = performance.now(); probe.render(viewport); redraw.push(performance.now() - start); }
    let previousFrame = await frame(signal);
    for (let i = 0; i < 20; i++) {
      const start = performance.now(); probe.render({ ...viewport, start: i / 2, row: viewport.row + i % 4 }); scroll.push(performance.now() - start);
      const next = await frame(signal); intervals.push(next - previousFrame); previousFrame = next;
    }
    for (let i = 0; i < 20; i++) { const start = performance.now(); probe.render(anchoredZoom(viewport, 480, 1 + i / 20)); zoom.push(performance.now() - start); await frame(signal); }
    probe.render(viewport);
    const first = probe.rectangles[0], region = regions.find(item => item.id === first?.id);
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      if (first && region) {
        probe.selected = hit(probe.rectangles, first.x + first.width / 2, first.y + 1);
        movePreview(region, i, 0, viewport); resizePreview(region, i, viewport);
      }
      probe.render(viewport); interaction.push(performance.now() - start);
    }
    const after = heapBytes();
    return { label, mode, count: regions.length, dpr, indexMs: probe.indexMs, initialMs, redrawMs: distribution(redraw), scrollMs: distribution(scroll), zoomMs: distribution(zoom), interactionWorkMs: distribution(interaction), frameIntervalsMs: distribution(intervals), visible: probe.rectangles.length, nodes: probe.nodeCount, backingBytes: probe.backingBytes, heapDeltaBytes: heap !== undefined && after !== undefined ? after - heap : undefined };
  } finally { probe.dispose(); }
}

export async function runRenderingBenchmarks(host: HTMLElement, progress: (message: string) => void, signal?: AbortSignal, capture: (results: RenderResult[]) => void = () => undefined): Promise<RenderResult[]> {
  const results: RenderResult[] = [];
  const record = (result: RenderResult): void => { results.push(result); capture([...results]); };
  for (const count of [100, 1000, 5000, 20000]) {
    for (const mode of ['dom-all', 'svg-all', 'dom-culled', 'canvas-culled'] as const) {
      // The first native all-DOM 20k run made CDP unresponsive. Avoid repeating an unbounded host workload.
      // SVG 20k is left unverified; compare both all-node approaches up to 5k and culled approaches through 20k.
      if (count === 20000 && mode.endsWith('-all')) continue;
      progress(`Rendering ${count} notes / ${mode}`);
      record(await benchmarkCase(host, 'piano', syntheticNotes(count), mode, devicePixelRatio, signal));
    }
  }
  for (const mode of ['dom-culled', 'canvas-culled'] as const) {
    const count = mode === 'dom-culled' ? 1000 : 20000;
    progress(`Dense ${count} visible notes / ${mode}`);
    record(await benchmarkCase(host, 'piano-dense', syntheticNotes(count, true), mode, devicePixelRatio, signal));
  }
  record(await benchmarkCase(host, 'piano-dpr2', syntheticNotes(20000), 'canvas-culled', 2, signal));
  for (const [count, lanes] of [[1000, 16], [5000, 64]] as const) {
    for (const mode of ['dom-culled', 'canvas-culled'] as const) {
      progress(`Arrangement ${lanes} lanes / ${count} regions / ${mode}`);
      record(await benchmarkCase(host, `arrangement-${lanes}`, syntheticArrangement(count, lanes), mode, devicePixelRatio, signal));
    }
  }
  return results;
}
