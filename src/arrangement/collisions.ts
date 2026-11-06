import type { ArrangementNote, CompileDiagnostic } from './compiled';
import { lexical } from './compiled';
export function noteOrder(a: ArrangementNote, b: ArrangementNote): number { return a.startTick - b.startTick || a.pitch - b.pitch || lexical(a.id, b.id); }
/** Half-open lifetimes: touching boundaries are legal, simultaneous overlapping starts are not. */
export function collision(a: readonly ArrangementNote[], b: readonly ArrangementNote[], channel: number, protectTrackBoundary = false): CompileDiagnostic | undefined {
  const rows = new Map<number, ArrangementNote[]>();
  for (const note of [...a, ...b]) { const row = rows.get(note.pitch) ?? []; row.push(note); rows.set(note.pitch, row); }
  for (const pitch of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(pitch) ?? []; row.sort(noteOrder); let active: ArrangementNote | undefined;
    for (const note of row) {
      if (active && (active.startTick + active.durationTicks > note.startTick || (protectTrackBoundary && active.startTick + active.durationTicks === note.startTick && active.provenance.laneId !== note.provenance.laneId))) return { code: active.startTick + active.durationTicks === note.startTick ? 'cross-track-boundary' : 'note-collision', severity: 'error', message: `Channel ${channel + 1}, pitch ${pitch}: ${active.provenance.laneName} conflicts with ${note.provenance.laneName}. ${active.startTick + active.durationTicks === note.startTick ? 'Separate same-pitch track boundaries with a gap to avoid SMF merge-order ambiguity.' : 'Overlapping same-channel/pitch lifetimes cannot be represented safely.'} Move a clip or choose another channel; no notes were changed.`, ...note.provenance, pitch, channel, conflict: active.provenance };
      active = note;
    }
  }
  return undefined;
}
