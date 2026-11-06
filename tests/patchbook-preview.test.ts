import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioPreview, type PreviewMedia } from '../src/modules/patchbook/preview';
import { deferred } from './support/memory-vault';
class Media extends EventTarget implements PreviewMedia {
  src = ''; preload = ''; currentTime = 0; duration = 8; error: { code: number } | null = null;
  paused = true; loads = 0; listeners = new Set<string>();
  playResult: Promise<void> = Promise.resolve();
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void { this.listeners.add(type); super.addEventListener(type, callback, options); }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void { this.listeners.delete(type); super.removeEventListener(type, callback, options); }
  play(): Promise<void> { this.paused = false; return this.playResult; }
  pause(): void { this.paused = true; }
  load(): void { this.loads++; }
  removeAttribute(): void { this.src = ''; }
}
const owner = {}, other = {};
function fixture() {
  const media: Media[] = [], player = new AudioPreview(() => { const item = new Media(); media.push(item); return item; });
  return { media, player };
}
afterEach(() => vi.useRealTimers());
describe('single-owner recorded-audio preview', () => {
  it('plays, tracks duration/position, pauses/resumes, seeks and stops releasing all resources', async () => {
    const { player, media } = fixture(); await player.play(owner, 'tone.wav', 'app://local/tone.wav');
    expect(player.current).toMatchObject({ status: 'playing', duration: 8 });
    const first = media[0]; if (!first) throw Error('Missing allocated media'); first.currentTime = 2; first.dispatchEvent(new Event('timeupdate')); expect(player.current.position).toBe(2);
    player.pause(owner); expect(player.current.status).toBe('paused'); expect(first.paused).toBe(true);
    await player.resume(owner); expect(player.current.status).toBe('playing');
    player.seek(owner, 4); expect(first.currentTime).toBe(4); expect(() => player.seek(owner, 9)).toThrow('within');
    player.stop(owner); expect(player.current.status).toBe('stopped'); expect(first.src).toBe(''); expect(first.listeners.size).toBe(0); expect(first.loads).toBe(1);
  });
  it('stops the previous preview and ignores controls from other owners', async () => {
    const { player, media } = fixture(); await player.play(owner, 'one', 'app://local/one'); await player.play(other, 'two', 'app://local/two');
    expect(media[0]?.paused).toBe(true); expect(media[0]?.listeners.size).toBe(0); expect(player.ownedBy(other)).toBe(true);
    player.pause(owner); player.stop(owner); player.seek(owner, 2); expect(player.current.status).toBe('playing'); player.dispose();
  });
  it('does not revive a stopped preview when an old play promise resolves or rejects', async () => {
    for (const reject of [false, true]) {
      const pending = deferred(), first = new Media(); first.playResult = pending.promise;
      const player = new AudioPreview(() => first), operation = player.play(owner, 'old', 'app://local/old');
      player.stop(owner); if (reject) first.dispatchEvent(new Event('error')); pending.resolve(); await operation;
      expect(player.current.status).toBe('stopped'); expect(first.listeners.size).toBe(0); player.dispose();
    }
  });
  it('reports unsupported decoding and play rejection while releasing media', async () => {
    const { player, media } = fixture(); await player.play(owner, 'bad', 'app://local/bad');
    const first = media[0]; if (!first) throw Error('Missing allocated media'); first.error = { code: 4 }; first.dispatchEvent(new Event('error'));
    expect(player.current.message).toContain('Unsupported'); expect(first.listeners.size).toBe(0); expect(first.src).toBe('');
    const failed = new Media(); failed.playResult = Promise.reject(Error('blocked'));
    const rejectPlayer = new AudioPreview(() => failed); await rejectPlayer.play(owner, 'bad', 'app://local/bad');
    expect(rejectPlayer.current).toMatchObject({ status: 'error' }); expect(failed.listeners.size).toBe(0); player.dispose(); rejectPlayer.dispose();
  });
  it('handles end, load timeout, unload and repeated start/stop without accumulation', async () => {
    vi.useFakeTimers(); const { player, media } = fixture();
    for (let i = 0; i < 25; i++) { await player.play(owner, 'tone', 'app://local/tone'); player.stop(owner); }
    expect(media.every(item => item.listeners.size === 0 && item.src === '' && item.paused)).toBe(true); expect(vi.getTimerCount()).toBe(0);
    await player.play(owner, 'tone', 'app://local/tone'); media.at(-1)?.dispatchEvent(new Event('ended')); expect(player.current.status).toBe('ended'); expect(media.at(-1)?.listeners.size).toBe(0);
    player.dispose(); await expect(player.play(owner, 'tone', 'app://local/tone')).rejects.toThrow('closed'); expect(vi.getTimerCount()).toBe(0);
    const pending = deferred(), stalled = new Media(); stalled.playResult = pending.promise;
    const timeout = new AudioPreview(() => stalled); const operation = timeout.play(owner, 'stall', 'app://local/stall');
    await vi.advanceTimersByTimeAsync(30000); expect(timeout.current.message).toContain('timed out'); pending.resolve(); await operation; expect(stalled.listeners.size).toBe(0); timeout.dispose();
  });
  it('rejects remote resources without allocating media', async () => {
    const { player, media } = fixture(); await expect(player.play(owner, 'remote', 'https://example.com/a.wav')).rejects.toThrow('local vault'); expect(media).toHaveLength(0); player.dispose();
  });
});

it('keeps a loading preview paused after its pending play promise settles', async () => {
  const pending = deferred(), media = new Media(); media.playResult = pending.promise;
  const player = new AudioPreview(() => media), operation = player.play(owner, 'loading', 'app://local/loading');
  player.pause(owner); pending.resolve(); await operation; expect(player.current.status).toBe('paused'); expect(media.paused).toBe(true); player.dispose();
});
it('ignores a rejected pending play after another owner has started', async () => {
  let rejectFirst: (reason: Error) => void = () => { throw Error('Uninitialized rejection'); };
  const first = new Media(); first.playResult = new Promise((_resolve, reject) => { rejectFirst = reject; });
  const second = new Media(); let calls = 0; const player = new AudioPreview(() => calls++ === 0 ? first : second);
  const old = player.play(owner, 'old', 'app://local/old'); await player.play(other, 'new', 'app://local/new'); rejectFirst(Error('Late aborted play')); await old;
  expect(player.current).toMatchObject({ status: 'playing', path: 'new' }); expect(first.listeners.size).toBe(0); player.dispose();
});
