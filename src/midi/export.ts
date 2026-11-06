import { writeMidi, type MidiEvent } from 'midi-file';
import type { Motif } from '../domain/entities';
import { editableMotif } from '../modules/motif/commands';
import { compileSequence } from '../music/compiler';
import { scanMidi, MidiError } from './structure';
/** UTF-8 track text, carried as bytes through midi-file's byte-string API. */
const midiText = (value: string): string => Array.from(new TextEncoder().encode(Array.from(value).slice(0,256).join('')), b => String.fromCharCode(b)).join('');
export function exportWarnings(motif: Motif): string[] {
  return ['Exports notes, source PPQ, constant tempo/meter, track name and exact end silence. No audio, PATCHBOOK sound, links, tags, description or user notes are embedded.',
    ...(Array.from(motif.title).length>256?['The MIDI track name is shortened to256 characters; the authoritative title is unchanged.']:[]),
    ...(Object.keys(motif.data).some(key => !['schemaVersion','ppq','tempoMicrosecondsPerQuarter','meter','lengthTicks','notes','importSourceChannel','midiImport'].includes(key)) || motif.data.notes.some(note => Object.keys(note).some(key => !['id','pitch','startTick','durationTicks','velocity'].includes(key))) ? ['Custom musical/note extension metadata is not exported. Its Markdown source is unchanged.'] : [])];
}
export function exportMidi(input: Motif): Uint8Array {
  const motif = editableMotif(input), data = motif.data, channel = data.importSourceChannel ?? 0;
  const plan = compileSequence({ ppq: data.ppq, lengthTicks: data.lengthTicks, tempos: [{ tick: 0, microsecondsPerQuarter: data.tempoMicrosecondsPerQuarter }], tracks: [{ id: motif.id, channel, sourcePpq: data.ppq, notes: data.notes }] }, 128);
  let previous = 0;
  const notes: MidiEvent[] = [{ deltaTime: 0, meta: true, type: 'trackName', text: midiText(motif.title) }];
  for (const event of plan.events) {
    if (event.tick.d !== 1n) throw new MidiError('Export would require fractional source ticks; no rounding is permitted.');
    const tick = Number(event.tick.n); notes.push({ deltaTime: tick - previous, type: event.kind === 'on' ? 'noteOn' : 'noteOff', channel, noteNumber: event.pitch, velocity: event.velocity }); previous = tick;
  }
  notes.push({ deltaTime: data.lengthTicks - previous, meta: true, type: 'endOfTrack' });
  const conductor: MidiEvent[] = [{ deltaTime: 0, meta: true, type: 'trackName', text: 'MNEMOBARD conductor' }, { deltaTime: 0, meta: true, type: 'setTempo', microsecondsPerBeat: data.tempoMicrosecondsPerQuarter }, { deltaTime: 0, meta: true, type: 'timeSignature', ...data.meter, metronome: 24, thirtyseconds: 8 }, { deltaTime: data.lengthTicks, meta: true, type: 'endOfTrack' }];
  const bytes = Uint8Array.from(writeMidi({ header: { format: 1, numTracks: 2, ticksPerBeat: data.ppq }, tracks: [conductor, notes] }, { running: false, useByte9ForNoteOff: false }));
  scanMidi(bytes); return bytes;
}
