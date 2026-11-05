import { describe, expect, it } from 'vitest';
import { parseMidi, writeMidi, type MidiData } from 'midi-file';
import { division, quarters, quantizeTicks, ticksAt } from '../experiments/timing';
import { compile } from '../experiments/compiler';
import { sequence } from './support/musical-fixtures';

// Independently authored minimal Type 0 fixture: PPQ480, C4 on at0/off at480, then end.
const fixture = [0x4d,0x54,0x68,0x64,0,0,0,6,0,0,0,1,1,0xe0,0x4d,0x54,0x72,0x6b,0,0,0,13,0,0x90,60,100,0x83,0x60,0x80,60,0,0,0xff,0x2f,0];
describe('experimental midi-file candidate contracts (not a production codec)', () => {
  it('round-trips a known standard MIDI byte fixture without retiming', () => {
    const parsed = parseMidi(Uint8Array.from(fixture));
    expect(parsed.header).toEqual({ format: 0, numTracks: 1, ticksPerBeat: 480 });
    expect(parsed.tracks[0]?.[1]).toMatchObject({ type: 'noteOff', deltaTime: 480, noteNumber: 60 });
    expect(writeMidi(parsed)).toEqual(fixture);
  });
  it.each([96, 480, 960, 1000, 32767])('preserves source PPQ and integer event ticks at %i', resolution => {
    const source: MidiData = { header: { format: 0, numTracks: 1, ticksPerBeat: resolution }, tracks: [[{ deltaTime: 1, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 90 }, { deltaTime: 37, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 }, { deltaTime: 19, type: 'endOfTrack', meta: true }]] };
    const parsed = parseMidi(writeMidi(source));
    expect(parsed.header.ticksPerBeat).toBe(resolution);
    expect(parsed.tracks[0]?.map(e => e.deltaTime)).toEqual([1, 37, 19]);
    expect(quantizeTicks(ticksAt(quarters(38, resolution), resolution)).tick).toBe(38);
  });
  it('retains Type1 conductor tempo/meter changes and track/channel data', () => {
    const source: MidiData = { header: { format: 1, numTracks: 2, ticksPerBeat: 960 }, tracks: [
      [{ deltaTime: 0, type: 'setTempo', meta: true, microsecondsPerBeat: 500000 }, { deltaTime: 0, type: 'timeSignature', meta: true, numerator: 6, denominator: 8, metronome: 24, thirtyseconds: 8 }, { deltaTime: 960, type: 'setTempo', meta: true, microsecondsPerBeat: 1000000 }, { deltaTime: 960, type: 'endOfTrack', meta: true }],
      [{ deltaTime: 0, type: 'trackName', meta: true, text: 'Synthetic' }, { deltaTime: 480, type: 'noteOn', channel: 3, noteNumber: 67, velocity: 100 }, { deltaTime: 960, type: 'noteOff', channel: 3, noteNumber: 67, velocity: 0 }, { deltaTime: 480, type: 'endOfTrack', meta: true }],
    ] };
    expect(parseMidi(writeMidi(source))).toEqual(source);
  });
  it('feeds the same compiled event positions to a candidate MIDI writer without a second timing system', () => {
    const plan = compile(sequence()); let previous = 0;
    const events = plan.events.map(event => {
      const tick = quantizeTicks(event.tick).tick, deltaTime = tick - previous; previous = tick;
      return { deltaTime, type: event.kind === 'on' ? 'noteOn' as const : 'noteOff' as const, channel: event.channel, noteNumber: event.pitch, velocity: event.velocity };
    });
    const parsed = parseMidi(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: plan.ppq }, tracks: [[...events, { deltaTime: 3840 - previous, meta: true, type: 'endOfTrack' }]] }));
    let absolute = 0;
    expect(parsed.tracks[0]?.map(event => { absolute += event.deltaTime; return absolute; })).toEqual([0, 480, 3840]);
    expect(plan.events[1]?.seconds).toBe(480 / 960 * .5);
  });
  it('detects SMPTE in raw division before attempting PPQ processing', () => {
    const bytes = [...fixture]; bytes[12] = 0xe3; bytes[13] = 40;
    expect(() => division(new DataView(Uint8Array.from(bytes).buffer).getUint16(12))).toThrow('Unsupported SMPTE');
    expect(parseMidi(bytes).header).toMatchObject({ framesPerSecond: 29, ticksPerFrame: 40 });
  });
  it('exposes permissive truncation requiring an outer production validation layer', () => {
    const headerOnly = fixture.slice(0, 14);
    const parsed = parseMidi(headerOnly);
    expect(parsed.header.numTracks).toBe(1);
    expect(parsed.tracks).toHaveLength(0); // Candidate does not itself enforce declared track count.
  });
});
