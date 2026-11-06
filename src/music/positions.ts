import type { Meter } from '../domain/entities';
import { add, fraction, integer, multiply, ppq, subtract } from './timing';
function beatSize(resolution: number, meter: Meter) {
    ppq(resolution);
    integer(meter.numerator, 'meter numerator', 1, 32);
    if (![1, 2, 4, 8, 16, 32].includes(meter.denominator))
        throw Error('Unsupported meter denominator');
    return fraction(BigInt(resolution) * 4n, BigInt(meter.denominator));
}
/** One-based bars/beats; beat unit is the written meter denominator. Offset is source ticks, optionally an exact fraction. */
export function musicalPosition(tick: number, resolution: number, meter: Meter): string {
    integer(tick, 'tick', 0, 1e9);
    const size = beatSize(resolution, meter), beats = BigInt(tick) * size.d / size.n, remainder = subtract(fraction(BigInt(tick)), multiply(size, fraction(beats)));
    return `${beats / BigInt(meter.numerator) + 1n}:${beats % BigInt(meter.numerator) + 1n}:${remainder.n}${remainder.d === 1n ? '' : '/' + remainder.d}`;
}
export function positionTick(value: string, resolution: number, meter: Meter): number {
    const match = /^([1-9]\d{0,8}):([1-9]\d{0,2}):(\d{1,9})(?:\/([1-9]\d{0,8}))?$/.exec(value.trim());
    if (!match)
        throw Error('Use bar:beat:tick, such as2:1:0; tick may be an exact fraction such as1/2.');
    const bar = BigInt(match[1] ?? '0'), beat = Number(match[2]), size = beatSize(resolution, meter);
    if (beat < 1 || beat > meter.numerator)
        throw Error(`Beat must be1..${meter.numerator} in ${meter.numerator}/${meter.denominator}.`);
    const offset = fraction(BigInt(match[3] ?? '0'), BigInt(match[4] ?? '1'));
    if (offset.n * size.d >= size.n * offset.d)
        throw Error('Tick offset must be smaller than one meter beat.');
    const total = add(multiply(size, fraction((bar - 1n) * BigInt(meter.numerator) + BigInt(beat - 1))), offset);
    if (total.d !== 1n)
        throw Error(`This position is fractional at source PPQ${resolution}. Choose an exactly representable source tick; no rounding was applied.`);
    const tick = Number(total.n);
    integer(tick, 'position tick', 0, 1e9);
    return tick;
}
