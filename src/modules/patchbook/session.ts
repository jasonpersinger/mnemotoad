import { isLibraryEntity, type LibraryEntity } from '../../domain/entities';
import type { EntityRecord } from '../../storage/repository';
import { DocumentSession, type DocumentSessionPort } from '../../application/document-session';
export type SessionPort = DocumentSessionPort<LibraryEntity>;
/** PATCHBOOK keeps its established session contract over the shared implementation. */
export class LibrarySession extends DocumentSession<LibraryEntity> {
  constructor(draft: LibraryEntity, base: EntityRecord | undefined, port: SessionPort, checkpointDelay = 500) {
    super(draft, base, port, checkpointDelay, isLibraryEntity);
  }
}
