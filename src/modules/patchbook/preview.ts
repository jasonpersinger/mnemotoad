import { FoundationError, messageOf } from '../../domain/errors';

export interface PreviewMedia extends EventTarget {
  src: string; preload: string; currentTime: number; duration: number;
  error: { code: number } | null;
  play(): Promise<void>; pause(): void; load(): void; removeAttribute(name: string): void;
}
export interface PreviewState {
  status: 'stopped' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
  path?: string; position: number; duration: number; message?: string;
}
/** Exactly one on-demand media element. No experimental synth/audio context. */
export class AudioPreview {
  private media?: PreviewMedia;
  private owner?: object;
  private generation = 0;
  private closed = false;
  private requested: 'playing' | 'paused' = 'playing';
  private cleanup: (() => void)[] = [];
  private timeout?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  private state: PreviewState = { status: 'stopped', position: 0, duration: 0 };
  constructor(private readonly factory: () => PreviewMedia = () => new Audio(), private readonly beforePlay: () => void = () => {}) {}
  get current(): PreviewState { return { ...this.state }; }
  ownedBy(owner: object): boolean { return this.owner === owner; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private isPaused(): boolean { return this.requested === 'paused'; }
  private publish(): void { for (const listener of this.listeners) listener(); }
  private releaseMedia(): void {
    if (this.timeout) clearTimeout(this.timeout); this.timeout = undefined;
    for (const remove of this.cleanup.splice(0)) remove();
    const media = this.media; this.media = undefined;
    if (media) { media.pause(); media.removeAttribute('src'); media.load(); }
  }
  stop(owner?: object): void {
    if (owner && this.owner !== owner) return;
    this.generation++; this.releaseMedia(); this.owner = undefined;
    this.state = { status: 'stopped', position: 0, duration: 0 }; this.publish();
  }
  async play(owner: object, path: string, url: string): Promise<void> {
    if (this.closed) throw new FoundationError('disposed', 'Audio preview is closed.');
    this.stop(); this.beforePlay();
    // Only the asset service supplies these ephemeral URLs; no remote fetch path.
    if (!url.startsWith('app://') && !url.startsWith('blob:')) throw new FoundationError('invalid', 'Preview requires a local vault resource.');
    this.owner = owner; this.requested = 'playing'; const generation = this.generation;
    const media = this.factory(); this.media = media;
    const active = (): boolean => !this.closed && this.media === media && generation === this.generation;
    const fail = (message: string): void => {
      if (!active()) return;
      this.releaseMedia(); this.state = { ...this.state, status: 'error', message }; this.publish();
    };
    const listen = (type: string, listener: () => void): void => { media.addEventListener(type, listener); this.cleanup.push(() => media.removeEventListener(type, listener)); };
    const position = (): void => {
      if (!active()) return;
      const duration = Number.isFinite(media.duration) && media.duration >= 0 ? media.duration : 0;
      this.state = { ...this.state, position: Number.isFinite(media.currentTime) ? media.currentTime : 0, duration }; this.publish();
    };
    listen('timeupdate', position); listen('durationchange', position); listen('loadedmetadata', position);
    listen('playing', () => { if (active()) { if (this.timeout) clearTimeout(this.timeout); this.timeout = undefined; if (this.requested === 'paused') media.pause(); this.state.status = this.requested; position(); } });
    listen('ended', () => { if (active()) { this.releaseMedia(); this.state.status = 'ended'; this.state.position = this.state.duration; this.publish(); } });
    listen('error', () => fail(media.error?.code === 4 ? 'Unsupported preview: this Obsidian runtime could not decode the file. Choose another recording or open it in Obsidian.' : 'Audio preview failed to load or decode. Check the file and select Play to retry.'));
    this.state = { status: 'loading', path, position: 0, duration: 0 }; this.publish();
    media.preload = 'metadata'; media.src = url;
    this.timeout = setTimeout(() => fail('Preview timed out after 30 seconds. Stop and check the recording.'), 30000);
    try { await media.play(); if (active()) { if (this.timeout) clearTimeout(this.timeout); this.timeout = undefined; this.state.status = this.requested; position(); } }
    catch (error) { if (!this.isPaused()) fail(`Preview could not play: ${messageOf(error)}. The format may be unsupported; retry from a user action.`); }
  }
  pause(owner: object): void { if (this.owner === owner && this.media) { this.requested = 'paused'; if (this.timeout) clearTimeout(this.timeout); this.timeout = undefined; this.media.pause(); this.state.status = 'paused'; this.publish(); } }
  async resume(owner: object): Promise<void> {
    const media = this.media, generation = this.generation;
    if (this.owner !== owner || !media) return;
    this.requested = 'playing';
    try { await media.play(); if (this.media === media && generation === this.generation) { this.state.status = this.requested; this.publish(); } }
    catch (error) {
      if (this.media === media && generation === this.generation && !this.isPaused()) { this.releaseMedia(); this.state = { ...this.state, status: 'error', message: `Preview could not resume: ${messageOf(error)}` }; this.publish(); }
    }
  }
  seek(owner: object, seconds: number): void {
    if (this.owner !== owner || !this.media) return;
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > this.state.duration) throw new FoundationError('invalid', 'Seek position must be within the recording.');
    this.media.currentTime = seconds; this.state.position = seconds; this.publish();
  }
  dispose(): void { this.closed = true; this.stop(); this.listeners.clear(); }
}
