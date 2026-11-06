/** Test-only CDP client. Every evaluation verifies the disposable vault first. */
import { fileURLToPath } from 'node:url';
export const expectedVault = fileURLToPath(new URL('../dev-vault', import.meta.url));
export async function connect() {
  const pages = await (await fetch('http://127.0.0.1:9227/json/list')).json();
  const target = pages.find(p => p.type === 'page' && p.url === 'app://obsidian.md/index.html');
  if (!target) throw new Error('No isolated Obsidian renderer at localhost:9227.');
  const socket = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(), exceptions = [];
  let id=0;
  await new Promise((resolve,reject) => { socket.addEventListener('open',resolve,{once:true}); socket.addEventListener('error',reject,{once:true}); });
  socket.addEventListener('message', event => {
    const response=JSON.parse(event.data);
    if (response.method === 'Runtime.exceptionThrown') exceptions.push(response.params.exceptionDetails.exception?.description ?? response.params.exceptionDetails.text);
    const task=pending.get(response.id); if (!task) return;
    pending.delete(response.id); clearTimeout(task.timer);
    if (response.error) task.reject(new Error(JSON.stringify(response.error))); else task.resolve(response.result);
  });
  function command(method,params={}) {
    return new Promise((resolve,reject) => {
      const request=++id, timer=setTimeout(()=>{ pending.delete(request);reject(new Error(`CDP timeout: ${method}`)); },20000);
      pending.set(request,{resolve,reject,timer});socket.send(JSON.stringify({id:request,method,params}));
    });
  }
  async function evaluate(expression) {
    const guard=`if(globalThis.app?.vault?.adapter?.getBasePath?.()!==${JSON.stringify(expectedVault)}) throw new Error('Refusing a non-disposable vault');`;
    // The guard is synchronous. Returning the original promise avoids an extra
    // unreferenced async-wrapper promise that Chromium may garbage-collect.
    const result=await command('Runtime.evaluate',{expression:`(()=>{${guard}return (${expression});})()`,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  }
  await evaluate('true'); await command('Runtime.enable');
  return {evaluate,command,exceptions,close:()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('CDP closed'));}pending.clear();socket.close();}};
}
