import type { CompiledSequence, TimedEvent } from './compiler';

export interface PlaybackSink {
  readonly now: number;
  readonly running: boolean;
  resume(): Promise<void>;
  schedule(event: TimedEvent, at: number): void;
  cancel(): void;
  close(): Promise<void>;
}
export interface TimerPort { readonly now: number; every(callback: () => void, milliseconds: number): () => void }
export type TransportState = 'stopped' | 'starting' | 'playing' | 'paused' | 'disposed';
export interface SchedulingSample { readonly leadSeconds: number; readonly event: string }
export const browserTimer: TimerPort = { get now() { return performance.now() / 1000; }, every(callback, ms) { const id = globalThis.setInterval(callback, ms); return () => globalThis.clearInterval(id); } };

/** Bounded lookahead experiment. UI clock never drives note timestamps. No vault dependencies. */
export class ExperimentalTransport {
  state: TransportState = 'stopped';
  diagnostic = '';
  readonly samples: SchedulingSample[] = [];
  readonly pollIntervals: number[] = [];
  readonly wallPollIntervals: number[] = [];
  private generation = 0;
  private clearTimer?: () => void;
  private plan?: CompiledSequence;
  private cursor = 0;
  private origin = 0;
  private pausedPosition = 0;
  private lastPoll = 0;
  private lastWallPoll = 0;
  private repeating = false;
  private cycle = 0;
  private nextScheduledPosition = 0;
  constructor(private readonly sink: PlaybackSink, private readonly timer: TimerPort = browserTimer) {}
  get timerCount(): number { return this.clearTimer ? 1 : 0; }
  get position(): number {
    if (this.state !== 'playing' || !this.plan) return this.pausedPosition;
    const elapsed = Math.max(0, this.sink.now - this.origin);
    return this.repeating ? elapsed % this.plan.durationSeconds : Math.min(this.plan.durationSeconds, elapsed);
  }
  async start(plan: CompiledSequence, repeat = false, position = 0): Promise<boolean> {
    if (this.state === 'disposed') throw new Error('Experimental transport is disposed');
    if (!Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0 || !Number.isFinite(position) || position < 0 || position >= plan.durationSeconds) throw new Error('Invalid playback duration/position');
    let previous = -Infinity;
    for (const event of plan.events) {
      if (!Number.isFinite(event.seconds) || event.seconds < previous || event.seconds < 0 || event.seconds > plan.durationSeconds) throw new Error('Invalid or unordered timed events');
      previous = event.seconds;
    }
    this.stop();
    const generation = this.generation;
    this.plan = plan; this.repeating = repeat; this.pausedPosition = position; this.state = 'starting'; this.diagnostic = '';
    try { await this.sink.resume(); }
    catch (error) {
      if (generation !== this.generation) return false;
      this.stop(); this.diagnostic = `Audio start failed: ${error instanceof Error ? error.message : String(error)}`;
      throw error;
    }
    if (generation !== this.generation) return false;
    this.origin = this.sink.now + .05 - position;
    this.lastPoll = this.sink.now; this.lastWallPoll = this.timer.now; this.cycle = 0; this.cursor = 0;
    // Resume policy: retrigger notes held at the paused position with shortened remaining duration.
    const held = new Map<string, TimedEvent>();
    while (this.cursor < plan.events.length) {
      const event = plan.events[this.cursor];
      if (!event || event.seconds > position || (event.seconds === position && event.kind === 'on')) break;
      if (event.kind === 'on') held.set(event.voiceId, event); else held.delete(event.voiceId);
      this.cursor++;
    }
    try {
      for (const event of held.values()) this.sink.schedule({ ...event, voiceId: `${event.voiceId}@0` }, this.origin + position);
      this.nextScheduledPosition = position; this.state = 'playing';
      this.clearTimer = this.timer.every(() => { if (generation === this.generation) this.pump(); }, 25);
      this.pump();
    } catch (error) { this.stop(); throw error; }
    return this.state === 'playing';
  }
  pause(): void {
    if (this.state !== 'playing') return;
    const position = this.position;
    this.stop(); this.pausedPosition = position; this.state = 'paused';
  }
  async resume(): Promise<boolean> {
    if (this.state !== 'paused' || !this.plan) return false;
    return this.start(this.plan, this.repeating, this.pausedPosition);
  }
  stop(): void {
    if (this.state === 'disposed') return;
    this.generation++; this.clearTimer?.(); this.clearTimer = undefined;
    this.sink.cancel(); this.state = 'stopped'; this.pausedPosition = 0;
  }
  private pump(): void {
    const plan = this.plan;
    if (this.state !== 'playing' || !plan) return;
    const now = this.sink.now, gap = now - this.lastPoll, wallGap = this.timer.now - this.lastWallPoll;
    if (this.pollIntervals.length < 10000) this.pollIntervals.push(gap);
    this.lastPoll = now;
    if (this.wallPollIntervals.length < 10000) this.wallPollIntervals.push(wallGap);
    this.lastWallPoll = this.timer.now;
    if (!this.sink.running) { this.stop(); this.diagnostic = 'Playback stopped: AudioContext is not running'; return; }
    if (gap > .1 || wallGap > .1) { this.stop(); this.diagnostic = `Playback stopped: scheduler stalled for ${(Math.max(gap, wallGap) * 1000).toFixed(1)} ms`; return; }
    try {
      let work = 0;
      while (work++ < 200001) {
        const event = plan.events[this.cursor];
        if (!event) {
          const boundary = this.origin + (this.cycle + 1) * plan.durationSeconds;
          if (!this.repeating) { if (now >= boundary) this.stop(); return; }
          if (boundary > now + .1) return;
          this.cycle++; this.cursor = 0;
          if (!plan.events.length) return; // Empty repeated plan advances one cycle per poll, no busy loop.
          continue;
        }
        const position = this.cycle * plan.durationSeconds + event.seconds, at = this.origin + position;
        if (at > now + .1) return;
        if (at < now) { this.stop(); this.diagnostic = `Playback stopped: late ${event.kind} at ${event.voiceId}`; return; }
        this.sink.schedule({ ...event, voiceId: `${event.voiceId}@${this.cycle}` }, at);
        this.nextScheduledPosition = position;
        if (this.samples.length < 20000) this.samples.push({ event: event.kind, leadSeconds: at - now });
        this.cursor++;
      }
      this.stop(); this.diagnostic = 'Playback stopped: per-poll event bound exceeded';
    } catch (error) { this.stop(); this.diagnostic = `Playback stopped: ${error instanceof Error ? error.message : String(error)}`; }
  }
  get scheduledThrough(): number { return this.nextScheduledPosition; }
  async dispose(): Promise<void> {
    if (this.state === 'disposed') return;
    this.stop(); this.state = 'disposed'; await this.sink.close();
  }
}
