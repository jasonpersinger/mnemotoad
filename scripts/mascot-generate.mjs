/**
 * MNEMOTOAD mascot generator (dependency-free, deterministic). Source of truth: assets/mascot/sprites.json — one
 * character per logical pixel, `.` = fully transparent, letters = the five canonical brand colours only.
 * Writes, into assets/mascot/:
 *   <id>.png        native 24×24 master (RGBA, alpha 0 or 255 only)
 *   <id>@8x.png     192×192 preview, every logical pixel copied to an 8×8 block (nearest neighbour, no filtering)
 *   concept-sheet.png  the three @8x previews side by side, 16 px transparent gutters
 * Usage: node scripts/mascot-generate.mjs   (verify with node scripts/mascot-verify.mjs)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const DIR = process.env.MNEMOTOAD_MASCOT_DIR ?? 'assets/mascot', SCALE = 8, GUTTER = 16;
const spec = JSON.parse(readFileSync(`${DIR}/sprites.json`, 'utf8'));
const CANONICAL = ['#070707', '#28231c', '#317b22', '#801a86', '#f4e409'];
const colours = Object.entries(spec.palette);
if (colours.length !== 5 || colours.some(([, hex]) => !CANONICAL.includes(hex))) throw Error('Palette must be exactly the five canonical MNEMOTOAD colours.');
const rgba = Object.fromEntries(colours.map(([key, hex]) => [key, [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(255)]));

/** Logical grid → RGBA pixel rows, scaled by an integer factor (block copy = nearest neighbour). */
function raster(rows, scale) {
  const size = spec.size, out = Buffer.alloc(size * scale * size * scale * 4);
  if (rows.length !== size || rows.some(r => r.length !== size)) throw Error(`Every sprite must be ${size}×${size}.`);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === spec.transparent) return;
    const px = rgba[ch]; if (!px) throw Error(`Unknown palette key ${ch}`);
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) out.set(px, (((y * scale + dy) * size * scale) + x * scale + dx) * 4);
  }));
  return { width: size * scale, height: size * scale, data: out };
}
function crc32(bytes) { let c = ~0; for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, body) { const head = Buffer.alloc(8); head.writeUInt32BE(body.length); head.write(type, 4, 'latin1'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body]))); return Buffer.concat([head, body, crc]); }
/** Minimal PNG: 8-bit RGBA, no interlace, filter 0 on every row, no ancillary chunks (no gamma/colour-profile drift). */
function png({ width, height, data }) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const written = [];
const save = (name, image) => { writeFileSync(`${DIR}/${name}`, png(image)); written.push(`${DIR}/${name} ${image.width}×${image.height}`); };
const previews = spec.concepts.map(c => { save(`${c.id}.png`, raster(c.rows, 1)); const big = raster(c.rows, SCALE); save(`${c.id}@${SCALE}x.png`, big); return big; });
const sheet = { width: previews.length * previews[0].width + (previews.length - 1) * GUTTER, height: previews[0].height };
sheet.data = Buffer.alloc(sheet.width * sheet.height * 4);
previews.forEach((p, i) => { for (let y = 0; y < p.height; y++) p.data.copy(sheet.data, (y * sheet.width + i * (p.width + GUTTER)) * 4, y * p.width * 4, (y + 1) * p.width * 4); });
save('concept-sheet.png', sheet);
console.log(written.join('\n'));
