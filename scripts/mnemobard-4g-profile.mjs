/**
 * Milestone 4G MOTIF profiling (§5.2). Disposable vault only. Two complementary views of the same 5,000-note workloads:
 *  1. Phase timing: raw vault read → repository.read (Markdown/YAML/JSON parse + schema validation) → library open (session init)
 *     → view attach/render (editor DOM, piano roll, register, panels). Median/p95 over N samples.
 *  2. CDP sampling CPU profile (100 µs) across the same operations, aggregated by function self time and inclusive time.
 * Deploy a non-minified build first (`node esbuild.config.mjs && pnpm dev:vault`, then reload the plugin) for readable names.
 * Usage: node scripts/mnemobard-4g-profile.mjs <label> [count]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';

const label = process.argv[2] ?? 'run', count = Number(process.argv[3] ?? 5000), directory = 'output/mnemobard/milestone-4g', c = await connect(), stamp = String(Date.now());
await mkdir(directory, { recursive: true });
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,r=services.repository,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],u=()=>crypto.randomUUID(),assert=(v,m)=>{if(!v)throw Error(m);},tick=()=>new Promise(res=>setTimeout(res,0));
const stats=out=>{const s=[...out].sort((a,b)=>a-b);return{samples:out.length,median:+s[Math.floor(s.length/2)].toFixed(2),p95:+s[Math.min(s.length-1,Math.ceil(s.length*0.95)-1)].toFixed(2)};};`;
const run = async body => { try { return await c.evaluate(`(globalThis.__p4g=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__p4g'); } };
/** Aggregate a CDP profile: self time per function, plus inclusive time (each function counted once per sample stack). */
function aggregate(profile) {
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of profile.nodes) for (const child of n.children ?? []) parent.set(child, n.id);
  const key = n => `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  const self = new Map(), inclusive = new Map(), callers = new Map(); let total = 0;
  const deltas = profile.timeDeltas; for (let i = 0; i < profile.samples.length; i++) {
    const ms = (deltas[i + 1] ?? deltas[i] ?? 0) / 1000, leafNode = nodes.get(profile.samples[i]); if (!leafNode) continue; total += ms;
    self.set(key(leafNode), (self.get(key(leafNode)) ?? 0) + ms);
    // Two-level caller chain of each self-time sample (which code paths pay for a hot function).
    const p1 = nodes.get(parent.get(leafNode.id)), p2 = p1 && nodes.get(parent.get(p1.id)), chain = `${key(leafNode)} ← ${p1 ? key(p1) : '-'} ← ${p2 ? key(p2) : '-'}`;
    callers.set(chain, (callers.get(chain) ?? 0) + ms);
    const seen = new Set(); for (let id = leafNode.id; id !== undefined; id = parent.get(id)) { const k = key(nodes.get(id)); if (!seen.has(k)) { seen.add(k); inclusive.set(k, (inclusive.get(k) ?? 0) + ms); } }
  }
  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, ms]) => ({ name, ms: +ms.toFixed(1), share: +(ms / total * 100).toFixed(1) }));
  return { sampledMs: +total.toFixed(1), self: top(self, 30), inclusive: top(inclusive, 45), callers: top(callers, 25) };
}
const profiled = async (name, body) => {
  await c.command('Profiler.enable'); await c.command('Profiler.setSamplingInterval', { interval: 100 }); await c.command('Profiler.start');
  const result = await run(body); const { profile } = await c.command('Profiler.stop');
  return { name, result, profile: aggregate(profile) };
};
const out = { label, count, stamp };
let path;
try {
  const made = await run(`const notes=[];for(let i=0;i<${count};i++)notes.push({id:u(),pitch:36+(i%48),startTick:i*240,durationTicks:200,velocity:64+(i%40)});
    const m=await r.create({id:u(),kind:'motif',schemaVersion:1,title:'Profile4g ${count} ${stamp}',tags:['profile4g-${stamp}'],extra:{},data:{schemaVersion:1,ppq:960,tempoMicrosecondsPerQuarter:500000,meter:{numerator:4,denominator:4},lengthTicks:Math.ceil(${count}*240/3840)*3840,notes}});
    await services.index.settled();await services.modules.open('motif');return{id:m.entity.id,path:m.path};`);
  path = made.path;
  const head = `const id=${JSON.stringify(made.id)},mv=()=>leaf('motif').view,discard=()=>{for(const d of services.motifs.drafts())if(d.draft.id===id)services.motifs.discard(d);const s=mv().session;if(s?.draft.id===id)services.motifs.discard(s);};`;
  out.phases = await run(`${head}const file=app.vault.getAbstractFileByPath(${JSON.stringify(made.path)}),read=[],parse=[],session=[],view=[],total=[];
    for(let i=0;i<5;i++){discard();await tick();let t=performance.now();await app.vault.read(file);read.push(performance.now()-t);
      t=performance.now();await r.read(id);parse.push(performance.now()-t);
      discard();t=performance.now();const sess=await services.motifs.open(id);session.push(performance.now()-t);services.motifs.discard(sess);
      await tick();t=performance.now();await mv().setState({selectedId:id});total.push(performance.now()-t);assert(mv().session?.draft.id===id,'open');}
    const S=stats;return{vaultRead:S(read),repositoryRead:S(parse),libraryOpen:S(session),viewOpenTotal:S(total),note:'repositoryRead includes vaultRead; libraryOpen includes repositoryRead; viewOpenTotal includes libraryOpen plus leave/attach/render'};`);
  console.log('phases', JSON.stringify(out.phases));
  out.open = await profiled('open', `${head}for(let i=0;i<5;i++){discard();await mv().setState({selectedId:id});}return true;`);
  out.edit = await profiled('edit', `${head}const s=()=>mv().session,roll=()=>mv().roll,first=s().draft.data.notes[0].id;s().select([first]);mv().selectionChanged();
    for(let i=0;i<5;i++){roll().gesture={pointerId:7,x:200,y:200,resize:false,moved:true,deltaTick:i%2?-240:240,deltaPitch:0,ids:new Set([first]),notes:[]};roll().up({pointerId:7});roll().draw();await tick();}
    for(let i=0;i<3;i++){mv().act(()=>s().undo());await tick();}
    for(let i=0;i<5;i++){const b=mv().contentEl.querySelectorAll('[data-note-id]')[i%2];b.click();await tick();}return true;`);
  out.save = await profiled('save', `${head}const s=()=>mv().session;for(let i=0;i<3;i++){s().edit('Rename motif',m=>({...m,title:'Profile4g ${count} ${stamp} '+i}),'title');await mv().save();}discard();return true;`);
  for (const p of [out.open, out.edit, out.save]) { console.log(`\n== ${p.name} (sampled ${p.profile.sampledMs} ms) — self`); for (const f of p.profile.self.slice(0, 14)) console.log(f.ms.toString().padStart(8), `${f.share}%`.padStart(6), f.name); console.log('-- callers'); for (const f of p.profile.callers.slice(0, 12)) console.log(f.ms.toString().padStart(8), `${f.share}%`.padStart(6), f.name.replaceAll('.obsidian%2Fplugins%2Fmnemobard?id=mnemobard', '')); console.log('-- inclusive'); for (const f of p.profile.inclusive.slice(0, 28)) console.log(f.ms.toString().padStart(8), `${f.share}%`.padStart(6), f.name); }
  out.rendererExceptions = c.exceptions;
  await writeFile(`${directory}/profile-${label}.json`, JSON.stringify(out, null, 2) + '\n');
} finally {
  if (path) try { await run(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(path)});if(f&&(await app.vault.read(f)).includes('profile4g-${stamp}'))await app.vault.delete(f);return true;`); } catch (e) { console.error('cleanup failed', e.message); }
  c.close();
}
