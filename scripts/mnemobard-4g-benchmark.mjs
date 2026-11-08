/**
 * Milestone 4G native benchmark (§6/§15). Disposable vault only; synthetic records tagged `bench4g-<stamp>` are deleted afterwards
 * (recovery checkpoints are left untouched). Same sampling method as 4C–4F: performance.now() around one operation, median/p95/max,
 * but every sample yields to the event loop first, so each sample is its own browser task and `longtask` entries attribute to it.
 *
 * Cold open (v2): 5 samples, each on a freshly created module leaf with no cached session (v1 used one sample, which proved
 * too noisy: the first open varied 10–50 ms on both builds). Warm open: discard the session, reopen in the existing leaf.
 * Usage: node scripts/mnemobard-4g-benchmark.mjs <label>   → output/mnemobard/milestone-4g/performance-<label>.json
 * Pointer gestures are synthesised at the PianoRoll method level (move()/up() with a prepared gesture), not as OS input.
 * Features absent from the build under test (4G batch acknowledgement on the 4F baseline) are recorded as "unavailable".
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, release, platform } from 'node:os';
import { connect } from './obsidian-cdp.mjs';

// 4H: MNEMOBARD_BENCH_DIR redirects output (4H evidence must not overwrite the 4G files); the method is unchanged.
const label = process.argv[2] ?? 'run', directory = process.env.MNEMOBARD_BENCH_DIR ?? 'output/mnemobard/milestone-4g', c = await connect(), stamp = String(Date.now());
await mkdir(directory, { recursive: true });
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,r=services.repository,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],u=()=>crypto.randomUUID(),assert=(v,m)=>{if(!v)throw Error(m);},tick=()=>new Promise(res=>setTimeout(res,0)),frame=()=>new Promise(res=>requestAnimationFrame(()=>res()));
const stats=out=>{const s=[...out].sort((a,b)=>a-b);return{samples:out.length,median:+s[Math.floor(s.length/2)].toFixed(2),p95:+s[Math.min(s.length-1,Math.ceil(s.length*0.95)-1)].toFixed(2),max:+s.at(-1).toFixed(2),raw:out.map(v=>+v.toFixed(2))};};
const time=async(fn,n=7)=>{const out=[];for(let i=0;i<n;i++){await tick();const t=performance.now();await fn(i);out.push(performance.now()-t);}return stats(out);};
/** fn measures and returns its own duration (setup/teardown excluded). */
const inner=async(fn,n=7)=>{const out=[];for(let i=0;i<n;i++){await tick();out.push(await fn(i));}return stats(out);};
const once=async fn=>{await tick();const t=performance.now();await fn();return +(performance.now()-t).toFixed(2);};
const base=(kind,title)=>({id:u(),kind,schemaVersion:1,title,tags:['bench4g-${stamp}'],extra:{}}),timing={schemaVersion:1,ppq:960,tempoMicrosecondsPerQuarter:500000,meter:{numerator:4,denominator:4}};`;
const run = async body => { try { return await c.evaluate(`(globalThis.__b4g=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__b4g'); } };
/** Browser-observed long tasks (>50 ms) inside one workload window. */
const section = async (name, body) => {
  await c.evaluate(`(()=>{globalThis.__lt??=[];if(!globalThis.__ltObserver){globalThis.__ltObserver=new PerformanceObserver(l=>{for(const e of l.getEntries())globalThis.__lt.push({start:e.startTime,duration:e.duration});});globalThis.__ltObserver.observe({type:'longtask',buffered:false});}globalThis.__ltStart=performance.now();return true;})()`);
  const result = await run(body);
  const longTasks = await c.evaluate(`(()=>{const s=globalThis.__ltStart,list=globalThis.__lt.filter(e=>e.start>=s).map(e=>+e.duration.toFixed(1));globalThis.__lt=[];return{count:list.length,max:list.length?Math.max(...list):0,durations:list.slice(0,40)};})()`);
  console.log(name, JSON.stringify(result, (k, v) => k === 'raw' ? undefined : v));
  return { ...result, longTasks };
};
const report = { label, stamp, method: 'performance.now() per operation inside the Obsidian renderer via CDP; each sample yields first; median/p95/max; browser longtask observer per workload', environment: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), kernel: release(), os: platform(), node: process.version }, patchbook: {}, motif: {}, canvas: {} };
const created = [];
try {
  await c.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  report.environment.host = await run(`return{userAgent:navigator.userAgent,obsidian:navigator.userAgent.match(/obsidian\\/([\\d.]+)/)?.[1],electron:navigator.userAgent.match(/Electron\\/([\\d.]+)/)?.[1],chrome:navigator.userAgent.match(/Chrome\\/([\\d.]+)/)?.[1],dpr:devicePixelRatio,vaultNotes:app.vault.getMarkdownFiles().length,batchAcknowledge:typeof services.canvas.reviewAll==='function'};`);
  // ── fixtures: PATCHBOOK 30 instruments / 15 chains / 50 patches, 20 small motifs ──
  const lib = await run(`const inst=[],chains=[],patches=[],paths=[];
    for(let i=0;i<30;i++){const x=await r.create({...base('instrument','Bench4g instrument '+i)});inst.push(x.entity.id);paths.push(x.path);}
    for(let i=0;i<15;i++){const x=await r.create({...base('effects-chain','Bench4g chain '+i),steps:[{id:u(),name:'Stage'}]});chains.push(x.entity.id);paths.push(x.path);}
    for(let i=0;i<50;i++){const x=await r.create({...base('patch','Bench4g patch '+i),instrument:'Bench',instrumentId:inst[i%30],effectsChainIds:[chains[i%15]]});patches.push(x.entity.id);paths.push(x.path);}
    const motifs=[];for(let i=0;i<20;i++){const x=await r.create({...base('motif','Bench4g motif '+i),patchId:patches[i%50],data:{...timing,lengthTicks:3840,notes:[{id:u(),pitch:48+i,startTick:0,durationTicks:960,velocity:80}]}});motifs.push(x.entity.id);paths.push(x.path);}
    await services.index.settled();return{inst,chains,patches,motifs,paths};`);
  created.push(...lib.paths);
  // ── PATCHBOOK ──
  await run(`await services.modules.open('patchbook');`);
  report.patchbook = await section('patchbook', `const pb=leaf('patchbook').view,L=${JSON.stringify(lib)};return{
    search:await time(i=>{services.patchbook.query({kind:'patch',search:'bench4g patch '+(i%5)});}),
    filterByInstrument:await time(i=>{services.patchbook.query({kind:'patch',instrumentId:L.inst[i%30]});}),
    selectPatchWithReverseRefs:await time(async i=>{await pb.setState({selectedId:L.patches[i%20]});assert(pb.currentSession?.draft.id===L.patches[i%20]&&pb.contentEl.textContent.includes('Motifs using this patch'),'patch');}),
    reverseReferences:await time(()=>{for(const p of L.patches)services.index.referencing(p,'motif');}),
    navigateToMotif:await time(async i=>{await pb.setState({selectedId:L.patches[i%20]});const out=await pb.openMotif(L.motifs[i%20]);assert(leaf('motif').view.session?.draft.id===L.motifs[i%20],'nav');app.workspace.setActiveLeaf(pb.leaf,{focus:true});},5)};`);
  // ── MOTIF 16 / 500 / 5000 / 10000 ──
  await run(`await services.modules.open('motif');`);
  for (const count of [16, 500, 5000, 10000]) {
    const made = await run(`const notes=[];for(let i=0;i<${count};i++)notes.push({id:u(),pitch:36+(i%48),startTick:i*240,durationTicks:200,velocity:64+(i%40)});
      const m=await r.create({...base('motif','Bench4g ${count} notes ${stamp}'),patchId:${JSON.stringify(lib.patches[0])},data:{...timing,lengthTicks:Math.max(3840,Math.ceil(${count}*240/3840)*3840),notes}});await services.index.settled();return{id:m.entity.id,path:m.path};`);
    created.push(made.path);
    const n = count >= 5000 ? 5 : 7;
    const head = `const id=${JSON.stringify(made.id)},mv=()=>leaf('motif').view,discard=()=>{for(const d of services.motifs.drafts())if(d.draft.id===id)services.motifs.discard(d);const s=mv().session;if(s?.draft.id===id)services.motifs.discard(s);};
      const open=async()=>{discard();await mv().setState({selectedId:id});assert(mv().session?.draft.id===id,'open');};const s=()=>mv().session,roll=()=>mv().roll;`;
    const a = await section(`motif ${count} open`, `${head}const openCold=await time(async()=>{discard();for(const l of app.workspace.getLeavesOfType('mnemobard-motif'))l.detach();await services.modules.open('motif');await mv().setState({selectedId:id});assert(mv().session?.draft.id===id,'cold');},5);const openWarm=await time(open,${n});
      const firstUsefulRender=await time(async()=>{await open();await frame();assert(roll()&&roll().frame===undefined,'paint');},${n});return{notes:${count},openCold,openWarm,firstUsefulRender};`);
    const b = await section(`motif ${count} edit`, `${head}const notes=s().draft.data.notes,first=notes[0].id;
      const noteSelection=await time(i=>{const b=mv().contentEl.querySelectorAll('[data-note-id]')[i%2];b.click();assert(s().selected.has(b.dataset.noteId),'sel');});
      const noteNavigation=await time(()=>{mv().navigateNote(1);});
      s().select([first]);mv().selectionChanged();roll().reveal(notes[0]);roll().draw();
      const gesture=(resize,delta)=>{const g={pointerId:7,x:200,y:200,resize,moved:false,deltaTick:0,deltaPitch:0,ids:new Set([first]),notes:s().draft.data.notes.filter(x=>x.id===first)};roll().gesture=g;const rect=roll().canvas.getBoundingClientRect(),px=delta/960*roll().pixels;for(const f of [0.33,0.66,1])roll().move({pointerId:7,clientX:rect.left+200+px*f,clientY:rect.top+200});roll().up({pointerId:7});roll().draw();};
      const drag=await time(i=>gesture(false,i%2?-240:240),${n});
      const resize=await time(i=>gesture(true,i%2?-240:240),${n});
      const zoom=await time(i=>{roll().zoom(i%2?0.8:1.25);roll().draw();});
      const scroll=await time(i=>{roll().scroller.scrollLeft=(i*1500)%(roll().scroller.scrollWidth||40000);roll().scroll();roll().draw();});
      const undo=await time(()=>{mv().act(()=>s().undo());roll().draw();},${n === 5 ? 4 : 6});
      const redo=await time(()=>{mv().act(()=>s().redo());roll().draw();},${n === 5 ? 4 : 6});return{noteSelection,noteNavigation,drag,resize,zoom,scroll,undo,redo};`);
    const d = await section(`motif ${count} save`, `${head}const save=await time(async i=>{s().edit('Rename motif',m=>({...m,title:'Bench4g ${count} notes ${stamp} '+i}),'title');await mv().save();assert(!s().dirty,'saved');},${count >= 10000 ? 3 : 5});
      const after=(await r.read(id)).entity.data.notes.length;assert(after===${count},'note count '+after);discard();return{save,savedNoteCount:after};`);
    report.motif[count] = { ...a, ...b, ...d, longTasks: { open: a.longTasks, edit: b.longTasks, save: d.longTasks } };
  }
  // ── CANVAS 4/20, 16/200, 32/1000 ──
  await run(`await services.modules.open('canvas');`);
  const heads = await run(`const M=${JSON.stringify(lib.motifs)};return M.map(id=>{const h=services.index.heads().find(x=>x.id===id.toLowerCase());return{id,revision:h.revision,path:h.path,title:h.title};});`);
  for (const [name, lanes, clips] of [['4x20', 4, 20], ['16x200', 16, 200], ['32x1000', 32, 1000]]) {
    const made = await run(`const H=${JSON.stringify(heads)},per=Math.ceil(${clips}/${lanes});const ls=[];let n=0;for(let l=0;l<${lanes};l++){const lane={id:u(),name:'Lane '+(l+1),clips:[]};for(let k=0;k<per&&n<${clips};k++,n++){const h=H[n%H.length];lane.clips.push({id:u(),motifId:h.id,startTick:k*3840,repeatCount:1,sourceRevision:h.revision,sourcePath:h.path,sourceTitle:h.title,reviewedLengthTicks:3840});}ls.push(lane);}
      const comp=await r.create({...base('composition','Bench4g ${name} ${stamp}'),data:{...timing,lengthTicks:3840*Math.max(64,per+2),lanes:ls,markers:[],sections:[],audioRefs:[]}});
      // Same shape with every clip of motif 0 recorded at an older (synthetic) revision → "changed", for batch acknowledgement.
      const stale=structuredClone(ls);for(const lane of stale)for(const clip of lane.clips)if(clip.motifId===H[0].id)clip.sourceRevision='0'.repeat(64);
      const review=await r.create({...base('composition','Bench4g review ${name} ${stamp}'),data:{...timing,lengthTicks:3840*Math.max(64,per+2),lanes:stale,markers:[],sections:[],audioRefs:[]}});
      await services.index.settled();return{id:comp.entity.id,path:comp.path,review:review.entity.id,reviewPath:review.path,per};`);
    created.push(made.path, made.reviewPath);
    report.canvas[name] = await section(`canvas ${name}`, `const id=${JSON.stringify(made.id)},v=()=>leaf('canvas').view,s=()=>v().session,per=${made.per};
      const discard=target=>{for(const d of services.canvas.drafts())if(d.draft.id===target)services.canvas.discard(d);const cur=v().session;if(cur?.draft.id===target)services.canvas.discard(cur);};
      const open=async(target=id)=>{discard(target);await v().setState({selectedId:target});assert(v().session?.draft.id===target,'open');};
      const openCold=await time(async()=>{discard(id);for(const l of app.workspace.getLeavesOfType('mnemobard-canvas'))l.detach();await services.modules.open('canvas');await v().setState({selectedId:id});assert(v().session?.draft.id===id,'cold');},5);
      const openWarm=await time(()=>open(),3);
      const lanes=s().draft.data.lanes,first=lanes[0].clips[0];
      const clipSelection=await time(i=>{const lane=lanes[i%lanes.length];v().select(lane.id,lane.clips[0].id);assert(v().contentEl.querySelector('[aria-label="Source and sound"]'),'sources');});
      const drag=await time(i=>{assert(v().act(()=>services.canvas.move(s(),first.id,lanes[0].id,i%2?0:per*3840,1)),'move');});
      const zoom=await time(i=>{v().timeline.zoom(i%2?0.8:1.25);v().timeline.draw();});
      const scroll=await time(i=>{const t=v().timeline;t.scroller.scrollLeft=(i*900)%40000;t.scroller.dispatchEvent(new Event('scroll'));t.draw();});
      const sourceResolutionRefresh=await time(()=>{services.canvas.sources.revision=-1;v().planKey='';v().refreshScene();});
      const compile=await time(async()=>{const p=v().performancePanel.preparation;await p.prepare();},3);
      const compileOutcome=v().performancePanel.preparation.state+(v().performancePanel.preparation.diagnostics[0]?' · '+v().performancePanel.preparation.diagnostics[0].code:'');
      const save=await time(async i=>{s().edit('Rename composition',c=>({...c,title:'Bench4g ${name} ${stamp} '+i}),'title');await v().save();assert(!s().dirty,'saved');},3);
      discard(id);
      let batchAcknowledge='unavailable (build has no batch acknowledgement)',batchUndo;
      if(typeof services.canvas.reviewAll==='function'){
        const target=${JSON.stringify(made.review)};await open(target);
        const item=()=>services.canvas.reviewItems(s()).find(x=>x.motifId.toLowerCase()===${JSON.stringify(heads[0].id)}.toLowerCase());
        assert(item()?.placements.length,'review item');
        const placements=item().placements.length;
        batchAcknowledge=await inner(async()=>{const t=performance.now(),token=services.canvas.reviewToken(s(),item());await services.canvas.reviewAll(s(),token);v().refreshScene();const d=performance.now()-t;assert(!item(),'acknowledged');s().undo();v().refreshScene();return d;},5);
        batchAcknowledge.placements=placements;
        batchUndo=await inner(async()=>{const token=services.canvas.reviewToken(s(),item());await services.canvas.reviewAll(s(),token);v().refreshScene();const t=performance.now();s().undo();v().refreshScene();const d=performance.now()-t;assert(item()?.placements.length===placements,'undo restored');return d;},5);
        discard(target);
      }
      return{lanes:${lanes},clips:${clips},openCold,openWarm,clipSelection,drag,zoom,scroll,sourceResolutionRefresh,compile,compileOutcome,save,batchAcknowledge,batchUndo};`);
  }
  report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await writeFile(`${directory}/performance-${label}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`wrote ${directory}/performance-${label}.json`);
} finally {
  // Remove only the synthetic records this run created (never recovery checkpoints or other notes).
  try { await run(`for(const p of ${JSON.stringify(created)}){const f=app.vault.getAbstractFileByPath(p);if(f&&(await app.vault.read(f)).includes('bench4g-${stamp}'))await app.vault.delete(f);}await services.index.settled();return true;`); } catch (e) { console.error('cleanup failed', e.message); }
  c.close();
}
