/** Independently constructed SMF bytes, no candidate codec writer. */
export function vlq(value: number): number[] { const bytes = [value & 127]; while ((value = Math.floor(value / 128))) bytes.unshift((value & 127) | 128); return bytes; }
export const event = (delta: number, ...data: number[]): number[] => [...vlq(delta), ...data];
export const end = (delta = 0): number[] => event(delta, 0xff, 0x2f, 0);
export const tempo = (value = 500000): number[] => event(0, 0xff, 0x51, 3, value >> 16, value >> 8 & 255, value & 255);
export const meter = (n = 4, exponent = 2): number[] => event(0, 0xff, 0x58, 4, n, exponent, 24, 8);
const int = (value: number, size: number): number[] => Array.from({ length: size }, (_, i) => Math.floor(value / 256 ** (size - i - 1)) & 255);
export function smf(tracks: number[][], format = tracks.length === 1 ? 0 : 1, ppq = 480): Uint8Array {
  return Uint8Array.from([77,84,104,100,0,0,0,6,...int(format,2),...int(tracks.length,2),...int(ppq,2),...tracks.flatMap(track => [77,84,114,107,...int(track.length,4),...track])]);
}
export function melody(ppq = 480): Uint8Array { return smf([[...tempo(),...meter(),...event(1,0x90,60,87),...event(37,0x80,60,0),...event(0,0x90,60,43),...event(39,0x90,60,0),...end(23)]],0,ppq); }
