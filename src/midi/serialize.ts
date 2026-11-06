import { writeMidi, type MidiEvent } from 'midi-file';
import type { Meter } from '../domain/entities';
import type { MusicalEvent } from '../music/compiler';
import { scanMidi, MidiError } from './structure';
export const midiText = (value: string): string => Array.from(new TextEncoder().encode(Array.from(value).slice(0,256).join('')), b => String.fromCharCode(b)).join('');
export interface MidiTrackInput { readonly name: string; readonly events: readonly MusicalEvent[] }
/** Shared note-only Type1 serializer: no routing, quantization or hidden data mutation. */
export function serializeTypeOne(ppq: number, tempo: number, meter: Readonly<Meter>, endTick: number, tracks: readonly MidiTrackInput[]): Uint8Array {
  if(!Number.isInteger(ppq)||ppq<1||ppq>32767||!Number.isInteger(tempo)||tempo<200000||tempo>3000000||!Number.isSafeInteger(endTick)||endTick<1||endTick>0x0fffffff||!Number.isInteger(meter.numerator)||meter.numerator<1||meter.numerator>32||![1,2,4,8,16,32].includes(meter.denominator))throw new MidiError('Invalid MIDI timing metadata.');
  const conductor: MidiEvent[] = [{ deltaTime:0, meta:true, type:'trackName', text:'MNEMOBARD conductor' }, { deltaTime:0, meta:true, type:'setTempo', microsecondsPerBeat:tempo }, { deltaTime:0, meta:true, type:'timeSignature', numerator:meter.numerator,denominator:meter.denominator, metronome:24, thirtyseconds:8 }, { deltaTime:endTick, meta:true, type:'endOfTrack' }];
  const notes = tracks.map(track => {
    const result: MidiEvent[] = [{ deltaTime:0, meta:true, type:'trackName', text:midiText(track.name) }]; let previous=0;
    for (const event of track.events) {
      if (event.tick.d !== 1n) throw new MidiError('Export would require fractional ticks; no rounding is permitted.');
      const tick=Number(event.tick.n);
      if (!Number.isSafeInteger(tick)||tick<previous||tick>endTick) throw new MidiError('Invalid or unordered MIDI endpoint.');
      if(!Number.isInteger(event.channel)||event.channel<0||event.channel>15||!Number.isInteger(event.pitch)||event.pitch<0||event.pitch>127||!Number.isInteger(event.velocity)||event.velocity<(event.kind==='on'?1:0)||event.velocity>127||!['on','off'].includes(event.kind))throw new MidiError('Invalid compiled MIDI event; no bytes were emitted.');
      result.push({ deltaTime:tick-previous, type:event.kind==='on'?'noteOn':'noteOff', channel:event.channel, noteNumber:event.pitch, velocity:event.velocity }); previous=tick;
    }
    result.push({ deltaTime:endTick-previous, meta:true, type:'endOfTrack' }); return result;
  });
  const bytes=Uint8Array.from(writeMidi({header:{format:1,numTracks:notes.length+1,ticksPerBeat:ppq},tracks:[conductor,...notes]},{running:false,useByte9ForNoteOff:false}));scanMidi(bytes);return bytes;
}
