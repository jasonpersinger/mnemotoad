import type { FoundationServices } from '../../application/services';
import type { LibraryEntity } from '../../domain/entities';
import type { LibrarySession } from './session';
import { RecoveryInspector } from '../../ui/recovery-inspector';
export class RecoveryPanel extends RecoveryInspector<LibraryEntity, LibrarySession> {
  constructor(root: HTMLElement, services: FoundationServices, loaded: (session: LibrarySession) => void, open: (path: string) => void) {
    super(root, { recovery: services.recovery, settings: services.settings, recover: value => services.patchbook.recover(value) }, loaded, open);
  }
}
