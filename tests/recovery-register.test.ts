// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createEntity, type Composition, type Entity, type Motif } from '../src/domain/entities';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { RecoveryCatalog, queryCatalog, type CatalogEntry } from '../src/storage/recovery-catalog';
import { MotifLibrary } from '../src/modules/motif/library';
import { CanvasLibrary } from '../src/modules/canvas/library';
import { PatchbookRecovery } from '../src/modules/patchbook/recovery';
import { RecoveryInspector } from '../src/ui/recovery-inspector';
import { installDomHelpers } from './support/obsidian';
import { MemoryVault } from './support/memory-vault';

/** Milestone 4I recovery register: catalog, query, register UI and read-only inspector (§4–§9, §18.1). */
const closers: (() => void)[] = []; afterEach(() => { for (const close of closers.splice(0)) close(); document.body.replaceChildren(); });
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); };
const uid = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
async function fixture() {
  installDomHelpers();
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index);
  const motifs = new MotifLibrary(index, repository, vault), canvas = new CanvasLibrary(index, repository, vault), patchbook = new PatchbookRecovery(vault, index, repository);
  closers.push(() => { motifs.dispose(); canvas.dispose(); patchbook.dispose(); repository.dispose(); index.dispose(); });
  await index.start(); return { vault, index, repository, motifs, canvas, patchbook };
}
/** A synthetic but valid editor-draft envelope written straight into a documented Recovery folder. */
function envelope(vault: MemoryVault, entityId: string, checkpoint: string, savedAt: string, draft: Partial<Entity> & { kind: Entity['kind'] }, extra: Record<string, unknown> = {}): string {
  const path = `MNEMOBARD/Recovery/${entityId}/${checkpoint}.json`;
  vault.files.set(path, JSON.stringify({ format: 'mnemobard-editor-draft', schemaVersion: 1, entityId, sourcePath: null, savedAt, originalSource: null, draft: { id: entityId, schemaVersion: 1, extra: {}, ...draft }, candidateSource: null, ...extra })); return path;
}
function register(f: Awaited<ReturnType<typeof fixture>>, module: 'MOTIF' | 'CANVAS' | 'PATCHBOOK' = 'MOTIF', options: { unsaved?: (id: string) => boolean; initialPath?: string } = {}) {
  const root = document.createElement('section'); document.body.append(root); const opened: { module: string; path: string }[] = [], loaded: unknown[] = [];
  const own = module === 'MOTIF' ? f.motifs : module === 'CANVAS' ? f.canvas : undefined;
  const services = { recovery: (own?.recovery ?? f.patchbook) as never, settings: { readOnly: false }, recover: (value: never) => { loaded.push(value); return value; }, module,
    others: { MOTIF: f.motifs.recovery, CANVAS: f.canvas.recovery, PATCHBOOK: f.patchbook } as never, openIn: (m: string, path: string) => { opened.push({ module: m, path }); }, unsaved: options.unsaved } as never;
  const panel = new RecoveryInspector(root, services, () => {}, () => {}, options.initialPath); closers.push(() => panel.dispose());
  return { root, panel, opened, loaded };
}
const rows = (root: HTMLElement): HTMLButtonElement[] => [...root.querySelectorAll<HTMLButtonElement>('button.mnemobard-recovery-row')];
const press = (root: HTMLElement, text: string): void => { const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent === text && !x.disabled); if (!b) throw Error('Missing ' + text); b.click(); };
const control = <E extends HTMLElement>(root: HTMLElement, label: string): E => { const e = root.querySelector<E>(`[aria-label="${label}"]`); if (!e) throw Error(label); return e; };
const set = (root: HTMLElement, label: string, value: string): void => { const e = control<HTMLInputElement | HTMLSelectElement>(root, label); e.value = value; e.dispatchEvent(new Event(e instanceof HTMLSelectElement || e.type === 'date' ? 'change' : 'input', { bubbles: true })); };
const facts = (root: HTMLElement, sel: string): Record<string, string> => Object.fromEntries([...root.querySelectorAll(`${sel} dt`)].map(dt => [dt.textContent ?? '', dt.nextElementSibling?.textContent ?? '']));

describe('4I catalog and query', () => {
  it('lists every checkpoint without reading any file and resolves names from the index', async () => {
    const f = await fixture(), saved = await f.repository.create(createEntity('motif', 'Night line'));
    await f.repository.saveEditorDraft({ ...saved.entity, title: 'Night line (draft)' }, saved);
    for (let i = 0; i < 40; i++) envelope(f.vault, uid(500 + i), `c${i}`, `2026-11-0${1 + (i % 7)}T10:00:00.000Z`, { kind: 'motif', title: `Synthetic ${i}` });
    const reads = f.vault.reads.length, entries = new RecoveryCatalog(f.vault, f.index).list();
    expect(entries).toHaveLength(41); expect(f.vault.reads.length).toBe(reads);
    const known = entries.find(e => e.folderId === saved.entity.id); expect(known).toMatchObject({ documentTitle: 'Night line', documentKind: 'motif', availability: 'ready', documentPath: saved.path });
    expect(entries.find(e => e.folderId === uid(500))?.availability).toBe('missing');
  });
  it('classifies real checkpoint types and every integrity condition without repairing anything', async () => {
    const f = await fixture(), saved = await f.repository.create(createEntity('patch', 'Glass pad')), catalog = new RecoveryCatalog(f.vault, f.index);
    const draft = await f.repository.saveEditorDraft({ ...saved.entity, title: 'Glass pad v2' }, saved), fresh = await f.repository.saveEditorDraft(createEntity('motif', 'Brand new'));
    const copy = await f.repository.saveDraftCopy(saved, { ...saved.entity, title: 'Copy' });
    const dir = `MNEMOBARD/Recovery/${uid(9)}`, files: Record<string, string> = {
      malformed: '{ not json', unsupported: JSON.stringify({ format: 'mnemobard-recovery', schemaVersion: 7, entityId: uid(9), savedAt: '2026-01-01T00:00:00Z', draft: {} }),
      foreign: JSON.stringify({ format: 'somebody-else', schemaVersion: 1 }), incomplete: JSON.stringify({ format: 'mnemobard-editor-draft', schemaVersion: 1, entityId: 'nope', savedAt: 'x', draft: null, originalSource: null }),
      before: JSON.stringify({ format: 'mnemobard-recovery', schemaVersion: 1, entityId: uid(9), savedAt: '2026-01-01T00:00:00Z', reason: 'before-save', originalSource: 'x', draft: { id: uid(9), kind: 'motif', title: 'Pre' } }),
      odd: JSON.stringify({ format: 'mnemobard-recovery', schemaVersion: 1, entityId: uid(9), savedAt: '2026-01-01T00:00:00Z', reason: 'mystery', originalSource: 'x', draft: { id: uid(9), kind: 'motif', title: 'Odd' } }),
    };
    for (const [name, text] of Object.entries(files)) f.vault.files.set(`${dir}/${name}.json`, text);
    const before = new Map(f.vault.files), entries = catalog.list(), byPath = (p: string): CatalogEntry => { const e = entries.find(x => x.path === p); if (!e) throw Error(p); return e; };
    const kind = async (p: string): Promise<[string, string]> => { const d = await catalog.details(byPath(p)); return [d.type, d.integrity]; };
    expect(await kind(draft)).toEqual(['Unsaved draft of a saved record', 'Readable']); expect(await kind(fresh)).toEqual(['Unsaved draft of a new record', 'Readable']);
    expect(await kind(copy)).toEqual(['Recovery copy', 'Readable']); expect(await kind(`${dir}/before.json`)).toEqual(['Pre-save backup', 'Readable']);
    expect(await kind(`${dir}/odd.json`)).toEqual(['Unknown', 'Readable']); expect(await kind(`${dir}/malformed.json`)).toEqual(['Unknown', 'Malformed']);
    expect(await kind(`${dir}/unsupported.json`)).toEqual(['Unknown', 'Unsupported schema']); expect(await kind(`${dir}/foreign.json`)).toEqual(['Unknown', 'Unrecognized format']);
    expect(await kind(`${dir}/incomplete.json`)).toEqual(['Unsaved draft of a new record', 'Malformed']);
    const huge = { ...byPath(draft), path: `${dir}/huge.json`, size: 25 * 1024 * 1024 }; expect((await catalog.details(huge)).integrity).toBe('Too large to inspect');
    const gone = { ...byPath(draft), path: `${dir}/vanished.json`, size: 10 }; expect((await catalog.details(gone)).integrity).toBe('Unreadable');
    expect(new Map(f.vault.files)).toEqual(before); // read-only
    const reads = f.vault.reads.length; await catalog.details(byPath(draft)); expect(f.vault.reads.length).toBe(reads); // cached by size + modified time
  });
  it('searches case-insensitively by name, UUID, checkpoint id, path and date; filters; sorts deterministically; paginates fully', async () => {
    const f = await fixture(), catalog = new RecoveryCatalog(f.vault, f.index);
    for (let i = 0; i < 30; i++) envelope(f.vault, uid(100 + (i % 3)), `cp-${String(i).padStart(2, '0')}`, `2026-10-${String(10 + (i % 5)).padStart(2, '0')}T08:00:00.000Z`, { kind: i % 3 === 2 ? 'composition' : 'motif', title: i % 3 === 0 ? 'Ascending CHOIR' : `Other ${i % 3}` });
    const entries = catalog.list(); for (const e of entries) await catalog.details(e);
    expect(queryCatalog(entries, { search: 'choir' }).total).toBe(10); expect(queryCatalog(entries, { search: 'ascending choir' }).total).toBe(10);
    expect(queryCatalog(entries, { search: uid(101).toUpperCase() }).total).toBe(10); expect(queryCatalog(entries, { search: 'cp-07' }).total).toBe(1);
    expect(queryCatalog(entries, { search: `recovery/${uid(102)}` }).total).toBe(10); expect(queryCatalog(entries, { search: '2026-10-12' }).total).toBe(6);
    expect(queryCatalog(entries, { module: 'CANVAS' }).total).toBe(10); expect(queryCatalog(entries, { type: 'Unsaved draft of a new record' }).total).toBe(30);
    expect(queryCatalog(entries, { from: '2026-10-11', to: '2026-10-12' }).total).toBe(12); expect(queryCatalog(entries, { document: uid(100) }).total).toBe(10);
    // Duplicate timestamps: ties broken by path, stable across calls; oldest is the exact reverse order of time.
    const newest = queryCatalog(entries, { pageSize: 100 }).rows, again = queryCatalog([...entries].reverse(), { pageSize: 100 }).rows;
    expect(newest.map(e => e.path)).toEqual(again.map(e => e.path));
    const times = newest.map(e => e.details?.savedAt ?? ''); expect([...times].sort().reverse()).toEqual(times);
    expect(queryCatalog(entries, { sort: 'oldest', pageSize: 100 }).rows[0]?.details?.savedAt).toBe('2026-10-10T08:00:00.000Z');
    expect(queryCatalog(entries, { sort: 'name', pageSize: 100 }).rows[0]?.details?.draftTitle).toBe('Ascending CHOIR');
    // Pagination over every size class, never capped.
    for (const [count, size] of [[0, 25], [1, 25], [25, 25], [30, 25], [30, 50]] as const) {
      const pages = Math.max(1, Math.ceil(count / size)), seen: string[] = [];
      for (let p = 0; p < pages; p++) { const r = queryCatalog(entries.slice(0, count), { page: p, pageSize: size }); expect(r.pages).toBe(pages); seen.push(...r.rows.map(e => e.path)); }
      expect(new Set(seen).size).toBe(count);
    }
    expect(queryCatalog(entries, { page: 99 })).toMatchObject({ page: 1, first: 26, last: 30 }); // clamped
    expect(queryCatalog([], {})).toMatchObject({ total: 0, pages: 1, first: 0, last: 0 });
  });
  it('excludes unread checkpoints from a type filter only visibly (counted), never silently', async () => {
    const f = await fixture(); for (let i = 0; i < 5; i++) envelope(f.vault, uid(i + 1), `x${i}`, '2026-10-01T00:00:00Z', { kind: 'motif', title: 'T' });
    const catalog = new RecoveryCatalog(f.vault, f.index), entries = catalog.list(); const first = entries[0]; if (!first) throw Error(); await catalog.details(first);
    expect(queryCatalog(entries, { type: 'Unsaved draft of a new record' })).toMatchObject({ total: 1, unreadExcluded: 4 });
  });
  it('handles 10,000 checkpoints: listing without reads, query and paging in bounded time', async () => {
    const f = await fixture(); for (let i = 0; i < 10000; i++) envelope(f.vault, uid(i % 300 + 1), `k${i}`, new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(), { kind: 'motif', title: `M${i % 300}` });
    const catalog = new RecoveryCatalog(f.vault, f.index), reads = f.vault.reads.length; let t = performance.now(); const entries = catalog.list(); const listMs = performance.now() - t;
    expect(entries).toHaveLength(10000); expect(f.vault.reads.length).toBe(reads);
    t = performance.now(); const r = queryCatalog(entries, { search: uid(7), sort: 'oldest', page: 3 }); const queryMs = performance.now() - t;
    expect(r.total).toBe(34); expect(listMs).toBeLessThan(2000); expect(queryMs).toBeLessThan(1000); // generous jsdom bounds; native timings in the report
  });
});

describe('4I register UI and read-only inspector', () => {
  it('shows counts, paginates, resets to page 1 on search, and reads only the visible rows', async () => {
    const f = await fixture(); for (let i = 0; i < 60; i++) envelope(f.vault, uid(i + 1), `p${i}`, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), { kind: 'motif', title: `Phrase-${i}` });
    const { root } = register(f); await settle();
    expect(control(root, 'Search checkpoints').tagName).toBe('INPUT'); expect(root.querySelector('[role="search"]')).not.toBeNull();
    expect(root.querySelector('.mnemobard-recovery-count')?.textContent).toBe('Showing 1–25 of 60 checkpoints'); expect(rows(root)).toHaveLength(25);
    expect(f.vault.reads.filter(p => p.includes('/Recovery/'))).toHaveLength(25); // visible rows only
    press(root, 'Next page'); await settle(); expect(root.querySelector('.mnemobard-recovery-count')?.textContent).toBe('Showing 26–50 of 60 checkpoints');
    expect(root.querySelector('nav[aria-label="Checkpoint pages"]')?.textContent).toContain('Page 2 of 3');
    const reads = f.vault.reads.length; set(root, 'Search checkpoints', 'phrase-5'); await settle();
    // Keystrokes filter in memory (no reads beyond newly visible rows); names of unread missing-document checkpoints are not
    // known yet, and the status says so instead of hiding them silently.
    expect(root.querySelector('.mnemobard-recovery-count')?.textContent).toMatch(/^Showing 1–\d+ of \d+ checkpoints? \(filtered from 60\) · \d+ checkpoints of documents that are not in the vault were matched by ID, path and date only/);
    expect(f.vault.reads.length - reads).toBeLessThanOrEqual(25); // only the newly visible page, if any
    press(root, 'Read all checkpoint details'); await settle(); await settle(); await settle();
    expect(root.querySelector('.mnemobard-recovery-count')?.textContent).toBe('Showing 1–11 of 11 checkpoints (filtered from 60)'); // page reset to 1
    set(root, 'Search checkpoints', ''); set(root, 'Page size', '50'); await settle(); expect(rows(root)).toHaveLength(50);
    set(root, 'Search checkpoints', 'zzz'); await settle(); expect(root.textContent).toContain('No checkpoints match'); press(root, 'Clear search and filters'); await settle(); expect(rows(root)).toHaveLength(50);
    const first = rows(root)[0]; expect(first?.getAttribute('aria-label')).toMatch(/^Phrase-59\. MOTIF, checkpoint .+, Unsaved draft of a new record, Readable, Original missing\. Inspect checkpoint\.$/);
  });
  it('shows an empty state for an empty register', async () => {
    const f = await fixture(), { root } = register(f); await settle();
    expect(root.querySelector('.mnemobard-recovery-count')?.textContent).toBe('No checkpoints in documented Recovery folders.'); expect(rows(root)).toHaveLength(0);
  });
  it('inspects MOTIF, CANVAS and PATCHBOOK checkpoints read-only with module summaries and safe actions', async () => {
    const f = await fixture(), m = createEntity('motif', 'Ascending choir') as Motif; m.data.lengthTicks = 7680;
    m.data.notes = [{ id: 'a', pitch: 60, startTick: 960, durationTicks: 480, velocity: 90 }, { id: 'b', pitch: 64, startTick: 3840, durationTicks: 960, velocity: 90 }];
    const motif = await f.repository.create(m), motifPath = await f.repository.saveEditorDraft({ ...motif.entity, title: 'Ascending choir (draft)' }, motif);
    const c = createEntity('composition', 'Night procession') as Composition; c.data.lengthTicks = 15360;
    c.data.lanes = [{ id: 'l1', name: 'Choir', clips: [{ id: 'c1', laneId: 'l1', motifId: motif.entity.id, startTick: 0, repeatCount: 1 }, { id: 'c2', laneId: 'l1', motifId: uid(77), startTick: 7680, repeatCount: 1 }] }];
    const composition = await f.repository.create(c), canvasPath = await f.repository.saveEditorDraft(composition.entity, composition);
    const patch = await f.repository.create({ ...createEntity('patch', 'Glass pad'), instrument: 'Prophet', tags: ['pad', 'night'] } as Entity), patchPath = await f.repository.saveEditorDraft(patch.entity, patch);
    const files = new Map(f.vault.files), { root, opened, loaded } = register(f, 'MOTIF'); await settle();
    const inspect = async (path: string): Promise<HTMLElement> => { const row = rows(root).find(r => r.dataset.path === path); if (!row) throw Error('row ' + path); row.click(); await settle(); const d = root.querySelector<HTMLElement>('.mnemobard-recovery-detail'); if (!d) throw Error(); return d; };
    let detail = await inspect(motifPath);
    expect(facts(detail, '.mnemobard-recovery-summary')).toMatchObject({ Module: 'MOTIF', Type: 'Unsaved draft of a saved record', 'Original path': motif.path, 'Original document': 'Available · unchanged since this checkpoint', Integrity: 'Valid checkpoint' });
    expect(facts(detail, '.mnemobard-recovery-preview')).toMatchObject({ Motif: 'Ascending choir (draft)', Notes: '2', Tempo: '120 BPM', 'Time signature': '4/4', PPQ: '960', 'Notes span': '1:2:0 – 2:2:0 (bar:beat:tick)' });
    expect(detail.querySelector<HTMLDetailsElement>('details.mnemobard-recovery-technical')?.open).toBe(false);
    expect(detail.textContent).toContain('Authoritative source unchanged since checkpoint.');
    expect([...detail.querySelectorAll('[aria-label="Checkpoint actions"] button')].map(b => b.textContent)).toEqual(['Load draft without saving', 'Open original document', 'Open checkpoint file', 'Close inspector']);
    detail = await inspect(canvasPath); // another module's checkpoint: validated by CANVAS rules, loading only via CANVAS
    expect(facts(detail, '.mnemobard-recovery-preview')).toMatchObject({ Composition: 'Night procession', Lanes: '1', Clips: '2', 'Referenced motifs': '2', 'Unresolved references': '1 motif not found or ambiguous', PPQ: '960' });
    expect(detail.textContent).not.toContain('Load draft without saving'); press(detail, 'Open in CANVAS recovery'); expect(opened).toEqual([{ module: 'CANVAS', path: canvasPath }]);
    detail = await inspect(patchPath);
    expect(facts(detail, '.mnemobard-recovery-preview')).toMatchObject({ Patch: 'Glass pad', 'Instrument or synthesizer': 'Prophet', Tags: 'pad, night', 'Referenced assets': '0', 'Associated motifs (saved)': '0' });
    press(detail, 'Close inspector'); expect(root.querySelector('.mnemobard-recovery-detail')?.children).toHaveLength(0); expect(document.activeElement?.getAttribute('data-path')).toBe(patchPath);
    expect(new Map(f.vault.files)).toEqual(files); expect(loaded).toHaveLength(0); // browsing and inspecting changed nothing
  });
  it('keeps malformed and missing-source checkpoints visible and explains them, and protects an open unsaved draft', async () => {
    const f = await fixture(), saved = await f.repository.create(createEntity('motif', 'Doomed phrase')), path = await f.repository.saveEditorDraft({ ...saved.entity, title: 'Doomed (draft)' }, saved);
    const bad = `MNEMOBARD/Recovery/${uid(3)}/broken.json`; f.vault.files.set(bad, '{"format":"mnemobard-editor-draft",');
    f.vault.files.delete(saved.path); f.vault.emit({ type: 'delete', path: saved.path }); await f.index.settled();
    const { root } = register(f, 'MOTIF'); await settle();
    const row = (p: string): HTMLButtonElement => { const r = rows(root).find(x => x.dataset.path === p); if (!r) throw Error(p); return r; };
    expect(row(bad).textContent).toContain('Malformed'); expect(row(path).textContent).toContain('Original missing');
    row(bad).click(); await settle(); let d = root.querySelector<HTMLElement>('.mnemobard-recovery-detail'); if (!d) throw Error();
    expect(facts(d, '.mnemobard-recovery-summary').Integrity).toMatch(/^Cannot be safely interpreted — /); expect(d.textContent).toContain('cannot be loaded'); expect(d.textContent).not.toContain('Load draft');
    row(path).click(); await settle(); d = root.querySelector<HTMLElement>('.mnemobard-recovery-detail'); if (!d) throw Error();
    expect(facts(d, '.mnemobard-recovery-summary')['Original document']).toBe('Missing · the original note is unavailable');
    expect(d.textContent).toContain('no replacement document is created'); expect(d.textContent).not.toContain('Load draft');
    expect(f.vault.files.has(path) && f.vault.files.has(bad)).toBe(true); expect(f.vault.files.has(saved.path)).toBe(false); // nothing recreated or removed
    // An open unsaved draft of the same document: loading is refused up front.
    const g = await fixture(), s2 = await g.repository.create(createEntity('motif', 'Busy')), p2 = await g.repository.saveEditorDraft({ ...s2.entity, title: 'Busy (draft)' }, s2);
    const reg = register(g, 'MOTIF', { unsaved: id => id === s2.entity.id, initialPath: p2 }); await settle();
    expect(reg.root.querySelector('.mnemobard-recovery-detail')?.textContent).toContain('An unsaved draft of this document is open'); expect(reg.root.textContent).not.toContain('Load draft without saving');
  });
  it('loads only through the module recovery path, as an unsaved draft, never saving', async () => {
    const f = await fixture(), saved = await f.repository.create(createEntity('motif', 'Keep me')), path = await f.repository.saveEditorDraft({ ...saved.entity, title: 'Keep me (draft)' }, saved);
    const files = new Map(f.vault.files), { root, loaded } = register(f, 'MOTIF', { initialPath: path }); await settle();
    press(root, 'Load draft without saving'); await settle();
    expect(loaded).toHaveLength(1); expect((loaded[0] as { draft: Motif }).draft.title).toBe('Keep me (draft)'); expect(new Map(f.vault.files)).toEqual(files);
  });
});
