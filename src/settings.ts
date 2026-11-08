import { PluginSettingTab, Setting, Notice, type App, type Plugin } from 'obsidian';
import { MODULES, type ModuleId, type SettingsService } from './application/settings';
import { MODULE_LABELS } from './ui/module-view';
import { messageOf } from './domain/errors';
import { mascotMark } from './ui/mascot';

export class MnemobardSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly owner: Plugin, private readonly settings: SettingsService,
    private readonly setModule: (module: ModuleId, enabled: boolean) => Promise<void>) { super(app, owner); }
  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass('mnemobard-settings');
    const about = this.containerEl.createEl('div', { cls: 'mnemotoad-about' });
    mascotMark(about, 4, 'MNEMOTOAD mascot: The Curmudgeon, a grumpy green toad');
    const text = about.createEl('div');
    text.createEl('h2', { text: 'MNEMOTOAD' }); text.createEl('p', { text: 'Remember what you\u2019ve yet to compose.', cls: 'mnemotoad-tagline' });
    text.createEl('p', { text: `Version ${this.owner.manifest.version} · by ${this.owner.manifest.author} · MIT License. PATCHBOOK, MOTIF and CANVAS keep their records as Markdown notes in your vault.`, cls: 'setting-item-description' });
    text.createEl('p', { text: 'Formerly MNEMOBARD: the plugin ID (mnemobard) and the content folder keep their original names so existing records, settings and recovery checkpoints stay where they are.', cls: 'setting-item-description' });
    if (this.settings.diagnostic) this.containerEl.createEl('p', { text: this.settings.diagnostic.message, attr: { role: 'alert' } });
    for (const module of MODULES) new Setting(this.containerEl)
      .setName(`${MODULE_LABELS[module]} interface`)
      .setDesc('Enable its workspace view. Disabling the interface preserves all vault data.')
      .addToggle(toggle => toggle.setValue(this.settings.current.modules[module]).setDisabled(this.settings.readOnly)
        .onChange(value => {
          void this.setModule(module, value).catch(error => { new Notice(`Could not save MNEMOTOAD preferences: ${messageOf(error)}`); this.display(); });
        }));
    new Setting(this.containerEl).setName('Content folder').setDesc(`${this.settings.current.creationRoot}. Folder configuration is loaded at plugin startup; existing entity locations are discovered independently.`);
    const label = this.containerEl.createEl('label', { text: 'Default asset import folder' });
    const input = this.containerEl.createEl('input', { attr: { type: 'text', 'aria-label': 'Default asset import folder' } });
    const id = `mnemobard-assets-${crypto.randomUUID()}`; input.id = id; label.htmlFor = id;
    input.value = this.settings.current.assetDirectory; input.disabled = this.settings.readOnly;
    input.addEventListener('change', () => { void this.settings.update({ assetDirectory: input.value }).catch(error => { new Notice(messageOf(error)); this.display(); }); });
    this.containerEl.createEl('p', { text: 'Imports require destination confirmation. Removing an association keeps the copied file.' });
  }
}
