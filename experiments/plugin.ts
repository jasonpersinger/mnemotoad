import { ItemView, Notice, Plugin, type WorkspaceLeaf } from 'obsidian';
import { compile, type CompiledSequence } from './compiler';
import { GridProbe, runRenderingBenchmarks, type RenderResult } from './rendering';
import { syntheticNotes } from './geometry';
import { ExperimentalTransport } from './transport';
import { TestToneSink } from './web-audio';
import { offlineOnsetProbe } from './offline-audio';

declare const EXPERIMENT_VAULT: string;
const VIEW = 'mnemobard-feasibility-lab';
export function auditionPlan(): CompiledSequence {
  return compile({ ppq: 960, lengthTicks: 1920, tempos: [{ tick: 0, microsecondsPerQuarter: 500000 }, { tick: 960, microsecondsPerQuarter: 400000 }], tracks: [{ id: 'test', channel: 0, clips: [{ id: 'synthetic', offsetTick: 0, repeatCount: 1, pattern: { ppq: 960, lengthTicks: 1920, notes: [{ id: 'a', startTick: 0, durationTicks: 480, pitch: 60, velocity: 80 }, { id: 'b', startTick: 960, durationTicks: 480, pitch: 67, velocity: 80 }] } }] }] });
}
class LabView extends ItemView {
  private sink?: TestToneSink;
  private transport?: ExperimentalTransport;
  private probe?: GridProbe;
  private readonly lifetime = new AbortController();
  constructor(leaf: WorkspaceLeaf, private readonly plugin: FeasibilityPlugin) { super(leaf); }
  getViewType(): string { return VIEW; }
  getDisplayText(): string { return 'MNEMOBARD Experimental Lab'; }
  getIcon(): string { return 'flask-conical'; }
  async onOpen(): Promise<void> {
    const content = this.contentEl; content.empty();
    content.createEl('h2', { text: 'Milestone 1B — disposable feasibility lab' });
    content.createEl('p', { text: 'Synthetic data only. No production editor or vault records are connected. Basic sine tones do not reproduce patches.' });
    this.sink = new TestToneSink(); this.transport = new ExperimentalTransport(this.sink);
    this.plugin.lab = this;
    const status = content.createEl('p', { text: 'Stopped; AudioContext has not been created.', attr: { role: 'status', 'aria-live': 'polite' } });
    const action = (label: string, callback: () => void | Promise<unknown>): void => {
      const button = content.createEl('button', { text: label });
      this.registerDomEvent(button, 'click', () => { Promise.resolve().then(callback).then(() => { status.textContent = this.statusText(); }).catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : String(error); }); });
    };
    action('Play experimental tone', () => this.transport?.start(auditionPlan(), true));
    action('Pause', () => this.transport?.pause()); action('Resume', () => this.transport?.resume()); action('Stop', () => this.transport?.stop());
    action('Run rendering benchmarks', async () => { await this.benchmark(); status.textContent = `${this.plugin.results.length} benchmark cases complete`; });
    const controls = content.createEl('label', { text: 'Synthetic selection ID ' });
    const input = controls.createEl('input', { type: 'number', value: '0', attr: { min: '0', max: '99', 'aria-label': 'Synthetic note selection ID' } });
    const host = content.createDiv(); host.style.overflow = 'auto';
    const viewport = { width: 960, height: 360, start: 0, row: 48, pixelsPerQuarter: 60, rowHeight: 15 };
    this.probe = new GridProbe(host, syntheticNotes(100), 'canvas-culled', viewport, devicePixelRatio); this.probe.render(viewport);
    this.registerDomEvent(input, 'input', () => { if (this.probe) { this.probe.selected = Number(input.value); this.probe.render(viewport); } });
    const stop = (): void => { this.transport?.stop(); status.textContent = 'Stopped because the view/window lost focus or visibility.'; };
    this.registerDomEvent(content.ownerDocument, 'visibilitychange', () => { if (content.ownerDocument.hidden) stop(); });
    const win = content.ownerDocument.defaultView;
    if (win) { this.registerDomEvent(win, 'blur', stop); this.registerDomEvent(win, 'pagehide', stop); }
    this.register(() => { void this.shutdown(); });
  }
  statusText(): string { return `${this.transport?.state ?? 'closed'}; ${this.sink?.contextState ?? 'no context'}; ${this.transport?.diagnostic ?? ''}`; }
  snapshot(): object {
    return { state: this.transport?.state, timerCount: this.transport?.timerCount, voices: this.sink?.activeVoices, created: this.sink?.createdVoices, released: this.sink?.releasedVoices, maxVoices: this.sink?.maxVoices, audio: this.sink?.contextInfo, diagnostic: this.transport?.diagnostic, samples: this.transport?.samples, pollIntervals: this.transport?.pollIntervals, wallPollIntervals: this.transport?.wallPollIntervals, inputFeedbackMs: this.probe?.inputFeedbackMs };
  }
  async play(): Promise<boolean | undefined> { return this.transport?.start(auditionPlan(), true); }
  stop(): void { this.transport?.stop(); }
  pause(): void { this.transport?.pause(); }
  async resume(): Promise<boolean | undefined> { return this.transport?.resume(); }
  async benchmark(): Promise<RenderResult[]> {
    if (this.plugin.benchmarkRunning) throw new Error('Benchmark already running');
    this.plugin.benchmarkRunning = true; this.stop();
    const host = this.contentEl.createDiv(); host.style.overflow = 'auto';
    try {
      this.plugin.results = await runRenderingBenchmarks(host, message => { this.plugin.progress = message; }, this.lifetime.signal, results => { this.plugin.results = results; });
      return this.plugin.results;
    } finally { host.remove(); this.plugin.benchmarkRunning = false; }
  }
  async shutdown(): Promise<void> { this.lifetime.abort(); this.probe?.dispose(); await this.transport?.dispose(); }
  async onClose(): Promise<void> { await this.shutdown(); }
}
/** Separate build/deploy only. Nothing imports this entry from the production plugin. */
export default class FeasibilityPlugin extends Plugin {
  offlineProbe = offlineOnsetProbe;
  lab?: LabView;
  results: RenderResult[] = [];
  progress = '';
  benchmarkRunning = false;
  benchmarkError = '';
  beginBenchmark(): void {
    if (!this.lab) throw new Error('Open the experimental lab first');
    this.benchmarkError = '';
    void this.lab.benchmark().catch((error: unknown) => { this.benchmarkError = error instanceof Error ? error.message : String(error); });
  }
  async onload(): Promise<void> {
    const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & { getBasePath?: () => string };
    if (adapter.getBasePath?.() !== EXPERIMENT_VAULT || await adapter.read('.mnemobard-disposable') !== 'MNEMOBARD disposable development vault v1\n') throw new Error('Experimental plugin restricted to the designated marked disposable vault');
    this.registerView(VIEW, leaf => new LabView(leaf, this));
    this.addCommand({ id: 'open', name: 'Open disposable feasibility lab', callback: () => { void this.open().catch((error: unknown) => new Notice(error instanceof Error ? error.message : String(error))); } });
    this.register(() => { void this.lab?.shutdown(); });
  }
  async open(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW)[0];
    if (existing) { await this.app.workspace.revealLeaf(existing); return; }
    const leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({ type: VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
