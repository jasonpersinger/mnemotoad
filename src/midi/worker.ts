import { inspectMidi } from './import';
import { compileArrangement } from '../arrangement/compiler';
import { exportArrangement } from '../arrangement/export';
import type { Composition } from '../domain/entities';
import type { CapturedSource } from '../arrangement/compiled';
self.onmessage = (event: MessageEvent<unknown>): void => {
  try {
    if(event.data&&typeof event.data==='object'&&'kind'in event.data&&event.data.kind==='arrangement'){
      // The domain compiler validates the unknown payload before expansion.
      const request=event.data as unknown as {composition:Composition;sources:CapturedSource[];inputRevision:string};
      const start=performance.now(),result=compileArrangement(request.composition,request.sources,request.inputRevision),compileMs=performance.now()-start,serialize=performance.now(),bytes=result.ok?exportArrangement(result.arrangement):undefined;
      const port=self as unknown as {postMessage(message:unknown,transfer:Transferable[]):void};
      port.postMessage({ok:true,compiled:{result,bytes,metrics:{compileMs,serializeMs:performance.now()-serialize}}},bytes?[bytes.buffer as ArrayBuffer]:[]);return;
    }
    if (!(event.data instanceof ArrayBuffer)) throw Error('Expected MIDI bytes'); const preview = inspectMidi(new Uint8Array(event.data)); self.postMessage({ ok: true, preview });
  }
  catch (error) { self.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) }); }
};
