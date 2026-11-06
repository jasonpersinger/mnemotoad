/** Reviewed1B rational arithmetic; transient fractions never replace source integer PPQ ticks. */
export interface Fraction { readonly n: bigint; readonly d: bigint }
export class MusicalInputError extends Error {
  constructor(message: string) { super(message); this.name = 'MusicalInputError'; }
}
export function integer(value: number, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new MusicalInputError(`${name}: expected integer ${min}..${max}, received ${value}`);
  return value;
}
export function fraction(n: bigint, d = 1n): Fraction {
  if (d <= 0n) throw new MusicalInputError('Rational denominator must be positive');
  let a = n < 0n ? -n : n, b = d;
  while (b) { const next = a % b; a = b; b = next; }
  return Object.freeze({ n: n / a, d: d / a });
}
export const add = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
export const subtract = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
export const multiply = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.n, a.d * b.d);
export const compare = (a: Fraction, b: Fraction): number => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
export const numeric = (a: Fraction): number => Number(a.n) / Number(a.d);
export const describe = (a: Fraction): string => `${a.n}/${a.d}`;
export const ppq = (value: number): number => integer(value, 'PPQ', 1, 32767);
export const quarters = (ticks: number, resolution: number): Fraction => fraction(BigInt(integer(ticks, 'ticks')), BigInt(ppq(resolution)));
export const ticksAt = (position: Fraction, resolution: number): Fraction => multiply(position, fraction(BigInt(ppq(resolution))));
export interface TempoChange { readonly tick: number; readonly microsecondsPerQuarter: number }
interface Segment { position: Fraction; elapsed: Fraction; tempo: Fraction }
function segmentAt(segments: readonly Segment[], value: Fraction, key: 'position' | 'elapsed'): Segment {
  let low = 0, high = segments.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2), candidate = segments[middle];
    if (candidate && compare(candidate[key], value) <= 0) low = middle; else high = middle - 1;
  }
  const result = segments[low];
  if (!result) throw new MusicalInputError('Missing initial tempo');
  return result;
}
function decimalFraction(value: number): Fraction {
  const [mantissa = '0', exponent = '0'] = value.toString().split('e');
  const places = (mantissa.split('.')[1]?.length ?? 0) - Number(exponent);
  const digits = BigInt(mantissa.replace('.', ''));
  return places > 0 ? fraction(digits, 10n ** BigInt(places)) : fraction(digits * 10n ** BigInt(-places));
}
export class TempoMap {
  private readonly segments: readonly Segment[];
  constructor(readonly resolution: number, changes: readonly TempoChange[]) {
    ppq(resolution);
    if (!changes.length || changes[0]?.tick !== 0) throw new MusicalInputError('Tempo map must begin at tick 0');
    if (changes.length > 10000) throw new MusicalInputError('Tempo map limit 10000 exceeded');
    let previous: Segment | undefined, previousTick = -1;
    this.segments = changes.map(change => {
      integer(change.tick, 'tempo tick'); integer(change.microsecondsPerQuarter, 'tempo microseconds/quarter', 1, 0xffffff);
      if (change.tick <= previousTick) throw new MusicalInputError('Tempo changes must be strictly ordered with unique ticks');
      const position = quarters(change.tick, resolution);
      const elapsed = previous ? add(previous.elapsed, multiply(subtract(position, previous.position), previous.tempo)) : fraction(0n);
      const segment = { position, elapsed, tempo: fraction(BigInt(change.microsecondsPerQuarter)) };
      previous = segment; previousTick = change.tick;
      return segment;
    });
  }
  microseconds(position: Fraction): Fraction {
    if (position.n < 0n) throw new MusicalInputError('Musical position must be nonnegative');
    const segment = segmentAt(this.segments, position, 'position');
    return add(segment.elapsed, multiply(subtract(position, segment.position), segment.tempo));
  }
  positionAtMicroseconds(elapsed: Fraction): Fraction {
    if (elapsed.n < 0n) throw new MusicalInputError('Elapsed time must be nonnegative');
    const segment = segmentAt(this.segments, elapsed, 'elapsed');
    return add(segment.position, multiply(subtract(elapsed, segment.elapsed), fraction(segment.tempo.d, segment.tempo.n)));
  }
  seconds(position: Fraction): number { return numeric(this.microseconds(position)) / 1_000_000; }
  /** Floating-point convenience at the audio boundary; does not promise a recoverable source integer. */
  secondsToTicks(seconds: number, resolution: number): number {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 1e9) throw new MusicalInputError('Seconds must be finite and within 0..1e9');
    // Preserve the Number's decimal representation; precision lost before this boundary cannot be recovered.
    const position = this.positionAtMicroseconds(multiply(decimalFraction(seconds), fraction(1_000_000n)));
    return numeric(ticksAt(position, resolution));
  }
}
export function barQuarters(numerator: number, denominator: number): Fraction {
  integer(numerator, 'meter numerator', 1, 255);
  if (![1, 2, 4, 8, 16, 32, 64, 128].includes(denominator)) throw new MusicalInputError('Meter denominator must be a supported power of two');
  return fraction(BigInt(numerator * 4), BigInt(denominator));
}
