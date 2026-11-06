import type { MusicalPlan } from './compiler';
import { SineSink, type MusicalSink } from './audio';
import { messageOf } from '../domain/errors';
export interface MusicalClock { readonly now: number; every(callback: () => void, milliseconds: number): () => void }
const clock: MusicalClock = { get now() { return performance.now() / 1000; }, every(callback, milliseconds) { const id = setInterval(callback, milliseconds); return () => clearInterval(id); } };
/** Reviewed lookahead policy; UI frames never determine event timestamps. */
export class MusicalTransport {
  state: 'stopped' | 'starting' | 'playing' | 'disposed' = 'stopped'; diagnostic = '';
  private sink?: MusicalSink; private owner?: object; private generation = 0; private clearTimer?: () => void;
  private plan?: MusicalPlan; private cursor = 0; private origin = 0; private lastAudio = 0; private lastWall = 0;
  private listeners = new Set<() => void>(); private closing = new Set<Promise<void>>();
  readonly measurements: { leadSeconds: number; wallGap: number }[] = [];
  constructor(private readonly beforeStart: () => void = () => {}, private readonly factory: () => MusicalSink = () => new SineSink(), private readonly timer: MusicalClock = clock) {}
  get position(): number { return this.state === 'playing' && this.sink ? Math.max(0, Math.min(this.plan?.durationSeconds ?? 0, this.sink.now - this.origin)) : 0; }
  get activeVoices(): number { return this.sink?.activeVoices ?? 0; }
  get timerCount(): number { return this.clearTimer ? 1 : 0; }
  get closingCount(): number { return this.closing.size; }
  ownedBy(owner: object): boolean { return this.owner === owner; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish(): void { for (const listener of this.listeners) listener(); }
  stop(owner?: object): void {
    if (owner && this.owner !== owner) return;
    this.generation++; this.clearTimer?.(); this.clearTimer = undefined; this.owner = undefined;
    const sink = this.sink; this.sink = undefined;
    if (sink) {
      try { sink.cancel(); } catch (error) { this.diagnostic = `Audio cancellation failed: ${messageOf(error)}`; }
      const closing = sink.close().catch(error => { this.diagnostic = `Audio cleanup failed: ${messageOf(error)}`; if (this.state !== 'disposed') this.publish(); });
      this.closing.add(closing); void closing.finally(() => { this.closing.delete(closing); });
    }
    if (this.state !== 'disposed') this.state = 'stopped'; this.publish();
  }
  async start(owner: object, plan: MusicalPlan): Promise<void> {
    if (this.state === 'disposed') throw Error('Transport is disposed');
    if (!Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0 || plan.events.some((event, i) => !Number.isFinite(event.seconds) || event.seconds < 0 || event.seconds > plan.durationSeconds || event.seconds < (plan.events[i - 1]?.seconds ?? 0))) throw Error('Playback plan has invalid timing');
    this.stop(); this.beforeStart(); this.owner = owner; this.diagnostic = ''; this.state = 'starting'; this.publish();
    const generation = this.generation;
    try {
      const sink = this.factory(); this.sink = sink; await sink.resume();
      if (generation !== this.generation) return;
      this.plan = plan; this.cursor = 0; this.origin = sink.now + .05; this.lastAudio = sink.now; this.lastWall = this.timer.now;
      this.state = 'playing'; this.clearTimer = this.timer.every(() => { if (generation === this.generation) this.pump(); }, 25); this.pump(); this.publish();
    } catch (error) { if (generation === this.generation) { this.stop(); this.diagnostic = `Playback failed: ${messageOf(error)}`; this.publish(); throw error; } }
  }
  private pump(): void {
    const sink = this.sink, plan = this.plan; if (this.state !== 'playing' || !sink || !plan) return;
    const now = sink.now, gap = Math.max(now - this.lastAudio, this.timer.now - this.lastWall); this.lastAudio = now; this.lastWall = this.timer.now;
    try {
      if (!sink.running) throw Error('Audio context suspended; press Play to restart');
      if (gap > .1) throw Error(`Scheduler stalled for${(gap * 1000).toFixed(1)}ms; no catch-up burst`);
      let work = 0;
      while (this.cursor < plan.events.length) {
        const event = plan.events[this.cursor]; if (!event) break;
        const at = this.origin + event.seconds; if (at > now + .1) break;
        if (at < now) throw Error('An event became late; press Play to restart');
        if (++work > 20000) throw Error('Scheduling work bound exceeded');
        sink.schedule(event, at); if (this.measurements.length < 1000) this.measurements.push({ leadSeconds: at - now, wallGap: gap }); this.cursor++;
      }
      if (now >= this.origin + plan.durationSeconds + .02) this.stop();
    } catch (error) { this.stop(); this.diagnostic = `Playback stopped: ${messageOf(error)}`; this.publish(); }
  }
  async settled(): Promise<void> { await Promise.all([...this.closing]); }
  dispose(): void { if (this.state === 'disposed') return; this.state = 'disposed'; this.stop(); this.listeners.clear(); }
}
