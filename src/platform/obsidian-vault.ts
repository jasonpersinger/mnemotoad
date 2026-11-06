import { TFile, TFolder, normalizePath, type Vault } from 'obsidian';
import { FoundationError } from '../domain/errors';
import { vaultPath } from '../domain/paths';
import type { VaultPort, VaultChange } from '../storage/vault-port';
import type { AssetPort, VaultAsset } from '../storage/asset-port';

/** The only runtime vault writer; uses supported public APIs, never node:fs. */
export class ObsidianVaultPort implements VaultPort, AssetPort {
  constructor(private readonly vault: Vault) {}
  markdownPaths(): string[] { return this.vault.getMarkdownFiles().map(f => f.path); }
  private info(file: TFile): VaultAsset { return { path: file.path, name: file.name, extension: file.extension, size: file.stat.size, modified: file.stat.mtime }; }
  assetFiles(): VaultAsset[] { return this.vault.getFiles().map(file => this.info(file)); }
  fileInfo(path: string): VaultAsset | undefined {
    const file = this.vault.getAbstractFileByPath(normalizePath(vaultPath(path)));
    return file instanceof TFile ? this.info(file) : undefined;
  }
  resource(path: string): string { return this.vault.getResourcePath(this.file(path)); }
  async createBinary(path: string, bytes: ArrayBuffer): Promise<void> { await this.vault.createBinary(normalizePath(vaultPath(path)), bytes); }
  exists(path: string): boolean { return this.vault.getAbstractFileByPath(normalizePath(vaultPath(path))) !== null; }
  private file(path: string): TFile {
    const file = this.vault.getAbstractFileByPath(normalizePath(vaultPath(path)));
    if (!(file instanceof TFile)) throw new FoundationError('missing', `Vault file missing: ${path}`, { path });
    return file;
  }
  read(path: string): Promise<string> { return this.vault.read(this.file(path)); }
  async create(path: string, source: string): Promise<void> { await this.vault.create(normalizePath(vaultPath(path)), source); }
  process(path: string, transform: (current: string) => string): Promise<string> { return this.vault.process(this.file(path), transform); }
  async ensureFolder(path: string, checkActive: () => void = () => {}): Promise<void> {
    const segments = vaultPath(path).split('/'); let prefix = '';
    for (const segment of segments) {
      checkActive();
      prefix = prefix ? `${prefix}/${segment}` : segment;
      const found = this.vault.getAbstractFileByPath(prefix);
      if (found && !(found instanceof TFolder)) throw new FoundationError('invalid', `A file occupies folder ${prefix}.`);
      if (!found) {
        try { await this.vault.createFolder(prefix); }
        catch (cause) { if (!(this.vault.getAbstractFileByPath(prefix) instanceof TFolder)) throw cause; }
      }
    }
  }
  subscribe(listener: (change: VaultChange) => void): () => void {
    const refs = [
      this.vault.on('create', file => listener({ type: 'create', path: file.path, folder: file instanceof TFolder })),
      this.vault.on('modify', file => listener({ type: 'modify', path: file.path })),
      this.vault.on('delete', file => listener({ type: 'delete', path: file.path, folder: file instanceof TFolder })),
      this.vault.on('rename', (file, oldPath) => listener({ type: 'rename', path: file.path, oldPath, folder: file instanceof TFolder })),
    ];
    return () => { for (const ref of refs) this.vault.offref(ref); };
  }
}
