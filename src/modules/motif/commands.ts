import type { Motif, Note } from '../../domain/entities';
import { FoundationError } from '../../domain/errors';
import { validateEntity } from '../../domain/validation';

export function editableMotif(value: Motif): Motif {
  const checked = validateEntity({ ...value, title: value.title || 'Untitled motif' });
  if (checked.kind !== 'motif') throw new FoundationError('wrong-kind', 'Choose a motif record.');
  for (const key of ['tempoMap', 'tempos', 'tempoChanges', 'meterChanges', 'timeSignatures']) if (checked.data[key] !== undefined) throw new FoundationError('unsupported-schema', `This motif contains ${key}. Map editing/playback is not supported in3A; open its Markdown without rewriting it.`);
  if (checked.extra.mnemobard_tempo_map !== undefined || checked.extra.mnemobard_meter_map !== undefined) throw new FoundationError('unsupported-schema', 'Timing-map metadata requires a later editor. The original is retained.');
  if (checked.data.lengthTicks > checked.data.ppq * 4096) throw new FoundationError('invalid', 'The editor supports at most4096 quarter notes. The larger original remains available in Markdown.');
  checked.title = value.title; return checked;
}
export type Grid = 'off' | 'quarter' | 'eighth' | 'sixteenth' | 'triplet';
export function gridTicks(ppq: number, grid: Grid): number {
  const divisor = { off: 0, quarter: 1, eighth: 2, sixteenth: 4, triplet: 3 }[grid];
  if (!Number.isSafeInteger(ppq) || ppq < 1 || ppq > 32767) throw new FoundationError('invalid', 'PPQ must be an integer1..32767.');
  if (!divisor) return 1;
  if (ppq % divisor !== 0) throw new FoundationError('invalid', `This ${grid} grid has fractional source ticks at PPQ${ppq}. Choose a coarser grid or turn snapping off; source timing was retained.`);
  return ppq / divisor;
}
export function snapped(tick: number, ppq: number, grid: Grid): number {
  if (!Number.isFinite(tick)) throw new FoundationError('invalid', 'Position must be finite.');
  const step = gridTicks(ppq, grid); return Math.round(tick / step) * step;
}
export function addNote(motif: Motif, note: { pitch: number; startTick: number; durationTicks: number; velocity: number }): Motif {
  return editableMotif({ ...motif, data: { ...motif.data, notes: [...motif.data.notes, { ...note, id: crypto.randomUUID() }] } });
}
export function changeNotes(motif: Motif, ids: ReadonlySet<string>, change: (note: Note) => Note): Motif {
  return editableMotif({ ...motif, data: { ...motif.data, notes: motif.data.notes.map(note => ids.has(note.id) ? change(structuredClone(note)) : note) } });
}
export function moveNotes(motif: Motif, ids: ReadonlySet<string>, deltaTicks: number, deltaPitch: number): Motif {
  return changeNotes(motif, ids, note => ({ ...note, startTick: note.startTick + deltaTicks, pitch: note.pitch + deltaPitch }));
}
export function resizeNotes(motif: Motif, ids: ReadonlySet<string>, deltaTicks: number): Motif {
  return changeNotes(motif, ids, note => ({ ...note, durationTicks: note.durationTicks + deltaTicks }));
}
export function deleteNotes(motif: Motif, ids: ReadonlySet<string>): Motif {
  return editableMotif({ ...motif, data: { ...motif.data, notes: motif.data.notes.filter(note => !ids.has(note.id)) } });
}
export function duplicateNotes(motif: Motif, ids: ReadonlySet<string>): { motif: Motif; ids: string[] } {
  const chosen = motif.data.notes.filter(note => ids.has(note.id)); if (!chosen.length) return { motif, ids: [] };
  const first = Math.min(...chosen.map(note => note.startTick)), last = Math.max(...chosen.map(note => note.startTick + note.durationTicks));
  const copies = chosen.map(note => ({ ...note, id: crypto.randomUUID(), startTick: note.startTick + last - first }));
  return { motif: editableMotif({ ...motif, data: { ...motif.data, notes: [...motif.data.notes, ...copies] } }), ids: copies.map(note => note.id) };
}
export function noteName(pitch: number): string { return `${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch % 12]}${Math.floor(pitch / 12) - 1}`; }

/** Explicit transformations preserve identity; full candidate validation rejects all collisions/bounds together. */
export function transposeNotes(motif: Motif, ids: ReadonlySet<string>, semitones: number): Motif {
  if (!Number.isSafeInteger(semitones) || Math.abs(semitones) > 127) throw new FoundationError('invalid', 'Transpose by an integer -127..127 semitones.');
  return changeNotes(motif, ids, note => ({ ...note, pitch: note.pitch + semitones }));
}
export function quantizeNotes(motif: Motif, ids: ReadonlySet<string>, grid: Exclude<Grid, 'off'>): Motif {
  if (!['quarter','eighth','sixteenth','triplet'].includes(grid)) throw new FoundationError('invalid', 'Choose a quantization grid.');
  gridTicks(motif.data.ppq, grid); return changeNotes(motif, ids, note => ({ ...note, startTick: snapped(note.startTick, motif.data.ppq, grid) }));
}
export function velocityNotes(motif: Motif, ids: ReadonlySet<string>, velocity: number): Motif {
  if (!Number.isSafeInteger(velocity) || velocity < 1 || velocity > 127) throw new FoundationError('invalid', 'Velocity must be an integer1..127.');
  return changeNotes(motif, ids, note => ({ ...note, velocity }));
}
