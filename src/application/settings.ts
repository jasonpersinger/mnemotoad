import { FoundationError, checkActive } from '../domain/errors';
import { vaultPath } from '../domain/paths';

export const MODULES = ['patchbook', 'motif', 'canvas'] as const;
export type ModuleId = typeof MODULES[number];
export interface Settings extends Record<string, unknown> {
  schemaVersion: 1;
  creationRoot: string;
  modules: Record<ModuleId, boolean> & Record<string, unknown>;
}
export interface SettingsPort { load(): Promise<unknown>; save(value: Settings): Promise<void> }
export function defaultSettings(): Settings { return { schemaVersion: 1, creationRoot: 'MNEMOBARD', modules: { patchbook: true, motif: true, canvas: true } }; }
export function parseSettings(raw: unknown): Settings {
  if (raw === null || raw === undefined) return defaultSettings();
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new FoundationError('invalid', 'Settings are malformed; the original settings were retained.');
  const input = raw as Record<string, unknown>;
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) throw new FoundationError('unsupported-schema', 'Newer settings version: module preferences are read-only. No downgrade was performed.');
  const root = input.creationRoot ?? 'MNEMOBARD';
  if (typeof root !== 'string') throw new FoundationError('invalid', 'Settings creation folder must be text.');
  vaultPath(root);
  if (root.split('/').some(s => s.startsWith('.'))) throw new FoundationError('invalid', 'Choose a visible content folder, outside hidden Obsidian configuration.');
  const modules = input.modules ?? {};
  if (!modules || typeof modules !== 'object' || Array.isArray(modules)) throw new FoundationError('invalid', 'Module preferences must be an object.');
  const values = modules as Record<string, unknown>;
  for (const id of MODULES) if (values[id] !== undefined && typeof values[id] !== 'boolean') throw new FoundationError('invalid', `${id} must be enabled or disabled.`);
  return { ...structuredClone(input), schemaVersion: 1, creationRoot: root,
    modules: { ...defaultSettings().modules, ...values } as Settings['modules'] };
}

export class SettingsService {
  private value = defaultSettings();
  private closed = false;
  private tail: Promise<unknown> = Promise.resolve();
  readOnly = false;
  diagnostic?: FoundationError;
  constructor(private readonly port: SettingsPort) {}
  get current(): Settings { return structuredClone(this.value); }
  async load(): Promise<void> {
    checkActive(undefined, this.closed);
    const raw = await this.port.load(); checkActive(undefined, this.closed);
    try { this.value = parseSettings(raw); }
    catch (error) {
      if (!(error instanceof FoundationError)) throw error;
      this.readOnly = true; this.diagnostic = error;
      // Do not write defaults over malformed/future data. No data writers are
      // exposed by views; the plugin also blocks repository use in this mode.
    }
  }
  update(change: { creationRoot?: string; modules?: Partial<Record<ModuleId, boolean>> }): Promise<Settings> {
    const frozen = structuredClone(change);
    const operation = this.tail.catch(() => {}).then(async () => {
      checkActive(undefined, this.closed);
      if (this.readOnly) throw this.diagnostic ?? new FoundationError('unsupported-schema', 'Settings are read-only.');
      const next = parseSettings({ ...this.value, ...frozen, modules: { ...this.value.modules, ...frozen.modules } });
      await this.port.save(next); checkActive(undefined, this.closed);
      this.value = next; return this.current;
    });
    this.tail = operation; return operation;
  }
  dispose(): void { this.closed = true; }
}
