import type { Motif, Meter } from '../domain/entities';
export interface SourceSummary {
    readonly id: string;
    readonly title: string;
    readonly path: string;
    readonly revision: string;
    readonly ppq: number;
    readonly lengthTicks: number;
    readonly tempo: number;
    readonly meter: Readonly<Meter>;
    readonly noteCount: number;
    readonly endpointQuantum: number;
}
export type SourceState = {
    readonly status: 'ready';
    readonly source: SourceSummary;
} | {
    readonly status: 'missing' | 'duplicate' | 'malformed' | 'unsupported' | 'wrong-kind' | 'archived';
    readonly paths: readonly string[];
    readonly message?: string;
};
/** GCD of every absolute note endpoint AND the complete length proves conversion compatibility without retaining notes. */
export function summarizeSource(motif: Motif, revision: string, path: string): SourceSummary {
    let quantum = BigInt(motif.data.lengthTicks);
    const gcd = (a: bigint, b: bigint): bigint => { while (b) {
        const remainder = a % b;
        a = b;
        b = remainder;
    } return a; };
    for (const note of motif.data.notes) {
        quantum = gcd(quantum, BigInt(note.startTick));
        quantum = gcd(quantum, BigInt(note.startTick + note.durationTicks));
    }
    return Object.freeze({ id: motif.id, title: motif.title, path, revision, ppq: motif.data.ppq, lengthTicks: motif.data.lengthTicks, tempo: motif.data.tempoMicrosecondsPerQuarter, meter: Object.freeze({ ...motif.data.meter }), noteCount: motif.data.notes.length, endpointQuantum: Number(quantum) });
}
export function hasTimingMap(motif: Motif): boolean { return ['tempoMap', 'tempos', 'tempoChanges', 'meterChanges', 'timeSignatures'].some(key => motif.data[key] !== undefined) || motif.extra.mnemobard_tempo_map !== undefined || motif.extra.mnemobard_meter_map !== undefined; }
