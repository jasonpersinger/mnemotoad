import type { VaultPort, VaultChange } from '../../src/storage/vault-port';
import type { AssetPort, VaultAsset } from '../../src/storage/asset-port';
export class MemoryVault implements VaultPort, AssetPort {
  binaries = new Map<string, ArrayBuffer>();
  failBinary?: 'before' | 'after';
  assetFiles(): VaultAsset[] {
    return [...new Set([...this.files.keys(), ...this.binaries.keys()])].map(path => ({ path, name: path.split('/').at(-1) ?? path, extension: path.split('.').at(-1) ?? '', size: this.binaries.get(path)?.byteLength ?? new TextEncoder().encode(this.files.get(path) ?? '').byteLength, modified: 1 }));
  }
  fileInfo(path: string): VaultAsset | undefined { return this.assetFiles().find(file => file.path === path); }
  resource(path: string): string { return `app://local/${path}`; }
  async createBinary(path: string, bytes: ArrayBuffer): Promise<void> {
    if (this.exists(path) || this.failBinary === 'before') throw Error('Binary creation failed');
    this.binaries.set(path, bytes.slice(0)); this.emit({ type: 'create', path });
    if (this.failBinary === 'after') throw Error('Binary completion unknown');
  }
  files = new Map<string, string>();
  folders = new Set<string>();
  listeners = new Set<(change: VaultChange) => void>();
  reads: string[] = [];
  failCreate?: (path: string) => boolean;
  beforeProcess?: (path: string) => void;
  failProcess?: 'before' | 'after';
  delayRead?: (path: string) => Promise<void>;
  private queues = new Map<string, Promise<unknown>>();
  markdownPaths(): string[] { return [...this.files.keys()].filter(p => p.endsWith('.md')); }
  exists(path: string): boolean { return this.files.has(path) || this.binaries.has(path) || this.folders.has(path); }
  async read(path: string): Promise<string> {
    this.reads.push(path); const text = this.files.get(path); if (text === undefined) throw Error('File missing');
    await this.delayRead?.(path); return text;
  }
  async create(path: string, source: string): Promise<void> {
    if (this.exists(path)) throw Error('File exists');
    if (this.failCreate?.(path)) throw Error('Injected creation failure');
    this.files.set(path, source); this.emit({ type: 'create', path });
  }
  process(path: string, change: (source: string) => string): Promise<string> {
    const prior = this.queues.get(path) ?? Promise.resolve();
    const op = prior.catch(() => {}).then(() => {
      this.beforeProcess?.(path);
      if (this.failProcess === 'before') throw Error('Injected write failure before commit');
      const source = this.files.get(path); if (source === undefined) throw Error('File missing');
      const next = change(source); this.files.set(path, next); this.emit({ type: 'modify', path });
      if (this.failProcess === 'after') throw Error('Injected write failure after commit');
      return next;
    });
    this.queues.set(path, op); return op;
  }
  async ensureFolder(path: string, checkActive: () => void = () => {}): Promise<void> { checkActive(); this.folders.add(path); }
  subscribe(listener: (change: VaultChange) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  emit(change: VaultChange): void { for (const listener of this.listeners) listener(change); }
  modify(path: string, source: string): void { this.files.set(path, source); this.emit({ type: 'modify', path }); }
  rename(path: string, next: string): void {
    const source = this.files.get(path); if (source === undefined) throw Error();
    this.files.delete(path); this.files.set(next, source); this.emit({ type: 'rename', path: next, oldPath: path });
  }
}
export function deferred<T = void>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => { throw Error('Uninitialized deferred'); };
  const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve };
}
