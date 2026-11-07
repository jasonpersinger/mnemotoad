import type { App } from 'obsidian';
import type { FoundationServices } from '../application/services';
import type { ModuleId } from '../application/settings';
import { VIEW_TYPES } from '../application/modules';
import type { NavigationOutcome } from '../application/navigation';

/** 4F: one place that builds verified-navigation steps for any target module (the coordinator checks the view is a NavigationTarget). */
export function navigateTo(app: App, services: FoundationServices, from: ModuleId, to: ModuleId, id: string, focus?: string): Promise<NavigationOutcome> {
  return services.navigation.navigate(from, to, id, {
    enabled: () => services.modules.enabled(to), open: () => services.modules.open(to),
    view: async () => { const leaf = app.workspace.getLeavesOfType(VIEW_TYPES[to])[0]; await leaf?.loadIfDeferred(); return leaf?.view; },
  }, focus);
}
