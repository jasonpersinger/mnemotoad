// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import MnemobardPlugin from '../src/main';
import { NavigationCoordinator, ReadyGate, type NavigationEvent, type NavigationTarget } from '../src/application/navigation';
import { ModuleView } from '../src/ui/module-view';
import { MotifView } from '../src/modules/motif/view';
import { PatchbookView } from '../src/modules/patchbook/view';
import { CanvasView } from '../src/modules/canvas/view';
import { createEntity } from '../src/domain/entities';
import { installDomHelpers, TFile, TFolder } from './support/obsidian';
import { MemoryVault, deferred } from './support/memory-vault';

/** Milestone 4E: navigation readiness, latest-request-wins, bounded failure, no orphaned leaves. */
beforeEach(() => { installDomHelpers(); Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null }); });
const phases = (trace: NavigationEvent[] | null, request?: number) => (trace ?? []).filter(e => request === undefined || e.request === request).map(e => e.phase);

describe('NavigationCoordinator', () => {
  const target = (impl: NavigationTarget['reveal']): NavigationTarget => ({ reveal: impl });
  const steps = (view: unknown, enabled = () => true) => ({ enabled, open: async () => {}, view: async () => view });
  it('records ordered phases and completes only after the target verified its selection', async () => {
    const n = new NavigationCoordinator(); n.trace = [];
    await expect(n.navigate('motif', 'patchbook', 'p1', steps(target(async (_id, _s, note) => { note?.('view-ready'); note?.('state-applied'); })))).resolves.toBe('selected');
    expect(phases(n.trace)).toEqual(['request', 'leaf-ready', 'view-loaded', 'view-ready', 'state-applied', 'selected']);
    expect(n.trace?.map(e => e.seq)).toEqual([1, 2, 3, 4, 5, 6]); expect(JSON.stringify(n.trace)).not.toMatch(/\.md|MNEMOBARD\//);
  });
  it('latest request wins: the earlier one resolves superseded and cannot report', async () => {
    const n = new NavigationCoordinator(); n.trace = []; const first = deferred();
    const a = n.navigate('canvas', 'motif', 'm1', steps(target(async (_id, signal) => { await first.promise; expect(signal.aborted).toBe(true); })));
    const b = n.navigate('canvas', 'motif', 'm2', steps(target(async () => {})));
    await expect(b).resolves.toBe('selected'); first.resolve(); await expect(a).resolves.toBe('superseded');
    expect(n.trace?.filter(e => e.phase === 'selected').map(e => e.target)).toEqual(['m2']); expect(phases(n.trace, 1)).toContain('superseded'); expect(phases(n.trace, 1)).not.toContain('failed');
  });
  it('fails with a bounded timeout and a meaningful message instead of waiting forever', async () => {
    vi.useFakeTimers(); try {
      const n = new NavigationCoordinator(1000); n.trace = []; const pending = n.navigate('motif', 'patchbook', 'p1', steps(target(() => new Promise(() => {}))));
      const assertion = expect(pending).rejects.toThrow('did not finish showing'); await vi.advanceTimersByTimeAsync(1001); await assertion; expect(phases(n.trace).at(-1)).toBe('failed');
    } finally { vi.useRealTimers(); }
  });
  it('reports a view that is not ready, a disabled module and a rejecting target without selecting anything', async () => {
    const n = new NavigationCoordinator(); n.trace = [];
    await expect(n.navigate('motif', 'patchbook', 'p', steps({}))).rejects.toThrow('not ready');
    await expect(n.navigate('motif', 'patchbook', 'p', steps(target(async () => {}), () => false))).rejects.toThrow('disabled');
    let enabled = true; await expect(n.navigate('motif', 'patchbook', 'p', steps(target(async () => { enabled = false; }), () => enabled))).rejects.toThrow('disabled during navigation');
    await expect(n.navigate('motif', 'patchbook', 'p', steps(target(async () => { throw Error('Entity not found.'); })))).rejects.toThrow('Entity not found');
    expect(phases(n.trace)).not.toContain('selected');
  });
  it('trace is off by default and disposal refuses new navigation', async () => {
    const n = new NavigationCoordinator(); await n.navigate('motif', 'patchbook', 'p', steps(target(async () => {}))); expect(n.trace).toBeNull();
    n.dispose(); await expect(n.navigate('motif', 'patchbook', 'p', steps(target(async () => {})))).rejects.toThrow('unloading');
  });
  it('ReadyGate resolves only after open and re-arms on reset', async () => {
    const gate = new ReadyGate(); let done = false; void gate.promise.then(() => { done = true; }); await Promise.resolve(); expect(done).toBe(false);
    gate.open(); await Promise.resolve(); expect(done).toBe(true); gate.reset(); let again = false; void gate.promise.then(() => { again = true; }); await Promise.resolve(); expect(again).toBe(false);
  });
});

type Leaf = { type: string; view?: ModuleView; detached: boolean; deferredState?: Record<string, unknown>; detach: () => void; setViewState: (s: { type: string; state?: Record<string, unknown> }) => Promise<void>; loadIfDeferred: () => Promise<void> };
/** Real plugin wiring (main.ts workspace port) over an Obsidian contract mock with deferred, restorable leaves. */
function host() {
  const memory = new MemoryVault(), listeners = new Map<string, Set<(...args: unknown[]) => void>>(), leaves: Leaf[] = [];
  const native = {
    getMarkdownFiles: () => memory.markdownPaths().map(p => new TFile(p)), getFiles: () => [],
    getAbstractFileByPath: (path: string) => memory.files.has(path) ? new TFile(path) : memory.folders.has(path) ? new TFolder(path) : null,
    read: (file: TFile) => memory.read(file.path), create: async (path: string, source: string) => { await memory.create(path, source); return new TFile(path); },
    createFolder: async (path: string) => { await memory.ensureFolder(path); return new TFolder(path); }, process: (file: TFile, fn: (s: string) => string) => memory.process(file.path, fn),
    on: (event: string, callback: (...args: unknown[]) => void) => { const set = listeners.get(event) ?? new Set(); set.add(callback); listeners.set(event, set); return { event, callback }; },
    offref: (ref: { event: string; callback: (...args: unknown[]) => void }) => { listeners.get(ref.event)?.delete(ref.callback); },
  };
  memory.subscribe(change => { for (const callback of listeners.get(change.type) ?? []) callback(new TFile(change.path), change.oldPath); });
  let restoreDelay: Promise<void> | undefined;
  const make = (): Leaf => {
    const leaf: Leaf = { type: '', detached: false,
      detach() { this.detached = true; void this.view?.onClose(); },
      async setViewState(state) { this.type = state.type; const factory = (plugin as unknown as { views: Map<string, (leaf: unknown) => ModuleView> }).views.get(state.type); if (!factory) throw Error('Missing factory'); this.view = factory(this); (this.view as unknown as { app: unknown }).app = app; await this.view.onOpen(); if (state.state) await this.view.setState(state.state, {} as never); },
      // Models the suspected host race: loading resolves before the restored state is applied.
      async loadIfDeferred() { if (this.view || !this.deferredState) return; const restored = this.deferredState; this.deferredState = undefined; await this.setViewState({ type: this.type }); void (async () => { await restoreDelay; await this.view?.setState(restored, {} as never); })(); },
    }; leaves.push(leaf); return leaf;
  };
  const workspace = { onLayoutReady: (fn: () => void) => { fn(); }, getLeavesOfType: (type: string) => leaves.filter(l => !l.detached && l.type === type), revealLeaf: async (leaf: Leaf) => { await leaf.loadIfDeferred(); }, activeLeaf: undefined as unknown, setActiveLeaf(leaf: unknown) { this.activeLeaf = leaf; }, getLeaf: () => make(), on: () => ({}), offref: () => {}, requestSaveLayout: () => {}, openLinkText: async () => {} };
  const app = { vault: native, workspace, metadataCache: { getFirstLinkpathDest: () => null }, keymap: { pushScope: () => {}, popScope: () => {} }, scope: {} };
  const plugin = new MnemobardPlugin(app as unknown as App, { id: 'mnemobard', name: 'MNEMOBARD', version: '0.1.0', minAppVersion: '1.14.4', author: 'MNEMOBARD', description: 'Foundation' });
  const restoredLeaf = (type: string, state: Record<string, unknown>) => { const leaf = make(); leaf.type = type; leaf.deferredState = state; return leaf; };
  return { plugin, memory, leaves, restoredLeaf, holdRestore: (p: Promise<void>) => { restoreDelay = p; } };
}
async function started() {
  const h = host(); await h.plugin.onload(); const s = h.plugin.services; if (!s) throw Error('services'); s.navigation.trace = []; await s.index.start();
  const patchA = await s.repository.create(createEntity('patch', 'Warm pad')), patchB = await s.repository.create(createEntity('patch', 'Glass bell'));
  const motif = await s.repository.create({ ...createEntity('motif', 'Theme'), patchId: patchA.entity.id }); await s.index.settled();
  const leaf = (type: string) => h.leaves.find(l => !l.detached && l.type === type);
  return { ...h, s, patchA, patchB, motif, leaf };
}
const motifView = async (h: Awaited<ReturnType<typeof started>>, id: string) => { await h.s.modules.open('motif'); const view = h.leaf('mnemobard-motif')?.view; if (!(view instanceof MotifView)) throw Error('motif view'); await view.setState({ selectedId: id }); return view; };
const navigatePatch = (view: MotifView, id: string) => (view as unknown as { navigatePatch(id: string): Promise<void> }).navigatePatch(id);
const shown = (view: PatchbookView | MotifView | undefined) => view?.getState().selectedId;

describe('plugin navigation readiness', () => {
  it('MOTIF → PATCHBOOK opens one leaf, waits for readiness and selects the requested UUID; repeat reuses the leaf', async () => {
    const h = await started(), view = await motifView(h, h.motif.entity.id);
    await navigatePatch(view, h.patchA.entity.id); const pb = h.leaf('mnemobard-patchbook')?.view as PatchbookView;
    expect(shown(pb)).toBe(h.patchA.entity.id); expect(pb.contentEl.querySelector('[aria-current="true"]')?.textContent).toContain('Warm pad');
    await navigatePatch(view, h.patchB.entity.id); expect(shown(pb)).toBe(h.patchB.entity.id);
    expect(h.leaves.filter(l => !l.detached && l.type === 'mnemobard-patchbook')).toHaveLength(1);
    expect(phases(h.s.navigation.trace).filter(p => p === 'selected')).toHaveLength(2); h.plugin.onunload();
  });
  it('cold start: a restored PATCHBOOK selection applied before the reveal is overridden by the explicit request', async () => {
    const h = await started(), hold = deferred(); h.holdRestore(hold.promise);
    h.restoredLeaf('mnemobard-patchbook', { selectedId: h.patchB.entity.id, kind: 'patch' }); const view = await motifView(h, h.motif.entity.id);
    const pending = navigatePatch(view, h.patchA.entity.id); hold.resolve(); await pending;
    const pb = h.leaf('mnemobard-patchbook')?.view as PatchbookView; await h.s.index.settled(); await new Promise(r => setTimeout(r, 0));
    expect(shown(pb)).toBe(h.patchA.entity.id); expect(h.leaves.filter(l => !l.detached && l.type === 'mnemobard-patchbook')).toHaveLength(1);
    const trace = h.s.navigation.trace ?? []; expect(trace.filter(e => e.phase === 'host-state').map(e => e.target)).toContain(h.patchB.entity.id); expect(trace.filter(e => e.phase === 'selected').map(e => e.target)).toEqual([h.patchA.entity.id]);
    h.plugin.onunload();
  });
  it('cold start: a host restoration arriving DURING the reveal is deferred, so the explicit request wins', async () => {
    const h = await started(), hold = deferred(), read = deferred(); h.holdRestore(hold.promise);
    h.restoredLeaf('mnemobard-patchbook', { selectedId: h.patchB.entity.id, kind: 'patch' }); const view = await motifView(h, h.motif.entity.id);
    h.memory.delayRead = async path => { if (path === h.patchA.path) await read.promise; };
    const pending = navigatePatch(view, h.patchA.entity.id);
    await vi.waitFor(() => expect(phases(h.s.navigation.trace)).toContain('view-ready')); hold.resolve();
    await vi.waitFor(() => expect(phases(h.s.navigation.trace)).toContain('host-state-deferred')); h.memory.delayRead = undefined; read.resolve(); await pending;
    const pb = h.leaf('mnemobard-patchbook')?.view as PatchbookView; expect(shown(pb)).toBe(h.patchA.entity.id);
    const trace = h.s.navigation.trace ?? []; expect(trace.filter(e => e.phase === 'host-state-deferred').map(e => e.target)).toEqual([h.patchB.entity.id]);
    expect(trace.filter(e => e.phase === 'selected').map(e => e.target)).toEqual([h.patchA.entity.id]);
    const order = trace.filter(e => e.request > 0 || e.phase.startsWith('host')).map(e => e.phase); expect(order.indexOf('host-state-deferred')).toBeGreaterThan(order.indexOf('view-ready')); expect(order.indexOf('host-state-deferred')).toBeLessThan(order.indexOf('selected'));
    h.plugin.onunload();
  });
  it('rapid consecutive requests select the latest target deterministically', async () => {
    const h = await started(), view = await motifView(h, h.motif.entity.id);
    const first = navigatePatch(view, h.patchA.entity.id), second = navigatePatch(view, h.patchB.entity.id); await Promise.all([first, second]);
    const pb = h.leaf('mnemobard-patchbook')?.view as PatchbookView; expect(shown(pb)).toBe(h.patchB.entity.id);
    expect((h.s.navigation.trace ?? []).filter(e => e.phase === 'selected').map(e => e.target)).toEqual([h.patchB.entity.id]); h.plugin.onunload();
  });
  it('a missing target record fails with the target message and leaves the source view and its draft intact', async () => {
    const h = await started(), view = await motifView(h, h.motif.entity.id); await h.s.modules.open('patchbook');
    const ghost = '00000000-0000-4000-8000-0000000000ff'; const outcome = h.s.navigation.navigate('motif', 'patchbook', ghost, { enabled: () => true, open: () => h.s.modules.open('patchbook'), view: async () => h.leaf('mnemobard-patchbook')?.view });
    await expect(outcome).rejects.toThrow(/not found|not show/); expect(shown(view)).toBe(h.motif.entity.id); expect(phases(h.s.navigation.trace).at(-1)).toBe('failed'); h.plugin.onunload();
  });
  it('disabling the target during navigation fails cleanly with no orphaned leaf', async () => {
    const h = await started(), view = await motifView(h, h.motif.entity.id);
    const pending = navigatePatch(view, h.patchA.entity.id); await h.plugin.setModule('patchbook', false);
    await expect(pending).rejects.toThrow(/disabled|closed/); expect(h.leaves.filter(l => !l.detached && l.type === 'mnemobard-patchbook')).toHaveLength(0);
    expect(shown(view)).toBe(h.motif.entity.id); h.plugin.onunload();
  });
  it('CANVAS → MOTIF selects the clip source after closing and reopening MOTIF (fresh view readiness)', async () => {
    const h = await started(); await h.s.modules.open('canvas'); const canvas = h.leaf('mnemobard-canvas')?.view as CanvasView;
    await h.s.modules.open('motif'); h.leaf('mnemobard-motif')?.detach(); await new Promise(r => setTimeout(r, 0));
    await (canvas as unknown as { openMotif(id: string): Promise<void> }).openMotif(h.motif.entity.id);
    expect(shown(h.leaf('mnemobard-motif')?.view as MotifView)).toBe(h.motif.entity.id); expect(h.leaves.filter(l => !l.detached && l.type === 'mnemobard-motif')).toHaveLength(1);
    expect(phases(h.s.navigation.trace).slice(-5)).toEqual(['leaf-ready', 'view-loaded', 'view-ready', 'state-applied', 'selected']); h.plugin.onunload();
  });
});

describe('4F cross-module chain', () => {
  const clickIn = (root: HTMLElement, text: string) => { const b = [...root.querySelectorAll('button')].find(x => x.textContent === text && !x.disabled); if (!b) throw Error('Missing button ' + text); b.click(); };
  it('Patch → Motif → Composition → Clip → Motif → Patch keeps every draft, selects each target and writes no source note', async () => {
    const h = await started(), s = h.s, { addLane } = await import('../src/modules/canvas/commands'), { addMarker } = await import('../src/modules/canvas/structure');
    const comp = s.canvas.create(); comp.edit('lane', c => addLane(c, 'Lead')); const lane = comp.draft.data.lanes[0]; if (!lane) throw Error('lane');
    s.canvas.place(comp, lane.id, h.motif.entity.id, 0, 2); comp.edit('title', c => ({ ...c, title: 'Chain test' })); await comp.save(); await s.index.settled();
    const clipId = comp.draft.data.lanes[0]?.clips[0]?.id, sources = () => [h.patchA.path, h.motif.path].map(p => h.memory.files.get(p)), before = sources(), notes = h.memory.markdownPaths().length;
    await s.modules.open('patchbook'); const pb = h.leaf('mnemobard-patchbook')?.view as PatchbookView; await pb.setState({ selectedId: h.patchA.entity.id });
    await vi.waitFor(() => expect(pb.contentEl.textContent).toContain('Motifs using this patch · 1'));
    clickIn(pb.contentEl, 'Open in MOTIF'); await vi.waitFor(() => expect(shown(h.leaf('mnemobard-motif')?.view as MotifView)).toBe(h.motif.entity.id));
    const mv = h.leaf('mnemobard-motif')?.view as MotifView, ms = (mv as unknown as { session: { edit: (l: string, f: (m: unknown) => unknown) => void } }).session;
    ms.edit('Rename', m => ({ ...(m as object), title: 'Ascent (unsaved)' }));
    await vi.waitFor(() => expect(mv.contentEl.textContent).toContain('Used in saved compositions · 1'));
    expect(mv.contentEl.querySelector('.mnemobard-motif-links')?.textContent).toContain('1 placement');
    clickIn(mv.contentEl, 'Open in CANVAS'); const cv = () => h.leaf('mnemobard-canvas')?.view as unknown as { session?: { draft: { id: string }; selectedClip?: string; edit: (l: string, f: (c: never) => never) => void }; contentEl: HTMLElement };
    await vi.waitFor(() => expect(cv().session?.selectedClip).toBe(clipId)); expect(cv().session?.draft.id).toBe(comp.draft.id);
    cv().session?.edit('Add marker', (c: never) => addMarker(c, { label: 'Draft cue', tick: 960 }) as never);
    const inspector = () => cv().contentEl.querySelector<HTMLElement>('.mnemobard-canvas-inspector'); await vi.waitFor(() => expect(inspector()?.textContent).toContain('Source and sound'));
    expect(inspector()?.querySelector('[data-ref-status="ready"] .mnemobard-ref-name')?.textContent).toBe('Theme');
    const source = inspector(); if (!source) throw Error('inspector'); clickIn(source, 'Open in MOTIF');
    await vi.waitFor(() => expect(h.s.navigation.trace?.filter(e => e.phase === 'selected').at(-1)?.to).toBe('motif'));
    await vi.waitFor(() => expect(mv.contentEl.textContent).toContain('Sound')); clickIn(mv.contentEl.querySelector('.mnemobard-motif-links') as HTMLElement, 'Open in PATCHBOOK');
    await vi.waitFor(() => expect(h.s.navigation.trace?.filter(e => e.phase === 'selected').at(-1)?.target).toBe(h.patchA.entity.id));
    expect(shown(pb)).toBe(h.patchA.entity.id);
    expect(s.motifs.drafts().map(d => d.draft.title)).toContain('Ascent (unsaved)');
    expect(s.canvas.drafts().find(d => d.draft.id === comp.draft.id)?.draft.data.markers.map(m => m.label)).toEqual(['Draft cue']);
    expect(sources()).toEqual(before); expect(h.memory.markdownPaths()).toHaveLength(notes);
    expect(h.leaves.filter(l => !l.detached && l.type.startsWith('mnemobard-'))).toHaveLength(3);
    h.plugin.onunload();
  });
  it('CANVAS refuses a navigation that would abandon pending (unapplied) properties, with no loss', async () => {
    const h = await started(), s = h.s; await s.modules.open('canvas'); const cv = h.leaf('mnemobard-canvas')?.view as unknown as { contentEl: HTMLElement; session?: { draft: { id: string } } };
    (cv.contentEl.querySelector('button.mod-cta') as HTMLButtonElement).click(); await vi.waitFor(() => expect(cv.session).toBeTruthy());
    [...cv.contentEl.querySelectorAll('button')].find(b => b.textContent === 'Add lane')?.click();
    const form = cv.contentEl.querySelector<HTMLFormElement>('.mnemobard-canvas-settings form'); if (!form) throw Error('form'); form.dataset.pending = 'true';
    const other = s.canvas.create(); await other.save();
    await expect(s.navigation.navigate('motif', 'canvas', other.draft.id, { enabled: () => true, open: () => s.modules.open('canvas'), view: async () => h.leaf('mnemobard-canvas')?.view })).rejects.toThrow(/pending properties/);
    expect(cv.session?.draft.id).not.toBe(other.draft.id); expect(form.dataset.pending).toBe('true');
    h.plugin.onunload();
  });
});
describe('4F CANVAS reveal robustness', () => {
  it('reopens a composition whose session was disposed underneath the view instead of reusing the dead session', async () => {
    const h = await started(), s = h.s; await s.modules.open('canvas'); const comp = s.canvas.create(); await comp.save(); await s.index.settled();
    const cv = h.leaf('mnemobard-canvas')?.view as unknown as { session?: { disposed: boolean; draft: { id: string } }; reveal: (id: string, signal: AbortSignal) => Promise<void> };
    await cv.reveal(comp.draft.id, new AbortController().signal); const first = cv.session; if (!first) throw Error('session');
    s.canvas.discard(first as never); expect(first.disposed).toBe(true);
    await cv.reveal(comp.draft.id, new AbortController().signal);
    expect(cv.session).not.toBe(first); expect(cv.session?.disposed).toBe(false); expect(cv.session?.draft.id).toBe(comp.draft.id);
    h.plugin.onunload();
  });
});

describe('4G PATCHBOOK edit-mode associations', () => {
  it('keeps the saved "Motifs using this patch" summary visible and read-only while the patch is edited, with the draft intact', async () => {
    const h = await started(), s = h.s;
    await s.modules.open('patchbook'); const pb = h.leaf('mnemobard-patchbook')?.view as PatchbookView; await pb.setState({ selectedId: h.patchA.entity.id });
    await vi.waitFor(() => expect(pb.contentEl.textContent).toContain('Motifs using this patch · 1'));
    const edit = [...pb.contentEl.querySelectorAll('button')].find(b => b.textContent === 'Edit record'); if (!edit) throw Error('Edit record'); edit.click();
    const summary = pb.contentEl.querySelector<HTMLElement>('details[aria-label="Motifs using this patch"]');
    expect(summary?.textContent).toContain('Motifs using this patch · 1'); expect(summary?.textContent).toContain('read-only while you edit');
    expect([...(summary?.querySelectorAll('button') ?? [])].map(b => b.textContent)).toEqual([]); // no navigation from inside the form
    expect(pb.contentEl.querySelector('form')).not.toBeNull(); // the editing form is still the primary content
    h.plugin.onunload();
  });
});
