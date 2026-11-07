/** 4E: attribute section-selection time to its sub-phases on the open benchmark composition (harness-only instance wrappers; no production change). */
import { writeFile } from 'node:fs/promises';
import { connect } from './obsidian-cdp.mjs';
const c = await connect(), label = process.argv[2] ?? 'profile';
try {
  const result = await c.evaluate(`(async()=>{const v=app.workspace.getLeavesOfType('mnemobard-canvas')[0].view,p=v.structurePanel,t=v.timeline,s=v.session;
    const totals={},wrap=(obj,name,key)=>{const f=obj[name];if(typeof f!=='function')return()=>{};obj[name]=function(...a){const t0=performance.now();try{return f.apply(this,a);}finally{totals[key]=(totals[key]??0)+performance.now()-t0;}};return()=>{delete obj[name];};};
    const undo=[wrap(v,'structureSelected','view.structureSelected (4D)'),wrap(v,'renderRegister','view.renderRegister (clip list)'),wrap(v,'placeContext','view.placeContext'),wrap(p,'render','structurePanel.render'),wrap(t,'structureSelection','timeline.structureSelection'),wrap(t,'draw','timeline.draw')];
    const ids=s.draft.data.sections.map(x=>x.id),n=40,all=[];for(let i=0;i<n;i++){const t0=performance.now();p.select('section',ids[i%ids.length]);t.draw();all.push(performance.now()-t0);}
    undo.forEach(f=>f());all.sort((a,b)=>a-b);const per={};for(const[k,x]of Object.entries(totals))per[k]=+(x/n).toFixed(2);
    return{label:${JSON.stringify(label)},iterations:n,counts:{sections:ids.length,markers:s.draft.data.markers.length,references:s.draft.data.audioRefs.length,clips:s.draft.data.lanes.flatMap(l=>l.clips).length,registerOpen:v.clipRegister?.open??null},medianTotal:+all[n/2].toFixed(2),perSelectMs:per};})()`);
  console.log(JSON.stringify(result, null, 1)); await writeFile(`output/canvas/milestone-4e/section-select-${label}.json`, JSON.stringify(result, null, 2) + '\n');
} finally { c.close(); }
