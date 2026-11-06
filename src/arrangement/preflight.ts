import type { Composition } from '../domain/entities';
import { validateEntity } from '../domain/validation';
import type { SourceState, SourceSummary } from './sources';
import { clipExtent, sourcePeriod } from './timing';
export type ArrangementCode = 'invalid-composition' | 'missing' | 'duplicate' | 'malformed' | 'unsupported' | 'wrong-kind' | 'archived' | 'unreviewed' | 'changed' | 'moved' | 'unsaved-source' | 'tempo-mismatch' | 'meter-mismatch' | 'empty-source' | 'inexact-timing' | 'beyond-end' | 'clip-overlap' | 'planning-only';
export interface ArrangementDiagnostic {
    readonly code: ArrangementCode;
    readonly severity: 'error' | 'warning' | 'info';
    readonly clipId?: string;
    readonly motifId?: string;
    readonly detail?: string;
}
export interface ResolvedClip {
    readonly id: string;
    readonly laneId: string;
    readonly laneIndex: number;
    readonly motifId: string;
    readonly title: string;
    readonly startTick: number;
    readonly repeatCount: number;
    readonly periodTicks?: number;
    readonly durationTicks?: number;
    readonly endTick?: number;
    readonly source?: SourceSummary;
    readonly diagnostics: readonly ArrangementDiagnostic[];
}
export interface ArrangementPlan {
    readonly clips: readonly ResolvedClip[];
    readonly diagnostics: readonly ArrangementDiagnostic[];
    readonly referencesReady: boolean;
    readonly exportReady: false;
}
export function resolveArrangement(input: Composition, resolve: (id: string) => SourceState, unsaved: (id: string) => boolean = () => false): ArrangementPlan {
    let composition: Composition;
    try {
        const checked = validateEntity(input);
        if (checked.kind !== 'composition')
            throw Error('Expected a composition');
        composition = checked;
    }
    catch (error) {
        return { clips: [], diagnostics: [{ code: 'invalid-composition', severity: 'error', detail: error instanceof Error ? error.message : String(error) }], referencesReady: false, exportReady: false };
    }
    const clips: ResolvedClip[] = [], all: ArrangementDiagnostic[] = [{ code: 'planning-only', severity: 'info' }], periods = new Map<string, number | Error>();
    for (const [laneIndex, lane] of composition.data.lanes.entries())
        for (const clip of lane.clips) {
            const diagnostics: ArrangementDiagnostic[] = [], add = (code: ArrangementCode, severity: ArrangementDiagnostic['severity'], detail?: string) => diagnostics.push({ code, severity, clipId: clip.id, motifId: clip.motifId, detail });
            const state = resolve(clip.motifId);
            let period: number | undefined, source: SourceSummary | undefined, extent: {
                endTick: number;
                durationTicks: number;
            } | undefined;
            if (state.status !== 'ready')
                add(state.status, 'error', state.message);
            else {
                source = state.source;
                const key = source.id.toLowerCase() + ':' + source.revision;
                let conversion = periods.get(key);
                if (conversion === undefined) {
                    try {
                        conversion = sourcePeriod(source, composition.data.ppq);
                    }
                    catch (error) {
                        conversion = error instanceof Error ? error : Error(String(error));
                    }
                    periods.set(key, conversion);
                }
                if (conversion instanceof Error)
                    add('inexact-timing', 'error', conversion.message);
                else {
                    period = conversion;
                    try {
                        extent = clipExtent(clip.startTick, period, clip.repeatCount);
                        if (extent.endTick > composition.data.lengthTicks)
                            add('beyond-end', 'error', 'Extend composition length explicitly; source length is live.');
                    }
                    catch (error) {
                        add('inexact-timing', 'error', error instanceof Error ? error.message : String(error));
                    }
                }
                if (!clip.sourceRevision)
                    add('unreviewed', 'warning');
                else if (clip.sourceRevision !== source.revision)
                    add('changed', 'warning');
                if (clip.sourcePath && clip.sourcePath !== source.path)
                    add('moved', 'info');
                if (source.tempo !== composition.data.tempoMicrosecondsPerQuarter)
                    add('tempo-mismatch', 'info');
                if (source.meter.numerator !== composition.data.meter.numerator || source.meter.denominator !== composition.data.meter.denominator)
                    add('meter-mismatch', 'info');
                if (!source.noteCount)
                    add('empty-source', 'info');
            }
            if (unsaved(clip.motifId))
                add('unsaved-source', 'warning');
            const result: ResolvedClip = { id: clip.id, laneId: lane.id, laneIndex, motifId: clip.motifId, title: clip.label ?? source?.title ?? clip.sourceTitle ?? 'Unresolved motif', startTick: clip.startTick, repeatCount: clip.repeatCount, periodTicks: period, durationTicks: extent?.durationTicks, endTick: extent?.endTick, source, diagnostics };
            clips.push(result);
            all.push(...diagnostics);
        }
    for (const lane of composition.data.lanes) {
        let furthest = 0;
        for (const clip of clips.filter(c => c.laneId === lane.id && c.endTick !== undefined).sort((a, b) => a.startTick - b.startTick)) {
            if (clip.startTick < furthest)
                all.push({ code: 'clip-overlap', severity: 'warning', clipId: clip.id, motifId: clip.motifId });
            furthest = Math.max(furthest, clip.endTick ?? 0);
        }
    }
    return Object.freeze({ clips: Object.freeze(clips), diagnostics: Object.freeze(all), referencesReady: !all.some(d => d.severity === 'error'), exportReady: false });
}
export function diagnosticText(d: ArrangementDiagnostic): string {
    const text: Record<ArrangementCode, string> = { 'invalid-composition': 'Composition structure is invalid.', missing: 'Saved motif is missing; clip retained.', duplicate: 'Motif UUID is ambiguous; inspect duplicates.', malformed: 'Saved motif is malformed; inspect its Markdown.', unsupported: 'Source schema/timing map is unsupported.', 'wrong-kind': 'Reference is not a motif.', archived: 'Source is archived; clip retained.', unreviewed: 'Saved source has not been explicitly reviewed.', changed: 'Saved source changed since placement/review; inspect and acknowledge.', moved: 'Source moved/renamed; UUID still resolves. Review can refresh the path hint.', 'unsaved-source': 'MOTIF has unsaved edits in this plugin instance; arrangement uses the saved record only.', 'tempo-mismatch': 'Source tempo differs. Arrangement tempo interprets musical ticks; source is not rewritten or time-stretched.', 'meter-mismatch': 'Source meter differs. Placement/ruler use composition meter; source note ticks remain unchanged.', 'empty-source': 'Empty motif: its full saved length remains a rest.', 'inexact-timing': 'Source timing is incompatible; no rounding or resampling.', 'beyond-end': 'Live clip extends beyond composition length.', 'clip-overlap': 'Clip regions overlap. No notes are merged; final note/channel collision policy belongs to4B.', 'planning-only': 'Arrangement planner only. Structurally resolved references do not imply MIDI export/playback readiness.' };
    return text[d.code] + (d.detail ? ' ' + d.detail : '');
}
