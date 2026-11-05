export type VaultChange = { type: 'create' | 'modify' | 'delete' | 'rename'; path: string; oldPath?: string; folder?: boolean };
/** process must run the callback synchronously at the host's per-file mutation boundary. */
export interface VaultPort {
  markdownPaths(): string[];
  exists(path: string): boolean;
  read(path: string): Promise<string>;
  create(path: string, text: string): Promise<void>;
  process(path: string, update: (current: string) => string): Promise<string>;
  ensureFolder(path: string, checkActive?: () => void): Promise<void>;
  subscribe(listener: (change: VaultChange) => void): () => void;
}
