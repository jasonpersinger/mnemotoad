/** Deliberately separate from production build. Deploys disabled to the marked disposable vault only. */
import { build } from 'esbuild';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const vault = join(root, 'dev-vault');
async function guard(path) {
  try { if ((await lstat(path)).isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const relative of ['dev-vault', 'dev-vault/.mnemobard-disposable', 'dev-vault/.obsidian', 'dev-vault/.obsidian/plugins', 'dev-vault/.obsidian/plugins/mnemobard-experiments']) await guard(join(root, relative));
if (await readFile(join(vault, '.mnemobard-disposable'), 'utf8') !== 'MNEMOBARD disposable development vault v1\n') throw new Error('Prepare the disposable vault first');
const target = join(vault, '.obsidian/plugins/mnemobard-experiments');
await mkdir(target, { recursive: true });
for (const name of ['main.js', 'manifest.json']) await guard(join(target, name));
const result = await build({ entryPoints: [join(root, 'experiments/plugin.ts')], bundle: true, write: false, platform: 'browser', format: 'cjs', target: 'es2022', external: ['obsidian'], minify: true, define: { EXPERIMENT_VAULT: JSON.stringify(vault) } });
const bundle = result.outputFiles[0]; if (!bundle) throw new Error('No experimental bundle produced');
await writeFile(join(target, 'main.js'), bundle.contents);
await writeFile(join(target, 'manifest.json'), JSON.stringify({ id: 'mnemobard-experiments', name: 'MNEMOBARD Experiments (disposable only)', version: '0.0.1', minAppVersion: '1.15.0', description: 'Isolated Milestone 1B synthetic feasibility lab. Not production.', author: 'MNEMOBARD', isDesktopOnly: true }, null, 2) + '\n');
console.log(`Experimental bundle: ${bundle.contents.length} bytes. Deployed ONLY to ${target}; not added to enabled plugins.`);
