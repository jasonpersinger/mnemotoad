/** Stop only the exact project-local isolated host, after guarded draft checkpoints. */
import{readFile}from'node:fs/promises';import{resolve}from'node:path';import{connect}from'./obsidian-cdp.mjs';
const c=await connect();let pid;
try{
 pid=await c.evaluate('(async()=>{const s=app.plugins.getPlugin("mnemobard")?.services;if(s){s.musical.stop();s.preview.stop();await s.musical.settled();await s.canvas.checkpointAll();await s.motifs.checkpointAll();await s.patchbook.checkpointAll();}await app.workspace.requestSaveLayout.run();return process.ppid;})()');
 const cmd=(await readFile(`/proc/${pid}/cmdline`,'utf8')).replaceAll('\0',' ');
 if(!cmd.includes(` --user-data-dir=${resolve('.runtime/config/obsidian')} `)||!cmd.includes(' --remote-debugging-port=9227 ')||cmd.includes(' --type='))throw Error('Refusing to stop a process without the exact isolated profile/port.');
}finally{c.close();}
process.kill(pid,'SIGTERM');console.log('Stopped only verified disposable Obsidian parent '+pid);
