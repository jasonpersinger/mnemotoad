import { FoundationError } from '../domain/errors';
export type Grid = 'off' | 'quarter' | 'eighth' | 'sixteenth' | 'triplet';
export function gridTicks(ppq: number, grid: Grid): number {
    const divisor = { off: 0, quarter: 1, eighth: 2, sixteenth: 4, triplet: 3 }[grid];
    if (!Number.isSafeInteger(ppq) || ppq < 1 || ppq > 32767)
        throw new FoundationError('invalid', 'PPQ must be an integer1..32767.');
    if (!divisor)
        return 1;
    if (ppq % divisor !== 0)
        throw new FoundationError('invalid', `This ${grid} grid has fractional source ticks at PPQ${ppq}. Choose a coarser grid or turn snapping off; source timing was retained.`);
    return ppq / divisor;
}
export function snapped(tick: number, ppq: number, grid: Grid): number {
    if (!Number.isFinite(tick))
        throw new FoundationError('invalid', 'Position must be finite.');
    const step = gridTicks(ppq, grid);
    return Math.round(tick / step) * step;
}
