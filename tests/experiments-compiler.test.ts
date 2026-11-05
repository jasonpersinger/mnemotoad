import { describe, expect, it } from 'vitest';
import { compile } from '../experiments/compiler';
import { describe as ratio } from '../experiments/timing';
import { note, sequence } from './support/musical-fixtures';
describe('experimental shared event compiler', () => {
  it('compiles one note with track/channel/patch identity and trailing rest', () => {
    const result = compile(sequence());
    expect(result.events.map(e => [e.kind, e.seconds, e.channel, e.patchId])).toEqual([['on', 0, 0, 'patch-reference'], ['off', .25, 0, 'patch-reference']]);
    expect(result.durationSeconds).toBe(2);
  });
  it('orders chords deterministically independent of source array order', () => {
    const notes = [note('b', 64), note('a', 60), note('c', 67)];
    expect(compile(sequence(notes))).toEqual(compile(sequence([...notes].reverse())));
    expect(compile(sequence(notes)).events.slice(0, 3).map(e => e.pitch)).toEqual([60, 64, 67]);
  });
  it('expands offsets and repetition with exact non-divisible PPQ positions', () => {
    const s = sequence();
    const result = compile({ ...s, tracks: [{ id: 't', channel: 0, clips: [{ id: 'c', offsetTick: 960, repeatCount: 2, pattern: { ppq: 1000, lengthTicks: 1000, notes: [note('n', 60, 1, 499)] } }] }] });
    expect(result.events.filter(e => e.kind === 'on').map(e => ratio(e.tick))).toEqual(['24024/25', '48024/25']);
    expect(result.events[0]?.seconds).toBe(.5005);
  });
  it('uses off-before-on ordering at repeated same-pitch boundaries', () => {
    const s = sequence([note('first', 60, 0, 480), note('second', 60, 480, 480)]);
    expect(compile(s).events.map(e => [e.kind, e.seconds])).toEqual([['on', 0], ['off', .25], ['on', .25], ['off', .5]]);
  });
  it('supports overlapping different pitches and rejects ambiguous same-channel same-pitch overlaps', () => {
    expect(compile(sequence([note('a', 60, 0, 800), note('b', 64, 400, 400)])).events).toHaveLength(4);
    expect(() => compile(sequence([note('a', 60, 0, 800), note('b', 60, 400, 400)]))).toThrow('Overlapping pitch');
    const s = sequence();
    expect(compile({ ...s, tracks: [...s.tracks, { id: 'other', channel: 1, clips: [{ id: 'c', offsetTick: 0, repeatCount: 1, pattern: { ppq: 960, lengthTicks: 960, notes: [note()] } }] }] }).events).toHaveLength(4);
  });
  it('places note ends across tempo changes using the same map', () => {
    const s = sequence();
    const result = compile({ ...s, tempos: [{ tick: 0, microsecondsPerQuarter: 500000 }, { tick: 240, microsecondsPerQuarter: 1000000 }] });
    expect(result.events[1]?.seconds).toBe(.375);
  });
  it('supports an empty sequence and rejects invalid values and duplicate IDs', () => {
    expect(compile({ ...sequence(), tracks: [] }).events).toEqual([]);
    for (const n of [note('n', 128), note('n', 60, -1), note('n', 60, 0, 0), note('n', 60, 900, 480)]) expect(() => compile(sequence([n]))).toThrow();
    expect(() => compile(sequence([note(), note()]))).toThrow('duplicate ID');
    const s = sequence();
    expect(() => compile({ ...s, lengthTicks: 100 })).toThrow('exceeds sequence');
    expect(() => compile({ ...s, tracks: [...s.tracks, { id: 'other', channel: 0, clips: [] }] })).toThrow('distinct channel');
  });
});
