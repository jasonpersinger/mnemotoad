import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type { ModuleId } from '../application/settings';
import { VIEW_TYPES } from '../application/modules';
import type { FoundationServices } from '../application/services';

export const MODULE_LABELS: Record<ModuleId, string> = { patchbook: 'PATCHBOOK', motif: 'MOTIF', canvas: 'CANVAS' };
const DESCRIPTIONS: Record<ModuleId, string> = {
  patchbook: 'Instrument and patch library', motif: 'MIDI composition editor', canvas: 'Composition and arrangement planner',
};
export class ModuleView extends ItemView {
  private unsubscribe?: () => void;
  private status?: HTMLElement;
  private issues?: HTMLElement;
  private closed = true;
  constructor(leaf: WorkspaceLeaf, readonly moduleId: ModuleId, private readonly services: () => FoundationServices | undefined) { super(leaf); }
  getViewType(): string { return VIEW_TYPES[this.moduleId]; }
  getDisplayText(): string { return `MNEMOTOAD · ${MODULE_LABELS[this.moduleId]}`; }
  getIcon(): string { return 'music'; }
  async onOpen(): Promise<void> {
    this.release(); this.closed = false;
    const root = this.contentEl; root.empty(); root.addClass('mnemobard-module');
    root.createEl('h2', { text: MODULE_LABELS[this.moduleId] });
    root.createEl('p', { text: DESCRIPTIONS[this.moduleId], cls: 'mnemobard-description' });
    root.createEl('p', { text: 'Under development. Milestone 1A provides the shared data foundation and workspace shell. Musical editing and playback are not available.' });
    this.status = root.createEl('p', { attr: { role: 'status' } });
    this.issues = root.createEl('ul', { cls: 'mnemobard-diagnostics', attr: { 'aria-label': 'Data diagnostics' } });
    const services = this.services();
    if (services?.modules.enabled(this.moduleId)) this.unsubscribe = services.index.subscribe(() => this.refresh());
    this.refresh();
  }
  private refresh(): void {
    if (this.closed || !this.status || !this.issues) return;
    const services = this.services(); this.issues.empty();
    if (!services?.modules.enabled(this.moduleId)) { this.status.setText('This module interface is disabled. Its vault files remain available.'); return; }
    const entries = services.index.all(), problems: string[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      if (entry.error) problems.push(`${entry.path}: ${entry.error.message}`);
      if (entry.id && !seen.has(entry.id)) {
        seen.add(entry.id); const state = services.index.resolve(entry.id);
        if (state.status === 'duplicate') problems.push(`Duplicate entity ID: ${state.paths.join(', ')}. Resolve the duplicate before editing.`);
      }
      if (entry.entity) problems.push(...services.references.diagnostics(entry.entity, entry.path).map(d => `${entry.path}: ${d.message}`));
    }
    if (services.settings.diagnostic) problems.unshift(services.settings.diagnostic.message);
    this.status.setText(`Shared vault index: ${entries.filter(e => e.entity).length} records; ${problems.length} diagnostics. Ordinary notes remain accessible without MNEMOTOAD.`);
    for (const message of problems.slice(0, 20)) this.issues.createEl('li', { text: message });
    if (problems.length > 20) this.issues.createEl('li', { text: 'Additional diagnostics are available through the shared index.' });
  }
  /** Explicit resource release without detaching the host-owned workspace leaf. */
  release(): void { this.closed = true; this.unsubscribe?.(); this.unsubscribe = undefined; }
  async onClose(): Promise<void> { this.release(); this.contentEl.empty(); }
}
