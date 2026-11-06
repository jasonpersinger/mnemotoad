/** Host-independent file metadata; resource URLs are transient, never serialized. */
export interface VaultAsset { path: string; name: string; extension: string; size: number; modified: number }
export interface AssetPort {
  assetFiles(): VaultAsset[];
  fileInfo(path: string): VaultAsset | undefined;
  resource(path: string): string;
  createBinary(path: string, bytes: ArrayBuffer): Promise<void>;
}
