import { Modal, TFile, type App } from 'obsidian';
import { messageOf } from '../domain/errors';
import { button, element } from './dom';

/** Unknown/preset files are inspected as inert text, never sent to an OS opener. */
export class AssetInspector extends Modal {
  private active = false;
  constructor(app: App, private readonly path: string) { super(app); }
  override onOpen(): void {
    this.active = true;
    const root = this.contentEl; root.replaceChildren(); element(root, 'h2', 'Asset inspection');
    element(root, 'code', this.path);
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) { element(root, 'p', 'File missing. Select a replacement in PATCHBOOK.'); return; }
    element(root, 'p', `${file.name} · ${file.stat.size} bytes · ${file.extension || 'unknown file type'}`);
    element(root, 'p', 'Preset/configuration files are inert references. MNEMOTOAD never executes them or launches an external application. Use the instrument’s own preset loader when needed.');
    const result = element(root, 'pre', '', 'mnemobard-asset-text');
    const inspect = button(root, 'Inspect as text', () => {
      inspect.disabled = true;
      void this.app.vault.read(file).then(text => { if (this.active) result.textContent = text.slice(0, 262144); })
        .catch(error => { if (this.active) result.textContent = messageOf(error); });
    });
    inspect.disabled = file.stat.size > 262144;
    if (inspect.disabled) element(root, 'p', 'Text inspection is limited to 256 KiB. This file was retained without reading or execution.');
    button(root, 'Close inspection', () => this.close());
  }
  override onClose(): void { this.active = false; this.contentEl.replaceChildren(); }
}
