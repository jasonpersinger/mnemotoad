import type { Motif } from '../domain/entities';
import { editableMotif } from '../modules/motif/commands';
import { compileSequence } from '../music/compiler';
import { serializeTypeOne } from './serialize';
/** UTF-8 track text, carried as bytes through midi-file's byte-string API. */
export function exportWarnings(motif: Motif): string[] {
  return ['Exports notes, source PPQ, constant tempo/meter, track name and exact end silence. No audio, PATCHBOOK sound, links, tags, description or user notes are embedded.',
    ...(Array.from(motif.title).length>256?['The MIDI track name is shortened to256 characters; the authoritative title is unchanged.']:[]),
    ...(Object.keys(motif.data).some(key => !['schemaVersion','ppq','tempoMicrosecondsPerQuarter','meter','lengthTicks','notes','importSourceChannel','midiImport'].includes(key)) || motif.data.notes.some(note => Object.keys(note).some(key => !['id','pitch','startTick','durationTicks','velocity'].includes(key))) ? ['Custom musical/note extension metadata is not exported. Its Markdown source is unchanged.'] : [])];
}
export function exportMidi(input: Motif): Uint8Array {
  const motif = editableMotif(input), data = motif.data, channel = data.importSourceChannel ?? 0;
  const plan = compileSequence({ ppq: data.ppq, lengthTicks: data.lengthTicks, tempos: [{ tick: 0, microsecondsPerQuarter: data.tempoMicrosecondsPerQuarter }], tracks: [{ id: motif.id, channel, sourcePpq: data.ppq, notes: data.notes }] }, 128);
  return serializeTypeOne(data.ppq,data.tempoMicrosecondsPerQuarter,data.meter,data.lengthTicks,[{name:motif.title,events:plan.events}]);
}
