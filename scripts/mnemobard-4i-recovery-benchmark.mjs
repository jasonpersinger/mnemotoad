/**
 * Milestone 4I recovery-register benchmark (§5.1). Disposable vault only; creates and deletes NOTHING.
 *  - Real collection: the dev vault's actual checkpoints — tier-1 listing, first page (incl. reading the visible rows),
 *    search / filter / sort / page / page-size changes, inspector opening (smallest and largest readable checkpoint), and
 *    the explicit "Read all checkpoint details".
 *  - Synthetic sizes 0, 1, 25, 100, 816, 2,500, 10,000: tier-1 entries built in the renderer through the catalog's real
 *    entry() code and real index lookups (no files are written: recovery files are never deleted, so the vault must not be
 *    filled with fakes), details pre-attached, then the same register query/render operations timed on the real UI.
 * Timing: performance.now() around each synchronous operation (register render includes the DOM for one page).
 * Usage: node scripts/mnemobard-4i-recovery-benchmark.mjs <label>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';

const label = process.argv[2] ?? 'run', directory = 'output/mnemobard/milestone-4i', c = await connect();
await mkdir(directory, { recursive: true });
const prefix = `const services=app.plugins.getPlugin('mnemobard').services,cv=()=>app.workspace.getLeavesOfType('mnemobard-canvas')[0].view,p=()=>cv().recoveryPanel,tick=()=>new Promise(r=>setTimeout(r,0)),assert=(v,m)=>{if(!v)throw Error(m);};
const stats=a=>{const s=[...a].sort((x,y)=>x-y);return{samples:a.length,median:+s[Math.floor(s.length/2)].toFixed(2),p95:+s[Math.min(s.length-1,Math.ceil(s.length*.95)-1)].toFixed(2)};};
const time=async(fn,n=7)=>{const out=[];for(let i=0;i<n;i++){await tick();const t=performance.now();await fn(i);out.push(performance.now()-t);}return stats(out);};
const ops=async()=>({render:await time(()=>p().render()),search:await time(i=>p().change({search:['night','choir','2026-11','bench'][i%4]})),clearSearch:await time(()=>p().change({search:''}),3),
  filterModule:await time(i=>p().change({module:['CANVAS','MOTIF','all'][i%3]})),sortOldest:await time(i=>p().change({sort:i%2?'newest':'oldest'})),sortName:await time(i=>p().change({sort:i%2?'newest':'name'})),
  nextPage:await time(i=>p().change({page:i%2?0:1})),pageSize:await time(i=>p().change({pageSize:[25,50,100][i%3]}))});`;
const run = async body => { try { return await c.evaluate(`(globalThis.__r4i=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__r4i'); } };
const out = { label, method: 'see file header', real: {}, synthetic: {} };
try {
  await c.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await run(`await services.modules.open('canvas');cv().openRecovery();await tick();return true;`);
  out.real = await run(`const reg=p(),n=reg.catalog.list().length;const list=await time(()=>reg.catalog.list(),5);
    // First page as a user sees it: listing + query + DOM + reading the visible rows (cold, cache cleared for those rows).
    const first=await time(async()=>{reg.catalog.cache.clear();reg.refresh();for(let k=0;k<4000;k++){const rows=[...reg.list.querySelectorAll('button.mnemobard-recovery-row')];if(rows.length&&rows.every(b=>b.dataset.integrity))break;await new Promise(r=>setTimeout(r,2));}},3);
    const o=await ops();reg.change({search:'',module:'all',sort:'newest',page:0,pageSize:25});
    // Inspector: smallest and largest readable checkpoint (inspect reads, parses and validates the whole file).
    const sized=reg.entries.filter(e=>e.size<20*1024*1024).sort((a,b)=>a.size-b.size),small=sized[0],large=sized.at(-1);
    // Settle first: page changes start background reads of the visible rows; an inspector opened during them waits behind them.
    for(let k=0;k<3000;k++){const rows=[...reg.list.querySelectorAll('button.mnemobard-recovery-row')];if(rows.every(b=>b.dataset.integrity))break;await new Promise(r=>setTimeout(r,5));}await new Promise(r=>setTimeout(r,500));
    const inspect=async e=>{const r=await time(()=>reg.inspect(e.path),5);return{...r,bytes:e.size};};
    return{checkpoints:n,list,firstPage:first,...o,inspectSmall:small?await inspect(small):null,inspectLarge:large?await inspect(large):null};`);
  console.log('real', JSON.stringify(out.real));
  // Read all checkpoint details (explicit action), polled across evaluations (20 s CDP budget each).
  await run(`globalThis.__readAll={start:performance.now()};const reg=p();for(const e of reg.entries)e.details=undefined;reg.catalog.cache?.clear?.();globalThis.__readAll.p=reg.catalog.readAll(reg.entries,new AbortController().signal,(d,t)=>{globalThis.__readAll.done=d;globalThis.__readAll.total=t;}).then(()=>{globalThis.__readAll.ms=performance.now()-globalThis.__readAll.start;});return true;`);
  for (let i = 0; i < 120; i++) { const s = await c.evaluate('globalThis.__readAll.ms'); if (s) break; await new Promise(r => setTimeout(r, 1000)); }
  out.real.readAll = await c.evaluate(`({ms:+globalThis.__readAll.ms.toFixed(0),files:globalThis.__readAll.total})`); await c.evaluate('delete globalThis.__readAll');
  console.log('readAll', JSON.stringify(out.real.readAll));
  for (const n of [0, 1, 25, 100, 816, 2500, 10000]) {
    out.synthetic[n] = await run(`const reg=p(),heads=new Map(services.index.heads().filter(h=>h.id).map(h=>[h.id.toLowerCase(),h])),ids=[...heads.keys()];
      const files=Array.from({length:${n}},(_,i)=>{const id=i%5===0?'00000000-0000-4000-8000-'+String(i).padStart(12,'0'):(ids[i%ids.length]??'00000000-0000-4000-8000-000000000001');return{path:'MNEMOBARD/Recovery/'+id+'/syn-'+i+'.json',name:'syn-'+i+'.json',extension:'json',size:2000+i,modified:Date.UTC(2026,0,1)+i*60000};});
      const t=performance.now();const states=new Map();const entries=files.map(f=>reg.catalog.entry(f,heads,states));const build=+(performance.now()-t).toFixed(2);
      const types=['Unsaved draft of a saved record','Unsaved draft of a new record','Pre-save backup','Recovery copy'],kinds=['motif','composition','patch'];
      entries.forEach((e,i)=>{e.details={integrity:i%97===0?'Malformed':'Readable',type:types[i%4],savedAt:new Date(e.modified).toISOString(),kind:kinds[i%3],draftTitle:'Synthetic '+(i%300)};});
      const saved=reg.entries;reg.entries=entries;reg.query={search:'',module:'all',type:'all',document:'all',sort:'newest',page:0,pageSize:25};
      try{const o=await ops();return{checkpoints:${n},buildTier1:build,...o,rows:reg.list.querySelectorAll('button.mnemobard-recovery-row').length};}finally{reg.entries=saved;reg.change({search:'',module:'all',sort:'newest',page:0,pageSize:25});}`);
    console.log(n, JSON.stringify(out.synthetic[n], (k, v) => k === 'samples' ? undefined : v));
  }
  out.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await writeFile(`${directory}/recovery-benchmark-${label}.json`, JSON.stringify(out, null, 2) + '\n');
} finally { c.close(); }
