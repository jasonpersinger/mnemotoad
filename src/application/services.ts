import type { SettingsService } from './settings';
import type { ModuleController } from './modules';
import type { EntityIndex } from '../storage/index';
import type { EntityRepository } from '../storage/repository';
import type { ReferenceResolver } from '../storage/references';
import type { PatchbookLibrary } from '../modules/patchbook/library';
export interface FoundationServices {
  settings: SettingsService; modules: ModuleController; index: EntityIndex;
  repository: EntityRepository; references: ReferenceResolver; patchbook: PatchbookLibrary;
}
