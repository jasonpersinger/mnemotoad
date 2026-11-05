export const ENTITY_KINDS = ['patch', 'motif', 'composition'] as const;
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
export interface Patch extends EntityBase {
  kind: 'patch'; instrument: string; manufacturer?: string; preset?: string;
  parameters?: (ExtensionFields & { name: string; value: string | number; unit?: string })[];
  effects?: string[];
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
  kind: 'motif'; patchId?: string; patchLink?: string; data: MotifData;
}
export interface Clip extends ExtensionFields { id: string; motifId: string; startTick: number; repeatCount: number }
export interface Lane extends ExtensionFields {
  id: string; name: string; midiChannel: number; percussion?: boolean; patchId?: string; clips: Clip[];
}
export interface CompositionData extends ExtensionFields {
  schemaVersion: 1; ppq: number; tempoMicrosecondsPerQuarter: number; meter: Meter; lengthTicks: number;
  lanes: Lane[];
  markers: (ExtensionFields & { id: string; tick: number; label: string })[];
  sections: (ExtensionFields & { id: string; startTick: number; endTick: number; label: string })[];
  audioRefs: (ExtensionFields & { id: string; path: string; atTick: number; label: string })[];
}
export interface Composition extends EntityBase { kind: 'composition'; data: CompositionData }
export type Entity = Patch | Motif | Composition;

export function createEntity(kind: EntityKind, title: string): Entity {
  const base = { id: crypto.randomUUID(), schemaVersion: 1 as const, title, extra: {} };
  const timing = { schemaVersion: 1 as const, ppq: 960, tempoMicrosecondsPerQuarter: 500000,
    meter: { numerator: 4, denominator: 4 }, lengthTicks: 3840 };
  if (kind === 'patch') return { ...base, kind, instrument: 'Unspecified instrument' };
  if (kind === 'motif') return { ...base, kind, data: { ...timing, notes: [] } };
  return { ...base, kind, data: { ...timing, lanes: [], markers: [], sections: [], audioRefs: [] } };
}
