/**
 * Actual-host 4E benchmark: the 4D workloads and method unchanged, plus freshness and navigation steps.
 * Runs unchanged against the 4D build for a same-host A/B (4E-only steps report `skipped`).
 * Env: MNEMOBARD_BENCH_DIR (default output/canvas/milestone-4e), MNEMOBARD_BENCH_FILE (default performance.json).
 * Synthetic data only; CDP refuses every non-disposable vault.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, totalmem, release } from 'node:os';
import { randomUUID } from 'node:crypto';
import { connect } from './obsidian-cdp.mjs';

const directory = process.env.MNEMOBARD_BENCH_DIR ?? 'output/canvas/milestone-4e', file = process.env.MNEMOBARD_BENCH_FILE ?? 'performance.json', c = await connect(), stamp = String(Date.now()), samples = 7;
await mkdir(directory, { recursive: true });
const prior = JSON.parse(await readFile('output/canvas/milestone-4b/native.json', 'utf8'));
const prefix = `const plugin=app.plugins.getPlugin('mnemobard'),services=plugin.services,view=app.workspace.getLeavesOfType('mnemobard-canvas')[0]?.view,sp=view?.structurePanel,tl=view?.timeline;const assert=(v,m)=>{if(!v)throw Error(m);};const frame=()=>new Promise(r=>requestAnimationFrame(()=>r()));const time=async(fn,n=${samples})=>{const out=[];for(let i=0;i<n;i++){const t=performance.now();await fn(i);out.push(performance.now()-t);}out.sort((a,b)=>a-b);return{median:+out[Math.floor(out.length/2)].toFixed(2),p95:+out[Math.min(out.length-1,Math.ceil(out.length*0.95)-1)].toFixed(2),max:+out.at(-1).toFixed(2),samples:out.map(x=>+x.toFixed(2))};};const until=(s,prep,test,ms=8000)=>new Promise((resolve,reject)=>{if(test())return resolve();const timer=setTimeout(()=>{u1();u2?.();reject(Error('until timeout '+test))},ms);const check=()=>{if(test()){clearTimeout(timer);u1();u2?.();resolve();}};const u1=s.subscribe(check),u2=prep?.subscribe(check);});const timed=async(setup,act,n=${samples})=>{const out=[];for(let i=0;i<n;i++){await setup(i);const t=performance.now();await act(i);out.push(performance.now()-t);}out.sort((a,b)=>a-b);return{median:+out[Math.floor(out.length/2)].toFixed(2),p95:+out[Math.min(out.length-1,Math.ceil(out.length*0.95)-1)].toFixed(2),max:+out.at(-1).toFixed(2),samples:out.map(x=>+x.toFixed(2))};};const external=async(s,fn)=>{const f=app.vault.getAbstractFileByPath(s.base.path);await app.vault.process(f,fn);};`;
const run = async body => { try { return await c.evaluate(`(globalThis.__bench4e=(async()=>{${prefix}${body}})())`); } finally { await c.evaluate('delete globalThis.__bench4e'); } };
const workloads = [['small', 5, 10, 3], ['medium', 25, 100, 20], ['large', 100, 500, 100]];
const BAR = 3840, LENGTH = BAR * 400, folder = `MNEMOBARD/Recordings 4E/bench-${stamp}`;
const wav = Buffer.from('UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQgAAAAAAAAAAAAAAA==', 'base64').toString('base64');
const report = { stamp, samples, environment: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), kernel: release() }, workloads: {} };
try {
  await c.command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1100, deviceScaleFactor: 1, mobile: false });
  await c.evaluate("app.plugins.getPlugin('mnemobard').services.modules.open('canvas')");
  for (let i = 0; i < 200 && !(await c.evaluate("!!app.workspace.getLeavesOfType('mnemobard-canvas')[0]?.view?.contentEl.querySelector('button.mod-cta')")); i++) await new Promise(r => setTimeout(r, 30));
  report.environment.host = await run('return{userAgent:navigator.userAgent,dpr:devicePixelRatio};');
  const base = await run(`const r=await services.repository.read(${JSON.stringify(prior.compositionId)});return r.entity.data.lanes;`);
  await run(`await app.vault.createFolder(${JSON.stringify(folder)});`);
  const setupStart = Date.now();
  for (let batch = 0; batch < 10; batch++) await run(`const bytes=Uint8Array.from(atob(${JSON.stringify(wav)}),ch=>ch.charCodeAt(0));for(let i=${batch * 10};i<${batch * 10 + 10};i++)await app.vault.createBinary(${JSON.stringify(folder)}+'/take-'+String(i).padStart(3,'0')+'.wav',bytes.buffer);`);
  report.setupFileCreationMsPerFile = (Date.now() - setupStart) / 100; console.log('setup ms/file', report.setupFileCreationMsPerFile);
  for (const [name, nSections, nMarkers, nRefs] of workloads) {
    const sections = Array.from({ length: nSections }, (_, i) => ({ id: randomUUID(), label: `Section ${i + 1}`, startTick: i * BAR * 4, endTick: i * BAR * 4 + BAR * 3, description: i % 3 ? undefined : 'Synthetic description' })).map(s => (s.description ? s : (delete s.description, s)));
    const markers = Array.from({ length: nMarkers }, (_, i) => ({ id: randomUUID(), label: `Marker ${i + 1}`, tick: Math.floor(i * (LENGTH - BAR) / nMarkers / 960) * 960 }));
    const audioRefs = Array.from({ length: nRefs }, (_, i) => ({ id: randomUUID(), label: `Take ${i + 1}`, path: `${folder}/take-${String(i).padStart(3, '0')}.wav`, atTick: sections[i % nSections].startTick, sectionId: sections[i % nSections].id, ...(i % 2 ? { markerId: markers[i % nMarkers].id } : {}) }));
    const entity = { id: randomUUID(), kind: 'composition', schemaVersion: 1, title: `4E benchmark ${name} ${stamp}`, extra: {}, assets: audioRefs.map(r => ({ role: 'audio', link: `[[${r.path}]]` })), data: { schemaVersion: 1, ppq: 960, tempoMicrosecondsPerQuarter: 500000, meter: { numerator: 4, denominator: 4 }, lengthTicks: LENGTH, lanes: base.map(l => ({ ...l, id: randomUUID(), clips: l.clips.map(cl => { const id = randomUUID(); return { ...cl, id }; }) })).map(l => ({ ...l, clips: l.clips.map(cl => ({ ...cl, laneId: l.id })) })), markers, sections, audioRefs } };
    await run(`const e=${JSON.stringify(entity)};await services.repository.create(e);await new Promise(r=>setTimeout(r,300));globalThis.__b4e={e,out:{}};`);
    const steps = [
      ['initialRender', `await time(async()=>{for(const d of services.canvas.drafts())if(d.draft.id===e.id)services.canvas.discard(d);await view.setState({selectedId:e.id});const v=app.workspace.getLeavesOfType('mnemobard-canvas')[0].view;assert(v.structurePanel&&v.session.draft.id===e.id,'open '+v.contentEl.querySelector('.mnemobard-feedback')?.textContent);v.timeline.draw();},3)`],
      ['panelRender', `(v.contentEl.querySelector('.mnemobard-canvas-structure').open=true,await time(()=>{p.refresh();}))`],
      ['draw', `await time(()=>{t.draw();})`],
      ['sectionSelect', `await time(i=>{const ids=s.draft.data.sections.map(x=>x.id);p.select('section',ids[i%ids.length]);t.draw();})`],
      ['markerNavigate', `await time(()=>{p.step('marker',1);t.draw();})`],
      ['sectionMove', `await time(i=>{const cur=s.draft.data.sections.reduce((a,b)=>a.startTick>b.startTick?a:b),d=(i%2?-1:1)*960;cb.moveSection(cur.id,cur.startTick+d,cur.endTick+d);t.draw();})`],
      ['sectionResize', `await time(i=>{const cur=s.draft.data.sections.reduce((a,b)=>a.startTick>b.startTick?a:b);cb.moveSection(cur.id,cur.startTick,cur.endTick+(i%2?-960:960));t.draw();})`],
      ['markerMove', `await time(i=>{cb.moveMarker(s.draft.data.markers[0].id,(i%2?0:960));t.draw();})`],
      ['undoRedo', `await time(()=>{v.act(()=>s.undo());v.act(()=>s.redo());t.draw();})`],
      ['save', `await time(async()=>{await s.save();},3)`],
      ['clipSelect', `await time(()=>{v.select(s.draft.data.lanes[0].id,s.draft.data.lanes[0].clips[0].id);t.draw();})`],
      ['inspectorSwitch', `await time(i=>{const ids=s.draft.data.sections.map(x=>x.id);if(i%2)v.select(s.draft.data.lanes[0].id,s.draft.data.lanes[0].clips[0].id);else p.select('section',ids[i%ids.length]);})`],
      ['compile', `await time(async()=>{await v.performancePanel.preparation.prepare();assert(v.performancePanel.preparation.state==='ready','compile '+JSON.stringify(v.performancePanel.preparation.diagnostics.slice(0,2)));},3)`],
      ['metadataEdit', `await time(i=>{const sec=s.draft.data.sections[0];v.act(()=>s.edit('Rename section',c=>({...c,data:{...c.data,sections:c.data.sections.map(x=>x.id===sec.id?{...x,label:'Renamed '+i}:x)}})));v.performancePanel.refresh();assert(v.performancePanel.preparation.state==='ready','metadata invalidated');})`],
      ['musicalEditInvalidation', `await time(i=>{const clip=s.draft.data.lanes[0].clips[0],was=v.performancePanel.preparation.state;services.canvas.move(s,clip.id,s.draft.data.lanes[0].id,clip.startTick+(i%2?-960:960),clip.repeatCount);v.performancePanel.refresh();assert(v.performancePanel.preparation.state==='invalidated'||was!=='ready','not invalidated');})`],
      ['compileAndExport', `await time(async i=>{await v.performancePanel.preparation.prepare();await v.performancePanel.preparation.export('MNEMOBARD/Exports/bench-4e-'+e.id.slice(0,8)+'-'+Date.now()+'-'+i+'.mid');},3)`],
      // 4E freshness: from the external write (Vault.process, as another editor) until the session published the classified result.
      ['cleanExternalRefresh', `typeof s.freshness==='undefined'?'skipped':(s.dirty&&await s.save(),await timed(async()=>{},async i=>{await external(s,t=>t.replace(/Marker 1( ext\\d+)?"/,'Marker 1 ext'+i+'"'));await until(s,undefined,()=>s.freshness.state==='refreshed'&&s.draft.data.markers.some(m=>m.label==='Marker 1 ext'+i));}))`],
      ['metadataRefreshKeepsCompilation', `typeof s.freshness==='undefined'?'skipped':(await v.performancePanel.preparation.prepare(),await timed(async()=>{assert(v.performancePanel.preparation.state==='ready','not ready');},async i=>{const prep=v.performancePanel.preparation;await external(s,t=>t.replace(/Marker 2( ext\\d+)?"/,'Marker 2 ext'+i+'"'));await until(s,prep,()=>s.draft.data.markers.some(m=>m.label==='Marker 2 ext'+i)&&prep.prepared?.baseSource===s.base.source);assert(prep.state==='ready','metadata refresh invalidated');}))`],
      ['musicalRefreshInvalidation', `typeof s.freshness==='undefined'?'skipped':await timed(async()=>{const prep=v.performancePanel.preparation;if(prep.state!=='ready')await prep.prepare();assert(prep.state==='ready','prepare');},async i=>{const prep=v.performancePanel.preparation;await external(s,t=>t.replace(/"tempoMicrosecondsPerQuarter": ?\\d+/,'"tempoMicrosecondsPerQuarter": '+(i%2?500000:500001)));await until(s,prep,()=>prep.state==='invalidated'&&s.freshness.state==='refreshed');},3)`],
      ['dirtyConflictDetection', `typeof s.freshness==='undefined'?'skipped':await (async()=>{const reopen=async()=>{for(const d of services.canvas.drafts())if(d.draft.id===e.id)services.canvas.discard(d);const cur=app.workspace.getLeavesOfType('mnemobard-canvas')[0].view.session;if(cur&&cur.draft.id===e.id&&!cur.disposed)services.canvas.discard(cur);await v.setState({selectedId:e.id});const n=app.workspace.getLeavesOfType('mnemobard-canvas')[0].view.session;assert(n&&!n.dirty&&n.draft.id===e.id,'reopen');return n;};let cur;const r=await timed(async()=>{cur=await reopen();},async i=>{cur.edit('Dirty '+i,c=>({...c,notes:'local '+i}));await external(cur,t=>t.replace(/Marker 3( ext\\d+)?"/,'Marker 3 ext'+i+'"'));await until(cur,undefined,()=>cur.freshness.state==='conflict');},3);await reopen();return r;})()`],
      ['zoom', `await time(i=>{t.zoom(i%2?0.8:1.25);t.draw();})`],
      ['scroll', `await time(i=>{t.scroller.scrollLeft=(i*700)%20000;t.scroller.dispatchEvent(new Event('scroll'));t.draw();})`],
      ['referenceResolution', `await time(()=>{const c=s.draft;for(const r of c.data.audioRefs)assert(services.canvas.recordingStatus(r.path).status==='available','ref');services.canvas.relinkSuggestion(c,s.base?.path??'');})`],
      ['crossModuleNavigation', `await timed(async()=>{app.workspace.setActiveLeaf(v.leaf,{focus:true});await frame();},async()=>{const id=s.draft.data.lanes[0].clips[0].motifId;await v.openMotif(id);assert(app.workspace.getLeavesOfType('mnemobard-motif')[0].view.session?.draft.id===id,'motif not selected');},5)`],
      ['meta', `({history:s.historySize,historyCap:'100 entries / 16 MiB (unchanged)',counts:{sections:s.draft.data.sections.length,markers:s.draft.data.markers.length,references:s.draft.data.audioRefs.length,clips:s.draft.data.lanes.flatMap(l=>l.clips).length},markdownBytes:new TextEncoder().encode((await services.repository.read(e.id)).source).length})`],
    ];
    const result = {};
    for (const [key, expr] of steps) { const t0 = Date.now(); result[key] = await run(`const {e}=globalThis.__b4e,v=app.workspace.getLeavesOfType('mnemobard-canvas')[0].view,s=v.session,p=v.structurePanel,t=v.timeline,cb=t?.structure;return ${expr};`); if (Date.now() - t0 > 5000) console.log('slow step', name, key, Date.now() - t0, 'ms'); }
    Object.assign(result, result.meta); delete result.meta;
    report.workloads[name] = result; console.log(name, JSON.stringify({ counts: result.counts, initial: result.initialRender.median, draw: result.draw.median, move: result.sectionMove.median, save: result.save.median, refs: result.referenceResolution.median }));
  }
  report.rendererExceptions = c.exceptions; if (c.exceptions.length) throw Error(c.exceptions.join('\n'));
  await writeFile(`${directory}/${file}`, JSON.stringify(report, null, 2) + '\n');
} finally { c.close(); }
