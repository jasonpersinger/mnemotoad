// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import { CanvasLibrary } from '../src/modules/canvas/library';
import type { FoundationServices } from '../src/application/services';
import { NavigationCoordinator } from '../src/application/navigation';
import { SettingsService } from '../src/application/settings';
import { ModuleController } from '../src/application/modules';
import { DocumentSession } from '../src/application/document-session';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { ReferenceResolver } from '../src/storage/references';
import { PatchbookLibrary } from '../src/modules/patchbook/library';
import { PatchbookAssets } from '../src/modules/patchbook/assets';
import { AudioPreview } from '../src/modules/patchbook/preview';
import { PatchbookRecovery } from '../src/modules/patchbook/recovery';
import { MotifLibrary } from '../src/modules/motif/library';
import { MotifView } from '../src/modules/motif/view';
import { MusicalTransport } from '../src/music/transport';
import { createEntity, type Motif } from '../src/domain/entities';
import { createEntityDocument, updateEntityDocument, parseEntityDocument } from '../src/storage/document';
import { MemoryVault } from './support/memory-vault';
import { installDomHelpers } from './support/obsidian';

/** 4G large-MOTIF responsiveness: the caches added for speed must never show stale notes, lose events or skip validation. */
const closers: (() => void)[] = [];
beforeEach(() => { installDomHelpers(); Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null }); });
afterEach(() => { for (const close of closers.splice(0)) close(); document.body.replaceChildren(); });
async function fixture() {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index), settings = new SettingsService({ load: async () => null, save: async () => {} }); await settings.load();
  const services: FoundationServices = { navigation: new NavigationCoordinator(), settings, index, repository, modules: new ModuleController(settings.current.modules, { open: async () => {}, close: () => {} }), references: new ReferenceResolver(index, path => vault.exists(path)), patchbook: new PatchbookLibrary(index, repository), assets: new PatchbookAssets(vault), preview: new AudioPreview(), recovery: new PatchbookRecovery(vault, index, repository), canvas: new CanvasLibrary(index, repository, vault), motifs: new MotifLibrary(index, repository, vault), musical: new MusicalTransport() };
  const view = new MotifView({} as WorkspaceLeaf, () => services); document.body.append(view.contentEl);
  closers.push(() => { view.release(); services.canvas.dispose(); services.motifs.dispose(); services.musical.dispose(); services.patchbook.dispose(); repository.dispose(); index.dispose(); settings.dispose(); });
  await view.onOpen(); return { view, services, vault, repository, index };
}
const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };
const click = (root: HTMLElement, text: string) => { const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent === text && !x.disabled); if (!b) throw Error('Missing button ' + text); b.click(); };
function large(count: number, title = 'Large phrase'): Motif {
  const m = createEntity('motif', title); m.data.ppq = 960; m.data.lengthTicks = Math.ceil(count * 240 / 3840) * 3840;
  // Deliberately not in musical order, with simultaneous notes (polyphony) every 4th position.
  m.data.notes = Array.from({ length: count }, (_, i) => ({ id: `n${String(i).padStart(5, '0')}`, pitch: 36 + (i * 7) % 48, startTick: (count - 1 - i) * 240 - (i % 4 === 0 && i ? 240 : 0), durationTicks: 200, velocity: 1 + i % 127 }));
  return m;
}
const register = (view: MotifView) => view.contentEl.querySelector('.mnemobard-note-inspector-heading span')?.textContent;

it('keeps the register, selection and note navigation exact across delete, undo, redo and save of a 2,000-note motif', async () => {
  const { view, repository } = await fixture(), motif = large(2000);
  const created = await repository.create(motif); await view.setState({ selectedId: created.entity.id }); await settle();
  expect(register(view)).toBe('2000 notes / 0 selected');
  click(view.contentEl, 'Next note'); // first in musical order (start tick, then pitch)
  const ordered = motif.data.notes.slice().sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch), first = ordered[0];
  const live = (view as unknown as { session: import('../src/modules/motif/session').MotifSession }).session;
  expect([...live.selected]).toEqual([first?.id]);
  click(view.contentEl, 'Delete selected');
  expect(register(view)).toBe('1999 notes / 0 selected');
  expect(live.draft.data.notes.some(n => n.id === first?.id)).toBe(false);
  live.select([first?.id ?? '']); expect(live.selected.size).toBe(0); // a deleted id can no longer be selected (cache rebuilt per version)
  click(view.contentEl, 'Undo');
  expect(register(view)).toBe('2000 notes / 0 selected');
  expect(live.draft.data.notes.find(n => n.id === first?.id)).toEqual(first);
  live.select([first?.id ?? '']); expect([...live.selected]).toEqual([first?.id]);
  click(view.contentEl, 'Next note'); expect([...live.selected]).toEqual([ordered[1]?.id]); // order cache follows the restored draft
  click(view.contentEl, 'Redo'); expect(register(view)).toBe('1999 notes / 1 selected'); // ordered[1] survives the redone deletion
  click(view.contentEl, 'Undo');
  click(view.contentEl, 'Save motif'); await vi.waitFor(() => expect(view.contentEl.querySelector('.mnemobard-save-status')?.textContent).toBe('Saved'));
  const saved = (await repository.read(created.entity.id)).entity as Motif;
  expect(saved.data.notes).toEqual(motif.data.notes); // no event lost, reordered, quantized or altered
});

it('changes the selection without cloning the draft once the register order is cached', async () => {
  const { view, repository } = await fixture(), created = await repository.create(large(3000));
  await view.setState({ selectedId: created.entity.id }); await settle();
  const buttons = () => view.contentEl.querySelectorAll<HTMLButtonElement>('[data-note-id]');
  buttons()[0]?.click(); // warm the order cache used for reveal
  const reads = vi.spyOn(DocumentSession.prototype, 'draft', 'get');
  buttons()[1]?.click(); buttons()[2]?.click();
  expect(reads).not.toHaveBeenCalled();
  const live = (view as unknown as { session: import('../src/modules/motif/session').MotifSession }).session;
  expect([...live.selected]).toEqual([buttons()[2]?.dataset.noteId]);
  expect([...buttons()].find(b => b.dataset.noteId === buttons()[2]?.dataset.noteId)?.getAttribute('aria-pressed')).toBe('true');
});

it('lists motifs from index scalars with the same rows and ambiguity as the cloning items()', async () => {
  const { services, repository, vault, index } = await fixture();
  const a = await repository.create(large(10, 'Beta')), b = await repository.create(large(10, 'alpha'));
  await vault.create('MNEMOBARD/Motifs/copy.md', a.source); await index.refresh('MNEMOBARD/Motifs/copy.md');
  const rows = services.motifs.listing(), items = services.motifs.items();
  expect(rows.map(r => [r.path, r.id, r.title, r.ambiguous])).toEqual(items.map(i => [i.path, i.entity.id, i.entity.title, i.ambiguous]));
  expect(rows.filter(r => r.ambiguous)).toHaveLength(2);
  expect(services.motifs.listing('ALPHA').map(r => r.id)).toEqual([b.entity.id]);
  // locate() classifies exactly like resolve(), without an entity copy.
  for (const id of [a.entity.id, b.entity.id, crypto.randomUUID()]) { const resolved: Record<string, unknown> = { ...index.resolve(id) }; delete resolved.entity; expect(index.locate(id)).toEqual(resolved); }
  expect('entity' in index.locate(b.entity.id)).toBe(false);
});

it('retains per-note extension fields by id when notes are reordered or removed (O(n) lookup, first match wins)', () => {
  const m = large(500), source = createEntityDocument(m).replace('"id": "n00007"', '"id": "n00007",\n      "x_marker": "keep"');
  const parse = (text: string): Motif => { const doc = parseEntityDocument(text); if (doc?.entity.kind !== 'motif') throw Error('motif expected'); return doc.entity; };
  const parsed = parse(source), next = structuredClone(parsed);
  next.data.notes = next.data.notes.slice().reverse().filter(n => n.id !== 'n00003');
  const updated = parse(updateEntityDocument(source, source, next));
  expect(updated.data.notes).toHaveLength(499);
  expect((updated.data.notes.find(n => n.id === 'n00007') as Record<string, unknown>).x_marker).toBe('keep');
  expect(updated.data.notes.filter(n => 'x_marker' in n)).toHaveLength(1);
});
