import { type Entity, ENTITY_KINDS } from './entities';
import { FoundationError } from './errors';
import { assetLink, vaultPath } from './paths';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function invalid(field: string, reason: string): never { throw new FoundationError('invalid', `${field}: ${reason}`); }
export function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(field, 'expected an object');
  return value as Record<string, unknown>;
}
function text(v: unknown, field: string): asserts v is string {
  if (typeof v !== 'string' || !v.trim()) invalid(field, 'expected nonempty text');
}
function integer(v: unknown, field: string, min: number, max = Number.MAX_SAFE_INTEGER): asserts v is number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) invalid(field, `expected an integer from ${min} to ${max}`);
}
export function uuid(v: unknown, field = 'id'): asserts v is string {
  if (typeof v !== 'string' || !UUID.test(v)) invalid(field, 'expected a stable UUID');
}
function list(v: unknown, field: string, max = 10000): unknown[] {
  if (!Array.isArray(v) || v.length > max) return invalid(field, `expected a list of at most ${max} entries`);
  return v;
}
function unique(items: Record<string, unknown>[], field: string): void {
  const ids = new Set<string>();
  for (const item of items) { text(item.id, `${field}.id`); if (ids.has(item.id)) invalid(field, 'duplicate IDs'); ids.add(item.id); }
}
function records(v: unknown, field: string, max?: number): Record<string, unknown>[] {
  const rows = list(v, field, max).map(item => object(item, field)); unique(rows, field); return rows;
}
function version(v: unknown): void {
  if (v !== 1) throw new FoundationError('unsupported-schema', 'Unsupported schema version. Open the original note; no migration or rewrite was performed.');
}
/** Extensions must survive YAML/JSON serialization without coercion or loss. */
function portable(value: unknown, ancestors = new WeakSet<object>(), depth = 0): void {
  if (depth > 100) invalid('extension data', 'portable structures must be at most 100 levels deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object') invalid('extension data', 'expected portable JSON/YAML values');
  if (ancestors.has(value)) invalid('extension data', 'cyclic structures cannot be saved');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) invalid('extension data', 'expected portable plain objects');
  ancestors.add(value);
  for (const entry of Array.isArray(value) ? value : Object.values(value)) portable(entry, ancestors, depth + 1);
  ancestors.delete(value);
}
export function validateEntity(value: unknown): Entity {
  const e = object(value, 'entity'); version(e.schemaVersion); uuid(e.id); text(e.title, 'title');
  if (!ENTITY_KINDS.includes(e.kind as Entity['kind'])) invalid('kind', 'unknown entity type');
  object(e.extra, 'extra'); portable(e.extra);
  if (e.tags !== undefined) list(e.tags, 'tags', 1000).forEach(t => text(t, 'tag'));
  if (e.assets !== undefined) for (const item of list(e.assets, 'assets', 1000)) {
    const a = object(item, 'asset');
    if (!['audio', 'image', 'preset'].includes(String(a.role))) invalid('asset.role', 'unknown role');
    text(a.link, 'asset.link'); assetLink(a.link);
  }
  if (['patch', 'instrument', 'effects-chain'].includes(String(e.kind))) {
    for (const key of ['description', 'notes']) if (e[key] !== undefined) {
      text(e[key], key); if (String(e[key]).length > 100000) invalid(key, 'maximum 100000 characters');
    }
    if (e.archived !== undefined && typeof e.archived !== 'boolean') invalid('archived', 'expected boolean');
    if (e.externalReferences !== undefined) for (const link of list(e.externalReferences, 'external references', 100)) {
      text(link, 'external reference');
      let url: URL; try { url = new URL(String(link)); } catch { return invalid('external reference', 'use a full http or https URL'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) invalid('external reference', 'use http/https without credentials');
    }
  }
  if (e.kind === 'patch') {
    text(e.instrument, 'instrument');
    for (const key of ['preset', 'manufacturer']) if (e[key] !== undefined) text(e[key], key);
    if (e.effects !== undefined) list(e.effects, 'effects').forEach(x => text(x, 'effect'));
    if (e.parameters !== undefined) for (const p of list(e.parameters, 'parameters')) {
      portable(p);
      const row = object(p, 'parameter'); text(row.name, 'parameter name');
      if (typeof row.value !== 'string' && !(typeof row.value === 'number' && Number.isFinite(row.value))) invalid('parameter value', 'expected text or finite number');
      if (row.unit !== undefined) text(row.unit, 'parameter unit');
    }
    for (const key of ['category', 'character', 'parameterNotes']) if (e[key] !== undefined) text(e[key], key);
    if (e.instrumentId !== undefined) uuid(e.instrumentId, 'instrumentId');
    if (e.instrumentLink !== undefined) { text(e.instrumentLink, 'instrumentLink'); assetLink(e.instrumentLink); }
    if (e.effectsChainIds !== undefined) {
      const ids = list(e.effectsChainIds, 'effectsChainIds', 100); ids.forEach(id => uuid(id, 'effectsChainId'));
      if (new Set(ids.map(id => String(id).toLowerCase())).size !== ids.length) invalid('effectsChainIds', 'duplicate IDs');
    }
    if (e.effectsChainLinks !== undefined) {
      const links = list(e.effectsChainLinks, 'effectsChainLinks', 100); links.forEach(link => { text(link, 'chain link'); assetLink(String(link)); });
      if (links.length !== (e.effectsChainIds as unknown[] | undefined)?.length) invalid('effectsChainLinks', 'must correspond in order to chain IDs');
    }
  } else if (e.kind === 'instrument') {
    for (const key of ['manufacturer', 'instrumentType', 'platform']) if (e[key] !== undefined) text(e[key], key);
  } else if (e.kind === 'effects-chain') {
    for (const step of records(e.steps, 'effects steps', 256)) {
      portable(step); text(step.name, 'processor name');
      if (step.parameterNotes !== undefined) text(step.parameterNotes, 'effect parameter notes');
      if (step.presetLink !== undefined) { text(step.presetLink, 'effect preset'); assetLink(step.presetLink); }
    }
  } else {
    const d = object(e.data, 'data'); version(d.schemaVersion); portable(d);
    integer(d.ppq, 'ppq', 1, 32767); integer(d.lengthTicks, 'lengthTicks', 1);
    integer(d.tempoMicrosecondsPerQuarter, 'tempo', 200000, 3000000);
    const m = object(d.meter, 'meter'); integer(m.numerator, 'meter numerator', 1, 32);
    if (![1, 2, 4, 8, 16, 32].includes(Number(m.denominator)) || typeof m.denominator !== 'number') invalid('meter denominator', 'unsupported beat unit');
    if (e.kind === 'motif') {
      if (e.patchId !== undefined) uuid(e.patchId, 'patchId');
      if (e.patchLink !== undefined) { text(e.patchLink, 'patchLink'); assetLink(e.patchLink); }
      if (d.importSourceChannel !== undefined) integer(d.importSourceChannel, 'source channel', 0, 15);
      const notes = records(d.notes, 'notes');
      const byPitch = new Map<number, Record<string, unknown>[]>();
      for (const n of notes) {
        integer(n.pitch, 'pitch', 0, 127); integer(n.startTick, 'startTick', 0);
        integer(n.durationTicks, 'durationTicks', 1); integer(n.velocity, 'velocity', 1, 127);
        if (!Number.isSafeInteger(n.startTick + n.durationTicks) || n.startTick + n.durationTicks > d.lengthTicks) invalid('note', 'extends beyond motif');
        const group = byPitch.get(n.pitch) ?? []; group.push(n); byPitch.set(n.pitch, group);
      }
      for (const group of byPitch.values()) {
        group.sort((a,b) => Number(a.startTick) - Number(b.startTick));
        for (let i = 1; i < group.length; i++) {
          const a = group[i-1], b = group[i];
          if (a && b && Number(a.startTick) + Number(a.durationTicks) > Number(b.startTick)) invalid('notes', 'overlapping same-pitch notes are unsupported');
        }
      }
    } else {
      if (d.ppq !== 960) invalid('composition ppq', 'must be 960 in schema 1');
      const lanes = records(d.lanes, 'lanes', 16), channels = new Set<number>(), clips: Record<string, unknown>[] = [];
      for (const lane of lanes) {
        text(lane.name, 'lane name'); integer(lane.midiChannel, 'lane channel', 0, 15);
        if (channels.has(lane.midiChannel)) invalid('lane channel', 'must be unique'); channels.add(lane.midiChannel);
        if (lane.percussion !== undefined && typeof lane.percussion !== 'boolean') invalid('percussion', 'expected boolean');
        if ((lane.midiChannel === 9) !== (lane.percussion === true)) invalid('percussion', 'channel 10 requires explicit percussion designation');
        if (lane.patchId !== undefined) uuid(lane.patchId, 'lane patchId');
        for (const c of records(lane.clips, 'clips', 1000)) {
          uuid(c.motifId, 'motifId'); integer(c.startTick, 'clip start', 0, d.lengthTicks - 1);
          integer(c.repeatCount, 'repeatCount', 1, 1000); clips.push(c);
        }
      }
      unique(clips, 'composition clips'); if (clips.length > 1000) invalid('clips', 'maximum is 1000');
      for (const marker of records(d.markers, 'markers')) { text(marker.label, 'marker label'); integer(marker.tick, 'marker tick', 0, d.lengthTicks); }
      for (const section of records(d.sections, 'sections')) {
        text(section.label, 'section label'); integer(section.startTick, 'section start', 0, d.lengthTicks - 1);
        integer(section.endTick, 'section end', section.startTick + 1, d.lengthTicks);
      }
      for (const ref of records(d.audioRefs, 'audioRefs')) {
        text(ref.label, 'audio label'); text(ref.path, 'audio path'); vaultPath(ref.path); integer(ref.atTick, 'audio position', 0, d.lengthTicks);
      }
    }
  }
  // The cast follows validation of every known field. Unknown fields remain data.
  return structuredClone(value) as Entity;
}
