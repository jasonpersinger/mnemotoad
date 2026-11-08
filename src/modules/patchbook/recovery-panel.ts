import type { FoundationServices } from '../../application/services';
import type { LibraryEntity } from '../../domain/entities';
import type { LibrarySession } from './session';
import { RecoveryInspector, recoveryLinks } from '../../ui/recovery-inspector';
import type { RecoveryModule } from '../../storage/recovery-catalog';
export class RecoveryPanel extends RecoveryInspector<LibraryEntity, LibrarySession> {
  constructor(root: HTMLElement, services: FoundationServices, loaded: (session: LibrarySession) => void, open: (path: string) => void, initialPath?: string, openIn?: (module: RecoveryModule, path: string) => Promise<void>, fail: (error: unknown) => void = () => {}) {
    super(root, { recovery: services.recovery, settings: services.settings, recover: value => services.patchbook.recover(value), module: 'PATCHBOOK', unsaved: id => services.patchbook.getDrafts().some(d => d.snapshot.id.toLowerCase() === id.toLowerCase()),
      ...(openIn ? recoveryLinks(services, openIn, fail) : {}) }, loaded, open, initialPath);
  }
}
