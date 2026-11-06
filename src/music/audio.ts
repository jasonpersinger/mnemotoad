import type { MusicalEvent } from './compiler';
export interface MusicalSink {
  readonly now: number; readonly running: boolean; readonly activeVoices: number;
  resume(): Promise<void>; schedule(event: MusicalEvent, at: number): void; cancel(): void; close(): Promise<void>;
}
/** A single quiet sine per note; no patch/instrument/sample hosting. */
export class SineSink implements MusicalSink {
  private context?: AudioContext; private closed = false;
  private voices = new Map<string, { oscillator: OscillatorNode; gain: GainNode; dispose(): void }>();
  get now(): number { return this.context?.currentTime ?? 0; }
  get running(): boolean { return this.context?.state === 'running'; }
  get activeVoices(): number { return this.voices.size; }
  get contextState(): string { return this.context?.state ?? 'not-created'; }
  async resume(): Promise<void> {
    if (this.closed) throw Error('Audio sink is closed');
    this.context ??= new AudioContext({ latencyHint: 'interactive' }); await this.context.resume();
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
    gain.gain.value = 0; gain.gain.setTargetAtTime(.004 * event.velocity / 127, at, .003);
    oscillator.connect(gain); gain.connect(context.destination);
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
    finally { if (this.context && this.context.state !== 'closed') await this.context.close(); }
  }
}
