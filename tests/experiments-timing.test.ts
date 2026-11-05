import { describe, expect, it } from 'vitest';
import { barQuarters, describe as ratio, division, fraction, ppq, quarters, quantizeTicks, TempoMap, ticksAt } from '../experiments/timing';
describe('experimental exact musical timing', () => {
  it.each([96, 480, 960, 1000, 32767])('retains source PPQ %i without changing source ticks', resolution => {
    const source = quarters(37, resolution);
    expect(quantizeTicks(ticksAt(source, resolution)).tick).toBe(37);
    expect(ratio(ticksAt(quarters(resolution, resolution), 960))).toBe('960/1');
  });
  it('requires explicit quantization of non-divisible source resolution', () => {
    const exact = ticksAt(quarters(1, 1000), 960);
    expect(ratio(exact)).toBe('24/25');
    expect(() => quantizeTicks(exact)).toThrow('Non-integral');
    expect(quantizeTicks(exact, 'nearest')).toEqual({ tick: 1, error: fraction(1n, 25n) });
    expect(quantizeTicks(fraction(3n, 2n), 'nearest').tick).toBe(2);
    expect(quantizeTicks(exact, 'floor').tick).toBe(0);
  });
  it('integrates tempo boundaries exactly and inverts them', () => {
    const map = new TempoMap(960, [{ tick: 0, microsecondsPerQuarter: 500000 }, { tick: 960, microsecondsPerQuarter: 1000000 }]);
    expect(map.seconds(quarters(480, 960))).toBe(.25);
    expect(map.seconds(quarters(960, 960))).toBe(.5);
    expect(map.seconds(quarters(1440, 960))).toBe(1);
    expect(map.seconds(quarters(1920, 960))).toBe(1.5);
    expect(map.positionAtMicroseconds(fraction(1000000n))).toEqual(quarters(1440, 960));
    expect(map.secondsToTicks(1, 960)).toBe(1440);
    for (let tick = 0; tick < 10000; tick += 37) expect(map.positionAtMicroseconds(map.microseconds(quarters(tick, 1000)))).toEqual(quarters(tick, 1000));
  });
  it('distinguishes meter beats from quarter notes', () => {
    expect(barQuarters(6, 8)).toEqual(fraction(3n));
    expect(barQuarters(4, 4)).toEqual(fraction(4n));
    expect(() => barQuarters(4, 3)).toThrow('denominator');
  });
  it('does not impose an additional nanosecond rounding grid at the floating audio boundary', () => {
    const map = new TempoMap(32767, [{ tick: 0, microsecondsPerQuarter: 1 }]);
    expect(map.secondsToTicks(1e-10, 32767)).toBeCloseTo(3.2767, 10);
    expect(() => map.secondsToTicks(NaN, 960)).toThrow('finite');
  });
  it.each([0xe828, 0xe728, 0xe328, 0xe228])('detects and rejects SMPTE division %i before conversion', word => expect(() => division(word)).toThrow('Unsupported SMPTE'));
  it('rejects malformed timing and unordered tempos', () => {
    expect(division(960)).toEqual({ type: 'ppq', ppq: 960 });
    for (const value of [0, -1, 32768, NaN, 1.5]) expect(() => ppq(value)).toThrow();
    expect(() => division(0xe800)).toThrow('Malformed');
    expect(() => division(0x8128)).toThrow('Malformed');
    expect(() => new TempoMap(960, [])).toThrow('tick 0');
    expect(() => new TempoMap(960, [{ tick: 0, microsecondsPerQuarter: 0 }])).toThrow();
    expect(() => new TempoMap(960, [{ tick: 0, microsecondsPerQuarter: 500000 }, { tick: 0, microsecondsPerQuarter: 400000 }])).toThrow('strictly ordered');
  });
});
