/**
 * Milestone 4I undo-depth measurement (§16). Disposable vault only; synthetic motifs tagged `undo4i-<stamp>` are deleted
 * afterwards (recovery checkpoints are left untouched). For each size, performs N small valid edits through the real
 * PianoRoll commit path (single-note move/resize alternating, ±1 grid step) and records after every edit the retained undo
 * depth (`historySize`) and, when the build exposes it, the history estimate (`historyBytes`). Then undoes everything that
 * is retained and redoes it, checking exact JSON equality with the recorded states.
 * Usage: node scripts/mnemobard-4i-undo-depth.mjs <label> [sizes=16:110,500:30,5000:30,10000:30]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';

const label = process.argv[2] ?? 'run', plan = (process.argv[3] ?? '16:110,500:30,5000:30,10000:30').split(',').map(p => p.split(':').map(Number));
const directory = 'output/mnemobard/milestone-4i', c = await connect(), stamp = String(Date.now());
await mkdir(directory, { recursive: true });
const prefix = `const services=app.plugins.getPlugin('mnemobard').services,r=services.repository,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],mv=()=>leaf('motif').view,s=()=>mv().session,roll=()=>mv().roll,assert=(v,m)=>{if(!v)throw Error(m);},tick=()=>new Promise(res=>setTimeout(res,0));
const gesture=(resize,delta)=>{const ro=roll(),ids=new Set(s().selected);ro.gesture={pointerId:7,x:200,y:200,resize,moved:false,deltaTick:0,deltaPitch:0,ids,notes:ro.model.data.notes.filter(x=>ids.has(x.id))};const rect=ro.canvas.getBoundingClientRect(),px=delta/960*ro.pixels;for(const f of[0.33,0.66,1])ro.move({pointerId:7,clientX:rect.left+200+px*f,clientY:rect.top+200});const v=s().changeVersion,t=performance.now();ro.up({pointerId:7});const ms=performance.now()-t;assert(s().changeVersion!==v,'edit did not commit');return ms;};`;
const run = async body => { try { return await c.evaluate(`(globalThis.__u4i=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__u4i'); } };
const out = { label, stamp, method: 'native Obsidian, real PianoRoll commit path; depth = historySize after each edit', sizes: {} }, created = [];
try {
  await c.command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  out.build = await run(`return{historyBytes:'historyBytes' in Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(services.motifs))??{})};`).catch(() => ({}));
  await run(`await services.modules.open('motif');return true;`);
  for (const [count, edits] of plan) {
    const made = await run(`const u=()=>crypto.randomUUID(),notes=[];for(let i=0;i<${count};i++)notes.push({id:u(),pitch:36+(i%48),startTick:i*240,durationTicks:200,velocity:64+(i%40)});
      const m=await r.create({id:u(),kind:'motif',schemaVersion:1,title:'Undo4i ${count} ${stamp}',tags:['undo4i-${stamp}'],extra:{},data:{schemaVersion:1,ppq:960,tempoMicrosecondsPerQuarter:500000,meter:{numerator:4,denominator:4},lengthTicks:Math.max(3840,Math.ceil(${count}*240/3840)*3840+3840),notes}});
      await services.index.settled();await mv().setState({selectedId:m.entity.id});assert(s()?.draft.id===m.entity.id,'open');s().select([notes[Math.min(5,${count}-1)].id]);mv().selectionChanged();return{id:m.entity.id,path:m.path};`);
    created.push(made.path);
    // Edits in batches (CDP 20 s budget per evaluation); states are kept in the renderer.
    let depth = [];
    await run(`globalThis.__u4iStates=[JSON.stringify(s().snapshot)];globalThis.__u4iMs=[];return true;`);
    for (let done = 0; done < edits; done += 10) {
      const batch = await run(`const out=[];for(let i=${done};i<Math.min(${edits},${done + 10});i++){await tick();globalThis.__u4iMs.push(gesture(i%2===1,i%4<2?240:-240));globalThis.__u4iStates.push(JSON.stringify(s().snapshot));out.push({edits:i+1,depth:s().historySize,bytes:s().historyBytes??null});}return out;`);
      depth = depth.concat(batch);
    }
    const check = await run(`const states=globalThis.__u4iStates,depth=s().historySize,last=states.length-1;let exact=true;
      for(let i=last;i>last-depth;i--){exact&&=JSON.stringify(s().snapshot)===states[i];s().undo();}exact&&=JSON.stringify(s().snapshot)===states[last-depth];const undoBottomIsSaved=!s().dirty;
      for(let i=last-depth+1;i<=last;i++){s().redo();exact&&=JSON.stringify(s().snapshot)===states[i];}mv().selectionChanged();
      const ms=[...globalThis.__u4iMs].sort((a,b)=>a-b);delete globalThis.__u4iStates;delete globalThis.__u4iMs;
      for(const d of services.motifs.drafts())if(d.draft.id===${JSON.stringify(made.id)})services.motifs.discard(d);
      return{retained:depth,undoRedoExact:exact,undoBottomIsSaved,commitMedianMs:+ms[Math.floor(ms.length/2)].toFixed(1),commitP95Ms:+ms[Math.ceil(ms.length*0.95)-1].toFixed(1)};`);
    out.sizes[count] = { notes: count, editsAttempted: edits, ...check, final: depth.at(-1), limit: check.retained >= 100 ? '100-entry cap' : check.retained < edits ? 'memory budget' : 'none reached', curve: depth };
    console.log(`${count} notes: ${edits} edits → ${check.retained} retained (${out.sizes[count].limit}); exact ${check.undoRedoExact}; bytes ${depth.at(-1)?.bytes ?? 'n/a'}; commit median ${check.commitMedianMs} ms`);
  }
  out.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await writeFile(`${directory}/undo-depth-${label}.json`, JSON.stringify(out, null, 2) + '\n');
} finally {
  try { await run(`for(const p of ${JSON.stringify(created)}){const f=app.vault.getAbstractFileByPath(p);if(f&&(await app.vault.read(f)).includes('undo4i-${stamp}'))await app.vault.delete(f);}await services.index.settled();return true;`); } catch (e) { console.error('cleanup failed', e.message); }
  c.close();
}
