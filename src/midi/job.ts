import type { MidiInspection } from './import';
import { MidiError, MIDI_LIMITS } from './structure';
declare const __MNEMOBARD_MIDI_WORKER__: string;
/** One bounded job per preview; close/abort/timeout terminates all decoder work. */
export function inspectMidiIsolated(bytes: ArrayBuffer, signal: AbortSignal, factory: (url: string) => Worker = url => new Worker(url)): Promise<MidiInspection> {
  if (signal.aborted) return Promise.reject(new MidiError('MIDI inspection cancelled.'));
  if (bytes.byteLength > MIDI_LIMITS.bytes) return Promise.reject(new MidiError('MIDI exceeds2MiB.'));
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined, url: string | undefined, timer: ReturnType<typeof setTimeout> | undefined, finished = false;
    const cleanup = (): void => { if (timer) clearTimeout(timer); signal.removeEventListener('abort', abort); worker?.terminate(); if (url) URL.revokeObjectURL(url); };
    const fail = (message: string): void => { if (finished) return; finished = true; cleanup(); reject(new MidiError(message)); };
    const abort = (): void => fail('MIDI inspection cancelled; no motif was created.');
    try {
      url = URL.createObjectURL(new Blob([__MNEMOBARD_MIDI_WORKER__], { type: 'text/javascript' })); worker = factory(url);
      worker.onmessage = (event: MessageEvent<{ ok: boolean; preview?: MidiInspection; message?: string }>) => { if (finished) return; if (!event.data.ok || !event.data.preview) { fail(event.data.message ?? 'MIDI inspection failed.'); return; } finished = true; cleanup(); resolve(event.data.preview); };
      worker.onerror = event => { event.preventDefault(); fail('MIDI decoder failed in the isolated worker. No motif was created.'); };
      signal.addEventListener('abort', abort, { once: true }); timer = setTimeout(() => fail('MIDI inspection exceeded10 seconds and was terminated. Split the file externally.'), 10000); worker.postMessage(bytes, [bytes]);
    } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  });
}
