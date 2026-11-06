import { describe, expect, it } from 'vitest';
import { compileSequence, type MusicalPlan, type MusicalSequence } from '../src/music/compiler';
import { MusicalTransport, type MusicalClock } from '../src/music/transport';
import type { MusicalSink } from '../src/music/audio';
import type { MusicalEvent } from '../src/music/compiler';
import { TempoMap, quarters, fraction, ticksAt } from '../src/music/timing';
import { deferred } from './support/memory-vault';
const note = (id = 'n', pitch = 60, startTick = 0, durationTicks = 480) => ({ id, pitch, startTick, durationTicks, velocity: 96 });
function sequence(): MusicalSequence { return { ppq: 960, lengthTicks: 3840, tempos: [{ tick: 0, microsecondsPerQuarter: 500000 }], tracks: [{ id: 'motif', channel: 0, sourcePpq: 960, notes: [note()] }] }; }
describe('production exact musical compiler', () => {
  it('compiles immutable on/off events with exact source PPQ and trailing rests', () => {
    const s = sequence(); const plan = compileSequence({ ...s, tracks: [{ ...s.tracks[0], id: 't', channel: 0, sourcePpq: 1000, notes: [note('n', 60, 1, 239)] }] });
    expect(plan.events[0]).toMatchObject({ kind: 'on', tick: fraction(24n, 25n), seconds: .0005, trackId: 't', channel: 0 }); expect(plan.durationSeconds).toBe(2); expect(Object.isFrozen(plan.events)).toBe(true);
  });
  it('orders chord events deterministically with off before on at a shared boundary', () => {
    const s = sequence(), notes = [note('b', 64), note('a', 60), note('c', 60, 480)];
    const build = (notes: ReturnType<typeof note>[]) => compileSequence({ ...s, tracks: [{ id: 't', channel: 0, sourcePpq: 960, notes }] });
    const plan = build(notes); expect(plan).toEqual(build(notes.slice().reverse())); expect(plan.maxPolyphony).toBe(2); expect(plan.events.filter(event => event.seconds === .25).map(event => event.kind)).toEqual(['off','off','on']);
  });
  it('uses one tempo map across boundaries with exact inverse timing', () => {
    const map = new TempoMap(960, [{ tick: 0, microsecondsPerQuarter: 500000 }, { tick: 960, microsecondsPerQuarter: 1000000 }]);
    expect(map.seconds(quarters(1440, 960))).toBe(1); expect(map.secondsToTicks(1, 960)).toBe(1440); expect(ticksAt(map.positionAtMicroseconds(fraction(1000000n)), 960)).toEqual(fraction(1440n));
    const s = sequence(), plan = compileSequence({ ...s, tempos: [{ tick: 0, microsecondsPerQuarter: 500000 }, { tick: 960, microsecondsPerQuarter: 1000000 }], tracks: [{ id: 't', channel: 0, sourcePpq: 960, notes: [note('n', 60, 480, 960)] }] }); expect(plan.events.map(event => event.seconds)).toEqual([.25, 1]);
  });
  it('handles empty phrases as timed rests and diagnoses channel/pitch ambiguity', () => {
    expect(compileSequence({ ...sequence(), tracks: [] }).durationSeconds).toBe(2);
    expect(() => compileSequence({ ...sequence(), tracks: [{ id: 't', channel: 0, sourcePpq: 960, notes: [note(), note('other',60,20)] }] })).toThrow('same-pitch');
  });
  it.each([NaN,-1,0,1.5,32768])('rejects unsupported PPQ %s', ppq => { expect(() => compileSequence({ ...sequence(), ppq })).toThrow(); });
  it('validates bounds, velocities, identity and excessive polyphony without dropping notes', () => {
    for (const notes of [[note(),note()], [{...note(),velocity:0}], [note('long',60,3800,100)], Array.from({length:65},(_,i)=>note(String(i),i))]) expect(() => compileSequence({ ...sequence(), tracks:[{id:'t',channel:0,sourcePpq:960,notes}] })).toThrow();
  });
});
class Clock implements MusicalClock {
  now = 0; callbacks = new Set<() => void>(); every(callback: () => void): () => void { this.callbacks.add(callback); return () => { this.callbacks.delete(callback); }; }
  advance(seconds: number, sink: Sink): void { this.now += seconds; sink.now += seconds; for (const callback of this.callbacks) callback(); }
}
class Sink implements MusicalSink {
  now = 0; running = true; activeVoices = 0; closed = false; scheduled: { event: MusicalEvent; at: number }[] = []; failSchedule = false;
  resumeResult = Promise.resolve(); resume(): Promise<void> { return this.resumeResult; }
  schedule(event: MusicalEvent, at: number): void { if (this.failSchedule) throw Error('Schedule failed'); this.scheduled.push({event,at}); this.activeVoices += event.kind === 'on' ? 1 : -1; }
  cancel(): void { this.activeVoices = 0; }
  async close(): Promise<void> { this.closed = true; }
}
function transport() { const timer = new Clock(), sinks: Sink[] = []; const player = new MusicalTransport(() => {}, () => { const sink = new Sink(); sinks.push(sink); return sink; }, timer); return { timer, sinks, player }; }
describe('production owner-scoped lookahead transport', () => {
  it('starts against the audio clock, schedules simultaneous notes and releases at Stop', async () => {
    const { player, timer, sinks } = transport(), owner = {}, s = sequence(), plan = compileSequence({ ...s, tracks: [{id:'t',channel:0,sourcePpq:960,notes:[note('a'),note('b',64)]}] });
    await player.start(owner,plan); const sink=sinks[0]; if(!sink)throw Error(); expect(sink.scheduled).toHaveLength(2); expect(sink.scheduled[0]?.at).toBe(.05); expect(timer.callbacks.size).toBe(1);
    timer.advance(.05,sink);expect(player.position).toBe(0); timer.advance(.025,sink); expect(player.position).toBeCloseTo(.025); player.stop(owner); await player.settled();expect(player.activeVoices).toBe(0);expect(timer.callbacks.size).toBe(0);expect(sink.closed).toBe(true);player.dispose();
  });
  it('releases notes, stops at phrase end and rejects late/stalled work', async () => {
    const {player,timer,sinks}=transport();await player.start({},compileSequence(sequence()));const sink=sinks[0];if(!sink)throw Error();for(let i=0;i<84;i++)timer.advance(.025,sink);expect(sink.scheduled.map(item=>item.event.kind)).toEqual(['on','off']);expect(player.state).toBe('stopped');
    await player.start({},compileSequence(sequence()));const second=sinks[1];if(!second)throw Error();timer.advance(.2,second);expect(player.diagnostic).toContain('stalled');expect(player.activeVoices).toBe(0);player.dispose();
  });
  it('prevents stale resume from reviving a stopped/disposed editor', async () => {
    const wait=deferred(),sink=new Sink();sink.resumeResult=wait.promise;const timer=new Clock(),player=new MusicalTransport(()=>{},()=>sink,timer),pending=player.start({},compileSequence(sequence()));player.dispose();wait.resolve();await pending;expect(player.state).toBe('disposed');expect(timer.callbacks.size).toBe(0);expect(sink.closed).toBe(true);
  });
  it('handles start and scheduling failures and ignores controls from another owner', async () => {
    const sink=new Sink();sink.resumeResult=Promise.reject(Error('Permission'));const player=new MusicalTransport(()=>{},()=>sink,new Clock());await expect(player.start({},compileSequence(sequence()))).rejects.toThrow('Permission');expect(sink.closed).toBe(true);player.dispose();
    const h=transport(),owner={};await h.player.start(owner,compileSequence(sequence()));h.player.stop({});expect(h.player.state).toBe('playing');const live=h.sinks[0];if(!live)throw Error();live.failSchedule=true;for(let i=0;i<8;i++)h.timer.advance(.025,live);expect(h.player.diagnostic).toContain('Schedule failed');expect(live.closed).toBe(true);h.player.dispose();
  });
  it('does not accumulate contexts, voices, timers or subscriptions over repeated playback', async () => {
    const {player,timer,sinks}=transport();for(let i=0;i<50;i++){await player.start({},compileSequence(sequence()));player.stop();}await player.settled();expect(player.closingCount).toBe(0);expect(timer.callbacks.size).toBe(0);expect(sinks.every(sink=>sink.closed&&sink.activeVoices===0)).toBe(true);player.dispose();
  });
  it('rejects unordered or invalid plans before allocating audio', async () => {
    const {player,sinks}=transport();const valid=compileSequence(sequence());await expect(player.start({}, {...valid,events:valid.events.slice().reverse()} as MusicalPlan)).rejects.toThrow('invalid timing');expect(sinks).toHaveLength(0);player.dispose();
  });
});

it('closes the sink even when cancellation fails and rejects reentrant starts during disposal',async()=>{
 const sink=new Sink(),player=new MusicalTransport(()=>{},()=>sink,new Clock());await player.start({},compileSequence(sequence()));sink.cancel=()=>{throw Error('Cancellation fault');};player.stop();await player.settled();expect(sink.closed).toBe(true);expect(player.diagnostic).toContain('cancellation failed');player.dispose();await expect(player.start({},compileSequence(sequence()))).rejects.toThrow('disposed');
});
