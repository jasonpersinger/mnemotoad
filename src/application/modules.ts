import { FoundationError } from '../domain/errors';
import { type ModuleId } from './settings';

export const VIEW_TYPES: Record<ModuleId, string> = {
  patchbook: 'mnemobard-patchbook', motif: 'mnemobard-motif', canvas: 'mnemobard-canvas',
};
export interface WorkspacePort {
  open(type: string, isCurrent: () => boolean): Promise<void>;
  close(type: string): void;
}
export class ModuleController {
  private flags: Record<ModuleId, boolean>;
  private generations: Record<ModuleId, number> = { patchbook: 0, motif: 0, canvas: 0 };
  private opening = new Map<ModuleId, Promise<void>>();
  private closed = false;
  constructor(flags: Record<ModuleId, boolean>, private readonly workspace: WorkspacePort) { this.flags = { ...flags }; }
  enabled(id: ModuleId): boolean { return !this.closed && this.flags[id]; }
  open(id: ModuleId): Promise<void> {
    if (!this.enabled(id)) return Promise.reject(new FoundationError('disposed', 'This module is disabled. Enable its interface in MNEMOTOAD settings.'));
    const existing = this.opening.get(id); if (existing) return existing;
    const generation = this.generations[id];
    const pending = this.workspace.open(VIEW_TYPES[id], () => this.enabled(id) && generation === this.generations[id]);
    this.opening.set(id, pending);
    void pending.finally(() => { if (this.opening.get(id) === pending) this.opening.delete(id); }).catch(() => { /* Caller receives original rejection. */ });
    return pending;
  }
  setEnabled(id: ModuleId, enabled: boolean): void {
    if (this.closed || this.flags[id] === enabled) return;
    this.flags[id] = enabled; this.generations[id]++;
    if (!enabled) this.workspace.close(VIEW_TYPES[id]);
  }
  dispose(): void { this.closed = true; /* Host owns restored leaves; do not detach on unload. */ }
}
