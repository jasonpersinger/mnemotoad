import { integer } from '../music/timing';
import type { SourceSummary } from './sources';
export const MAX_ARRANGEMENT_TICK = 1000000000;
/** Positive complete source period and every note endpoint must be exactly representable. */
export function sourcePeriod(source: SourceSummary, compositionPpq = 960): number {
    integer(source.ppq, 'source PPQ', 1, 32767);
    integer(compositionPpq, 'arrangement PPQ', 1, 32767);
    integer(source.lengthTicks, 'source length', 1);
    integer(source.endpointQuantum, 'source endpoint quantum', 1);
    const target = BigInt(compositionPpq), resolution = BigInt(source.ppq);
    if (BigInt(source.endpointQuantum) * target % resolution !== 0n || BigInt(source.lengthTicks) * target % resolution !== 0n)
        throw Error(`Source PPQ${source.ppq} note endpoints/full repetition boundaries cannot map exactly to PPQ${compositionPpq}. No rounding is permitted.`);
    const value = BigInt(source.lengthTicks) * target / resolution;
    if (value > BigInt(MAX_ARRANGEMENT_TICK))
        throw Error('Converted source length exceeds the safe arrangement bound.');
    return Number(value);
}
export function clipExtent(start: number, period: number, repetitions: number): {
    endTick: number;
    durationTicks: number;
} {
    integer(start, 'clip start', 0, MAX_ARRANGEMENT_TICK);
    integer(period, 'source period', 1, MAX_ARRANGEMENT_TICK);
    integer(repetitions, 'repetitions', 1, 1000);
    const duration = BigInt(period) * BigInt(repetitions), end = BigInt(start) + duration;
    if (end > BigInt(MAX_ARRANGEMENT_TICK))
        throw Error('Clip extent exceeds the safe arrangement tick bound.');
    return { endTick: Number(end), durationTicks: Number(duration) };
}
export function repetitionBoundary(start: number, period: number, count: number, index: number): number { integer(index, 'boundary index', 0, count); clipExtent(start, period, count); return Number(BigInt(start) + BigInt(period) * BigInt(index)); }
