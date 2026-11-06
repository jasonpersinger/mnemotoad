import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileArrangementIsolated } from '../src/arrangement/job';
import { compileArrangement } from '../src/arrangement/compiler';
import { exportArrangement } from '../src/arrangement/export';
import { composition, motif, captured, revision } from './support/arrangement-fixtures';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture() {
  vi.stubGlobal('__MNEMOBARD_MIDI_WORKER__', 'self.onmessage=()=>{}');
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const worker = { onmessage: null as Worker['onmessage'], onerror: null as Worker['onerror'], terminate: vi.fn(), postMessage: vi.fn() };
  return { worker, revoke, factory: () => worker as unknown as Worker };
}
it('arrangement worker carries exact provenance/BigInt events and transfers a complete deterministic result', async () => {
  const m = motif(), c = composition([m]), sources = [captured(m)], { worker, revoke, factory } = fixture();
  const pending = compileArrangementIsolated(c, sources, revision, new AbortController().signal, factory);
  expect(worker.postMessage.mock.calls[0]?.[0]).toEqual({ kind: 'arrangement', composition: c, sources, inputRevision: revision });
  const result = compileArrangement(c, sources, revision); if (!result.ok) throw Error('Fixture invalid');
  const compiled = { result, bytes: exportArrangement(result.arrangement), metrics: { compileMs: 1, serializeMs: 1 } };
  worker.onmessage?.call(worker as unknown as Worker, new MessageEvent('message', { data: { ok: true, compiled } }));
  expect(await pending).toEqual(compiled); expect(worker.terminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce();
});
it('cancels arrangement expansion and ignores late success, releasing worker/URL exactly once', async () => {
  const m = motif(), { worker, revoke, factory } = fixture(), abort = new AbortController();
  const pending = compileArrangementIsolated(composition([m]), [captured(m)], revision, abort.signal, factory); abort.abort();
  await expect(pending).rejects.toThrow('cancelled');
  worker.onmessage?.call(worker as unknown as Worker, new MessageEvent('message', { data: { ok: true, compiled: {} } }));
  expect(worker.terminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce();
});
it('enforces arrangement worker deadline and preserves actionable worker errors', async () => {
  vi.useFakeTimers(); const m = motif(), { worker, revoke, factory } = fixture();
  const pending = compileArrangementIsolated(composition([m]), [captured(m)], revision, new AbortController().signal, factory), rejected = expect(pending).rejects.toThrow('10 seconds');
  await vi.advanceTimersByTimeAsync(10000); await rejected; expect(worker.terminate).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce();
});
it('export matches the original synthetic golden SMF without rewriting that fixture', () => {
  const m = motif(), result = compileArrangement(composition([m]), [captured(m)], revision); if (!result.ok) throw Error('Fixture invalid');
  expect(Buffer.from(exportArrangement(result.arrangement))).toEqual(readFileSync(new URL('./fixtures/arrangement-single.mid', import.meta.url)));
});
