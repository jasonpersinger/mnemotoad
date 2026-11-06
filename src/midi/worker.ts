import { inspectMidi } from './import';
self.onmessage = (event: MessageEvent<unknown>): void => {
  try { if (!(event.data instanceof ArrayBuffer)) throw Error('Expected MIDI bytes'); const preview = inspectMidi(new Uint8Array(event.data)); self.postMessage({ ok: true, preview }); }
  catch (error) { self.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) }); }
};
