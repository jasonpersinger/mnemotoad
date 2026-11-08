import type { MusicalEvent } from './compiler';
export interface MusicalSink {
  readonly now: number; readonly running: boolean; readonly activeVoices: number;
  resume(): Promise<void>; schedule(event: MusicalEvent, at: number): void; cancel(): void; close(): Promise<void>;
}
/**
 * Peak gain of one sine voice for a MIDI velocity (1–127). All voices sum into one shared limiter before the speakers,
 * so this sets how loud a single note or a sparse phrase is; dense chords are held below full scale by the limiter.
 * Linear in velocity, 0.175 at 127: velocity 96 ≈ −17.6 dBFS, 127 ≈ −15.1 dBFS (0.2.0 used a −50 dBFS test-tone level,
 * which was inaudible).
 */
export function voiceGain(velocity: number): number {
  return .175 * velocity / 127;
}

/** One sine per note through a shared limiter; no patch/instrument/sample hosting. */
export class SineSink implements MusicalSink {
  private context?: AudioContext; private limiter?: DynamicsCompressorNode; private closed = false;
  private voices = new Map<string, { oscillator: OscillatorNode; gain: GainNode; dispose(): void }>();
  get now(): number { return this.context?.currentTime ?? 0; }
  get running(): boolean { return this.context?.state === 'running'; }
  get activeVoices(): number { return this.voices.size; }
  get contextState(): string { return this.context?.state ?? 'not-created'; }
  async resume(): Promise<void> {
    if (this.closed) throw Error('Audio sink is closed');
    this.context ??= new AudioContext({ latencyHint: 'interactive' }); await this.context.resume();
    if (!this.limiter) { // brick-wall-style limiter: polyphony may sum above full scale; never clip the output
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = .002; limiter.release.value = .1;
      limiter.connect(this.context.destination); this.limiter = limiter;
    }
    if (this.closed || this.context.state !== 'running') throw Error('Audio is suspended or closed. Start again from Play.');
  }
  schedule(event: MusicalEvent, at: number): void {
    const context = this.context; if (this.closed || !context || context.state !== 'running') throw Error('Audio context is unavailable');
    if (event.kind === 'off') {
      const voice = this.voices.get(event.voiceId); if (!voice) throw Error(`Missing voice ${event.voiceId}`);
      voice.gain.gain.setTargetAtTime(0, at, .003); voice.oscillator.stop(at + .015); return;
    }
    if (!Number.isFinite(event.durationSeconds) || !(Number(event.durationSeconds) > 0)) throw Error('A note-on must include its compiled duration');
    if (this.voices.has(event.voiceId) || this.voices.size >= 256) throw Error('Pending voice bound exceeded; playback stopped without dropping notes');
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 440 * 2 ** ((event.pitch - 69) / 12);
    gain.gain.value = 0; gain.gain.setTargetAtTime(voiceGain(event.velocity), at, .003);
    oscillator.connect(gain); gain.connect(this.limiter ?? context.destination);
    let cleaned = false;
    const voice = { oscillator, gain, dispose: () => {
      if (cleaned) return; cleaned = true; oscillator.onended = null; oscillator.disconnect(); gain.disconnect(); this.voices.delete(event.voiceId);
    } };
    oscillator.onended = voice.dispose; this.voices.set(event.voiceId, voice);
    try { oscillator.start(at); const end = at + Number(event.durationSeconds); gain.gain.setTargetAtTime(0, end, .003); oscillator.stop(end + .015); } catch (error) { voice.dispose(); throw error; }
  }
  cancel(): void {
    let failure: unknown;
    for (const voice of [...this.voices.values()]) {
      try { voice.gain.gain.cancelScheduledValues(0); voice.gain.gain.value = 0; voice.oscillator.stop(); }
      catch (error) { failure ??= error; }
      finally { voice.dispose(); }
    }
    if (failure) throw new Error('Voice cancellation failed; all nodes were disconnected.', { cause: failure });
  }
  async close(): Promise<void> {
    if (this.closed) return; this.closed = true;
    try { this.cancel(); }
    finally { this.limiter?.disconnect(); if (this.context && this.context.state !== 'closed') await this.context.close(); }
  }
}
