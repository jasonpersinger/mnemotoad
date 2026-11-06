import type { MidiInspection } from './import';
import { MidiError, MIDI_LIMITS } from './structure';
declare const __MNEMOBARD_MIDI_WORKER__: string;
/** One bounded job per preview; close/abort/timeout terminates all decoder work. */
export function inspectMidiIsolated(bytes: ArrayBuffer, signal: AbortSignal, factory: (url: string) => Worker = url => new Worker(url)): Promise<MidiInspection> {
  if (signal.aborted) return Promise.reject(new MidiError('MIDI inspection cancelled.'));
  if (bytes.byteLength > MIDI_LIMITS.bytes) return Promise.reject(new MidiError('MIDI exceeds2MiB.'));
  return isolatedMidiWork(bytes,[bytes],signal,data=>data.preview as MidiInspection|undefined,factory,'MIDI inspection');
}
/** Shared owned worker boundary. Only our embedded local worker executes requests. */
export function isolatedMidiWork<T>(payload:unknown,transfer:Transferable[],signal:AbortSignal,select:(data:Record<string,unknown>)=>T|undefined,factory:(url:string)=>Worker=url=>new Worker(url),label='MIDI work'):Promise<T>{
  if(signal.aborted)return Promise.reject(new MidiError(`${label} cancelled.`));
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined, url: string | undefined, timer: ReturnType<typeof setTimeout> | undefined, finished = false;
    const cleanup = (): void => { if (timer) clearTimeout(timer); signal.removeEventListener('abort', abort); worker?.terminate(); if (url) URL.revokeObjectURL(url); };
    const fail = (message: string): void => { if (finished) return; finished = true; cleanup(); reject(new MidiError(message)); };
    const abort = (): void => fail(`${label} cancelled; no musical record was changed.`);
    try {
      url = URL.createObjectURL(new Blob([__MNEMOBARD_MIDI_WORKER__], { type: 'text/javascript' })); worker = factory(url);
      worker.onmessage = (event: MessageEvent<Record<string,unknown>>) => { if (finished) return;try{const result=select(event.data);if(!event.data.ok||!result){fail(typeof event.data.message==='string'?event.data.message:`${label} failed.`);return;}finished=true;cleanup();resolve(result);}catch(error){fail(error instanceof Error?error.message:String(error));} };
      worker.onerror = event => { event.preventDefault(); fail('MIDI decoder failed in the isolated worker. No motif was created.'); };
      signal.addEventListener('abort', abort, { once: true }); timer = setTimeout(() => fail(`${label} exceeded10 seconds and was terminated. Split the input.`), 10000); worker.postMessage(payload, transfer);
    } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  });
}
