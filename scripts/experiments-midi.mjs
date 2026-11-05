/** No vault access: compare candidate browser bundle and exact byte fixture round-trip. */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseMidi, writeMidi } from 'midi-file';
const result = await build({ stdin: { contents: 'export {parseMidi,writeMidi} from "midi-file";', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', minify: true });
const bytes = result.outputFiles[0]?.contents; if (!bytes) throw new Error('No candidate bundle');
const fixture = [77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,0,0,0,13,0,144,60,100,131,96,128,60,0,0,255,47,0];
const decoded = parseMidi(fixture), reencoded = writeMidi(decoded);
if (JSON.stringify(fixture) !== JSON.stringify(reencoded)) throw new Error('Known fixture changed');
const measurements = { candidate: 'midi-file@1.2.4', minifiedBrowserBytes: bytes.length, gzipBytes: gzipSync(bytes).length, fixtureBytes: fixture.length, exactRoundTrip: true, productionDependency: false };
await mkdir('output/experiments', { recursive: true }); await writeFile('output/experiments/midi.json', JSON.stringify(measurements, null, 2) + '\n');
console.log(JSON.stringify(measurements, null, 2));
