import { Plugin, Notice } from 'obsidian';
import { MODULES, SettingsService, type ModuleId } from './application/settings';
import { ModuleController, VIEW_TYPES } from './application/modules';
import type { FoundationServices } from './application/services';
import { EntityIndex } from './storage/index';
import { EntityRepository } from './storage/repository';
import { ReferenceResolver } from './storage/references';
import { ObsidianVaultPort } from './platform/obsidian-vault';
import { ModuleView, MODULE_LABELS } from './ui/module-view';
import { MnemobardSettingTab } from './settings';
import { messageOf } from './domain/errors';

export default class MnemobardPlugin extends Plugin {
  /** Shared foundation for future modules. No musical/editor implementation. */
  services?: FoundationServices;
  private active = false;
  private generation = 0;
  async onload(): Promise<void> {
    const generation = ++this.generation;
    this.active = true;
    const settings = new SettingsService({ load: () => this.loadData() as Promise<unknown>, save: value => this.saveData(value) });
    this.register(() => settings.dispose());
    await settings.load(); if (!this.active || generation !== this.generation) return;
    const vault = new ObsidianVaultPort(this.app.vault), index = new EntityIndex(vault);
    const repository = new EntityRepository(vault, index, settings.current.creationRoot, () => !settings.readOnly);
    const references = new ReferenceResolver(index, path => vault.exists(path), (link, source) => this.app.metadataCache.getFirstLinkpathDest(link, source)?.path ?? null);
    const modules = new ModuleController(settings.current.modules, {
      open: async (type, isCurrent) => {
        if (!isCurrent()) return;
        const existing = this.app.workspace.getLeavesOfType(type)[0];
        const leaf = existing ?? this.app.workspace.getLeaf('tab');
        if (!existing) await leaf.setViewState({ type, active: true });
        if (!isCurrent()) { if (!existing) leaf.detach(); return; }
        await this.app.workspace.revealLeaf(leaf);
        if (!isCurrent()) { if (!existing) leaf.detach(); return; }
        if (!(leaf.view instanceof ModuleView)) throw Error('The workspace view did not initialize. Reopen the module.');
      },
      close: type => { for (const leaf of this.app.workspace.getLeavesOfType(type)) leaf.detach(); },
    });
    this.services = { settings, modules, index, repository, references };
    for (const module of MODULES) {
      this.registerView(VIEW_TYPES[module], leaf => new ModuleView(leaf, module, () => this.active ? this.services : undefined));
      this.addCommand({ id: `open-${module}`, name: `Open ${MODULE_LABELS[module]}`,
        checkCallback: checking => {
          if (!modules.enabled(module)) return false;
          if (!checking) void modules.open(module).catch(error => { if (this.active) new Notice(`Could not open MNEMOBARD: ${messageOf(error)}`); });
          return true;
        } });
    }
    this.addSettingTab(new MnemobardSettingTab(this.app, this, settings, (id, enabled) => this.setModule(id, enabled)));
    this.app.workspace.onLayoutReady(() => {
      if (this.active && generation === this.generation) void index.start().catch(error => { if (this.active && generation === this.generation) new Notice(`MNEMOBARD indexing failed: ${messageOf(error)}`); });
    });
  }
  async setModule(id: ModuleId, enabled: boolean): Promise<void> {
    const services = this.services; if (!this.active || !services) return;
    const confirmed = await services.settings.update({ modules: { [id]: enabled } });
    if (this.active) services.modules.setEnabled(id, confirmed.modules[id]);
  }
  onunload(): void {
    this.active = false;
    this.generation++;
    const services = this.services;
    if (services) {
      services.modules.dispose(); services.repository.dispose(); services.settings.dispose();
      for (const type of Object.values(VIEW_TYPES)) for (const leaf of this.app.workspace.getLeavesOfType(type)) {
        if (leaf.view instanceof ModuleView) leaf.view.release();
      }
      services.index.dispose();
    }
    this.services = undefined;
  }
}
