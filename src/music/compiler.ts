import { compare, integer, MusicalInputError, ppq, quarters, TempoMap, ticksAt, type Fraction, type TempoChange } from './timing';
import type { Note } from '../domain/entities';
export interface MusicalTrack { readonly id: string; readonly channel: number; readonly patchId?: string; readonly sourcePpq: number; readonly notes: readonly Note[] }
export interface MusicalSequence { readonly ppq: number; readonly lengthTicks: number; readonly tempos: readonly TempoChange[]; readonly tracks: readonly MusicalTrack[] }
export interface MusicalEvent {
  readonly kind: 'on' | 'off'; readonly voiceId: string; readonly trackId: string; readonly channel: number; readonly patchId?: string;
  readonly pitch: number; readonly velocity: number; readonly tick: Fraction; readonly seconds: number; readonly durationSeconds?: number;
}
export interface MusicalPlan { readonly events: readonly MusicalEvent[]; readonly durationSeconds: number; readonly maxPolyphony: number }
const lexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
/** Pure source-PPQ compiler. No clip/timeline/codec or host dependency. */
export function compileSequence(sequence: MusicalSequence): MusicalPlan {
  ppq(sequence.ppq); integer(sequence.lengthTicks, 'sequence length', 1, 1e9);
  const tempo = new TempoMap(sequence.ppq, sequence.tempos), end = quarters(sequence.lengthTicks, sequence.ppq);
  if (sequence.tempos.some(change => change.tick > sequence.lengthTicks) || sequence.tracks.length > 16) throw new MusicalInputError('Tempo map or track count exceeds the sequence bounds');
  const events: MusicalEvent[] = [], tracks = new Set<string>();
  for (const track of sequence.tracks) {
    if (!track.id || track.id.length > 256 || tracks.has(track.id)) throw new MusicalInputError('Track IDs must be unique and nonempty'); tracks.add(track.id);
    integer(track.channel, 'channel', 0, 15); ppq(track.sourcePpq);
    if (track.notes.length > 10000) throw new MusicalInputError('Maximum10000 notes per track');
    const ids = new Set<string>();
    for (const note of track.notes) {
      if (!note.id || note.id.length > 1000 || ids.has(note.id)) throw new MusicalInputError('Note IDs must be unique and nonempty'); ids.add(note.id);
      integer(note.pitch, 'pitch', 0, 127); integer(note.velocity, 'velocity', 1, 127); integer(note.startTick, 'note start'); integer(note.durationTicks, 'note duration', 1);
      integer(note.startTick + note.durationTicks, 'note end');
      const start = quarters(note.startTick, track.sourcePpq), finish = quarters(note.startTick + note.durationTicks, track.sourcePpq);
      if (compare(finish, end) > 0) throw new MusicalInputError(`Note ${note.id} extends beyond the sequence`);
      const common = { voiceId: `${encodeURIComponent(track.id)}/${encodeURIComponent(note.id)}`, trackId: track.id, channel: track.channel, patchId: track.patchId, pitch: note.pitch };
      events.push(Object.freeze({ ...common, kind: 'on', velocity: note.velocity, tick: ticksAt(start, sequence.ppq), seconds: tempo.seconds(start), durationSeconds: tempo.seconds(finish) - tempo.seconds(start) }), Object.freeze({ ...common, kind: 'off', velocity: 0, tick: ticksAt(finish, sequence.ppq), seconds: tempo.seconds(finish) }));
    }
  }
  events.sort((a, b) => compare(a.tick, b.tick) || (a.kind === b.kind ? 0 : a.kind === 'off' ? -1 : 1) || a.channel - b.channel || lexical(a.trackId, b.trackId) || a.pitch - b.pitch || lexical(a.voiceId, b.voiceId));
  const active = new Set<string>(); let maxPolyphony = 0;
  for (const event of events) {
    const key = `${event.channel}:${event.pitch}`;
    if (event.kind === 'on') {
      if (active.has(key)) throw new MusicalInputError(`Overlapping same-pitch notes on channel${event.channel + 1} are unsupported. Move/shorten a note explicitly.`);
      active.add(key); maxPolyphony = Math.max(maxPolyphony, active.size);
    } else active.delete(key);
  }
  if (maxPolyphony > 64) throw new MusicalInputError('Audition supports at most64 simultaneous notes; no notes were dropped.');
  return Object.freeze({ events: Object.freeze(events), durationSeconds: tempo.seconds(end), maxPolyphony });
}
