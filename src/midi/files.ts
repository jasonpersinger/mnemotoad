import { checkActive, FoundationError, messageOf } from '../domain/errors';
import { vaultPath } from '../domain/paths';
import type { AssetPort } from '../storage/asset-port';
import type { VaultPort } from '../storage/vault-port';
import { MIDI_LIMITS } from './structure';
/** A derivative binary export, never an entity writer or overwrite operation. */
export class MidiFiles {
  constructor(private readonly vault: VaultPort & AssetPort) {}
  async create(path: string, bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
    vaultPath(path); checkActive(signal); if(path.split('/').some(part=>part.startsWith('.')))throw new FoundationError('invalid','Choose a visible vault folder, outside hidden configuration.'); if (!/\.mid$/i.test(path)) throw new FoundationError('invalid', 'Choose a vault-relative destination ending in.mid.');
    if (!bytes.length || bytes.length > MIDI_LIMITS.bytes) throw new FoundationError('invalid', 'MIDI output size is invalid.');
    if (this.vault.exists(path)) throw new FoundationError('conflict', 'An export already exists at this path. Choose a new filename; nothing was overwritten.', { path });
    const folder = path.split('/').slice(0, -1).join('/'), copy = Uint8Array.from(bytes).buffer;
    if (folder) await this.vault.ensureFolder(folder, () => checkActive(signal)); checkActive(signal);
    try { await this.vault.createBinary(path, copy); }
    catch (cause) { throw new FoundationError('io', `Export was not acknowledged: ${messageOf(cause)}. Inspect ${path} before retrying; a complete or partial file may exist. Nothing was deleted or overwritten.`, { path, cause }); }
    // Submitted host I/O cannot be cancelled/rolled back. Report confirmed creation even if cancellation arrived during the write.
    return path;
  }
}
