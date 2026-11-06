import { isLibraryEntity, type LibraryEntity } from '../../domain/entities';
import { FoundationError } from '../../domain/errors';
import { object, validateEntity } from '../../domain/validation';
import type { AssetPort } from '../../storage/asset-port';
import type { VaultPort } from '../../storage/vault-port';
import type { EntityIndex } from '../../storage/index';
import type { EntityRepository } from '../../storage/repository';
import { CheckpointRecovery } from '../../storage/recovery';
export type { RecoveryEntry } from '../../storage/recovery';
export type RecoveryInspection = import('../../storage/recovery').RecoveryInspection<LibraryEntity>;
export type RecoveredDraft = import('../../storage/recovery').RecoveredDraft<LibraryEntity>;
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


export class PatchbookRecovery extends CheckpointRecovery<LibraryEntity> {
  constructor(vault: VaultPort & AssetPort, index: EntityIndex, repository: EntityRepository) { super(vault, index, repository, checkpointDraft); }
}
