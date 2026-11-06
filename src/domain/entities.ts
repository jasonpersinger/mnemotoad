export const ENTITY_KINDS = ['patch', 'motif', 'composition', 'instrument', 'effects-chain'] as const;
export type EntityKind = typeof ENTITY_KINDS[number];
export const SCHEMA_VERSION = 1;
export type ExtensionFields = Record<string, unknown>;
export interface AssetReference { role: 'audio' | 'image' | 'preset'; link: string }
export interface EntityBase {
  id: string; kind: EntityKind; schemaVersion: 1; title: string;
  tags?: string[]; assets?: AssetReference[];
  /** Unowned YAML fields. They are preserved, never executed. */
  extra: ExtensionFields;
}
export interface LibraryMetadata {
  description?: string; notes?: string; externalReferences?: string[]; archived?: boolean;
}
export interface Instrument extends EntityBase, LibraryMetadata {
  kind: 'instrument'; manufacturer?: string; instrumentType?: string; platform?: string;
}
export interface EffectStep extends ExtensionFields { id: string; name: string; parameterNotes?: string; presetLink?: string }
export interface EffectsChain extends EntityBase, LibraryMetadata { kind: 'effects-chain'; steps: EffectStep[] }
export interface Patch extends EntityBase, LibraryMetadata {
  kind: 'patch'; instrument: string; manufacturer?: string; preset?: string;
  parameters?: (ExtensionFields & { name: string; value: string | number; unit?: string })[];
  effects?: string[];
  instrumentId?: string; instrumentLink?: string; effectsChainIds?: string[]; effectsChainLinks?: string[];
  category?: string; character?: string; parameterNotes?: string;
}
export interface Meter extends ExtensionFields { numerator: number; denominator: number }
export interface Note extends ExtensionFields {
  id: string; pitch: number; startTick: number; durationTicks: number; velocity: number;
}
export interface MotifData extends ExtensionFields {
  schemaVersion: 1; ppq: number; tempoMicrosecondsPerQuarter: number;
  meter: Meter; lengthTicks: number; notes: Note[]; importSourceChannel?: number;
}
export interface Motif extends EntityBase {
  kind: 'motif'; description?: string; notes?: string; patchId?: string; patchLink?: string; data: MotifData;
}
export interface Clip extends ExtensionFields { id: string; motifId: string; startTick: number; repeatCount: number; laneId?: string; label?: string; sourceRevision?: string; sourcePath?: string; sourceTitle?: string; reviewedLengthTicks?: number }
export interface Lane extends ExtensionFields {
  id: string; name: string; midiChannel?: number; percussion?: boolean; patchId?: string; clips: Clip[];
}
export interface CompositionData extends ExtensionFields {
  schemaVersion: 1; ppq: number; tempoMicrosecondsPerQuarter: number; meter: Meter; lengthTicks: number;
  lanes: Lane[];
  markers: (ExtensionFields & { id: string; tick: number; label: string; description?: string })[];
  sections: (ExtensionFields & { id: string; startTick: number; endTick: number; label: string; description?: string })[];
  /** Vault-relative recording reference; `atTick` is its required timeline anchor. 4C adds optional description/associations. */
  audioRefs: (ExtensionFields & { id: string; path: string; atTick: number; label: string; description?: string; sectionId?: string; markerId?: string })[];
}
export interface Composition extends EntityBase { kind: 'composition'; description?: string; notes?: string; data: CompositionData }
export type LibraryEntity = Patch | Instrument | EffectsChain;
export type LibraryKind = LibraryEntity['kind'];
export type Entity = LibraryEntity | Motif | Composition;
export function isLibraryEntity(entity: Entity): entity is LibraryEntity {
  return entity.kind === 'patch' || entity.kind === 'instrument' || entity.kind === 'effects-chain';
}

export function createEntity<K extends EntityKind>(kind: K, title: string): Extract<Entity, {kind: K}>;
export function createEntity(kind: EntityKind, title: string): Entity {
  const base = { id: crypto.randomUUID(), schemaVersion: 1 as const, title, extra: {} };
  const timing = { schemaVersion: 1 as const, ppq: 960, tempoMicrosecondsPerQuarter: 500000,
    meter: { numerator: 4, denominator: 4 }, lengthTicks: 3840 };
  if (kind === 'patch') return { ...base, kind, instrument: 'Unspecified instrument' };
  if (kind === 'instrument') return { ...base, kind };
  if (kind === 'effects-chain') return { ...base, kind, steps: [] };
  if (kind === 'motif') return { ...base, kind, data: { ...timing, notes: [] } };
  return { ...base, kind, data: { ...timing, lanes: [], markers: [], sections: [], audioRefs: [] } };
}
