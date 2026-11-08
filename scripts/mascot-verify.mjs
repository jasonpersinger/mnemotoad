/**
 * MNEMOTOAD mascot verifier. Decodes every exported PNG independently of the generator (inflate + all five PNG row
 * filters) and checks, per file: PNG header (8-bit RGBA, not interlaced), documented dimensions, that every pixel is
 * either fully transparent or fully opaque (no antialiasing / partial alpha), that every opaque pixel is one of the five
 * canonical colours, and for enlarged previews and the sheet that every 8×8 block is uniform and equal to the native
 * master's pixel (proof of nearest-neighbour scaling). Exit code 1 on any failure.
 * Usage: node scripts/mascot-verify.mjs [--json out.json]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const DIR = process.env.MNEMOTOAD_MASCOT_DIR ?? 'assets/mascot', SCALE = 8, GUTTER = 16;
const CANONICAL = new Set(['#070707', '#28231c', '#317b22', '#801a86', '#f4e409']);
const spec = JSON.parse(readFileSync(`${DIR}/sprites.json`, 'utf8')), N = spec.size;

function decode(path) {
  const b = readFileSync(path), chunks = [];
  if (b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('not a PNG');
  let at = 8, idat = [];
  while (at < b.length) { const len = b.readUInt32BE(at), type = b.toString('latin1', at + 4, at + 8), body = b.subarray(at + 8, at + 8 + len); chunks.push(type); if (type === 'IDAT') idat.push(body); if (type === 'IHDR') var ihdr = body; at += 12 + len; }
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4), depth = ihdr[8], colourType = ihdr[9], interlace = ihdr[12];
  if (depth !== 8 || colourType !== 6 || interlace !== 0) return { width, height, chunks, header: `depth ${depth} colour type ${colourType} interlace ${interlace}` };
  const raw = inflateSync(Buffer.concat(idat)), stride = width * 4, data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = data.subarray(y * stride, (y + 1) * stride), up = y ? data.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? out[i - 4] : 0, c = i >= 4 ? up[i - 4] : 0, u = up[i];
      const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c);
      out[i] = (row[i] + [0, a, u, (a + u) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? u : c][f]) & 255;
    }
  }
  return { width, height, chunks, header: 'RGBA8', data };
}
const hex = (d, i) => '#' + [0, 1, 2].map(k => d[i + k].toString(16).padStart(2, '0')).join('');
function inspect(path, expectW, expectH) {
  const img = decode(path), problems = [], used = new Set(); let transparent = 0, opaque = 0, partial = 0;
  if (img.header !== 'RGBA8') problems.push(`unexpected PNG format: ${img.header}`);
  if (img.width !== expectW || img.height !== expectH) problems.push(`dimensions ${img.width}×${img.height}, expected ${expectW}×${expectH}`);
  const extra = img.chunks.filter(t => !['IHDR', 'IDAT', 'IEND'].includes(t)); if (extra.length) problems.push(`ancillary chunks ${extra.join(',')}`);
  if (img.data) for (let i = 0; i < img.data.length; i += 4) {
    const alpha = img.data[i + 3];
    if (alpha === 0) transparent++; else if (alpha === 255) { opaque++; const h = hex(img.data, i); used.add(h); if (!CANONICAL.has(h)) problems.push(`non-canonical colour ${h}`); } else partial++;
  }
  if (partial) problems.push(`${partial} partially transparent pixels`);
  return { path, width: img.width, height: img.height, transparent, opaque, partialAlpha: partial, colours: [...used].sort(), problems: [...new Set(problems)], img };
}
/** Every SCALE×SCALE block at (ox+x·SCALE, oy+y·SCALE) is uniform and equals native pixel (x, y). */
function nearestNeighbour(big, native, ox = 0) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const want = native.img.data.readUInt32BE((y * N + x) * 4);
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) if (big.img.data.readUInt32BE(((y * SCALE + dy) * big.width + ox + x * SCALE + dx) * 4) !== want) return false;
  }
  return true;
}
const results = [];
const sheet = inspect(`${DIR}/concept-sheet.png`, 3 * N * SCALE + 2 * GUTTER, N * SCALE);
spec.concepts.forEach((c, i) => {
  const native = inspect(`${DIR}/${c.id}.png`, N, N), big = inspect(`${DIR}/${c.id}@${SCALE}x.png`, N * SCALE, N * SCALE);
  const grid = c.rows.every((row, y) => [...row].every((ch, x) => { const a = native.img.data?.[(y * N + x) * 4 + 3]; return ch === spec.transparent ? a === 0 : a === 255 && hex(native.img.data, (y * N + x) * 4) === spec.palette[ch]; }));
  if (!grid) native.problems.push('pixels differ from sprites.json');
  if (!big.problems.length && !nearestNeighbour(big, native)) big.problems.push('not a nearest-neighbour enlargement of the master');
  if (!sheet.problems.length && !nearestNeighbour(sheet, native, i * (N * SCALE + GUTTER))) sheet.problems.push(`${c.id} block in the sheet is not a nearest-neighbour copy`);
  results.push({ concept: c.id, name: c.name, native, preview: big });
});
const strip = r => { const { img, ...rest } = r; void img; return rest; };
/** 0.2.0: the canonical (approved) mascot — B2, The Curmudgeon. Checked when mascot.json is present in the directory. */
let mascot = null;
if (existsSync(`${DIR}/mascot.json`)) {
  const m = JSON.parse(readFileSync(`${DIR}/mascot.json`, 'utf8')), problems = [];
  const native = inspect(`${DIR}/mnemotoad-mascot.png`, N, N), big = inspect(`${DIR}/mnemotoad-mascot@8x.png`, N * SCALE, N * SCALE);
  if (m.id !== 'b2-curmudgeon' || m.status !== 'approved') problems.push(`mascot.json is ${m.id}/${m.status}, expected the approved b2-curmudgeon`);
  if (Object.values(m.palette).some(h => !CANONICAL.has(h))) problems.push('mascot.json palette has a non-canonical colour');
  const matches = native.img.data && m.rows.length === N && m.rows.every((row, y) => row.length === N && [...row].every((ch, x) => { const i = (y * N + x) * 4, a = native.img.data[i + 3]; return ch === m.transparent ? a === 0 : a === 255 && hex(native.img.data, i) === m.palette[ch]; }));
  if (!matches) native.problems.push('pixels differ from mascot.json');
  if (!big.problems.length && !native.problems.length && !nearestNeighbour(big, native)) big.problems.push('not a nearest-neighbour enlargement of the canonical mascot');
  const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex'), approved = `${DIR}/refinement/b2-curmudgeon.png`;
  if (existsSync(approved)) {
    if (sha(approved) !== sha(`${DIR}/mnemotoad-mascot.png`)) problems.push('canonical PNG is not byte-identical to the approved refinement B2');
    const ref = JSON.parse(readFileSync(`${DIR}/refinement/sprites.json`, 'utf8')).concepts.find(c => c.id === 'b2-curmudgeon');
    if (JSON.stringify(ref?.rows) !== JSON.stringify(m.rows)) problems.push('mascot.json rows differ from the approved refinement B2');
  } else problems.push('approved refinement B2 reference is missing');
  mascot = { id: m.id, name: m.name, sha256: sha(`${DIR}/mnemotoad-mascot.png`), native: strip(native), preview: strip(big), problems };
}
const report = { size: `${N}×${N}`, scale: SCALE, canonical: [...CANONICAL], concepts: results.map(r => ({ concept: r.concept, name: r.name, native: strip(r.native), preview: strip(r.preview) })), sheet: strip(sheet) };
report.mascot = mascot;
report.pass = [sheet, ...results.flatMap(r => [r.native, r.preview]), ...(mascot ? [mascot, mascot.native, mascot.preview] : [])].every(r => !r.problems.length);
const out = process.argv.indexOf('--json'); if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pass: report.pass, canonicalMascot: mascot && { id: mascot.id, sha256: mascot.sha256, problems: mascot.problems }, files: [sheet, ...results.flatMap(r => [r.native, r.preview]), ...(mascot ? [mascot.native, mascot.preview] : [])].map(r => `${r.path} ${r.width}×${r.height} colours=${r.colours.join(',')} partial=${r.partialAlpha} ${r.problems.join('; ') || 'OK'}`) }, null, 1));
process.exitCode = report.pass ? 0 : 1;
