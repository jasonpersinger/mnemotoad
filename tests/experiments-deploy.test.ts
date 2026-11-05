import { expect, it } from 'vitest';
import { copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
async function fixture() {
  const area = join(process.cwd(), '.runtime/script-fixtures'); await mkdir(area, { recursive: true });
  const root = await mkdtemp(join(area, 'experiments-')); await mkdir(join(root, 'scripts'));
  await copyFile('scripts/experiments-build.mjs', join(root, 'scripts/experiments-build.mjs'));
  return { root, run: () => execute(process.execPath, [join(root, 'scripts/experiments-build.mjs')]) };
}
it('experimental deployment refuses a wrong marker without modifying existing files', async () => {
  const f = await fixture(), vault = join(f.root, 'dev-vault'); await mkdir(vault);
  await writeFile(join(vault, '.mnemobard-disposable'), 'unrecognized'); await writeFile(join(vault, 'Retain.md'), 'Keep exact');
  await expect(f.run()).rejects.toThrow('Prepare the disposable vault first');
  expect(await readFile(join(vault, 'Retain.md'), 'utf8')).toBe('Keep exact');
});
it('experimental deployment refuses a vault symlink', async () => {
  const f = await fixture(), target = join(f.root, 'owned-target'); await mkdir(target);
  await writeFile(join(target, 'Retain.md'), 'Keep exact'); await symlink(target, join(f.root, 'dev-vault'));
  await expect(f.run()).rejects.toThrow('Refusing symlink'); expect(await readFile(join(target, 'Retain.md'), 'utf8')).toBe('Keep exact');
});
it('experimental deployment refuses artifact symlinks without writing the pointed-to file', async () => {
  const f = await fixture(), vault = join(f.root, 'dev-vault'), target = join(vault, '.obsidian/plugins/mnemobard-experiments');
  await mkdir(target, { recursive: true }); await writeFile(join(vault, '.mnemobard-disposable'), 'MNEMOBARD disposable development vault v1\n');
  const retained = join(f.root, 'retained.txt'); await writeFile(retained, 'Keep exact'); await symlink(retained, join(target, 'main.js'));
  await expect(f.run()).rejects.toThrow('Refusing symlink'); expect(await readFile(retained, 'utf8')).toBe('Keep exact');
});
