import { isMap, isScalar, isNode, parseDocument as parseYaml, stringify } from 'yaml';
import { isLibraryEntity, type Entity, type EntityKind, type AssetReference } from '../domain/entities';
import { FoundationError, messageOf } from '../domain/errors';
import { UUID, object, validateEntity } from '../domain/validation';

export interface ParsedDocument { entity: Entity; source: string }
const COMMON_KEYS = ['mnemobard_id', 'mnemobard_kind', 'mnemobard_schema', 'title', 'tags',
  'mnemobard_audio', 'mnemobard_images', 'mnemobard_presets'];
const LIBRARY_FIELDS = { description: 'mnemobard_description', notes: 'mnemobard_notes', externalReferences: 'mnemobard_external_references', archived: 'mnemobard_archived' } as const;
const PATCH_FIELDS = { instrumentId: 'mnemobard_instrument_id', instrumentLink: 'mnemobard_instrument', effectsChainIds: 'mnemobard_effects_chain_ids', effectsChainLinks: 'mnemobard_effects_chains', category: 'mnemobard_category', character: 'mnemobard_character', parameterNotes: 'mnemobard_parameter_notes' } as const;
const INSTRUMENT_FIELDS = { instrumentType: 'mnemobard_instrument_type', platform: 'mnemobard_platform', manufacturer: 'manufacturer' } as const;
function libraryFields(kind: EntityKind): Record<string, string> {
  return kind === 'patch' ? { ...LIBRARY_FIELDS, ...PATCH_FIELDS } : kind === 'instrument' ? { ...LIBRARY_FIELDS, ...INSTRUMENT_FIELDS } : kind === 'effects-chain' ? { ...LIBRARY_FIELDS, steps: 'mnemobard_effects' } : {};
}
const musical = (kind: EntityKind): boolean => kind === 'motif' || kind === 'composition';
const ownedKeys = (kind: EntityKind) => [...COMMON_KEYS, ...Object.values(libraryFields(kind)), ...(kind === 'patch' ?
  ['instrument', 'manufacturer', 'preset', 'parameters', 'effects'] : kind === 'motif' ? ['mnemobard_patch_id', 'mnemobard_patch'] : [])];
const ASSETS = { audio: 'mnemobard_audio', image: 'mnemobard_images', preset: 'mnemobard_presets' } as const;

function frontmatter(source: string) {
  const match = /^(\uFEFF?---[ \t]*\r?\n)([\s\S]*?)(^---[ \t]*(?:\r?\n|$))/m.exec(source);
  if (!match || match.index !== 0) return null;
  const raw = match[2] ?? '', start = match[1]?.length ?? 0;
  const owned = /mnemobard_(?:id|kind|schema)/.test(raw);
  let doc: ReturnType<typeof parseYaml>;
  try { doc = parseYaml(raw, { uniqueKeys: true, strict: true }); }
  catch (cause) {
    if (!owned) return null;
    throw new FoundationError('invalid', `Invalid YAML: ${messageOf(cause)}`, { cause });
  }
  if (doc.errors.length || doc.warnings.length || !isMap(doc.contents)) {
    if (!owned) return null;
    throw new FoundationError('invalid', `Invalid YAML: ${doc.errors[0]?.message ?? doc.warnings[0]?.message ?? 'expected a mapping'}`);
  }
  let value: unknown;
  try { value = doc.toJS({ maxAliasCount: 0 }); }
  catch (cause) { if (!owned) return null; throw new FoundationError('invalid', `Invalid YAML: ${messageOf(cause)}`, { cause }); }
  const fields = object(value, 'YAML');
  if (!['mnemobard_id', 'mnemobard_kind', 'mnemobard_schema'].some(k => Object.hasOwn(fields, k))) return null;
  return { raw, start, end: match[0].length, doc, fields };
}

interface Block { start: number; end: number; content: string; kind: string }
function ownedBlocks(source: string, from: number): Block[] {
  const result: Block[] = []; let open: { char: string; length: number; kind: string; start: number; contentStart: number } | undefined;
  let offset = from;
  for (const line of source.slice(from).match(/[^\n]*(?:\n|$)/g) ?? []) {
    if (!line) continue;
    const match = /^ {0,3}(`{3,}|~{3,})(.*?)[\r\n]*$/.exec(line);
    if (match?.[1]) {
      const fence = match[1], info = (match[2] ?? '').trim();
      if (!open) open = { char: fence[0] ?? '`', length: fence.length, kind: info, start: offset, contentStart: offset + line.length };
      else if (fence[0] === open.char && fence.length >= open.length && !info) {
        if (/^mnemobard-(?:motif|composition)$/.test(open.kind)) result.push({ start: open.start, end: offset + line.length,
          content: source.slice(open.contentStart, offset), kind: open.kind });
        open = undefined;
      }
    }
    offset += line.length;
  }
  if (open?.kind.startsWith('mnemobard-')) throw new FoundationError('invalid', 'The owned JSON block is unclosed. Open the source note to repair it.');
  return result;
}

export function parseEntityDocument(source: string): ParsedDocument | null {
  if (source.length > 8 * 1024 * 1024) {
    if (/mnemobard_(?:id|kind|schema)/.test(source)) throw new FoundationError('invalid', 'Entity text exceeds the 8 Mi-character safety limit.');
    return null;
  }
  const fm = frontmatter(source); if (!fm) return null;
  const fields = fm.fields;
  if (fields.mnemobard_schema !== 1) throw new FoundationError('unsupported-schema', 'Unsupported entity schema; open the original note without rewriting it.');
  const kind = fields.mnemobard_kind as EntityKind, blocks = ownedBlocks(source, fm.end);
  if (!musical(kind) ? blocks.length !== 0 : blocks.length !== 1 || blocks[0]?.kind !== `mnemobard-${kind}`) {
    throw new FoundationError('invalid', 'Expected exactly one correctly typed owned JSON block for a motif/composition, and none for a patch.');
  }
  let data: unknown;
  if (musical(kind)) {
    try {
      const content = blocks[0]?.content ?? '';
      data = JSON.parse(content);
      // Native JSON.parse accepts duplicate keys. Strict YAML's JSON schema
      // supplies a duplicate-key check without introducing another parser.
      if (parseYaml(content, { schema: 'json', uniqueKeys: true }).errors.length) throw new Error('Duplicate or invalid JSON keys');
    }
    catch (cause) { throw new FoundationError('invalid', 'Invalid owned JSON. Repair the original note or recover a saved copy.', { cause }); }
  }
  const extra = Object.fromEntries(Object.entries(fields).filter(([k]) => !ownedKeys(kind).includes(k)));
  const candidate: Record<string, unknown> = { id: fields.mnemobard_id, kind, schemaVersion: fields.mnemobard_schema,
    title: fields.title, extra };
  if (fields.tags !== undefined) candidate.tags = fields.tags;
  const assets: AssetReference[] = [];
  for (const [role, key] of Object.entries(ASSETS)) {
    const links = fields[key];
    if (links !== undefined) {
      if (!Array.isArray(links) || links.some(x => typeof x !== 'string')) throw new FoundationError('invalid', `${key}: expected a list of quoted vault links`);
      for (const link of links as string[]) assets.push({ role: role as AssetReference['role'], link });
    }
  }
  if (assets.length) candidate.assets = assets;
  for (const [key, field] of Object.entries(libraryFields(kind))) if (fields[field] !== undefined) candidate[key] = fields[field];
  if (kind === 'patch') {
    for (const key of ['instrument', 'manufacturer', 'preset', 'parameters', 'effects']) if (fields[key] !== undefined) candidate[key] = fields[key];
  } else if (musical(kind)) {
    candidate.data = data;
    if (kind === 'motif') {
      if (fields.mnemobard_patch_id !== undefined) candidate.patchId = fields.mnemobard_patch_id;
      if (fields.mnemobard_patch !== undefined) candidate.patchLink = fields.mnemobard_patch;
    }
  }
  return { entity: validateEntity(candidate), source };
}

/** Diagnostic identity only: never grants permission to write an invalid note. */
export function entityIdentityHint(source: string): string | undefined {
  try {
    const id = frontmatter(source)?.fields.mnemobard_id;
    if (typeof id === 'string' && UUID.test(id)) return id.toLowerCase();
  } catch (error) { if (!(error instanceof FoundationError)) throw error; }
  const literal = /^mnemobard_id:\s*["']?([0-9a-f-]+)["']?\s*$/mi.exec(source)?.[1];
  return literal && UUID.test(literal) ? literal.toLowerCase() : undefined;
}

function metadata(entity: Entity): Record<string, unknown> {
  const result: Record<string, unknown> = { ...entity.extra, mnemobard_id: entity.id, mnemobard_kind: entity.kind,
    mnemobard_schema: entity.schemaVersion, title: entity.title };
  if (entity.tags !== undefined) result.tags = entity.tags;
  for (const [role, key] of Object.entries(ASSETS)) {
    const links = entity.assets?.filter(a => a.role === role).map(a => a.link);
    if (links?.length) result[key] = links;
  }
  if (entity.kind === 'patch') {
    for (const key of ['instrument', 'manufacturer', 'preset', 'parameters', 'effects'] as const) if (entity[key] !== undefined) result[key] = entity[key];
  } else if (entity.kind === 'motif') {
    if (entity.patchId !== undefined) result.mnemobard_patch_id = entity.patchId;
    if (entity.patchLink !== undefined) result.mnemobard_patch = entity.patchLink;
  }
  if (isLibraryEntity(entity)) for (const [key, field] of Object.entries(libraryFields(entity.kind))) {
    const value = (entity as unknown as Record<string, unknown>)[key];
    if (value !== undefined) result[field] = value;
  }
  return result;
}

export function createEntityDocument(value: Entity): string {
  const entity = validateEntity(value);
  const block = isLibraryEntity(entity) ? '' : `\n\`\`\`mnemobard-${entity.kind}\n${JSON.stringify(entity.data, null, 2)}\n\`\`\`\n`;
  const source = `---\n${stringify(metadata(entity), { lineWidth: 0 })}---\n${block}\n# Notes\n\n`;
  // Creation must obey the same readable-document limits as updates and later opens.
  if (!parseEntityDocument(source)) throw new FoundationError('invalid', 'The proposed entity note could not be parsed; no record was written.');
  return source;
}

/** Preserve extensions on retained objects; optional known fields may be removed. */
function retainExtensions(previous: unknown, next: unknown, context = 'data'): unknown {
  if (Array.isArray(previous) && Array.isArray(next)) return next.map(item => {
    if (!item || typeof item !== 'object' || !('id' in item)) return item;
    const prior = previous.find(p => p && typeof p === 'object' && 'id' in p && p.id === item.id);
    return retainExtensions(prior, item, context);
  });
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object' || Array.isArray(previous) || Array.isArray(next)) return next;
  const old = previous as Record<string, unknown>, result = { ...old, ...next };
  const optionalFields = context === 'data' ? ['importSourceChannel'] : context === 'lanes' ? ['patchId', 'percussion'] : context === 'steps' ? ['parameterNotes', 'presetLink'] : [];
  for (const optional of optionalFields) if (!Object.hasOwn(next, optional)) delete result[optional];
  for (const [k, v] of Object.entries(next)) result[k] = retainExtensions(old[k], v, k);
  return result;
}

export function updateEntityDocument(source: string, expectedSource: string, value: Entity): string {
  if (source !== expectedSource) throw new FoundationError('conflict', 'The note changed elsewhere. Read the latest version or save your draft as a recovery copy.');
  const current = parseEntityDocument(source), fm = frontmatter(source);
  if (!current || !fm) throw new FoundationError('invalid', 'The source is no longer a supported MNEMOBARD note.');
  let next = validateEntity(value);
  if (next.id !== current.entity.id || next.kind !== current.entity.kind) throw new FoundationError('invalid', 'Entity identity and kind cannot change during an update.');
  if (!isLibraryEntity(next) && !isLibraryEntity(current.entity)) next = validateEntity({ ...next, data: retainExtensions(current.entity.data, next.data) });
  if (next.kind === 'effects-chain' && current.entity.kind === 'effects-chain') next = validateEntity({ ...next, steps: retainExtensions(current.entity.steps, next.steps, 'steps') });
  const fields = metadata(next), edits: { start: number; end: number; text: string }[] = [];
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  // Only owned fields and explicitly supplied extension fields are touched.
  for (const key of new Set([...ownedKeys(next.kind), ...Object.keys(next.extra)])) {
    if (JSON.stringify(fm.fields[key]) === JSON.stringify(fields[key])) continue;
    const pair = isMap(fm.doc.contents) ? fm.doc.contents.items.find(p => isScalar(p.key) && p.key.value === key) : undefined;
    let replacement = fields[key] === undefined ? '' : stringify({ [key]: fields[key] }, { lineWidth: 0 }).replaceAll('\n', newline);
    if (pair) {
      if (!isNode(pair.key) || !pair.key.range || !isNode(pair.value) || !pair.value.range) throw new FoundationError('invalid', 'Cannot safely determine this YAML property range; edit it in the note.');
      const start = pair.key.range[0], end = pair.value.range[2];
      // Preserve a comment at the end of the changed value as well.
      if (pair.value.comment && replacement) replacement = replacement.replace(new RegExp(`${newline}$`), ` #${pair.value.comment}${newline}`);
      edits.push({ start: fm.start + start, end: fm.start + end, text: replacement });
    } else if (replacement) edits.push({ start: fm.start + fm.raw.length, end: fm.start + fm.raw.length, text: replacement });
  }
  if (!isLibraryEntity(next) && !isLibraryEntity(current.entity) && JSON.stringify(next.data) !== JSON.stringify(current.entity.data)) {
    const block = ownedBlocks(source, fm.end)[0]; if (!block) throw new FoundationError('invalid', 'Owned block missing.');
    edits.push({ start: block.start, end: block.end, text: `\`\`\`mnemobard-${next.kind}${newline}${JSON.stringify(next.data, null, 2).replaceAll('\n', newline)}${newline}\`\`\`${newline}` });
  }
  let result = source;
  for (const edit of edits.sort((a,b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  parseEntityDocument(result); // Never return an invalid candidate to the writer.
  return result;
}
