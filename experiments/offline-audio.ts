/** Algorithmic onset probe; no device, speaker or loopback latency is measured. */
export async function offlineOnsetProbe(): Promise<object> {
  const sampleRate = 48000, context = new OfflineAudioContext(1, sampleRate * 2, sampleRate);
  const expected = [.125, .5, 1.5].map(time => Math.round(time * sampleRate));
  for (const frame of expected) {
    const source = context.createConstantSource(); source.offset.value = .1; source.connect(context.destination);
    source.start(frame / sampleRate); source.stop((frame + 48) / sampleRate);
  }
  const rendered = await context.startRendering(), samples = rendered.getChannelData(0), observed: number[] = [];
  for (let frame = 0; frame < samples.length; frame++) if (Math.abs(samples[frame] ?? 0) > .01 && (frame === 0 || Math.abs(samples[frame - 1] ?? 0) <= .01)) observed.push(frame);
  if (JSON.stringify(expected) !== JSON.stringify(observed)) throw new Error(`Offline onset mismatch: ${observed.join(',')}`);
  return { sampleRate, expectedFrames: expected, observedFrames: observed, scope: 'OfflineAudioContext scheduling only; no audible-output latency claim' };
}
