import type { Sequence, SourceNote } from '../../experiments/compiler';
export const note = (id = 'n', pitch = 60, startTick = 0, durationTicks = 480): SourceNote => ({ id, pitch, startTick, durationTicks, velocity: 100 });
export function sequence(notes: readonly SourceNote[] = [note()]): Sequence {
  return { ppq: 960, lengthTicks: 3840, tempos: [{ tick: 0, microsecondsPerQuarter: 500000 }], tracks: [{ id: 't', channel: 0, patchId: 'patch-reference', clips: [{ id: 'c', offsetTick: 0, repeatCount: 1, pattern: { ppq: 960, lengthTicks: 960, notes } }] }] };
}
