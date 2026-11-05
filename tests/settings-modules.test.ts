import { it, expect, vi } from 'vitest';
import { SettingsService, parseSettings, defaultSettings } from '../src/application/settings';
import { ModuleController } from '../src/application/modules';
import { deferred } from './support/memory-vault';

it('loads/saves module settings, preserving unknown fields and serializing simultaneous updates', async () => {
  const saved: unknown[] = [], port = { load: async () => ({ schemaVersion: 1, custom: 'keep', modules: { future: true } }), save: async (s: unknown) => { saved.push(s); } };
  const service = new SettingsService(port); await service.load();
  await Promise.all([service.update({ modules: { patchbook: false } }), service.update({ modules: { motif: false } })]);
  expect(service.current.modules).toEqual({ patchbook: false, motif: false, canvas: true, future: true });
  expect(service.current.custom).toBe('keep'); expect(saved).toHaveLength(2); service.dispose();
});
it.each([{ schemaVersion: 2 }, { modules: { motif: 'yes' } }, { creationRoot: '../private' }, { creationRoot: '.obsidian' }, []])('retains invalid/future settings %j read-only', async raw => {
  const save = vi.fn(), service = new SettingsService({ load: async () => raw, save }); await service.load();
  expect(service.readOnly).toBe(true); await expect(service.update({ modules: { motif: false } })).rejects.toThrow(); expect(save).not.toHaveBeenCalled();
});
it('reports settings write failures and retains confirmed preferences', async () => {
  const service = new SettingsService({ load: async () => null, save: async () => { throw Error('Disk full'); } }); await service.load();
  await expect(service.update({ modules: { canvas: false } })).rejects.toThrow('Disk full'); expect(service.current.modules.canvas).toBe(true);
});
it('does not accept late load completion or submit queued writes after disposal', async () => {
  const wait = deferred<unknown>(), save = vi.fn(), service = new SettingsService({ load: () => wait.promise, save });
  const loading = service.load(); service.dispose(); wait.resolve({}); await expect(loading).rejects.toMatchObject({ code: 'disposed' });
  await expect(service.update({ modules: { motif: false } })).rejects.toMatchObject({ code: 'disposed' }); expect(save).not.toHaveBeenCalled();
});
it('deduplicates concurrent module opens, blocks disabled commands and never closes leaves on unload', async () => {
  const wait = deferred(), open = vi.fn(async () => { await wait.promise; }), close = vi.fn();
  const controller = new ModuleController(defaultSettings().modules, { open, close });
  const a = controller.open('motif'), b = controller.open('motif'); expect(a).toBe(b); expect(open).toHaveBeenCalledTimes(1);
  controller.setEnabled('motif', false); expect(close).toHaveBeenCalledWith('mnemobard-motif');
  await expect(controller.open('motif')).rejects.toThrow(/disabled/); wait.resolve(); await a;
  close.mockClear(); controller.dispose(); expect(close).not.toHaveBeenCalled(); expect(controller.enabled('patchbook')).toBe(false);
});
it('invalidates the guard on an open awaiting the host', async () => {
  const wait = deferred(); let valid = () => true;
  const controller = new ModuleController(defaultSettings().modules, { open: async (_type, guard) => { valid=guard; await wait.promise; }, close: () => {} });
  const opening=controller.open('canvas'); expect(valid()).toBe(true); controller.dispose(); expect(valid()).toBe(false); wait.resolve(); await opening;
});
it('provides fresh defaults without sharing mutable settings', () => {
  const a = parseSettings(null); a.modules.motif=false; expect(defaultSettings().modules.motif).toBe(true);
});
