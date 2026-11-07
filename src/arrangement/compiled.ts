import type { Composition, Motif, Note, Meter } from '../domain/entities';
import type { MusicalEvent, MusicalPlan, MusicalProvenance } from '../music/compiler';

export const ARRANGEMENT_LIMITS = Object.freeze({ notes: 24000, events: 48000, sources: 128, sourceBytes: 8 * 1024 * 1024, captureBytes: 16 * 1024 * 1024, workingBytes: 64 * 1024 * 1024, ticks: 1000000000 });
export const ARRANGEMENT_POLICY = 'mnemobard-arrangement-4b-v1';
export interface CapturedSource { readonly motif: Motif; readonly revision: string; readonly textBytes: number }
export interface ArrangementNote extends Note { readonly provenance: MusicalProvenance }
export interface RoutedLane { readonly id: string; readonly name: string; readonly order: number; readonly channel?: number; readonly explicit: boolean; readonly percussion: boolean; readonly stateKey: string; readonly notes: readonly ArrangementNote[] }
export interface CompileDiagnostic {
  readonly code: string; readonly severity: 'error' | 'warning' | 'info'; readonly message: string;
  readonly laneId?: string; readonly laneName?: string; readonly clipId?: string; readonly motifId?: string;
  readonly noteId?: string; readonly pitch?: number; readonly channel?: number; readonly startTick?: number; readonly endTick?: number;
  readonly conflict?: MusicalProvenance;
}
export interface ArrangementEvent extends MusicalEvent { readonly absoluteTick: number; readonly provenance: MusicalProvenance }
export interface CompiledArrangement extends MusicalPlan {
  readonly events: readonly ArrangementEvent[];
  readonly compositionId: string; readonly title: string; readonly inputRevision: string; readonly ppq: number; readonly lengthTicks: number;
  readonly tempo: number; readonly meter: Readonly<Meter>; readonly lanes: readonly RoutedLane[];
  readonly sources: readonly { id: string; revision: string; ppq: number; lengthTicks: number }[];
  readonly diagnostics: readonly CompileDiagnostic[]; readonly expandedNotes: number;
}
export type CompilationResult = { readonly ok: true; readonly arrangement: CompiledArrangement } | { readonly ok: false; readonly diagnostics: readonly CompileDiagnostic[] };
export function lexical(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
/** Canonical input, hashed by the capture coordinator; no clocks/random IDs. */
export function compilationInput(composition: Composition, sources: readonly CapturedSource[]): string {
  return JSON.stringify({ policy: ARRANGEMENT_POLICY, composition, sources: sources.map(s => ({ id: s.motif.id.toLowerCase(), revision: s.revision })).sort((a, b) => lexical(a.id, b.id)) }, (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => lexical(a, b))) : value);
}
/** Organizational fields the compiler/serializer never read (4D). Denylist on purpose: every other field, including unknown ones, stays musical. */
export const ORGANIZATIONAL_DATA_FIELDS = Object.freeze(['sections', 'markers', 'audioRefs'] as const);
/** Composition-level prose and the frontmatter audio mirror (`assets`). `title` is deliberately NOT here: it is copied into the compiled arrangement. */
export const ORGANIZATIONAL_ENTITY_FIELDS = Object.freeze(['description', 'notes', 'tags', 'assets'] as const);
/** Canonical musical identity: `compilationInput` minus organizational metadata. Independent of document save state. */
export function musicalInput(composition: Composition, sources: readonly CapturedSource[]): string {
  const entity: Record<string, unknown> = { ...composition }, data: Record<string, unknown> = { ...composition.data };
  for (const key of ORGANIZATIONAL_ENTITY_FIELDS) delete entity[key];
  for (const key of ORGANIZATIONAL_DATA_FIELDS) delete data[key];
  return compilationInput({ ...entity, data } as unknown as Composition, sources);
}
