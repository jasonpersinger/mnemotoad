import type { Meter } from '../domain/entities';
import { integer } from './timing';

const plural = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? '' : 's'}`;

/**
 * 4G: an exact musician-readable duration ("2 bars", "1 bar 2 beats", "3 beats 240 ticks"). The beat is the meter's written
 * denominator, so 6/8 counts eighths. Nothing is rounded: any remainder is shown in ticks. When the beat is not a whole
 * number of ticks at this PPQ the raw tick count is returned unchanged (still exact).
 */
export function musicalDuration(ticks: number, ppq: number, meter: Meter): string {
  integer(ticks, 'duration', 0, 1e9);
  integer(ppq, 'PPQ', 1, 32767);
  if ((ppq * 4) % meter.denominator !== 0) return plural(ticks, 'tick');
  const beat = ppq * 4 / meter.denominator, bar = beat * meter.numerator;
  const bars = Math.floor(ticks / bar), rest = ticks - bars * bar, beats = Math.floor(rest / beat), remainder = rest - beats * beat;
  const parts = [bars && plural(bars, 'bar'), beats && plural(beats, 'beat'), remainder && plural(remainder, 'tick')].filter((p): p is string => !!p);
  return parts.length ? parts.join(' ') : '0 ticks';
}
