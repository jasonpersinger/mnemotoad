import { mkdir, readFile, writeFile, copyFile, lstat, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devVaultName } from './dev-target.mjs';

const root = await realpath(join(dirname(fileURLToPath(import.meta.url)), '..'));
const vault = join(root, devVaultName);
const markerText = 'MNEMOBARD disposable development vault v1\n';
async function exists(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
async function safe(path) {
  const entry = await exists(path);
  if (entry?.isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`);
  return entry;
}
const present = await safe(vault);
if (present) {
  const marker = join(vault, '.mnemobard-disposable'); await safe(marker);
  if (await readFile(marker, 'utf8').catch(error => { throw new Error(`Existing dev-vault is not an authorized disposable vault: ${error.message}`); }) !== markerText) {
    throw new Error('Existing dev-vault has an unrecognized marker; nothing was copied.');
  }
} else {
  await mkdir(vault); await writeFile(join(vault, '.mnemobard-disposable'), markerText, { flag: 'wx' });
}
const config = join(vault, '.obsidian'), plugins = join(config, 'plugins'), target = join(plugins, 'mnemobard');
for (const path of [config, plugins, target]) { await safe(path); await mkdir(path, { recursive: true }); }
// Only the three generated plugin artifacts are replaced; data.json and all
// entity/recovery notes are retained. No cleanup/delete command is provided.
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  const source = join(root, name), destination = join(target, name);
  await safe(source); await safe(destination); await copyFile(source, destination);
}
const enabledFile = join(config, 'community-plugins.json'); await safe(enabledFile);
const enabled = (await exists(enabledFile)) ? JSON.parse(await readFile(enabledFile, 'utf8')) : [];
if (!Array.isArray(enabled) || enabled.some(x => typeof x !== 'string')) throw new Error('Invalid disposable-vault community plugin list; inspect it manually.');
await writeFile(enabledFile, JSON.stringify([...new Set([...enabled, 'mnemobard'])], null, 2) + '\n');
for (const [name, text] of [
  ['DISPOSABLE.md', '# MNEMOBARD disposable development vault\n\nSynthetic foundation tests only. No personal notes, sync, or remote services. The three module views are placeholders.\n'],
  ['.obsidian/core-plugins.json', '[]\n'],
]) {
  const path=join(vault,name); if (!(await safe(path))) await writeFile(path,text,{ flag: 'wx' });
}
console.log(`Prepared only the marked disposable vault: ${vault}`);
