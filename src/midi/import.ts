import { parseMidi } from 'midi-file';
import type { Meter, MotifData, Note } from '../domain/entities';
import { validateEntity } from '../domain/validation';
import { createEntity } from '../domain/entities';
import { scanMidi, MidiError, type RawMidiEvent } from './structure';
export interface MidiIssue { severity: 'block' | 'warning' | 'info'; code: string; message: string; count: number }
export interface MidiPart { track: number; channel: number; name: string; notes: Note[]; lengthTicks: number; issues: MidiIssue[] }
export interface MidiInspection { format: 0 | 1; ppq: number; tracks: { index: number; name: string; channels: number[]; noteCount: number; lengthTicks: number }[]; parts: MidiPart[]; tempoMicrosecondsPerQuarter: number; meter: Meter; lengthTicks: number; eventCount: number; issues: MidiIssue[] }
const text = (bytes: Uint8Array): string => { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return Array.from(bytes, b => String.fromCharCode(b)).join(''); } };
function issue(list: MidiIssue[], severity: MidiIssue['severity'], code: string, message: string): void { const previous = list.find(i => i.code === code); if (previous) previous.count++; else list.push({ severity, code, message, count: 1 }); }
export function inspectMidi(bytes: Uint8Array): MidiInspection {
  const structure = scanMidi(bytes), decoded = parseMidi(bytes);
  if (decoded.tracks.length !== structure.tracks.length || decoded.header.ticksPerBeat !== structure.ppq || decoded.tracks.some((events, i) => events.length !== structure.tracks[i]?.events.length)) throw new MidiError('Decoder disagrees with strict MIDI framing. Import blocked.');
  const issues: MidiIssue[] = []; let tempo = 500000, meter: Meter = { numerator: 4, denominator: 4 }, tempoSeen = false, meterSeen = false;
  const globals = structure.tracks.flatMap((track, index) => track.events.map((event, order) => ({ event, index, order }))).sort((a, b) => a.event.tick - b.event.tick || a.index - b.index || a.order - b.order);
  for (const { event } of globals) {
    if (event.metaType === 0x51) {
      const value = Number(event.data[0]) * 65536 + Number(event.data[1]) * 256 + Number(event.data[2]);
      if (value < 200000 || value > 3000000) issue(issues, 'block', 'tempo-range', 'Tempo is outside the schema1 range20–300 quarter-note BPM.');
      if ((event.tick > 0 || tempoSeen) && value !== tempo) issue(issues, 'block', 'tempo-map', 'Tempo changes/conflicting declarations cannot be represented; no flattening is offered.');
      if (!tempoSeen && event.tick === 0) tempo = value; tempoSeen = true;
    }
    if (event.metaType === 0x58) {
      const next = { numerator: Number(event.data[0]), denominator: 2 ** Number(event.data[1]) };
      if (next.numerator < 1 || next.numerator > 32 || next.denominator > 32) issue(issues, 'block', 'meter-range', 'Meter cannot be represented by schema1 (numerator1–32, denominator1/2/4/8/16/32).');
      if ((event.tick > 0 || meterSeen) && (next.numerator !== meter.numerator || next.denominator !== meter.denominator)) issue(issues, 'block', 'meter-map', 'Time-signature changes/conflicting declarations cannot be represented.');
      if (!meterSeen && event.tick === 0) meter = next; meterSeen = true;
      if (event.data[3] !== 8) issue(issues,'block','meter-beat-unit','Nonstandard notated32nd-notes per MIDI quarter changes beat interpretation and cannot be represented by the current meter schema.');
      if (event.data[2] !== 24) issue(issues, 'warning', 'meter-click', 'Custom MIDI metronome click spacing is omitted; meter, playback tempo and note ticks remain exact.');
    }
    if (event.status === 0xf0 || event.status === 0xf7) issue(issues, 'block', 'sysex', 'SysEx/escape data can change device state for the file. It is never executed and this import is blocked.');
    if (event.metaType === 0x21) issue(issues, 'block', 'midi-port', 'MIDI port routing may change channel meaning and is unsupported.');
    if (event.metaType === 0x54) issue(issues, 'block', 'timecode-offset', 'SMPTE start-offset metadata cannot be represented faithfully.');
    if (event.metaType !== undefined && ![0x2f, 0x51, 0x58, 3, 0x21, 0x54].includes(event.metaType)) {
      const names: Record<number,string> = {0:'sequence number',1:'text annotation',2:'copyright notice',4:'instrument-name annotation',5:'lyrics',6:'marker',7:'cue point',8:'program-name annotation',0x20:'channel-prefix annotation',0x59:'key signature'};
      const name=names[event.metaType];if(name)issue(issues,'warning',`meta-${event.metaType}`,`MIDI ${name} is omitted from the editable motif. Notes/timing remain; the original file stays unchanged.`);
      else issue(issues,'block',`meta-${event.metaType}`,`Unsupported ${event.metaType===9?'device routing':event.metaType===0x7f?'sequencer-specific state':'unknown MIDI metadata'} (0x${event.metaType.toString(16)}) may affect musical/device meaning and cannot be classified as harmless loss.`);
    }
  }
  if (!tempoSeen) issue(issues, 'info', 'default-tempo', 'No tempo supplied: MIDI default120 quarter-note BPM is used.');
  if (!meterSeen) issue(issues, 'info', 'default-meter', 'No meter supplied: MIDI default4/4 is used.');
  if (structure.extendedHeader) issue(issues, 'block', 'header-extension', 'Unknown extended MIDI header semantics are unsupported; no data is discarded.');
  const parts: MidiPart[] = [], tracks: MidiInspection['tracks'] = [];
  for (const [index, track] of structure.tracks.entries()) {
    const nameEvents=track.events.filter(e=>e.metaType===3),rawName=text(nameEvents[0]?.data??new Uint8Array()),name=(Array.from(rawName).slice(0,240).join('').trim()?Array.from(rawName).slice(0,240).join(''):'')||`Track ${index + 1}`,nameIssues:MidiIssue[]=[];
    if(rawName&&rawName!==name)issue(nameIssues,'warning','track-name-shortened','The selected track name is shortened/replaced in the motif title (maximum240 characters); original MIDI text remains in the source.');
    if(nameEvents.length>1)issue(nameIssues,'warning','track-name-changes','Additional track-name annotations are omitted; only the initial name becomes the motif title.');
    for(const event of nameEvents){try{new TextDecoder('utf-8',{fatal:true}).decode(event.data);}catch{issue(nameIssues,'warning','track-name-encoding','Track-name bytes are not valid UTF-8; byte-text fallback is shown. Original text encoding is not preserved on export.');}}
    const channels = [...new Set(track.events.filter(e => e.channel !== undefined).map(e => Number(e.channel)))].sort((a, b) => a - b);
    let noteCount = 0;
    for (const channel of channels) {
      const part: MidiPart = { track: index, channel, name, notes: [], lengthTicks: track.endTick, issues: nameIssues.map(i=>({...i})) }, active = new Map<number, { tick: number; velocity: number }>();
      const decodedTrack = decoded.tracks[index]; if (!decodedTrack) throw new MidiError('Missing decoded track'); let tick = 0;
      for (const event of decodedTrack) {
        tick += event.deltaTime; if (!('channel' in event) || event.channel !== channel) continue;
        if (event.type === 'noteOn') {
          if (active.has(event.noteNumber)) issue(part.issues, 'block', 'same-pitch', 'Overlapping same-channel/same-pitch note-ons are ambiguous; no notes are dropped or durations invented.');
          else active.set(event.noteNumber, { tick, velocity: event.velocity });
        } else if (event.type === 'noteOff') {
          const start = active.get(event.noteNumber);
          if (!start) issue(part.issues, 'block', 'extra-off', 'An unmatched note-off exists in this part.');
          else { active.delete(event.noteNumber); part.notes.push({ id: `t${index}c${channel}n${part.notes.length}`, pitch: event.noteNumber, startTick: start.tick, durationTicks: tick - start.tick, velocity: start.velocity }); }
          if (event.velocity) issue(part.issues, 'warning', 'release-velocity', 'Note-release velocity is not represented; attack velocity and note endpoints remain exact.');
        }
      }
      if (active.size) issue(part.issues, 'block', 'unterminated', 'This part has note-ons without note-offs; no duration is invented.');
      // State can be declared in any Type1 track on this channel. Never hide it behind track selection.
      for (const { event } of globals) if (event.channel === channel) classifyChannel(event, part.issues);
      part.notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch || a.id.localeCompare(b.id)); noteCount += part.notes.length;
      if (part.notes.length) {
        if (part.notes.length > 10000 || part.lengthTicks > structure.ppq * 4096) issue(part.issues, 'block', 'editor-limit', 'Selected part exceeds10000 notes or4096 quarter notes. Split it externally.');
        else if (!issues.some(i => i.severity === 'block')) {
          try { const candidate = createEntity('motif', name); candidate.data = dataFor(structure.ppq, tempo, meter, part); validateEntity(candidate); }
          catch (error) { issue(part.issues, 'block', 'note-structure', error instanceof Error ? error.message : 'Selected notes cannot be represented.'); }
        }
        parts.push(part);
      } else if (part.issues.some(i => i.severity === 'block')) parts.push(part);
    }
    tracks.push({ index, name, channels, noteCount, lengthTicks: track.endTick });
  }
  if (!parts.some(part => part.notes.length)) issue(issues, 'block', 'empty', 'No sounding notes with complete endpoints were found.');
  return { format: structure.format, ppq: structure.ppq, tracks, parts, tempoMicrosecondsPerQuarter: tempo, meter, lengthTicks: Math.max(...tracks.map(t => t.lengthTicks)), eventCount: structure.eventCount, issues };
}
function classifyChannel(event: RawMidiEvent, issues: MidiIssue[]): void {
  switch (event.status & 0xf0) {
    case 0xb0: issue(issues, 'block', `controller-${event.data[0]}`, `Controller${event.data[0]}${event.data[0] === 64 ? ' (sustain pedal)' : ''} on this channel affects playback. Controller automation cannot be represented; import blocked.`); break;
    case 0xe0: issue(issues, 'block', 'pitch-bend', 'Pitch bend changes sounding pitch and cannot be represented.'); break;
    case 0xa0: case 0xd0: issue(issues, 'block', 'aftertouch', 'Aftertouch changes musical expression and cannot be represented.'); break;
    case 0xc0: issue(issues, 'warning', 'program-change', 'Program changes/instrument selection are omitted. This is a note-only part, auditioned with a sine tone; choose PATCHBOOK context separately.'); break;
  }
}
function dataFor(ppq: number, tempo: number, meter: Meter, part: MidiPart): MotifData { return { schemaVersion: 1, ppq, tempoMicrosecondsPerQuarter: tempo, meter: { ...meter }, lengthTicks: part.lengthTicks, importSourceChannel: part.channel, notes: part.notes.map(note => ({ ...note })) }; }
export function selectedMidiData(preview: MidiInspection, track: number, channel: number, acknowledgeLoss: boolean): MotifData {
  const part = preview.parts.find(p => p.track === track && p.channel === channel); if (!part?.notes.length) throw new MidiError('Choose one track/channel containing notes.');
  const issues = [...preview.issues, ...part.issues], blocked = issues.find(i => i.severity === 'block'); if (blocked) throw new MidiError(blocked.message);
  if (!acknowledgeLoss && issues.some(i => i.severity === 'warning')) throw new MidiError('Explicit acknowledgment of listed metadata/instrument losses is required.');
  const data = dataFor(preview.ppq, preview.tempoMicrosecondsPerQuarter, preview.meter, part), candidate = createEntity('motif', 'Imported part'); candidate.data = data; validateEntity(candidate); return data;
}
