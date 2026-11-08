import { mkdir, lstat, readFile, writeFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { devVaultName, runtimeName } from './dev-target.mjs';

const root=await realpath(fileURLToPath(new URL('..',import.meta.url))), vault=join(root,devVaultName);
if((await lstat(vault)).isSymbolicLink()||(await lstat(join(vault,'.mnemobard-disposable'))).isSymbolicLink())throw new Error('Refusing a symlinked disposable vault/marker.');
if(await readFile(join(vault,'.mnemobard-disposable'),'utf8')!=='MNEMOBARD disposable development vault v1\n')throw new Error('Prepare the marked dev-vault first.');
for(const relative of ['','/config','/config/obsidian','/cache','/data','/run'].map(p=>runtimeName+p)) {
  const path=join(root,relative);let stat;
  try {stat=await lstat(path);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(stat?.isSymbolicLink()||(stat&&!stat.isDirectory()))throw new Error(`Refusing unexpected profile path: ${path}`);
  await mkdir(path,{recursive:true,mode:0o700});
}
const profile=join(root,runtimeName,'config/obsidian'), registry=join(profile,'obsidian.json');
let existing;
try {
  if((await lstat(registry)).isSymbolicLink())throw new Error('Refusing registry symlink');
  existing=JSON.parse(await readFile(registry,'utf8'));
}catch(error){if(error.code!=='ENOENT')throw error;}
if(existing) {
  if(!existing.vaults||Object.values(existing.vaults).some(entry=>entry.path!==vault))throw new Error('Isolated profile contains another vault. Refusing to launch it.');
}else {
  const id=createHash('sha256').update(vault).digest('hex').slice(0,16);
  await writeFile(registry,JSON.stringify({vaults:{[id]:{path:vault,ts:Date.now(),open:true}}},null,2),{flag:'wx'});
}
// 4E: electron43 43.8.7 auto-selects Wayland, whose socket is not in the isolated XDG_RUNTIME_DIR; pin X11 (XWayland) per launch.
const child=spawn('obsidian',['--ozone-platform=x11',`--user-data-dir=${profile}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=9227','--disable-gpu','--no-first-run'],{
  stdio:'inherit',env:{...process.env,XDG_CONFIG_HOME:join(root,runtimeName,'config'),XDG_CACHE_HOME:join(root,runtimeName,'cache'),XDG_DATA_HOME:join(root,runtimeName,'data'),XDG_RUNTIME_DIR:join(root,runtimeName,'run'),GSETTINGS_BACKEND:'memory'},
});
child.on('error',error=>{console.error(`Cannot launch the isolated Obsidian desktop: ${error.message}`);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{child.kill(signal);});
child.on('exit',code=>{process.exitCode=code??0;});
