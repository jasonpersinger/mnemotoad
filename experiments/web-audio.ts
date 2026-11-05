import type { TimedEvent } from './compiler';
import type { PlaybackSink } from './transport';

interface Voice { oscillator: OscillatorNode; gain: GainNode; dispose: () => void }
/** A quiet sine tone for the feasibility harness, not an instrument implementation. */
export class TestToneSink implements PlaybackSink {
  private context?: AudioContext;
  private readonly voices = new Map<string, Voice>();
  private disposed = false;
  createdVoices = 0;
  releasedVoices = 0;
  maxVoices = 0;
  get now(): number { return this.context?.currentTime ?? 0; }
  get running(): boolean { return this.context?.state === 'running'; }
  get activeVoices(): number { return this.voices.size; }
  get contextState(): string { return this.context?.state ?? 'not-created'; }
  get contextInfo(): object {
    return { state: this.contextState, sampleRate: this.context?.sampleRate, baseLatency: this.context?.baseLatency, outputLatency: this.context?.outputLatency };
  }
  async resume(): Promise<void> {
    if (this.disposed) throw new Error('Test-tone sink disposed');
    this.context ??= new AudioContext({ latencyHint: 'interactive' });
    await this.context.resume();
    if (this.disposed) return;
    if (this.context.state !== 'running') throw new Error(`AudioContext ${this.context.state}; use the playback button to resume audio`);
  }
  schedule(event: TimedEvent, at: number): void {
    const context = this.context;
    if (this.disposed || !context || context.state !== 'running') throw new Error('AudioContext is not running');
    if (event.kind === 'off') {
      const voice = this.voices.get(event.voiceId);
      if (!voice) throw new Error(`Missing scheduled voice ${event.voiceId}`);
      voice.gain.gain.setTargetAtTime(0, at, .003);
      voice.oscillator.stop(at + .02);
      return;
    }
    if (this.voices.has(event.voiceId)) throw new Error('Voice identity collision');
    if (this.voices.size >= 64) throw new Error('Test-tone polyphony limit 64 exceeded');
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = 440 * 2 ** ((event.pitch - 69) / 12);
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(.015 * event.velocity / 127, at, .003);
    oscillator.connect(gain); gain.connect(context.destination);
    let cleaned = false;
    const voice: Voice = { oscillator, gain, dispose: () => {
      if (cleaned) return; cleaned = true;
      oscillator.onended = null; oscillator.disconnect(); gain.disconnect();
      if (this.voices.get(event.voiceId) === voice) this.voices.delete(event.voiceId);
      this.releasedVoices++;
    } };
    oscillator.onended = voice.dispose;
    this.voices.set(event.voiceId, voice); this.createdVoices++; this.maxVoices = Math.max(this.maxVoices, this.voices.size);
    try { oscillator.start(at); } catch (error) { voice.dispose(); throw error; }
  }
  cancel(): void {
    for (const voice of [...this.voices.values()]) {
      voice.gain.gain.cancelScheduledValues(0); voice.gain.gain.value = 0;
      voice.oscillator.stop(); voice.dispose();
    }
  }
  async close(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true; this.cancel();
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }
}
