import type { Meter } from '../domain/entities';
import type { CompiledArrangement } from './compiled';

/**
 * 4H: what an arrangement MIDI export contains, read ONLY from the existing results — the compiled arrangement that was
 * serialised and the exported bytes' own MThd header — never from a second event pipeline. A field that cannot be read
 * reliably is left undefined (and not shown) instead of being guessed.
 */
export interface ExportSummary {
  /** From the file header: SMF format, track count and PPQ actually written. */
  readonly format?: number; readonly midiTracks?: number; readonly filePpq?: number;
  readonly ppq: number; readonly tempoBpm: number; readonly meter: Readonly<Meter>;
  readonly lanes: number; readonly exportedLanes: number;
  readonly notes: number; readonly lengthTicks: number; readonly durationSeconds: number;
  /** Tick of the last note-off in the compiled events (absent when the arrangement has no notes). */
  readonly lastNoteTick?: number;
  readonly channels: readonly { readonly lane: string; readonly channel?: number; readonly explicit: boolean; readonly percussion: boolean; readonly notes: number }[];
}
/** The 14-byte Standard MIDI File header, or undefined when the bytes do not start with one. */
export function smfHeader(bytes: Uint8Array): { format: number; tracks: number; ppq: number } | undefined {
  if (bytes.length < 14 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'MThd') return undefined;
  const word = (at: number): number => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0), length = ((bytes[4] ?? 0) << 24 | (bytes[5] ?? 0) << 16 | (bytes[6] ?? 0) << 8 | (bytes[7] ?? 0)) >>> 0;
  if (length < 6) return undefined;
  const ppq = word(12); return ppq & 0x8000 ? undefined : { format: word(8), tracks: word(10), ppq };
}
export function exportSummary(arrangement: CompiledArrangement, bytes: Uint8Array): ExportSummary {
  const header = smfHeader(bytes);
  let lastNoteTick: number | undefined;
  for (const event of arrangement.events) if (event.kind === 'off' && (lastNoteTick === undefined || event.absoluteTick > lastNoteTick)) lastNoteTick = event.absoluteTick;
  return {
    format: header?.format, midiTracks: header?.tracks, filePpq: header?.ppq,
    ppq: arrangement.ppq, tempoBpm: 60_000_000 / arrangement.tempo, meter: arrangement.meter,
    lanes: arrangement.lanes.length, exportedLanes: arrangement.lanes.filter(lane => lane.notes.length).length,
    notes: arrangement.expandedNotes, lengthTicks: arrangement.lengthTicks, durationSeconds: arrangement.durationSeconds, lastNoteTick,
    channels: arrangement.lanes.map(lane => ({ lane: lane.name, channel: lane.channel, explicit: lane.explicit, percussion: lane.percussion, notes: lane.notes.length })),
  };
}
/** m:ss.s for a duration in seconds (display only). */
export function clockTime(seconds: number): string {
  const tenths = Math.round(seconds * 10), minutes = Math.floor(tenths / 600), rest = (tenths - minutes * 600) / 10;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}
