// @vitest-environment jsdom
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import sprites from '../assets/mascot/sprites.json';
import mascot from '../assets/mascot/mascot.json';
import { mascotMark, MASCOT_ID } from '../src/ui/mascot';

/** MNEMOTOAD mascot: strict five-colour palette, 24×24 masters, binary alpha, nearest-neighbour previews. */
const CANONICAL = ['#070707', '#28231c', '#317b22', '#801a86', '#f4e409'];
const verify = (dir?: string) => spawnSync(process.execPath, ['scripts/mascot-verify.mjs'], { encoding: 'utf8', env: { ...process.env, ...(dir ? { MNEMOTOAD_MASCOT_DIR: dir } : {}) } });
const temps: string[] = []; afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); document.body.replaceChildren(); });
/** Independent minimal RGBA PNG writer, used only to plant defects the verifier must catch. */
function png(width: number, height: number, rgba: Uint8Array): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), body]))); return Buffer.concat([len, Buffer.from(type, 'latin1'), body, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height); for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function copyAssets(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mnemotoad-mascot-')); temps.push(dir);
  for (const name of ['sprites.json', 'concept-sheet.png', ...sprites.concepts.flatMap(c => [`${c.id}.png`, `${c.id}@8x.png`])]) copyFileSync(`assets/mascot/${name}`, join(dir, name));
  return dir;
}
/** The committed master of concept A as RGBA, with one pixel replaced. */
function masterWith(x: number, y: number, pixel: number[]): Uint8Array {
  const data = new Uint8Array(24 * 24 * 4);
  sprites.concepts[0]?.rows.forEach((row, ry) => [...row].forEach((key, rx) => { if (key !== '.') { const hex = (sprites.palette as Record<string, string>)[key] ?? ''; data.set([1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(255), (ry * 24 + rx) * 4); } }));
  data.set(pixel, (y * 24 + x) * 4); return data;
}

describe('mascot sprite data', () => {
  it('declares exactly the five canonical colours and three 24×24 concepts with no accessories palette', () => {
    expect(Object.values(sprites.palette).sort()).toEqual([...CANONICAL].sort());
    expect(sprites.size).toBe(24);
    expect(sprites.concepts.map(c => c.id)).toEqual(['a-familiar', 'b-grump', 'c-watcher']);
    for (const c of sprites.concepts) { expect(c.rows).toHaveLength(24); for (const row of c.rows) expect(row).toMatch(/^[.KUGVY]{24}$/); }
  });
});

describe('exported PNGs (independent decoder)', () => {
  it('pass palette, binary-alpha, dimension and nearest-neighbour verification', () => {
    const run = verify(); expect(run.stderr).toBe(''); expect(run.status).toBe(0);
    const report = JSON.parse(run.stdout) as { pass: boolean; files: string[] };
    expect(report.pass).toBe(true); expect(report.files).toHaveLength(9); // 3 concepts ×2 + sheet + canonical ×2
    for (const line of report.files) { expect(line).toMatch(/ partial=0 OK$/); expect(line).not.toMatch(/colours=.*#(?!070707|28231c|317b22|801a86|f4e409)[0-9a-f]{6}/); }
  });
  it('rejects an off-palette colour', () => {
    const dir = copyAssets(); writeFileSync(join(dir, 'a-familiar.png'), png(24, 24, masterWith(10, 10, [0x31, 0x7b, 0x23, 255])));
    const run = verify(dir); expect(run.status).toBe(1); expect(run.stdout).toContain('non-canonical colour #317b23');
  });
  it('rejects a partially transparent (antialiased) pixel', () => {
    const dir = copyAssets(); writeFileSync(join(dir, 'a-familiar.png'), png(24, 24, masterWith(10, 10, [0x31, 0x7b, 0x22, 128])));
    const run = verify(dir); expect(run.status).toBe(1); expect(run.stdout).toContain('1 partially transparent pixels');
  });
  it('rejects wrong dimensions and a preview that is not a nearest-neighbour enlargement', () => {
    const dir = copyAssets(); writeFileSync(join(dir, 'b-grump.png'), png(23, 24, new Uint8Array(23 * 24 * 4)));
    const big = new Uint8Array(192 * 192 * 4); writeFileSync(join(dir, 'c-watcher@8x.png'), png(192, 192, big));
    const run = verify(dir); expect(run.status).toBe(1);
    expect(run.stdout).toContain('dimensions 23×24, expected 24×24'); expect(run.stdout).toContain('not a nearest-neighbour enlargement');
  });
  it('are reproducible: the generator rewrites byte-identical files', () => {
    const dir = copyAssets(), before = sprites.concepts.map(c => readFileSync(join(dir, `${c.id}@8x.png`)));
    const run = spawnSync(process.execPath, ['scripts/mascot-generate.mjs'], { encoding: 'utf8', env: { ...process.env, MNEMOTOAD_MASCOT_DIR: dir } });
    expect(run.status).toBe(0);
    sprites.concepts.forEach((c, i) => expect(readFileSync(join(dir, `${c.id}@8x.png`)).equals(before[i] ?? Buffer.alloc(0))).toBe(true));
  });
});

describe('in-app mark (approved B2 — The Curmudgeon)', () => {
  it('draws the approved mascot on whole pixels with crisp edges, canonical fills and an integer scale', () => {
    const svg = mascotMark(document.body, 2);
    expect(MASCOT_ID).toBe('b2-curmudgeon'); expect(mascot.id).toBe('b2-curmudgeon');
    expect(svg.getAttribute('width')).toBe('48'); expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges'); expect(svg.getAttribute('aria-hidden')).toBe('true');
    const fills = [...svg.querySelectorAll('path')].map(p => p.getAttribute('fill')); expect(fills.every(f => CANONICAL.includes(f ?? ''))).toBe(true);
    // Every drawn unit square is exactly an opaque cell of the master grid.
    const drawn = new Set<string>(); for (const p of svg.querySelectorAll('path')) for (const m of (p.getAttribute('d') ?? '').matchAll(/M(\d+) (\d+)h1v1h-1z/g)) drawn.add(`${m[1]},${m[2]},${p.getAttribute('fill')}`);
    const expected = new Set<string>(); mascot.rows.forEach((row, y) => [...row].forEach((k, x) => { if (k !== '.') expected.add(`${x},${y},${(mascot.palette as Record<string, string>)[k]}`); }));
    expect(drawn).toEqual(expected);
  });
  it('is labelled when it carries meaning on its own', () => {
    const svg = mascotMark(document.body, 4, 'MNEMOTOAD mascot');
    expect(svg.getAttribute('role')).toBe('img'); expect(svg.getAttribute('aria-label')).toBe('MNEMOTOAD mascot'); expect(svg.getAttribute('width')).toBe('96');
  });
});

describe('canonical mascot asset (0.2.0)', () => {
  const APPROVED_SHA256 = '56b47400c0f133d1fc6b6ab3090ae28e14509c055024c914645096d49c0e2bb2'; // B2 as approved from the refinement sheet
  const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
  it('is the exact approved B2 file, and the verifier reports it', () => {
    expect(sha('assets/mascot/mnemotoad-mascot.png')).toBe(APPROVED_SHA256);
    expect(sha('assets/mascot/refinement/b2-curmudgeon.png')).toBe(APPROVED_SHA256);
    expect(mascot.status).toBe('approved'); expect(Object.values(mascot.palette).every(h => CANONICAL.includes(h))).toBe(true);
    const run = verify(); expect(run.status).toBe(0);
    expect((JSON.parse(run.stdout) as { canonicalMascot: unknown }).canonicalMascot).toEqual({ id: 'b2-curmudgeon', sha256: APPROVED_SHA256, problems: [] });
  });
  function copyCanonical(): string {
    const dir = copyAssets(); mkdirSync(join(dir, 'refinement'));
    for (const name of ['mascot.json', 'mnemotoad-mascot.png', 'mnemotoad-mascot@8x.png']) copyFileSync(`assets/mascot/${name}`, join(dir, name));
    for (const name of ['sprites.json', 'b2-curmudgeon.png']) copyFileSync(`assets/mascot/refinement/${name}`, join(dir, 'refinement', name));
    return dir;
  }
  it('fails when the canonical mascot is replaced by another (otherwise valid) sprite', () => {
    const dir = copyCanonical(); copyFileSync('assets/mascot/a-familiar.png', join(dir, 'mnemotoad-mascot.png'));
    const run = verify(dir); expect(run.status).toBe(1);
    expect(run.stdout).toContain('pixels differ from mascot.json'); expect(run.stdout).toContain('not byte-identical to the approved refinement B2');
  });
  it('fails when mascot.json no longer names the approved B2 or its grid drifts', () => {
    const dir = copyCanonical(), m = JSON.parse(readFileSync(join(dir, 'mascot.json'), 'utf8')) as { id: string; rows: string[] };
    m.id = 'b1-skeptic'; m.rows[14] = m.rows[14]?.replace('KK', 'GG') ?? ''; writeFileSync(join(dir, 'mascot.json'), JSON.stringify(m));
    const run = verify(dir); expect(run.status).toBe(1);
    expect(run.stdout).toContain('expected the approved b2-curmudgeon'); expect(run.stdout).toContain('rows differ from the approved refinement B2');
  });
});
