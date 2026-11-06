import { isLibraryEntity, type LibraryEntity } from '../../domain/entities';
import { checkActive, FoundationError, messageOf } from '../../domain/errors';
import { object, uuid, validateEntity } from '../../domain/validation';
import type { AssetPort } from '../../storage/asset-port';
import { parseEntityDocument } from '../../storage/document';
import type { EntityIndex } from '../../storage/index';
import type { EntityRecord, EntityRepository } from '../../storage/repository';
import type { VaultPort } from '../../storage/vault-port';
import { parseDocument as parseYaml } from 'yaml';

const MAX_CHECKPOINT_BYTES = 20 * 1024 * 1024;
export interface RecoveryEntry { path: string; timestamp: string; title?: string; entityId?: string; diagnostic?: string }
export interface RecoveryInspection extends RecoveryEntry {
  raw: string; draft?: LibraryEntity; originalSource?: string | null; current?: EntityRecord;
  sourceStatus: 'unchanged' | 'changed' | 'new' | 'unavailable' | 'unreadable';
}
export interface RecoveredDraft { draft: LibraryEntity; base?: EntityRecord; checkpoint: string }

function checkpointDraft(raw: unknown): LibraryEntity {
  const value = object(raw, 'recovery draft');
  // Preserve common temporarily empty form values, validating every other field.
  const normalized = structuredClone(value);
  if (normalized.title === '') normalized.title = 'Untitled recovery';
  if (normalized.kind === 'patch' && normalized.instrument === '') normalized.instrument = 'Unassigned recovery';
  if (normalized.kind === 'effects-chain' && Array.isArray(normalized.steps)) normalized.steps = normalized.steps.map(step => {
    const fields = object(step, 'recovery effect'); return fields.name === '' ? { ...fields, name: 'Unnamed recovery stage' } : fields;
  });
  const validated = validateEntity(normalized);
  if (!isLibraryEntity(validated)) throw new FoundationError('wrong-kind', 'This checkpoint belongs to a musical module, not PATCHBOOK.');
  if (value.title === '') validated.title = '';
  if (validated.kind === 'patch' && value.instrument === '') validated.instrument = '';
  if (validated.kind === 'effects-chain' && Array.isArray(value.steps)) {
    for (const [i, step] of value.steps.entries()) if (object(step, 'effect').name === '' && validated.steps[i]) validated.steps[i].name = '';
  }
  return validated;
}

/** Bounded, read-only discovery. Restoration returns a draft, never writes a note. */
export class PatchbookRecovery {
  private closed = false;
  constructor(private readonly vault: VaultPort & AssetPort, private readonly index: EntityIndex, private readonly repository: EntityRepository) {}
  paths(): string[] {
    checkActive(undefined, this.closed);
    // Historical creation roots remain discoverable; only the documented Recovery subfolders.
    return this.vault.assetFiles().filter(file => file.path.includes('/Recovery/') && file.extension.toLowerCase() === 'json')
      .sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path)).map(file => file.path);
  }
  async discover(offset = 0, signal?: AbortSignal): Promise<{ entries: RecoveryEntry[]; total: number }> {
    checkActive(signal, this.closed);
    const paths = this.paths(), entries: RecoveryEntry[] = []; let bytes = 0;
    for (const path of paths.slice(offset, offset + 100)) {
      checkActive(signal, this.closed);
      const size = this.vault.fileInfo(path)?.size ?? 0; bytes += size;
      if (bytes > 32 * 1024 * 1024) { entries.push({ path, timestamp: '', diagnostic: 'Discovery read budget reached. Inspect this checkpoint individually.' }); continue; }
      const inspection = await this.inspect(path, signal);
      entries.push({ path, timestamp: inspection.timestamp, title: inspection.title, entityId: inspection.entityId, diagnostic: inspection.diagnostic });
    }
    return { entries, total: paths.length };
  }
  async inspect(path: string, signal?: AbortSignal): Promise<RecoveryInspection> {
    checkActive(signal, this.closed);
    const result: RecoveryInspection = { path, timestamp: '', raw: '', sourceStatus: 'unreadable' };
    try {
      if (!this.paths().includes(path)) throw new FoundationError('invalid', 'Select a checkpoint in a documented Recovery folder.');
      const metadata = this.vault.fileInfo(path);
      if (!metadata || metadata.size > MAX_CHECKPOINT_BYTES) throw new FoundationError('invalid', 'Checkpoint is missing or exceeds the 20 MiB inspection limit. Open its original JSON in Obsidian; it was retained.');
      result.raw = await this.vault.read(path); checkActive(signal, this.closed);
      if (result.raw.length > MAX_CHECKPOINT_BYTES) throw new FoundationError('invalid', 'Checkpoint grew beyond the inspection limit. The original is retained.');
      const decoded: unknown = JSON.parse(result.raw);
      if (parseYaml(result.raw, { schema: 'json', uniqueKeys: true }).errors.length) throw new FoundationError('invalid', 'Checkpoint contains duplicate or malformed JSON keys. Original retained.');
      const envelope = object(decoded, 'recovery checkpoint');
      if (!['mnemobard-recovery', 'mnemobard-editor-draft'].includes(String(envelope.format))) throw new FoundationError('invalid', 'Unrecognized recovery format; retained for inspection.');
      if (envelope.schemaVersion !== 1) throw new FoundationError('unsupported-schema', 'Unsupported recovery schema. Inspect the original; no downgrade was performed.');
      uuid(envelope.entityId);
      if (typeof envelope.savedAt !== 'string' || !Number.isFinite(Date.parse(envelope.savedAt))) throw new FoundationError('invalid', 'Checkpoint timestamp is malformed.');
      result.timestamp = envelope.savedAt; result.entityId = String(envelope.entityId);
      const draft = checkpointDraft(envelope.draft);
      if (draft.id.toLowerCase() !== result.entityId.toLowerCase()) throw new FoundationError('invalid', 'Checkpoint identity disagrees with its draft.');
      if (envelope.originalSource !== null && typeof envelope.originalSource !== 'string') throw new FoundationError('invalid', 'Checkpoint source text is malformed.');
      result.draft = draft; result.title = draft.title || `Untitled ${draft.kind}`; result.originalSource = envelope.originalSource;
      if (typeof result.originalSource === 'string') {
        const parsed = parseEntityDocument(result.originalSource);
        if (!parsed || parsed.entity.id !== draft.id || parsed.entity.kind !== draft.kind) throw new FoundationError('invalid', 'Checkpoint source identity does not match its draft.');
      }
      await this.index.start(); checkActive(signal, this.closed);
      const resolution = this.index.resolve(draft.id);
      if (resolution.status === 'missing' && result.originalSource === null) { result.sourceStatus = 'new'; return result; }
      if (resolution.status !== 'ready') { result.sourceStatus = 'unavailable'; result.diagnostic = `Authoritative record is ${resolution.status}. Restore or resolve its source before loading this checkpoint.`; return result; }
      const current = await this.repository.read(draft.id, signal); checkActive(signal, this.closed);
      if (current.entity.kind !== draft.kind) throw new FoundationError('invalid', 'Current record has a different kind.');
      result.current = current;
      result.sourceStatus = current.source === result.originalSource ? 'unchanged' : 'changed';
      return result;
    } catch (error) {
      checkActive(signal, this.closed);
      result.sourceStatus = 'unreadable'; delete result.draft;
      result.diagnostic = messageOf(error); return result;
    }
  }
  async prepare(inspection: RecoveryInspection, reviewedChangedSource: boolean, signal?: AbortSignal): Promise<RecoveredDraft> {
    checkActive(signal, this.closed);
    // Re-read the checkpoint too; callers cannot manufacture an editable envelope.
    const fresh = await this.inspect(inspection.path, signal);
    if (fresh.raw !== inspection.raw || !fresh.draft || !['new', 'unchanged', 'changed'].includes(fresh.sourceStatus)) throw new FoundationError('conflict', 'Recovery checkpoint or source changed or is unavailable. Inspect it again.');
    if (fresh.sourceStatus === 'changed') {
      if (!reviewedChangedSource || fresh.current?.source !== inspection.current?.source) throw new FoundationError('conflict', 'The authoritative note changed after this checkpoint. Compare both versions and explicitly authorize the reviewed source as the save base.');
    } else if (fresh.sourceStatus !== inspection.sourceStatus) throw new FoundationError('conflict', 'Source status changed. Inspect again before loading.');
    return { draft: fresh.draft, base: fresh.current, checkpoint: fresh.path };
  }
  dispose(): void { this.closed = true; }
}
