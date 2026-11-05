import { describe, expect, it } from 'vitest';
import { compile, type TimedEvent } from '../experiments/compiler';
import { ExperimentalTransport, type PlaybackSink, type TimerPort } from '../experiments/transport';
import { sequence } from './support/musical-fixtures';

class Sink implements PlaybackSink {
  now = 10; active = new Set<string>(); scheduled: { event: TimedEvent; at: number }[] = []; closed = 0;
  running = true;
  pending?: Promise<void>;
  resume(): Promise<void> { return this.pending ?? Promise.resolve(); }
  schedule(event: TimedEvent, at: number): void { this.scheduled.push({ event, at }); if (event.kind === 'on') this.active.add(event.voiceId); }
  cancel(): void { this.active.clear(); }
  async close(): Promise<void> { this.closed++; }
}
class Timer implements TimerPort {
  now = 0;
  callbacks = new Set<() => void>();
  every(callback: () => void): () => void { this.callbacks.add(callback); return () => this.callbacks.delete(callback); }
  advance(sink: Sink, seconds: number): void { sink.now += seconds; this.now += seconds; for (const callback of [...this.callbacks]) callback(); }
}
function setup() { const sink = new Sink(), timer = new Timer(); return { sink, timer, transport: new ExperimentalTransport(sink, timer), plan: compile(sequence()) }; }
describe('experimental audio-clock transport', () => {
  it('schedules ahead on the audio clock and cancels pending voices/timers', async () => {
    const { sink, timer, transport, plan } = setup();
    expect(await transport.start(plan)).toBe(true);
    expect(sink.scheduled[0]?.at).toBeCloseTo(10.05);
    expect(transport.timerCount).toBe(1);
    for (let i = 0; i < 10; i++) timer.advance(sink, .025);
    expect(sink.scheduled[1]?.at).toBeCloseTo(10.3);
    transport.stop(); expect(sink.active.size).toBe(0); expect(timer.callbacks.size).toBe(0);
    const count = sink.scheduled.length; timer.advance(sink, 1); expect(sink.scheduled).toHaveLength(count);
  });
  it('pauses and resumes by retriggering held notes at remaining duration', async () => {
    const { sink, timer, transport, plan } = setup();
    await transport.start(plan); timer.advance(sink, .075); transport.pause();
    expect(transport.state).toBe('paused'); expect(transport.position).toBeCloseTo(.025);
    expect(await transport.resume()).toBe(true);
    expect(sink.scheduled.filter(e => e.event.kind === 'on')).toHaveLength(2);
    transport.stop(); expect(await transport.resume()).toBe(false);
  });
  it('does not resurrect playback after stop during async audio resume', async () => {
    const { sink, timer, transport, plan } = setup(); let release: () => void = () => undefined;
    sink.pending = new Promise(resolve => { release = resolve; });
    const starting = transport.start(plan); expect(transport.state).toBe('starting');
    transport.stop(); release(); expect(await starting).toBe(false);
    expect(timer.callbacks.size).toBe(0); expect(sink.scheduled).toHaveLength(0);
  });
  it('does not retrigger a note at its exact half-open end boundary', async () => {
    const { sink, transport, plan } = setup();
    await transport.start(plan, false, .25);
    expect(sink.scheduled).toHaveLength(0);
    transport.stop();
  });
  it('stops explicitly on a main-thread stall without catching up overdue notes', async () => {
    const { sink, timer, transport, plan } = setup(); await transport.start(plan, true);
    const count = sink.scheduled.length; timer.advance(sink, .25);
    expect(transport.state).toBe('stopped'); expect(transport.diagnostic).toContain('stalled');
    expect(sink.scheduled).toHaveLength(count); expect(sink.active.size).toBe(0);
  });
  it('stops if the audio context becomes suspended or the wall clock stalls while audio time freezes', async () => {
    const { sink, timer, transport, plan } = setup(); await transport.start(plan);
    sink.running = false; timer.advance(sink, .025); expect(transport.diagnostic).toContain('not running');
    sink.running = true; await transport.start(plan); timer.now += .25;
    for (const callback of [...timer.callbacks]) callback();
    expect(transport.diagnostic).toContain('stalled'); expect(transport.timerCount).toBe(0);
  });
  it('repeats and performs 50 start/stop cycles without accumulating timers', async () => {
    const { sink, timer, transport, plan } = setup(); await transport.start(plan, true);
    for (let i = 0; i < 180; i++) timer.advance(sink, .025);
    expect(sink.scheduled.filter(e => e.event.kind === 'on').length).toBe(3);
    for (let i = 0; i < 50; i++) { await transport.start(plan); expect(timer.callbacks.size).toBe(1); transport.stop(); }
    expect(timer.callbacks.size).toBe(0); expect(sink.active.size).toBe(0);
  });
  it('disposes once, cancels async starts and rejects future starts', async () => {
    const { sink, timer, transport, plan } = setup(); let release: () => void = () => undefined;
    sink.pending = new Promise(resolve => { release = resolve; });
    const starting = transport.start(plan); await transport.dispose(); release(); expect(await starting).toBe(false);
    await transport.dispose(); expect(sink.closed).toBe(1); expect(timer.callbacks.size).toBe(0);
    await expect(transport.start(plan)).rejects.toThrow('disposed');
  });
  it('reports audio start/scheduling failures and invalid plans', async () => {
    const { sink, transport, plan } = setup(); sink.pending = Promise.reject(new Error('device unavailable'));
    await expect(transport.start(plan)).rejects.toThrow('device unavailable'); expect(transport.diagnostic).toContain('Audio start failed');
    await expect(transport.start({ ...plan, durationSeconds: 0 })).rejects.toThrow('Invalid');
    sink.pending = undefined; sink.schedule = () => { throw new Error('device suspended'); };
    expect(await transport.start(plan)).toBe(false); expect(transport.diagnostic).toContain('device suspended');
    expect(transport.timerCount).toBe(0);
  });
});
