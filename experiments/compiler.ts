import { add, compare, fraction, integer, MusicalInputError, ppq, quarters, TempoMap, ticksAt, type Fraction, type TempoChange } from './timing';

export interface SourceNote { readonly id: string; readonly pitch: number; readonly velocity: number; readonly startTick: number; readonly durationTicks: number }
export interface SourcePattern { readonly ppq: number; readonly lengthTicks: number; readonly notes: readonly SourceNote[] }
export interface Clip { readonly id: string; readonly offsetTick: number; readonly repeatCount: number; readonly pattern: SourcePattern }
export interface Track { readonly id: string; readonly channel: number; readonly patchId?: string; readonly clips: readonly Clip[] }
export interface Sequence { readonly ppq: number; readonly lengthTicks: number; readonly tempos: readonly TempoChange[]; readonly tracks: readonly Track[] }
export interface TimedEvent {
  readonly kind: 'on' | 'off'; readonly voiceId: string; readonly trackId: string; readonly channel: number;
  readonly patchId?: string; readonly pitch: number; readonly velocity: number; readonly tick: Fraction; readonly seconds: number;
}
export interface CompiledSequence { readonly events: readonly TimedEvent[]; readonly durationSeconds: number; readonly ppq: number }
const lexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function unique(id: string, seen: Set<string>, context: string): void {
  if (!id || id.length > 256 || seen.has(id)) throw new MusicalInputError(`${context}: missing, oversized or duplicate ID ${id}`);
  seen.add(id);
}
/** Independent of host, rendering, storage and sound. Schema 1 records are not changed. */
export function compile(sequence: Sequence): CompiledSequence {
  ppq(sequence.ppq); integer(sequence.lengthTicks, 'sequence length', 1, 1e9);
  if (sequence.tracks.length > 16) throw new MusicalInputError('At most 16 tracks in this experiment');
  const tempo = new TempoMap(sequence.ppq, sequence.tempos), end = quarters(sequence.lengthTicks, sequence.ppq);
  if (sequence.tempos.some(item => item.tick > sequence.lengthTicks)) throw new MusicalInputError('Tempo change beyond sequence end');
  const events: TimedEvent[] = [], trackIds = new Set<string>(), channels = new Set<number>();
  let voices = 0;
  for (const track of sequence.tracks) {
    unique(track.id, trackIds, 'Track'); integer(track.channel, 'channel', 0, 15);
    if (channels.has(track.channel)) throw new MusicalInputError('Use one distinct channel per track for unambiguous note pairing');
    channels.add(track.channel);
    const clipIds = new Set<string>();
    if (track.clips.length > 1000) throw new MusicalInputError('At most 1000 clips per track');
    for (const clip of track.clips) {
      unique(clip.id, clipIds, `Track ${track.id} clip`);
      integer(clip.offsetTick, 'clip offset', 0, sequence.lengthTicks); integer(clip.repeatCount, 'repeat count', 1, 1000);
      ppq(clip.pattern.ppq); integer(clip.pattern.lengthTicks, 'pattern length', 1, 1e9);
      if (clip.pattern.notes.length > 20000) throw new MusicalInputError('At most 20000 source notes');
      const length = quarters(clip.pattern.lengthTicks, clip.pattern.ppq), offset = quarters(clip.offsetTick, sequence.ppq);
      const clipEnd = add(offset, fraction(length.n * BigInt(clip.repeatCount), length.d));
      if (compare(clipEnd, end) > 0) throw new MusicalInputError(`Clip ${clip.id} exceeds sequence end; no trimming was performed`);
      const noteIds = new Set<string>();
      for (const note of clip.pattern.notes) {
        unique(note.id, noteIds, `Clip ${clip.id} note`);
        integer(note.pitch, 'pitch', 0, 127); integer(note.velocity, 'velocity', 1, 127);
        integer(note.startTick, 'note start', 0, clip.pattern.lengthTicks); integer(note.durationTicks, 'note duration', 1, clip.pattern.lengthTicks);
        if (note.startTick + note.durationTicks > clip.pattern.lengthTicks) throw new MusicalInputError(`Note ${note.id} exceeds pattern end`);
        for (let repeat = 0; repeat < clip.repeatCount; repeat++) {
          if (++voices > 100000) throw new MusicalInputError('Expanded note limit 100000 exceeded');
          const start = add(add(offset, fraction(length.n * BigInt(repeat), length.d)), quarters(note.startTick, clip.pattern.ppq));
          const finish = add(start, quarters(note.durationTicks, clip.pattern.ppq));
          const voiceId = [track.id, clip.id, String(repeat), note.id].map(encodeURIComponent).join('/');
          const base = { voiceId, trackId: track.id, channel: track.channel, patchId: track.patchId, pitch: note.pitch };
          events.push(Object.freeze({ ...base, kind: 'on', velocity: note.velocity, tick: ticksAt(start, sequence.ppq), seconds: tempo.seconds(start) }));
          events.push(Object.freeze({ ...base, kind: 'off', velocity: 0, tick: ticksAt(finish, sequence.ppq), seconds: tempo.seconds(finish) }));
        }
      }
    }
  }
  events.sort((a, b) => compare(a.tick, b.tick) || (a.kind === b.kind ? 0 : a.kind === 'off' ? -1 : 1) || a.channel - b.channel || lexical(a.trackId, b.trackId) || a.pitch - b.pitch || lexical(a.voiceId, b.voiceId));
  const active = new Set<string>();
  for (const event of events) {
    const key = `${event.channel}:${event.pitch}`;
    if (event.kind === 'on') {
      if (active.has(key)) throw new MusicalInputError(`Overlapping pitch ${event.pitch} on channel ${event.channel} at ${event.voiceId}; use distinct channels or resolve overlap`);
      active.add(key);
    } else active.delete(key);
  }
  return Object.freeze({ events: Object.freeze(events), durationSeconds: tempo.seconds(end), ppq: sequence.ppq });
}
