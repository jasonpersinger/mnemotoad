import { PluginSettingTab, Setting, Notice, type App, type Plugin } from 'obsidian';
import { MODULES, type ModuleId, type SettingsService } from './application/settings';
import { MODULE_LABELS } from './ui/module-view';
import { messageOf } from './domain/errors';

export class MnemobardSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private readonly settings: SettingsService,
    private readonly setModule: (module: ModuleId, enabled: boolean) => Promise<void>) { super(app, plugin); }
  display(): void {
    this.containerEl.empty();
    if (this.settings.diagnostic) this.containerEl.createEl('p', { text: this.settings.diagnostic.message, attr: { role: 'alert' } });
    for (const module of MODULES) new Setting(this.containerEl)
      .setName(`${MODULE_LABELS[module]} interface`)
      .setDesc('Enable its workspace view. Disabling the interface preserves all vault data.')
      .addToggle(toggle => toggle.setValue(this.settings.current.modules[module]).setDisabled(this.settings.readOnly)
        .onChange(value => {
          void this.setModule(module, value).catch(error => { new Notice(`Could not save MNEMOBARD preferences: ${messageOf(error)}`); this.display(); });
        }));
    new Setting(this.containerEl).setName('Content folder').setDesc(`${this.settings.current.creationRoot}. Folder configuration is loaded at plugin startup; existing entity locations are discovered independently.`);
  }
}
