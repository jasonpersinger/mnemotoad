/** Only synthetic fixtures in a designated project-local directory; never overwrite. */
import { mkdir, lstat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url), directory = new URL('.runtime/synthetic/milestone-2b/', root);
for (const part of ['.runtime/', '.runtime/synthetic/', '.runtime/synthetic/milestone-2b/']) {
  const path = new URL(part, root);
  try { const stat = await lstat(path); if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Unsafe synthetic fixture directory'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(path); }
}
async function create(name, bytes) {
  const path = new URL(name, directory);
  try { const stat = await lstat(path); if (stat.isSymbolicLink() || !stat.isFile()) throw Error('Unexpected fixture path'); return; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(path, bytes, { flag: 'wx' });
}
const samples = 44100 * 8, wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i=0;i<samples;i++) wav.writeInt16LE(Math.round(Math.sin(i*220*2*Math.PI/44100)*160),44+i*2);
await create('audition.wav', wav); await create('external.wav', wav);
await create('panel.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=', 'base64'));
await create('sound.custom-preset', 'Synthetic inert preset fixture\n'); await create('unsupported.wav', 'Synthetic unsupported audio\n');
for (const [extension, codec] of [['mp3','libmp3lame'],['ogg','libvorbis'],['flac','flac']]) {
  const path = new URL(`audition.${extension}`, directory);
  try { const stat = await lstat(path); if (stat.isSymbolicLink() || !stat.isFile()) throw Error('Unexpected encoded fixture'); continue; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await promisify(execFile)('ffmpeg', ['-n','-hide_banner','-loglevel','error','-i',fileURLToPath(new URL('audition.wav',directory)),'-c:a',codec,fileURLToPath(path)]);
}
console.log('Synthetic fixtures prepared/preserved only under .runtime/synthetic/milestone-2b. Optional codec generation requires an existing ffmpeg; no installs.');
