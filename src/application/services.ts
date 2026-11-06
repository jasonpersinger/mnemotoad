import type { SettingsService } from './settings';
import type { ModuleController } from './modules';
import type { EntityIndex } from '../storage/index';
import type { EntityRepository } from '../storage/repository';
import type { ReferenceResolver } from '../storage/references';
import type { PatchbookLibrary } from '../modules/patchbook/library';
import type { PatchbookAssets } from '../modules/patchbook/assets';
import type { AudioPreview } from '../modules/patchbook/preview';
import type { PatchbookRecovery } from '../modules/patchbook/recovery';
import type { MotifLibrary } from '../modules/motif/library';
import type { MusicalTransport } from '../music/transport';
import type { CanvasLibrary } from '../modules/canvas/library';
export interface FoundationServices {
  settings: SettingsService; modules: ModuleController; index: EntityIndex;
  repository: EntityRepository; references: ReferenceResolver; patchbook: PatchbookLibrary;
  motifs: MotifLibrary; canvas: CanvasLibrary; musical: MusicalTransport;
  assets: PatchbookAssets; preview: AudioPreview; recovery: PatchbookRecovery;
}
