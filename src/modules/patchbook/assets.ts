import type { AssetReference, LibraryEntity } from '../../domain/entities';
import { checkActive, FoundationError, messageOf } from '../../domain/errors';
import { assetLink, assetTarget, vaultPath } from '../../domain/paths';
import type { AssetPort, VaultAsset } from '../../storage/asset-port';
import type { VaultPort } from '../../storage/vault-port';

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 250 * 1024 * 1024;
export interface ImportFile { name: string; size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> }
export type AssetStatus = { status: 'valid'; file: VaultAsset } | { status: 'missing' | 'invalid'; message: string };
export class AssetImportError extends FoundationError {
  constructor(message: string, readonly importedPath?: string, cause?: unknown) { super('io', message, { ...(importedPath ? { path: importedPath } : {}), cause }); }
}
export function assetDirectory(path: string): string {
  vaultPath(path);
  if (path.split('/').some(segment => segment.startsWith('.'))) throw new FoundationError('invalid', 'Choose a visible asset folder outside hidden vault configuration.');
  return path;
}
/** No deletion API. All associations remain ordinary portable wikilinks. */
export class PatchbookAssets {
  private closed = false;
  constructor(private readonly vault: VaultPort & AssetPort, private readonly resolveLink?: (target: string, source: string) => string | null,
    private readonly writable: () => boolean = () => true) {}
  subscribe(listener: () => void): () => void { return this.vault.subscribe(listener); }
  files(search = ''): VaultAsset[] {
    checkActive(undefined, this.closed);
    const needle = search.toLocaleLowerCase();
    return this.vault.assetFiles().filter(file => { try { vaultPath(file.path); return file.path.toLocaleLowerCase().includes(needle); } catch { return false; } }).sort((a, b) => a.path.localeCompare(b.path));
  }
  status(reference: AssetReference, source = ''): AssetStatus {
    try {
      const target = assetTarget(reference.link), resolved = this.resolveLink?.(target, source);
      const file = this.vault.fileInfo(resolved ?? target);
      return file ? { status: 'valid', file } : { status: 'missing', message: `Missing file: ${reference.link}. Select a replacement explicitly.` };
    } catch (error) { return { status: 'invalid', message: messageOf(error) }; }
  }
  reference(path: string, role: AssetReference['role']): AssetReference {
    checkActive(undefined, this.closed);
    if (!['audio', 'image', 'preset'].includes(role)) throw new FoundationError('invalid', 'Choose an asset category.');
    if (!this.vault.fileInfo(vaultPath(path))) throw new FoundationError('missing', 'The selected vault file no longer exists. Select it again.');
    return { role, link: assetLink(`[[${path}]]`) };
  }
  associate(entity: LibraryEntity, reference: AssetReference, replace?: number): LibraryEntity {
    const verified = this.status(reference);
    if (verified.status !== 'valid') throw new FoundationError(verified.status === 'missing' ? 'missing' : 'invalid', verified.message);
    const next = structuredClone(entity), refs = next.assets ?? [];
    if (replace === undefined) {
      if (!refs.some(r => r.role === reference.role && r.link === reference.link)) refs.push(structuredClone(reference));
    } else {
      if (!Number.isInteger(replace) || !refs[replace]) throw new FoundationError('invalid', 'This association changed. Select it again.');
      refs[replace] = structuredClone(reference);
    }
    next.assets = refs; return next;
  }
  remove(entity: LibraryEntity, index: number): LibraryEntity {
    const next = structuredClone(entity);
    if (!Number.isInteger(index) || !next.assets?.[index]) throw new FoundationError('invalid', 'Association no longer exists.');
    next.assets.splice(index, 1); return next;
  }
  preview(reference: AssetReference, source = ''): { path: string; url: string } {
    checkActive(undefined, this.closed);
    if (reference.role !== 'audio') throw new FoundationError('invalid', 'Select an audio association to audition.');
    const state = this.status(reference, source);
    if (state.status !== 'valid') throw new FoundationError(state.status === 'missing' ? 'missing' : 'invalid', state.message);
    if (state.file.size > MAX_PREVIEW_BYTES) throw new FoundationError('invalid', 'Preview exceeds the 250 MiB audition limit. Open the file in Obsidian instead.');
    return { path: state.file.path, url: this.vault.resource(state.file.path) };
  }
  async import(file: ImportFile, directory: string, confirmed: boolean, signal?: AbortSignal): Promise<VaultAsset> {
    checkActive(signal, this.closed);
    if (!confirmed) throw new FoundationError('cancelled', 'Import cancelled; no file was copied.');
    if (!this.writable()) throw new FoundationError('invalid', 'Settings are read-only; import is disabled.');
    const root = assetDirectory(directory);
    if (file.name.includes('/') || file.name.includes('\\')) throw new FoundationError('invalid', 'Import one file with a portable filename.');
    vaultPath(file.name);
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_IMPORT_BYTES) throw new FoundationError('invalid', 'Import requires a nonempty file no larger than 100 MiB. Larger existing vault assets may still be associated.');
    const bytes = await file.arrayBuffer(); checkActive(signal, this.closed);
    if (bytes.byteLength !== file.size) throw new FoundationError('invalid', 'The selected file changed while reading. Select it again.');
    await this.vault.ensureFolder(root, () => checkActive(signal, this.closed)); checkActive(signal, this.closed);
    let path = `${root}/${file.name}`;
    if (this.vault.exists(path)) {
      const dot = file.name.lastIndexOf('.'), stem = dot > 0 ? file.name.slice(0, dot) : file.name, suffix = dot > 0 ? file.name.slice(dot) : '';
      path = `${root}/${stem}-${crypto.randomUUID()}${suffix}`;
    }
    if (this.vault.exists(path)) throw new FoundationError('conflict', 'Import destination is occupied. Choose another destination.');
    try {
      checkActive(signal, this.closed);
      await this.vault.createBinary(path, bytes);
      checkActive(signal, this.closed);
      const copied = this.vault.fileInfo(path);
      if (!copied || copied.size !== bytes.byteLength) throw new Error('Copied file metadata could not be confirmed');
      return copied;
    } catch (cause) {
      throw new AssetImportError(`Import did not confirm association. A complete or partial copy may remain at ${path}. Inspect it before retrying. The original file is unchanged. ${messageOf(cause)}`, path, cause);
    }
  }
  dispose(): void { this.closed = true; }
}
