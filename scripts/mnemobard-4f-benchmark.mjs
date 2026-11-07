/** Milestone 4F native benchmark (§11). Synthetic records in the disposable vault only; same time() method as 4C–4E (7 samples, median/p95/max). */
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, release } from 'node:os';
import { connect } from './obsidian-cdp.mjs';

const directory = 'output/mnemobard/milestone-4f', c = await connect(), samples = 7, stamp = String(Date.now());
await mkdir(directory, { recursive: true });
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,r=services.repository,leaf=t=>app.workspace.getLeavesOfType('mnemobard-'+t)[0],u=()=>crypto.randomUUID(),assert=(v,m)=>{if(!v)throw Error(m);};const time=async(fn,n=${samples})=>{const out=[];for(let i=0;i<n;i++){const t=performance.now();await fn(i);out.push(performance.now()-t);}out.sort((a,b)=>a-b);return{median:+out[Math.floor(out.length/2)].toFixed(2),p95:+out[Math.min(out.length-1,Math.ceil(out.length*0.95)-1)].toFixed(2),max:+out.at(-1).toFixed(2)};};const base=(kind,title)=>({id:u(),kind,schemaVersion:1,title,extra:{}}),timing={schemaVersion:1,ppq:960,tempoMicrosecondsPerQuarter:500000,meter:{numerator:4,denominator:4}};`;
const run = async body => { try { return await c.evaluate(`(globalThis.__b4f=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__b4f'); } };
const report = { stamp, samples, environment: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), kernel: release() }, patchbook: {}, motif: {}, canvas: {} };
try {
  await c.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  report.environment.host = await run(`return{userAgent:navigator.userAgent,obsidian:app.vault.config?undefined:undefined,dpr:devicePixelRatio,vaultNotes:app.vault.getMarkdownFiles().length};`);
  // ── PATCHBOOK 30 / 50 / 15 ──
  const lib = await run(`const tag='bench4f-${stamp}';const inst=[],chains=[],patches=[];
    for(let i=0;i<30;i++)inst.push((await r.create({...base('instrument','Bench instrument '+i),tags:[tag]})).entity.id);
    for(let i=0;i<15;i++)chains.push((await r.create({...base('effects-chain','Bench chain '+i),steps:[{id:u(),name:'Stage'}],tags:[tag]})).entity.id);
    for(let i=0;i<50;i++)patches.push((await r.create({...base('patch','Bench patch '+i),instrument:'Bench',instrumentId:inst[i%30],effectsChainIds:[chains[i%15]],tags:[tag]})).entity.id);
    const motifs=[];for(let i=0;i<20;i++)motifs.push((await r.create({...base('motif','Bench motif '+i),patchId:patches[i%50],data:{...timing,lengthTicks:3840,notes:[{id:u(),pitch:60,startTick:0,durationTicks:960,velocity:80}]}})).entity.id);
    await services.index.settled();return{tag,inst,chains,patches,motifs};`);
  await run(`await services.modules.open('patchbook');`);
  report.patchbook = await run(`const pb=leaf('patchbook').view,L=${JSON.stringify(lib)};return{
    search:await time(i=>{services.patchbook.query({kind:'patch',search:'bench patch '+(i%5)});}),
    filterByInstrument:await time(i=>{services.patchbook.query({kind:'patch',instrumentId:L.inst[i%30]});}),
    selectPatchWithReverseRefs:await time(async i=>{await pb.setState({selectedId:L.patches[i%50]});assert(pb.currentSession?.draft.id===L.patches[i%50]&&pb.contentEl.textContent.includes('Motifs using this patch'),'patch');}),
    reverseReferences:await time(()=>{for(const p of L.patches)services.index.referencing(p,'motif');}),
    referenceResolutionAll:await time(()=>{const {ReferenceLookup}={ReferenceLookup:null};const heads=services.index.heads();const ids=new Map(heads.filter(h=>h.id).map(h=>[h.id,h]));for(const p of L.patches){ids.get(p.toLowerCase());}}),
    counts:{instruments:30,patches:50,chains:15,motifsUsingPatches:20,vaultNotes:app.vault.getMarkdownFiles().length}};`);
  console.log('patchbook', JSON.stringify(report.patchbook));
  // ── MOTIF small / 500 / 5000 notes ──
  await run(`await services.modules.open('motif');`);
  for (const [name, count] of [['small', 16], ['500', 500], ['5000', 5000]]) {
    report.motif[name] = await run(`const notes=[];for(let i=0;i<${count};i++)notes.push({id:u(),pitch:36+(i%48),startTick:i*240,durationTicks:200,velocity:64+(i%40)});
      const m=await r.create({...base('motif','Bench ${name} notes ${stamp}'),patchId:${JSON.stringify(lib.patches[0])},data:{...timing,lengthTicks:Math.max(3840,Math.ceil(${count}*240/3840)*3840),notes}});await services.index.settled();
      const mv=leaf('motif').view;return{notes:${count},
        open:await time(async()=>{for(const d of services.motifs.drafts())if(d.draft.id===m.entity.id)services.motifs.discard(d);await mv.setState({selectedId:m.entity.id});assert(mv.session?.draft.id===m.entity.id,'open');},3),
        noteNavigation:await time(()=>{mv.navigateNote(1);}),
        soundPanelRefresh:await time(()=>{mv.links.key='';mv.links.refresh(mv.session.draft);})};`);
    console.log('motif', name, JSON.stringify(report.motif[name]));
  }
  // ── CANVAS 4/20, 16/200, 32/1000 ──
  await run(`await services.modules.open('canvas');`);
  for (const [name, lanes, clips] of [['4x20', 4, 20], ['16x200', 16, 200], ['32x1000', 32, 1000]]) {
    report.canvas[name] = await run(`const M=${JSON.stringify(lib.motifs)},per=Math.ceil(${clips}/${lanes});const ls=[];let n=0;for(let l=0;l<${lanes};l++){const lane={id:u(),name:'Lane '+(l+1),clips:[]};for(let k=0;k<per&&n<${clips};k++,n++)lane.clips.push({id:u(),motifId:M[n%M.length],startTick:k*3840,repeatCount:1});ls.push(lane);}
      const comp=await r.create({...base('composition','Bench ${name} ${stamp}'),data:{...timing,lengthTicks:3840*Math.max(64,per+1),lanes:ls,markers:[],sections:[],audioRefs:[]}});await services.index.settled();
      const v=()=>leaf('canvas').view,first=ls[0].clips[0];return{lanes:${lanes},clips:${clips},
        open:await time(async()=>{for(const d of services.canvas.drafts())if(d.draft.id===comp.entity.id)services.canvas.discard(d);const cur=v().session;if(cur?.draft.id===comp.entity.id)services.canvas.discard(cur);await v().setState({selectedId:comp.entity.id});assert(v().session?.draft.id===comp.entity.id,'open');},3),
        clipSelectWithSources:await time(i=>{const lane=ls[i%ls.length];v().select(lane.id,lane.clips[0].id);assert(v().contentEl.querySelector('[aria-label="Source and sound"]'),'sources');}),
        scroll:await time(i=>{const t=v().timeline;t.scroller.scrollLeft=(i*900)%40000;t.scroller.dispatchEvent(new Event('scroll'));t.draw();}),
        zoom:await time(i=>{v().timeline.zoom(i%2?0.8:1.25);v().timeline.draw();}),
        crossModuleNavigation:await time(async()=>{app.workspace.setActiveLeaf(v().leaf,{focus:true});await v().openMotif(first.motifId);assert(leaf('motif').view.session?.draft.id===first.motifId,'nav');}),
        reverseReferencesForMotif:await time(()=>{services.index.referencing(first.motifId,'composition');})};`);
    console.log('canvas', name, JSON.stringify(report.canvas[name]));
  }
  report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await writeFile(`${directory}/performance.json`, JSON.stringify(report, null, 2) + '\n');
} finally { c.close(); }
