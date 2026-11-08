import { it, expect } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
async function fixture() {
  const area=join(process.cwd(),'.runtime','script-fixtures'); await mkdir(area,{recursive:true});
  const root=await mkdtemp(join(area,'dev-vault-')); await mkdir(join(root,'scripts'));
  await copyFile(join(process.cwd(),'scripts/dev-vault.mjs'),join(root,'scripts/dev-vault.mjs'));
  await copyFile(join(process.cwd(),'scripts/dev-target.mjs'),join(root,'scripts/dev-target.mjs')); // its vault-selection module (RC)
  for(const file of ['main.js','manifest.json','styles.css'])await writeFile(join(root,file),'fixture');
  return {root,run:()=>execute(process.execPath,[join(root,'scripts/dev-vault.mjs')])};
}
it('prepares only a marked new vault and preserves data/settings on repeat deployment',async()=>{
  const f=await fixture(); await f.run();
  const data=join(f.root,'dev-vault','.obsidian/plugins/mnemobard/data.json'), note=join(f.root,'dev-vault','Writing.md');
  await writeFile(data,'{"modules":{"motif":false}}'); await writeFile(note,'Retained writing'); await f.run();
  expect(await readFile(data,'utf8')).toBe('{"modules":{"motif":false}}'); expect(await readFile(note,'utf8')).toBe('Retained writing');
});
it('refuses an existing unmarked vault before writing anything into it',async()=>{
  const f=await fixture(); await mkdir(join(f.root,'dev-vault')); const note=join(f.root,'dev-vault','Private.md'); await writeFile(note,'Do not touch');
  await expect(f.run()).rejects.toThrow(/not an authorized disposable vault/); expect(await readFile(note,'utf8')).toBe('Do not touch');
});
it('refuses a vault symlink instead of following it',async()=>{
  const f=await fixture(), other=join(f.root,'owned-test-target'); await mkdir(other);
  const note=join(other,'Retain.md'); await writeFile(note,'Untouched'); await symlink(other,join(f.root,'dev-vault'));
  await expect(f.run()).rejects.toThrow(/Refusing symlink/); expect(await readFile(note,'utf8')).toBe('Untouched');
});
it('refuses a generated-artifact symlink even inside a marked vault',async()=>{
  const f=await fixture(); await f.run();
  // Use a separate destination name that the deploy script will inspect first.
  const root=await fixture(), vault=join(root.root,'dev-vault'); await mkdir(vault);
  await writeFile(join(vault,'.mnemobard-disposable'),'MNEMOBARD disposable development vault v1\n');
  const plugin=join(vault,'.obsidian/plugins/mnemobard');await mkdir(plugin,{recursive:true});
  const target=join(root.root,'retained.txt');await writeFile(target,'Retain');await symlink(target,join(plugin,'main.js'));
  await expect(root.run()).rejects.toThrow(/Refusing symlink/);expect(await readFile(target,'utf8')).toBe('Retain');
});
