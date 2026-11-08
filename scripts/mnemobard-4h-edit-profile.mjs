/**
 * Milestone 4H edit-commit profiling (§5.2). Disposable vault only; synthetic motifs tagged `prof4h-<stamp>` are deleted afterwards
 * (recovery checkpoints are left untouched).
 *
 * For each size (16 / 500 / 5,000 / 10,000 notes) and each operation (single-note move, resize, velocity, transpose, quantize,
 * 100-note move, undo, redo), two passes over the SAME real UI paths the user triggers (PianoRoll gesture up(), transform-panel
 * buttons, view act()):
 *   1. uninstrumented: performance.now() around the synchronous commit + roll.draw()  → the cost of the edit itself;
 *   2. instrumented: temporary wrappers on the session instance (edit's transform, validate, publish, each subscriber, draft/dirty
 *      getters) and on globalThis.structuredClone / JSON.stringify, attributing time and call counts to phases. The difference
 *      between pass 2's total and pass 1 is the instrumentation overhead and is reported, never subtracted.
 * Phases overlap by design (a clone inside a subscriber counts in both); `clone`/`stringify` are cross-cutting totals.
 * Long tasks: browser `longtask` entries inside each uninstrumented workload. Allocation: clone count × serialised document size.
 * Usage: node scripts/mnemobard-4h-edit-profile.mjs <label> [sizes=16,500,5000,10000]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';

const label = process.argv[2] ?? 'run', sizes = (process.argv[3] ?? '16,500,5000,10000').split(',').map(Number);
const directory = 'output/mnemobard/milestone-4h', c = await connect(), stamp = String(Date.now());
await mkdir(directory, { recursive: true });
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,r=services.repository,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],u=()=>crypto.randomUUID(),assert=(v,m)=>{if(!v)throw Error(m);},tick=()=>new Promise(res=>setTimeout(res,0));
const stats=out=>{const s=[...out].sort((a,b)=>a-b);return{samples:out.length,median:+s[Math.floor(s.length/2)].toFixed(2),p95:+s[Math.min(s.length-1,Math.ceil(s.length*0.95)-1)].toFixed(2),max:+s.at(-1).toFixed(2)};};`;
const run = async body => { try { return await c.evaluate(`(globalThis.__p4h=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__p4h'); } };
const longTaskStart = () => c.evaluate(`(()=>{globalThis.__lt??=[];if(!globalThis.__ltObserver){globalThis.__ltObserver=new PerformanceObserver(l=>{for(const e of l.getEntries())globalThis.__lt.push({start:e.startTime,duration:e.duration});});globalThis.__ltObserver.observe({type:'longtask',buffered:false});}globalThis.__ltStart=performance.now();return true;})()`);
const longTaskEnd = () => c.evaluate(`(()=>{const s=globalThis.__ltStart,list=globalThis.__lt.filter(e=>e.start>=s).map(e=>+e.duration.toFixed(1));globalThis.__lt=[];return{count:list.length,max:list.length?Math.max(...list):0};})()`);

/** Operation bodies: `op(i)` performs ONE committed edit through the real UI path; `reset(i)` (unmeasured) restores the state. */
const operations = {
  move: { op: `gesture(false,i%2?-240:240,[first])` },
  resize: { op: `gesture(true,i%2?-240:240,[first])` },
  velocity: { op: `s().select([first]);globalThis.__k=(globalThis.__k??0)+1;input('Set selected velocity').value=String(90+globalThis.__k%2);click('Set velocity')` },
  transpose: { op: `s().select([first]);input('Transpose semitones').value=String(i%2?-1:1);click('Transpose selected')` },
  quantize: { op: `s().select(hundred);mv().selectionChanged();select('Quantization grid').value='quarter';select('Quantization scope').value='selected';click('Quantize starts')`, reset: `mv().act(()=>s().undo())` },
  multiMove: { op: `gesture(false,i%2?-240:240,hundred)` },
  undo: { op: `mv().act(()=>s().undo())`, reset: `mv().act(()=>s().redo())` },
  redo: { op: `mv().act(()=>s().redo())`, reset: `mv().act(()=>s().undo())`, prepare: `gesture(false,240,[first]);mv().act(()=>s().undo())` },
};
const instrument = `const P={};const add=(k,ms)=>{const p=P[k]??={ms:0,calls:0};p.ms+=ms;p.calls++;};const timed=(k,fn)=>function(...a){const t=performance.now();try{return fn.apply(this,a);}finally{add(k,performance.now()-t);}};
  const sess=s(),proto=Object.getPrototypeOf(sess),getter=(o,k)=>{for(let x=o;x;x=Object.getPrototypeOf(x)){const d=Object.getOwnPropertyDescriptor(x,k);if(d?.get)return d.get;}};
  const origClone=globalThis.structuredClone,origStringify=JSON.stringify,origEdit=sess.edit,origValidate=sess.validate,origPublish=sess.publish,draftGet=getter(proto,'draft'),dirtyGet=getter(proto,'dirty');
  const listeners=[...sess.listeners];
  const on=()=>{globalThis.structuredClone=timed('clone',origClone);JSON.stringify=timed('stringify',origStringify);
    sess.edit=function(label,transform,group){return timed('edit.total',origEdit).call(this,label,timed('edit.transform (command incl. its own validation)',transform),group);};
    sess.validate=timed('edit.validate (session)',origValidate);sess.publish=timed('publish (all subscribers)',origPublish);
    Object.defineProperty(sess,'draft',{configurable:true,get:timed('draft getter (clone)',draftGet)});Object.defineProperty(sess,'dirty',{configurable:true,get:timed('dirty getter',dirtyGet)});
    sess.listeners.clear();listeners.forEach((l,n)=>sess.listeners.add(timed('subscriber '+n+' '+(String(l).includes('NoteIndex')?'(piano roll)':String(l).includes('tickMap')?'(MOTIF view)':'(other)'),l)));};
  const off=()=>{globalThis.structuredClone=origClone;JSON.stringify=origStringify;delete sess.edit;sess.validate=origValidate;delete sess.publish;delete sess.draft;delete sess.dirty;sess.listeners.clear();listeners.forEach(l=>sess.listeners.add(l));};`;

const out = { label, stamp, method: 'see file header', sizes: {} };
const created = [];
try {
  await c.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  out.host = await run(`return{userAgent:navigator.userAgent};`);
  await run(`await services.modules.open('motif');return true;`);
  for (const count of sizes) {
    const made = await run(`const notes=[];for(let i=0;i<${count};i++)notes.push({id:u(),pitch:36+(i%48),startTick:i*240,durationTicks:200,velocity:64+(i%40)});
      const m=await r.create({id:u(),kind:'motif',schemaVersion:1,title:'Prof4h ${count} ${stamp}',tags:['prof4h-${stamp}'],extra:{},data:{schemaVersion:1,ppq:960,tempoMicrosecondsPerQuarter:500000,meter:{numerator:4,denominator:4},lengthTicks:Math.max(3840,Math.ceil(${count}*240/3840)*3840),notes}});
      await services.index.settled();return{id:m.entity.id,path:m.path,bytes:JSON.stringify(m.entity).length};`);
    created.push(made.path);
    const head = `const id=${JSON.stringify(made.id)},mv=()=>leaf('motif').view,s=()=>mv().session,roll=()=>mv().roll;
      if(s()?.draft.id!==id){for(const d of services.motifs.drafts())if(d.draft.id===id)services.motifs.discard(d);await mv().setState({selectedId:id});}assert(s()?.draft.id===id,'open');
      const all=s().draft.data.notes,first=all[0].id,hundred=all.slice(0,Math.min(100,Math.floor(all.length*0.75))).map(n=>n.id);
      const q=sel=>mv().contentEl.querySelector(sel),input=l=>q('input[aria-label="'+l+'"]'),select=l=>q('select[aria-label="'+l+'"]'),click=t=>{const b=[...mv().contentEl.querySelectorAll('button')].find(x=>x.textContent===t);assert(b,'button '+t);b.click();};
      const gesture=(resize,delta,ids)=>{const set=new Set(ids);s().select(set);mv().selectionChanged();const g={pointerId:7,x:200,y:200,resize,moved:false,deltaTick:0,deltaPitch:0,ids:set,notes:s().draft.data.notes.filter(x=>set.has(x.id))};roll().gesture=g;const rect=roll().canvas.getBoundingClientRect(),px=delta/960*roll().pixels;for(const f of [0.33,0.66,1])roll().move({pointerId:7,clientX:rect.left+200+px*f,clientY:rect.top+200});roll().up({pointerId:7});};`;
    const n = count >= 5000 ? 6 : 8, result = { notes: count, documentBytes: made.bytes, operations: {} };
    for (const [name, { op, reset = '', prepare = '' }] of Object.entries(operations)) {
      // Pass 1: uninstrumented.
      await longTaskStart();
      const plain = await run(`${head}${prepare};const out=[];for(let i=0;i<${n};i++){await tick();const v=s().changeVersion,t=performance.now();${op};roll().draw();out.push(performance.now()-t);assert(s().changeVersion!==v,'${name} did not commit');await tick();${reset};}
        return{commit:stats(out),history:s().historySize};`);
      const longTasks = await longTaskEnd();
      // Pass 2: instrumented phase attribution (same operation, same number of samples).
      const phases = await run(`${head}${prepare};${instrument}const totals=[],per=[];try{for(let i=0;i<${n};i++){await tick();on();const v=s().changeVersion,t=performance.now();${op};const tDraw=performance.now();roll().draw();add('roll.draw',performance.now()-tDraw);totals.push(performance.now()-t);off();assert(s().changeVersion!==v,'${name} did not commit (instrumented)');per.push(JSON.parse(origStringify(P)));for(const k in P)delete P[k];await tick();${reset};}}finally{off();}
        const keys=[...new Set(per.flatMap(o=>Object.keys(o)))],median=a=>{const x=[...a].sort((p,q)=>p-q);return +x[Math.floor(x.length/2)].toFixed(2);};
        return{instrumentedTotal:stats(totals),phases:Object.fromEntries(keys.map(k=>[k,{medianMs:median(per.map(o=>o[k]?.ms??0)),callsPerCommit:median(per.map(o=>o[k]?.calls??0))}]))};`);
      result.operations[name] = { ...plain, longTasks, ...phases, instrumentationOverheadMs: +(phases.instrumentedTotal.median - plain.commit.median).toFixed(2) };
      console.log(`${count} ${name}: ${plain.commit.median} ms (p95 ${plain.commit.p95}, long tasks ${longTasks.count}) · instrumented ${phases.instrumentedTotal.median}`);
    }
    // Function-level CPU profile of the 10k-class move commit (sampling, 100 µs).
    if (count === Math.max(...sizes)) {
      await c.command('Profiler.enable'); await c.command('Profiler.setSamplingInterval', { interval: 100 }); await c.command('Profiler.start');
      await run(`${head}for(let i=0;i<6;i++){await tick();${operations.move.op};roll().draw();}return true;`);
      const { profile } = await c.command('Profiler.stop');
      const nodes = new Map(profile.nodes.map(x => [x.id, x])), self = new Map(); let total = 0;
      for (let i = 0; i < profile.samples.length; i++) { const ms = (profile.timeDeltas[i + 1] ?? 0) / 1000, node = nodes.get(profile.samples[i]); if (!node) continue; const k = `${node.callFrame.functionName || '(anonymous)'} :${node.callFrame.lineNumber + 1}`; total += ms; self.set(k, (self.get(k) ?? 0) + ms); }
      result.cpuProfileMove = { sampledMs: +total.toFixed(1), selfTop: [...self].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, ms]) => ({ name, ms: +ms.toFixed(1), share: +(ms / total * 100).toFixed(1) })) };
    }
    await run(`${head}for(const d of services.motifs.drafts())if(d.draft.id===id)services.motifs.discard(d);if(s()?.draft.id===id)services.motifs.discard(s());return true;`);
    out.sizes[count] = result;
  }
  out.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await writeFile(`${directory}/edit-profile-${label}.json`, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${directory}/edit-profile-${label}.json`);
} finally {
  try { await run(`for(const p of ${JSON.stringify(created)}){const f=app.vault.getAbstractFileByPath(p);if(f&&(await app.vault.read(f)).includes('prof4h-${stamp}'))await app.vault.delete(f);}await services.index.settled();return true;`); } catch (e) { console.error('cleanup failed', e.message); }
  c.close();
}
