import type { FoundationServices } from '../../application/services';
import { messageOf } from '../../domain/errors';
import { button, element } from './form';
import type { LibrarySession } from './session';
import type { RecoveryInspection } from './recovery';

export class RecoveryPanel {
  private readonly lifetime = new AbortController();
  private generation = 0;
  private offset = 0;
  private readonly status: HTMLElement;
  private readonly entries: HTMLElement;
  private readonly detail: HTMLElement;
  constructor(private readonly root: HTMLElement, private readonly services: FoundationServices,
    private readonly loaded: (session: LibrarySession) => void, private readonly open: (path: string) => void) {
    element(root, 'h3', 'Recovery register');
    element(root, 'p', 'Checkpoints are copies of pending drafts or pre-save versions. Nothing is applied automatically. History is append-only; no cleanup or pruning occurs.', 'mnemobard-hint');
    button(root, 'Refresh checkpoints', () => { void this.refresh(); });
    this.status = element(root, 'p'); this.status.setAttribute('role', 'status');
    this.entries = element(root, 'div', undefined, 'mnemobard-recovery-list');
    this.detail = element(root, 'section', undefined, 'mnemobard-recovery-detail');
    void this.refresh();
  }
  private async refresh(): Promise<void> {
    const generation = ++this.generation; this.status.textContent = 'Discovering checkpoints…';
    try {
      const found = await this.services.recovery.discover(this.offset, this.lifetime.signal);
      if (this.lifetime.signal.aborted || generation !== this.generation) return;
      this.entries.replaceChildren(); this.status.textContent = `${found.total} checkpoints · showing ${this.offset + 1}–${Math.min(this.offset + 100, found.total)}. Sources and checkpoints are retained.`;
      for (const entry of found.entries) {
        const row = element(this.entries, 'div', undefined, 'mnemobard-recovery-row');
        button(row, `${entry.title ?? entry.entityId ?? 'Inspect checkpoint'} · ${entry.timestamp || 'timestamp unavailable'}`, () => { void this.inspect(entry.path); });
        if (entry.diagnostic) element(row, 'p', entry.diagnostic);
      }
      if (this.offset > 0) button(this.entries, 'Previous checkpoints', () => { this.offset -= 100; void this.refresh(); });
      if (this.offset + 100 < found.total) button(this.entries, 'More checkpoints', () => { this.offset += 100; void this.refresh(); });
      if (!found.total) element(this.entries, 'p', 'No checkpoints found in documented Recovery folders.');
    } catch (error) { if (!this.lifetime.signal.aborted) this.status.textContent = messageOf(error); }
  }
  private async inspect(path: string): Promise<void> {
    const generation = ++this.generation;
    try {
      const inspection = await this.services.recovery.inspect(path, this.lifetime.signal);
      if (this.lifetime.signal.aborted || generation !== this.generation) return;
      this.render(inspection);
    } catch (error) { if (!this.lifetime.signal.aborted) this.status.textContent = messageOf(error); }
  }
  private text(label: string, value: string): void {
    const details = element(this.detail, 'details'); element(details, 'summary', label);
    const area = element(details, 'textarea'); area.readOnly = true; area.rows = 8; area.value = value.slice(0, 65536); area.setAttribute('aria-label', label);
    if (value.length > 65536) element(details, 'p', 'Display limited to 64 Ki characters. Open the original checkpoint for all content; it remains unchanged.');
  }
  private render(inspection: RecoveryInspection): void {
    this.detail.replaceChildren();
    element(this.detail, 'h4', inspection.title ?? 'Checkpoint inspection');
    element(this.detail, 'p', inspection.timestamp || 'Timestamp unavailable');
    element(this.detail, 'code', inspection.path);
    button(this.detail, 'Open original checkpoint', () => this.open(inspection.path));
    const states = { unchanged: 'Authoritative source unchanged since checkpoint.', changed: 'CONFLICT: authoritative source changed after this checkpoint. Compare all versions before loading.', new: 'New unsaved record; no authoritative note exists.', unavailable: 'Authoritative record unavailable. Resolve missing or duplicate identity before loading.', unreadable: 'Checkpoint is inspection-only.' };
    element(this.detail, 'p', states[inspection.sourceStatus], 'mnemobard-recovery-status');
    if (inspection.diagnostic) element(this.detail, 'p', inspection.diagnostic, 'mnemobard-library-issues');
    this.text('Original checkpoint JSON', inspection.raw);
    if (inspection.originalSource) this.text('Saved source at checkpoint', inspection.originalSource);
    if (inspection.current) { this.text('Current authoritative source', inspection.current.source); button(this.detail, 'Open current Markdown record', () => this.open(inspection.current?.path ?? '')); }
    if (inspection.draft) this.text('Recoverable draft', JSON.stringify(inspection.draft, null, 2));
    if (!inspection.draft || !['new', 'unchanged', 'changed'].includes(inspection.sourceStatus)) return;
    let reviewed: HTMLInputElement | undefined;
    if (inspection.sourceStatus === 'changed') {
      const label = element(this.detail, 'label', undefined, 'mnemobard-recovery-consent');
      reviewed = element(label, 'input'); reviewed.type = 'checkbox';
      const text = 'I compared the versions. Use the displayed current source as the save base for this recovered draft.';
      reviewed.setAttribute('aria-label', text); element(label, 'span', text);
    }
    const load = button(this.detail, 'Load draft without saving', () => { void restore(); }, 'mod-cta'); load.disabled = this.services.settings.readOnly || !!reviewed;
    reviewed?.addEventListener('change', () => { load.disabled = !reviewed?.checked || this.services.settings.readOnly; });
    const restore = async (): Promise<void> => {
      load.disabled = true;
      try {
        const draft = await this.services.recovery.prepare(inspection, reviewed?.checked ?? false, this.lifetime.signal);
        if (this.lifetime.signal.aborted) return;
        this.loaded(this.services.patchbook.recover(draft));
      } catch (error) { if (!this.lifetime.signal.aborted) { this.status.textContent = messageOf(error); load.disabled = this.services.settings.readOnly || (!!reviewed && !reviewed.checked); } }
    };
    element(this.detail, 'p', 'Loading changes only an unsaved session. Review the form, then explicitly Save record. Any later external change still rejects the save. Existing source and checkpoint stay intact until that save.');
  }
  dispose(): void { this.lifetime.abort(); this.generation++; this.root.replaceChildren(); }
}
