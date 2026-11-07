import type { Composition, Note } from '../domain/entities';
import type { SourceState, SourceSummary } from './sources';
import { clipExtent, sourcePeriod } from './timing';

/**
 * 4G source-revision review (pure). Groups the clips whose acknowledged saved revision differs from the current saved motif,
 * one group per stable motif UUID, and decides — without changing anything — whether every such placement may be acknowledged.
 * Acknowledging records the CURRENT saved revision on the clip (the existing per-clip review fields); it never alters the
 * source, its notes, the clip's position, repetitions, lane or routing.
 *
 * History: a clip stores only the previous revision's SHA-256 fingerprint, title, path and per-repetition length. No earlier
 * note data exists, so a note-by-note comparison is impossible and is never presented as performed.
 */
export interface ReviewPlacement {
  readonly clipId: string; readonly laneId: string; readonly laneIndex: number; readonly laneName: string;
  /** Clip label, else the current or last reviewed source title. */
  readonly label: string;
  readonly startTick: number; readonly repeatCount: number;
  readonly previousRevision?: string; readonly previousTitle?: string; readonly previousPath?: string;
  /** Arrangement ticks per repetition at the previous review (unknown for clips placed before review recording). */
  readonly previousPeriodTicks?: number; readonly previousDurationTicks?: number;
  readonly periodTicks?: number; readonly durationTicks?: number; readonly endTick?: number;
  readonly eligible: boolean; readonly reason?: string;
}
export interface SourceReviewItem {
  /** The stable UUID as written on the first affected clip (compared case-insensitively). */
  readonly motifId: string;
  readonly title: string;
  readonly status: SourceState['status'];
  readonly source?: SourceSummary;
  readonly paths: readonly string[];
  /** Distinct previously acknowledged revisions among the affected clips; `undefined` = never reviewed. */
  readonly previousRevisions: readonly (string | undefined)[];
  readonly placements: readonly ReviewPlacement[];
  readonly timing: { readonly ok: boolean; readonly message: string };
  /** Source-level conditions that block acknowledgement of every placement. */
  readonly blockers: readonly string[];
  /** True only when nothing blocks and every affected placement is eligible (all-or-nothing). */
  readonly eligible: boolean;
}
/** What the user reviewed; revalidated immediately before the single undoable acknowledgement. */
export interface ReviewToken {
  readonly motifId: string; readonly revision: string; readonly baseSource?: string;
  readonly clips: readonly { readonly id: string; readonly laneId: string; readonly previousRevision?: string; readonly startTick: number; readonly repeatCount: number }[];
}

const STATUS: Record<Exclude<SourceState['status'], 'ready'>, string> = {
  missing: 'The saved motif is missing. Restore its note (same UUID); clips are kept.',
  duplicate: 'More than one note has this motif UUID. Resolve the duplicate first.',
  malformed: 'The saved motif note is malformed. Repair its Markdown first.',
  unsupported: 'The saved motif uses an unsupported schema or timing map.',
  'wrong-kind': 'This UUID belongs to a record that is not a motif.',
  archived: 'The saved motif is archived. Restore it before acknowledging it.',
};

export function sourceReview(composition: Composition, resolve: (id: string) => SourceState, unsaved: (id: string) => boolean = () => false, keep?: string): SourceReviewItem[] {
  const groups = new Map<string, { motifId: string; clips: { lane: Composition['data']['lanes'][number]; laneIndex: number; clip: Composition['data']['lanes'][number]['clips'][number] }[] }>();
  for (const [laneIndex, lane] of composition.data.lanes.entries()) for (const clip of lane.clips) {
    const key = clip.motifId.toLowerCase(), group = groups.get(key) ?? { motifId: clip.motifId, clips: [] };
    group.clips.push({ lane, laneIndex, clip }); groups.set(key, group);
  }
  const items: SourceReviewItem[] = [], kept = keep?.toLowerCase();
  for (const [key, group] of groups) {
    const state = resolve(group.motifId), source = state.status === 'ready' ? state.source : undefined;
    const affected = group.clips.filter(({ clip }) => !source || clip.sourceRevision !== source.revision);
    if (key !== kept && (!source || !affected.length)) continue;
    const blockers: string[] = [];
    if (state.status !== 'ready') blockers.push(state.message ? `${STATUS[state.status]} ${state.message}` : STATUS[state.status]);
    if (unsaved(group.motifId)) blockers.push('MOTIF has unsaved edits to this motif. Save or discard them first, so the version you acknowledge is the one you mean.');
    let period: number | undefined, timing = { ok: false, message: 'Source unavailable; timing cannot be checked.' };
    if (source) {
      try { period = sourcePeriod(source, composition.data.ppq); timing = { ok: true, message: `PPQ ${source.ppq} → ${composition.data.ppq}: every note boundary and the full repetition length convert exactly.` }; }
      catch (error) { timing = { ok: false, message: error instanceof Error ? error.message : String(error) }; blockers.push('Timing is incompatible: ' + timing.message); }
    }
    const placements = affected.map(({ lane, laneIndex, clip }): ReviewPlacement => {
      const previousPeriodTicks = clip.reviewedLengthTicks, base = {
        clipId: clip.id, laneId: lane.id, laneIndex, laneName: lane.name, label: clip.label ?? source?.title ?? clip.sourceTitle ?? 'Unresolved motif',
        startTick: clip.startTick, repeatCount: clip.repeatCount, previousRevision: clip.sourceRevision, previousTitle: clip.sourceTitle, previousPath: clip.sourcePath,
        previousPeriodTicks, previousDurationTicks: previousPeriodTicks === undefined ? undefined : previousPeriodTicks * clip.repeatCount,
      };
      if (period === undefined) return { ...base, eligible: false, reason: source ? 'Timing is incompatible.' : 'Source unavailable.' };
      try {
        const extent = clipExtent(clip.startTick, period, clip.repeatCount);
        if (extent.endTick > composition.data.lengthTicks) return { ...base, periodTicks: period, durationTicks: extent.durationTicks, endTick: extent.endTick, eligible: false, reason: 'With the current saved length this clip would end after the composition. Extend the composition or move/shorten the clip first.' };
        return { ...base, periodTicks: period, durationTicks: extent.durationTicks, endTick: extent.endTick, eligible: true };
      } catch (error) { return { ...base, periodTicks: period, eligible: false, reason: error instanceof Error ? error.message : String(error) }; }
    });
    const previousRevisions = [...new Set(affected.map(({ clip }) => clip.sourceRevision))];
    items.push({ motifId: group.motifId, title: source?.title ?? affected[0]?.clip.sourceTitle ?? group.clips[0]?.clip.sourceTitle ?? 'Unresolved motif', status: state.status, source, paths: source ? [source.path] : state.status === 'ready' ? [] : state.paths, previousRevisions, placements, timing, blockers, eligible: !blockers.length && placements.length > 0 && placements.every(p => p.eligible) });
  }
  return items.sort((a, b) => a.title.localeCompare(b.title) || a.motifId.localeCompare(b.motifId));
}

/** Freezes exactly what was reviewed. Refuses an ineligible review: there is no silent partial acknowledgement. */
export function reviewToken(item: SourceReviewItem, baseSource?: string): ReviewToken {
  if (!item.eligible || !item.source) throw Error(item.blockers[0] ?? item.placements.find(p => !p.eligible)?.reason ?? 'Nothing to acknowledge for this source.');
  return Object.freeze({ motifId: item.motifId, revision: item.source.revision, ...(baseSource === undefined ? {} : { baseSource }), clips: Object.freeze(item.placements.map(p => Object.freeze({ id: p.clipId, laneId: p.laneId, ...(p.previousRevision === undefined ? {} : { previousRevision: p.previousRevision }), startTick: p.startTick, repeatCount: p.repeatCount }))) });
}

/** Earliest note start and latest note end of the CURRENT saved source (context for the before/after summary). */
export function noteExtent(notes: readonly Note[]): { first: number; last: number } | undefined {
  if (!notes.length) return undefined;
  let first = Infinity, last = 0; for (const n of notes) { first = Math.min(first, n.startTick); last = Math.max(last, n.startTick + n.durationTicks); }
  return { first, last };
}
