/** Strict, bounded SMF framing independent of the candidate decoder/writer. */
export const MIDI_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, tracks: 128, events: 50000, payload: 65536, ticks: 1000000000 });
export class MidiError extends Error { override name = 'MidiError'; }
export interface RawMidiEvent { tick: number; status: number; channel?: number; metaType?: number; data: Uint8Array }
export interface MidiStructure { format: 0 | 1; ppq: number; tracks: { events: RawMidiEvent[]; endTick: number }[]; eventCount: number; extendedHeader: boolean }
export function scanMidi(bytes: Uint8Array): MidiStructure {
  if (bytes.length > MIDI_LIMITS.bytes) throw new MidiError('MIDI exceeds the2MiB input limit. Split the file outside MNEMOTOAD.');
  let at = 0, bound = bytes.length, count = 0;
  const fail = (message: string): never => { throw new MidiError(`${message} (byte${at}). No motif was created.`); };
  const byte = (): number => { if (at >= bound) return fail('Truncated MIDI payload'); return bytes[at++] ?? fail('Missing byte'); };
  const number = (size: number): number => { let value = 0; for (let i = 0; i < size; i++) value = value * 256 + byte(); return value; };
  const tag = (): string => String.fromCharCode(byte(), byte(), byte(), byte());
  const vlq = (): number => { let value = 0; for (let i = 0; i < 4; i++) { const b = byte(); value = value * 128 + (b & 127); if (!(b & 128)) return value; } return fail('Malformed VLQ: maximum four bytes'); };
  if (tag() !== 'MThd') fail('Invalid MIDI header: expected MThd');
  const headerLength = number(4); if (headerLength < 6 || headerLength > 1024 || at + headerLength > bound) fail('Invalid/truncated header length');
  const headerEnd = at + headerLength, format = number(2), trackCount = number(2), ppq = number(2); at = headerEnd;
  if (format !== 0 && format !== 1) fail('Unsupported MIDI format; Type0/1 only, Type2 independent sequences cannot become one motif');
  if (!trackCount || trackCount > MIDI_LIMITS.tracks || (format === 0 && trackCount !== 1)) fail('Invalid track count (maximum128; Type0 requires one)');
  if (ppq & 0x8000) fail('SMPTE-timed MIDI is unsupported. Convert explicitly to PPQ in a MIDI application');
  if (!ppq) fail('PPQ must be1..32767');
  const tracks: MidiStructure['tracks'] = [];
  for (let track = 0; track < trackCount; track++) {
    bound = bytes.length; if (tag() !== 'MTrk') fail('Expected declared MTrk chunk');
    const length = number(4); if (length > bound - at) fail('Truncated track or invalid track length');
    bound = at + length; let tick = 0, running = 0, ended = false; const events: RawMidiEvent[] = [];
    while (at < bound) {
      if (++count > MIDI_LIMITS.events) fail('MIDI exceeds50000 events');
      tick += vlq(); if (!Number.isSafeInteger(tick) || tick > MIDI_LIMITS.ticks) fail('Timing exceeds the safe1000000000 tick bound');
      let status = byte();
      if (status < 128) { if (!running) fail('Invalid running status without a channel status'); at--; status = running; }
      let channel: number | undefined, metaType: number | undefined, data: Uint8Array;
      if (status < 0xf0) {
        if (status < 0x80) fail('Invalid channel status'); running = status; channel = status & 15;
        const size = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2, start = at;
        for (let i = 0; i < size; i++) if (byte() > 127) fail('Channel event data must be0..127'); data = bytes.subarray(start, at);
      } else {
        running = 0;
        if (status === 0xff) { metaType = byte(); if (metaType > 127) fail('Invalid meta type'); }
        else if (status !== 0xf0 && status !== 0xf7) fail('Unsupported system status in Standard MIDI File');
        const size = vlq(); if (size > MIDI_LIMITS.payload || size > bound - at) fail('Truncated or overlarge event payload (maximum64KiB)');
        data = bytes.subarray(at, at + size); at += size;
        if (metaType !== undefined) {
          const fixed: Record<number, number> = { 0: 2, 0x20: 1, 0x21: 1, 0x2f: 0, 0x51: 3, 0x54: 5, 0x58: 4, 0x59: 2 };
          if (fixed[metaType] !== undefined && size !== fixed[metaType]) fail('Invalid fixed-length meta payload');
          if (metaType === 0x20 && Number(data[0]) > 15) fail('Invalid channel prefix');
          if (metaType === 0x59 && (!((Number(data[0]) <= 7) || Number(data[0]) >= 249) || Number(data[1]) > 1)) fail('Invalid key-signature payload');
          if (metaType === 0x2f) { if (at !== bound) fail('Events/bytes occur after end-of-track'); ended = true; }
        }
      }
      events.push({ tick, status, channel, metaType, data });
    }
    if (!ended) fail('Track is missing mandatory end-of-track'); tracks.push({ events, endTick: tick });
  }
  if (at !== bytes.length) fail('Undeclared trailing MIDI chunks/bytes');
  return { format: format as 0 | 1, ppq, tracks, eventCount: count, extendedHeader: headerLength !== 6 };
}
