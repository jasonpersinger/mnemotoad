import type { Motif, Note } from '../../domain/entities';
import { FoundationError } from '../../domain/errors';
import { checkEntity, validateEntity } from '../../domain/validation';
import { freezeDeep } from '../../application/freeze';

/** MOTIF editor rules on top of schema validation (shared by editableMotif and sealedMotif). */
function motifRules(checked: Motif): void {
  if (checked.kind !== 'motif') throw new FoundationError('wrong-kind', 'Choose a motif record.');
  for (const key of ['tempoMap', 'tempos', 'tempoChanges', 'meterChanges', 'timeSignatures']) if (checked.data[key] !== undefined) throw new FoundationError('unsupported-schema', `This motif contains ${key}. Map editing/playback is not supported in3A; open its Markdown without rewriting it.`);
  if (checked.extra.mnemobard_tempo_map !== undefined || checked.extra.mnemobard_meter_map !== undefined) throw new FoundationError('unsupported-schema', 'Timing-map metadata requires a later editor. The original is retained.');
  if (checked.data.lengthTicks > checked.data.ppq * 4096) throw new FoundationError('invalid', 'The editor supports at most4096 quarter notes. The larger original remains available in Markdown.');
}
export function editableMotif(value: Motif): Motif {
  const checked = validateEntity({ ...value, title: value.title || 'Untitled motif' }) as Motif;
  motifRules(checked); checked.title = value.title; return checked;
}
/** 4H: how an edit command finishes its candidate: full validation (editableMotif, the default) or sealedMotif. */
export type Finish = (value: Motif) => Motif;
const sealed = new WeakSet<Motif>();
/**
 * 4H/4I: the same rules as editableMotif (schema checkEntity + motifRules), then deep-freeze and register. The only way
 * into the registry, so a registered value has passed those rules and cannot have changed since. 4I: no defensive deep
 * copy — sealedMotif TAKES OWNERSHIP of `value`: the result is a new top-level object that shares nested values with
 * `value` (for edit commands: the unchanged, already frozen notes of the previous snapshot) and freezes everything
 * reachable. Session commits pass it as `finish`; never pass a value whose nested objects someone else will mutate.
 */
export function sealedMotif(value: Motif): Motif {
  const checked: Motif = { ...value, title: value.title || 'Untitled motif' };
  checkEntity(checked); motifRules(checked); checked.title = value.title;
  freezeDeep(checked); sealed.add(checked); return checked;
}
/**
 * 4H: the MOTIF session validator. editableMotif is a pure check, so a sealed value would pass again unchanged: it is
 * accepted as is instead of being validated and copied a second time. Every other value (inline transforms, settings,
 * recovered or imported drafts, unsealed command results) is fully validated by editableMotif.
 */
export function sessionMotif(value: Motif): Motif { return sealed.has(value) ? value : editableMotif(value); }
export { gridTicks, snapped, type Grid } from '../../music/grid';
import { gridTicks, snapped, type Grid } from '../../music/grid';
export function addNote(motif: Motif, note: { pitch: number; startTick: number; durationTicks: number; velocity: number }, finish: Finish = editableMotif): Motif {
  return finish({ ...motif, data: { ...motif.data, notes: [...motif.data.notes, { ...note, id: crypto.randomUUID() }] } });
}
export function changeNotes(motif: Motif, ids: ReadonlySet<string>, change: (note: Note) => Note, finish: Finish = editableMotif): Motif {
  return finish({ ...motif, data: { ...motif.data, notes: motif.data.notes.map(note => ids.has(note.id) ? change(structuredClone(note)) : note) } });
}
export function moveNotes(motif: Motif, ids: ReadonlySet<string>, deltaTicks: number, deltaPitch: number, finish: Finish = editableMotif): Motif {
  return changeNotes(motif, ids, note => ({ ...note, startTick: note.startTick + deltaTicks, pitch: note.pitch + deltaPitch }), finish);
}
export function resizeNotes(motif: Motif, ids: ReadonlySet<string>, deltaTicks: number, finish: Finish = editableMotif): Motif {
  return changeNotes(motif, ids, note => ({ ...note, durationTicks: note.durationTicks + deltaTicks }), finish);
}
export function deleteNotes(motif: Motif, ids: ReadonlySet<string>, finish: Finish = editableMotif): Motif {
  return finish({ ...motif, data: { ...motif.data, notes: motif.data.notes.filter(note => !ids.has(note.id)) } });
}
export function duplicateNotes(motif: Motif, ids: ReadonlySet<string>, finish: Finish = editableMotif): { motif: Motif; ids: string[] } {
  const chosen = motif.data.notes.filter(note => ids.has(note.id)); if (!chosen.length) return { motif, ids: [] };
  const first = Math.min(...chosen.map(note => note.startTick)), last = Math.max(...chosen.map(note => note.startTick + note.durationTicks));
  const copies = chosen.map(note => ({ ...note, id: crypto.randomUUID(), startTick: note.startTick + last - first }));
  return { motif: finish({ ...motif, data: { ...motif.data, notes: [...motif.data.notes, ...copies] } }), ids: copies.map(note => note.id) };
}
export function noteName(pitch: number): string { return `${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch % 12]}${Math.floor(pitch / 12) - 1}`; }

/** Explicit transformations preserve identity; full candidate validation rejects all collisions/bounds together. */
export function transposeNotes(motif: Motif, ids: ReadonlySet<string>, semitones: number, finish: Finish = editableMotif): Motif {
  if (!Number.isSafeInteger(semitones) || Math.abs(semitones) > 127) throw new FoundationError('invalid', 'Transpose by an integer -127..127 semitones.');
  return changeNotes(motif, ids, note => ({ ...note, pitch: note.pitch + semitones }), finish);
}
export function quantizeNotes(motif: Motif, ids: ReadonlySet<string>, grid: Exclude<Grid, 'off'>, finish: Finish = editableMotif): Motif {
  if (!['quarter','eighth','sixteenth','triplet'].includes(grid)) throw new FoundationError('invalid', 'Choose a quantization grid.');
  gridTicks(motif.data.ppq, grid); return changeNotes(motif, ids, note => ({ ...note, startTick: snapped(note.startTick, motif.data.ppq, grid) }), finish);
}
export function velocityNotes(motif: Motif, ids: ReadonlySet<string>, velocity: number, finish: Finish = editableMotif): Motif {
  if (!Number.isSafeInteger(velocity) || velocity < 1 || velocity > 127) throw new FoundationError('invalid', 'Velocity must be an integer1..127.');
  return changeNotes(motif, ids, note => ({ ...note, velocity }), finish);
}
