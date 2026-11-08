import { FoundationError, messageOf } from '../domain/errors';
import type { ModuleId } from './settings';

/**
 * Milestone 4E cross-module navigation readiness.
 *
 * A navigation is complete only when the target view has finished opening, applied the request and verified that the
 * record it now displays is the requested UUID (`NavigationTarget.reveal`). A resolved `setState` or an existing leaf is
 * never treated as proof. Per target module the latest request wins; earlier requests resolve as `superseded` and can no
 * longer report or select. Every navigation is bounded by a timeout; failures leave the source view untouched.
 */
export type NavigationPhase = 'request' | 'superseded' | 'leaf-ready' | 'view-loaded' | 'view-ready' | 'state-applied' | 'host-state' | 'host-state-deferred' | 'selected' | 'failed';
export interface NavigationEvent { seq: number; at: number; request: number; phase: NavigationPhase; from: ModuleId; to: ModuleId; target: string; detail?: string }
export type NavigationNote = (phase: NavigationPhase, detail?: string) => void;
/** `focus` (4F) optionally names an item inside the record, e.g. a CANVAS clip to select; targets may ignore it. */
export interface NavigationTarget { reveal(id: string, signal: AbortSignal, note?: NavigationNote, focus?: string): Promise<void> }
export interface NavigationSteps { enabled(): boolean; open(): Promise<void>; view(): Promise<unknown> }
export type NavigationOutcome = 'selected' | 'superseded';
const LABEL: Record<ModuleId, string> = { patchbook: 'PATCHBOOK', motif: 'MOTIF', canvas: 'CANVAS' };

export function isNavigationTarget(view: unknown): view is NavigationTarget { return !!view && typeof (view as Partial<NavigationTarget>).reveal === 'function'; }

/** Resolved once a view finished `onOpen` (including its own restored selection); reset on every reopen. */
export class ReadyGate {
  private release: () => void = () => {};
  promise: Promise<void> = new Promise(resolve => { this.release = resolve; });
  reset(): void { this.promise = new Promise(resolve => { this.release = resolve; }); }
  open(): void { this.release(); }
}

export class NavigationCoordinator {
  /**
   * Development/test instrumentation: `null` (off) unless the native harness sets an array. Memory-only, bounded,
   * records phases, module names and record UUIDs — never note content or file paths. No production telemetry.
   */
  trace: NavigationEvent[] | null = null;
  private seq = 0;
  private requests = 0;
  private closed = false;
  private readonly latest = new Map<ModuleId, { request: number; controller: AbortController; from: ModuleId; target: string }>();
  constructor(private readonly timeoutMs = 10000) {}
  note(event: Omit<NavigationEvent, 'seq' | 'at'>): void {
    if (!this.trace) return;
    this.trace.push({ ...event, seq: ++this.seq, at: Math.round(performance.now() * 1000) / 1000 });
    if (this.trace.length > 500) this.trace.splice(0, this.trace.length - 500);
  }
  async navigate(from: ModuleId, to: ModuleId, id: string, steps: NavigationSteps, focus?: string): Promise<NavigationOutcome> {
    if (this.closed) throw new FoundationError('disposed', 'MNEMOTOAD is unloading; navigation was not started.');
    const request = ++this.requests, controller = new AbortController(), previous = this.latest.get(to);
    if (previous) { previous.controller.abort(); this.note({ request: previous.request, phase: 'superseded', from: previous.from, to, target: previous.target, detail: `by request ${request}` }); }
    this.latest.set(to, { request, controller, from, target: id });
    const log: NavigationNote = (phase, detail) => this.note({ request, phase, from, to, target: id, ...(detail ? { detail } : {}) });
    const current = (): boolean => !this.closed && !controller.signal.aborted && this.latest.get(to)?.request === request;
    const disabled = (): FoundationError => new FoundationError('disposed', `${LABEL[to]} was disabled during navigation. Nothing was selected; the source view is unchanged.`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new FoundationError('io', `${LABEL[to]} did not finish showing the requested record within ${Math.round(this.timeoutMs / 1000)} s. Nothing else was selected; try again.`)), this.timeoutMs); });
    log('request');
    try {
      await Promise.race([timeout, (async () => {
        if (!steps.enabled()) throw disabled();
        await steps.open(); if (!current()) return; log('leaf-ready');
        const view = await steps.view(); if (!current()) return;
        if (!steps.enabled()) throw disabled();
        if (!isNavigationTarget(view)) throw new FoundationError('io', `${LABEL[to]} view is not ready. Reopen it or inspect the linked Markdown.`);
        log('view-loaded');
        await view.reveal(id, controller.signal, log, focus); if (!current()) return;
        if (!steps.enabled()) throw disabled();
      })()]);
      if (!current()) return 'superseded';
      log('selected'); return 'selected';
    } catch (error) {
      if (!current()) return 'superseded';
      log('failed', messageOf(error)); controller.abort(); throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (this.latest.get(to)?.request === request) this.latest.delete(to);
    }
  }
  dispose(): void { this.closed = true; for (const entry of this.latest.values()) entry.controller.abort(); this.latest.clear(); this.trace = null; }
}
