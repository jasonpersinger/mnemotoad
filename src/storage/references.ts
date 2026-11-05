import type { Entity, EntityKind } from '../domain/entities';
import { assetTarget } from '../domain/paths';
import { EntityIndex } from './index';
export interface ReferenceDiagnostic { code: 'missing' | 'duplicate' | 'invalid' | 'wrong-kind' | 'link-mismatch'; field: string; message: string }
export class ReferenceResolver {
  constructor(private readonly index: EntityIndex, private readonly assetExists: (path: string) => boolean,
    private readonly resolveLink?: (link: string, sourcePath: string) => string | null) {}
  diagnostics(entity: Entity, sourcePath = ''): ReferenceDiagnostic[] {
    const result: ReferenceDiagnostic[] = [];
    const check = (id: string | undefined, kind: EntityKind, field: string) => {
      if (!id) return;
      const state = this.index.resolve(id);
      if (state.status !== 'ready') result.push({ code: state.status, field, message: `${field} is ${state.status}. Relink or restore the target note.` });
      else if (state.entity.kind !== kind) result.push({ code: 'wrong-kind', field, message: `${field} must reference a ${kind}.` });
    };
    if (entity.kind === 'motif') {
      check(entity.patchId, 'patch', 'patchId');
      if (entity.patchLink && entity.patchId && this.resolveLink) {
        const path = this.resolveLink(assetTarget(entity.patchLink), sourcePath), target = this.index.resolve(entity.patchId);
        if (target.status === 'ready' && path !== target.path) result.push({ code: 'link-mismatch', field: 'patchLink', message: 'The patch link and stable patch ID disagree. Choose the intended association explicitly.' });
      }
    }
    if (entity.kind === 'composition') {
      for (const lane of entity.data.lanes) {
        check(lane.patchId, 'patch', `lane ${lane.id} patch`);
        for (const clip of lane.clips) check(clip.motifId, 'motif', `clip ${clip.id} motif`);
      }
      for (const audio of entity.data.audioRefs) if (!this.assetExists(audio.path)) result.push({ code: 'missing', field: `audio ${audio.id}`, message: `Relink missing asset ${audio.path}.` });
    }
    for (const asset of entity.assets ?? []) {
      const path = this.resolveLink ? this.resolveLink(assetTarget(asset.link), sourcePath) : assetTarget(asset.link);
      if (!path || !this.assetExists(path)) result.push({ code: 'missing', field: asset.role, message: `Relink missing ${asset.role} asset ${asset.link}.` });
    }
    return result;
  }
}
