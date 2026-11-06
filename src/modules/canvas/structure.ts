import type { AssetReference, Composition, CompositionData } from '../../domain/entities';
import { vaultPath } from '../../domain/paths';
import { editableComposition } from './commands';

/**
 * Milestone 4C organizational metadata. Pure Composition → Composition commands for
 * HistorySession.edit(); none of these fields are read by the arrangement compiler.
 */
export type Section = CompositionData['sections'][number];
export type Marker = CompositionData['markers'][number];
export type RecordingReference = CompositionData['audioRefs'][number];

/** Editor bounds. Schema 1 accepts larger lists from other writers; they stay readable. */
export const STRUCTURE_LIMITS = { sections: 256, markers: 1024, references: 256, label: 200, description: 10000 } as const;
/** Audio only; extension checks never read file bytes. */
export const RECORDING_EXTENSIONS: readonly string[] = ['wav', 'mp3', 'flac', 'ogg', 'oga', 'm4a', 'aif', 'aiff', 'opus', 'webm'];

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
/** Deterministic display order: time, then end, then stable ID (never locale-dependent). */
export function orderedSections(c: Composition): Section[] { return [...c.data.sections].sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick || compare(a.id, b.id)); }
/** Equal ticks remain distinct markers ordered by label then ID; nothing is merged. */
export function orderedMarkers(c: Composition): Marker[] { return [...c.data.markers].sort((a, b) => a.tick - b.tick || compare(a.label, b.label) || compare(a.id, b.id)); }

/** Half-open [start,end): adjacent sections do not overlap. */
export function overlaps(a: Pick<Section, 'startTick' | 'endTick'>, b: Pick<Section, 'startTick' | 'endTick'>): boolean { return a.startTick < b.endTick && b.startTick < a.endTick; }
/** Diagnostic for stored data written elsewhere; loading never rejects overlaps. */
export function sectionOverlaps(c: Composition): [Section, Section][] {
  const sorted = orderedSections(c), pairs: [Section, Section][] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]; if (!a) continue;
    for (let j = i + 1; j < sorted.length; j++) { const b = sorted[j]; if (!b || b.startTick >= a.endTick) break; pairs.push([a, b]); }
  }
  return pairs;
}
export function sectionAt(c: Composition, tick: number): Section | undefined { return orderedSections(c).find(s => s.startTick <= tick && tick < s.endTick); }

function label(value: string, kind: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw Error(`Name the ${kind}.`);
  if (trimmed.length > STRUCTURE_LIMITS.label) throw Error(`${kind[0]?.toUpperCase()}${kind.slice(1)} names are limited to ${STRUCTURE_LIMITS.label} characters.`);
  return trimmed;
}
/** Empty text removes the optional field so the writer can delete it. */
function described<T extends { description?: string }>(item: T, description: string | undefined): T {
  if (description === undefined) return item;
  const next = { ...item }, text = description.trim();
  if (text.length > STRUCTURE_LIMITS.description) throw Error(`Descriptions are limited to ${STRUCTURE_LIMITS.description} characters.`);
  if (text) next.description = text; else delete next.description;
  return next;
}
function tickWithin(c: Composition, tick: number, field: string, max = c.data.lengthTicks): number {
  if (!Number.isSafeInteger(tick) || tick < 0 || tick > max) throw Error(`${field} must lie within the composition (0–${max} ticks).`);
  return tick;
}
function checkedSection(c: Composition, candidate: Section): Section {
  tickWithin(c, candidate.startTick, 'Section start', c.data.lengthTicks - 1);
  tickWithin(c, candidate.endTick, 'Section end');
  if (candidate.endTick <= candidate.startTick) throw Error('Section end must be after its start.');
  const conflict = orderedSections(c).find(s => s.id !== candidate.id && overlaps(s, candidate));
  if (conflict) throw Error(`Overlaps section “${conflict.label}”. Sections may touch or leave gaps, but never overlap; neighbours were not changed.`);
  return candidate;
}
const withData = (c: Composition, data: Partial<CompositionData>, assets = c.assets): Composition => {
  const next: Composition = { ...c, data: { ...c.data, ...data } };
  if (assets?.length) next.assets = assets; else delete next.assets;
  return editableComposition(next);
};
function sectionById(c: Composition, id: string): Section { const s = c.data.sections.find(x => x.id === id); if (!s) throw Error('Selected section is unavailable.'); return s; }
function markerById(c: Composition, id: string): Marker { const m = c.data.markers.find(x => x.id === id); if (!m) throw Error('Selected marker is unavailable.'); return m; }
function referenceById(c: Composition, id: string): RecordingReference { const r = c.data.audioRefs.find(x => x.id === id); if (!r) throw Error('Selected recording reference is unavailable.'); return r; }

export interface SectionInput { label: string; startTick: number; endTick: number; description?: string }
export function addSection(c: Composition, input: SectionInput, id: string = crypto.randomUUID()): Composition {
  if (c.data.sections.length >= STRUCTURE_LIMITS.sections) throw Error(`CANVAS edits at most ${STRUCTURE_LIMITS.sections} sections.`);
  const section = checkedSection(c, described<Section>({ id, label: label(input.label, 'section'), startTick: input.startTick, endTick: input.endTick }, input.description));
  return withData(c, { sections: [...c.data.sections, section] });
}
/** Rename, move, resize and numeric edits share one validated transform. */
export function updateSection(c: Composition, id: string, patch: Partial<SectionInput>): Composition {
  const current = sectionById(c, id);
  let next: Section = { ...current, ...(patch.label !== undefined ? { label: label(patch.label, 'section') } : {}), ...(patch.startTick !== undefined ? { startTick: patch.startTick } : {}), ...(patch.endTick !== undefined ? { endTick: patch.endTick } : {}) };
  next = checkedSection(c, described(next, patch.description));
  return withData(c, { sections: c.data.sections.map(s => s.id === id ? next : s) });
}
/** Moves preserve duration; the whole span must stay inside the composition. */
export function moveSection(c: Composition, id: string, startTick: number): Composition { const s = sectionById(c, id); return updateSection(c, id, { startTick, endTick: startTick + (s.endTick - s.startTick) }); }
/**
 * Reorder = exchange timeline order with the previous/next section while keeping each
 * duration and the gap between them. Clips are not moved; sections are labels only.
 */
export function swapSection(c: Composition, id: string, direction: -1 | 1): Composition {
  const sorted = orderedSections(c), index = sorted.findIndex(s => s.id === id), self = sorted[index], other = sorted[index + direction];
  if (!self) throw Error('Selected section is unavailable.');
  if (!other) throw Error(direction < 0 ? 'This is already the first section.' : 'This is already the last section.');
  const [first, second] = direction < 0 ? [other, self] : [self, other], gap = second.startTick - first.endTick;
  if (gap < 0) throw Error('Overlapping sections cannot be reordered; resolve the overlap first.');
  const start = first.startTick, movedSecond = { ...second, startTick: start, endTick: start + (second.endTick - second.startTick) };
  const movedFirst = { ...first, startTick: movedSecond.endTick + gap, endTick: movedSecond.endTick + gap + (first.endTick - first.startTick) };
  const sections = c.data.sections.map(s => s.id === first.id ? movedFirst : s.id === second.id ? movedSecond : s);
  for (const s of [movedFirst, movedSecond]) checkedSection({ ...c, data: { ...c.data, sections } }, s);
  return withData(c, { sections });
}
/** Associated references keep their records; only the dangling association is cleared. */
export function deleteSection(c: Composition, id: string): Composition {
  sectionById(c, id);
  return withData(c, { sections: c.data.sections.filter(s => s.id !== id), audioRefs: c.data.audioRefs.map(r => { if (r.sectionId !== id) return r; const next = { ...r }; delete next.sectionId; return next; }) });
}

export interface MarkerInput { label: string; tick: number; description?: string }
export function addMarker(c: Composition, input: MarkerInput, id: string = crypto.randomUUID()): Composition {
  if (c.data.markers.length >= STRUCTURE_LIMITS.markers) throw Error(`CANVAS edits at most ${STRUCTURE_LIMITS.markers} markers.`);
  const marker = described<Marker>({ id, label: label(input.label, 'marker'), tick: tickWithin(c, input.tick, 'Marker position') }, input.description);
  return withData(c, { markers: [...c.data.markers, marker] });
}
export function updateMarker(c: Composition, id: string, patch: Partial<MarkerInput>): Composition {
  const current = markerById(c, id);
  const next = described<Marker>({ ...current, ...(patch.label !== undefined ? { label: label(patch.label, 'marker') } : {}), ...(patch.tick !== undefined ? { tick: tickWithin(c, patch.tick, 'Marker position') } : {}) }, patch.description);
  return withData(c, { markers: c.data.markers.map(m => m.id === id ? next : m) });
}
export function deleteMarker(c: Composition, id: string): Composition {
  markerById(c, id);
  return withData(c, { markers: c.data.markers.filter(m => m.id !== id), audioRefs: c.data.audioRefs.map(r => { if (r.markerId !== id) return r; const next = { ...r }; delete next.markerId; return next; }) });
}

/** Rejects traversal, absolute/URI paths and non-audio types before any host lookup. */
export function recordingPath(path: string): string {
  try { vaultPath(path); } catch { throw Error('Choose a vault-relative recording path without traversal, absolute locations or URI schemes.'); }
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (!path.includes('.') || !RECORDING_EXTENSIONS.includes(extension)) throw Error(`Recording references support audio files only (${RECORDING_EXTENSIONS.join(', ')}).`);
  return path;
}
const mirror = (path: string): AssetReference => ({ role: 'audio', link: `[[${path}]]` });
/** Frontmatter wikilinks give native backlinks and let Obsidian rewrite renamed targets. */
function withMirror(assets: AssetReference[] | undefined, path: string): AssetReference[] {
  const list = assets ?? [], link = mirror(path);
  return list.some(a => a.role === 'audio' && a.link === link.link) ? list : [...list, link];
}
/** Remove only this plugin's exact mirror link and only when no other reference still uses the file. */
function withoutMirror(assets: AssetReference[] | undefined, path: string, remaining: RecordingReference[]): AssetReference[] | undefined {
  if (remaining.some(r => r.path === path)) return assets;
  const link = mirror(path).link;
  return assets?.filter(a => !(a.role === 'audio' && a.link === link));
}
function association(c: Composition, sectionId: string | undefined, markerId: string | undefined): void {
  if (sectionId !== undefined && sectionId !== '' && !c.data.sections.some(s => s.id === sectionId)) throw Error('Associated section no longer exists.');
  if (markerId !== undefined && markerId !== '' && !c.data.markers.some(m => m.id === markerId)) throw Error('Associated marker no longer exists.');
}
/** Anchor default when the user does not choose a position: marker, then section start, then 1:1:0. */
export function defaultAnchor(c: Composition, sectionId?: string, markerId?: string): number {
  return c.data.markers.find(m => m.id === markerId)?.tick ?? c.data.sections.find(s => s.id === sectionId)?.startTick ?? 0;
}
export interface ReferenceInput { label: string; path: string; atTick?: number; description?: string; sectionId?: string; markerId?: string }
function referenceFields(c: Composition, base: RecordingReference, input: Partial<ReferenceInput>): RecordingReference {
  association(c, input.sectionId, input.markerId);
  const next = described({ ...base, ...(input.label !== undefined ? { label: label(input.label, 'recording reference') } : {}) }, input.description);
  for (const key of ['sectionId', 'markerId'] as const) { const value = input[key]; if (value === '') delete next[key]; else if (value !== undefined) next[key] = value; }
  if (input.atTick !== undefined) next.atTick = tickWithin(c, input.atTick, 'Timeline anchor');
  return next;
}
/** Metadata only: the caller has verified the file exists; no bytes are read or written. */
export function addReference(c: Composition, input: ReferenceInput, id: string = crypto.randomUUID()): Composition {
  if (c.data.audioRefs.length >= STRUCTURE_LIMITS.references) throw Error(`CANVAS edits at most ${STRUCTURE_LIMITS.references} recording references.`);
  const path = recordingPath(input.path), atTick = input.atTick ?? defaultAnchor(c, input.sectionId || undefined, input.markerId || undefined);
  const reference = referenceFields(c, { id, path, atTick, label: label(input.label, 'recording reference') }, { ...input, atTick });
  return withData(c, { audioRefs: [...c.data.audioRefs, reference] }, withMirror(c.assets, path));
}
export function updateReference(c: Composition, id: string, patch: Partial<Omit<ReferenceInput, 'path'>>): Composition {
  const next = referenceFields(c, referenceById(c, id), patch);
  return withData(c, { audioRefs: c.data.audioRefs.map(r => r.id === id ? next : r) });
}
/** Explicit relink keeps identity, label, description, anchor and associations. */
export function relinkReference(c: Composition, id: string, path: string): Composition {
  const current = referenceById(c, id), target = recordingPath(path);
  if (target === current.path) throw Error('The reference already points to this file.');
  const audioRefs = c.data.audioRefs.map(r => r.id === id ? { ...r, path: target } : r);
  return withData(c, { audioRefs }, withMirror(withoutMirror(c.assets, current.path, audioRefs), target));
}
/** Removes the reference record only. The underlying file is never touched. */
export function removeReference(c: Composition, id: string): Composition {
  const current = referenceById(c, id), audioRefs = c.data.audioRefs.filter(r => r.id !== id);
  return withData(c, { audioRefs }, withoutMirror(c.assets, current.path, audioRefs));
}

export interface RelinkSuggestion { referenceIds: string[]; from: string; to: string }
/**
 * Suggest, never apply. When Obsidian rewrote exactly one mirrored frontmatter link
 * after a rename and exactly one stored path is missing, propose that pairing. Anything
 * ambiguous yields no suggestion (no basename matching).
 */
export function relinkSuggestion(c: Composition, exists: (path: string) => boolean, resolve: (link: string) => string | null): RelinkSuggestion | undefined {
  const missing = [...new Set(c.data.audioRefs.filter(r => !exists(r.path)).map(r => r.path))];
  if (missing.length !== 1) return undefined;
  const used = new Set(c.data.audioRefs.map(r => r.path)), orphans = new Set<string>();
  for (const asset of c.assets ?? []) {
    if (asset.role !== 'audio') continue;
    const target = resolve(asset.link.slice(2, -2));
    if (target && exists(target) && !used.has(target)) orphans.add(target);
  }
  const [from] = missing, [to] = [...orphans];
  if (orphans.size !== 1 || !from || !to) return undefined;
  try { recordingPath(to); } catch { return undefined; }
  return { referenceIds: c.data.audioRefs.filter(r => r.path === from).map(r => r.id), from, to };
}
