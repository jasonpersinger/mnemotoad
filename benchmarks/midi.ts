import { syntheticMotif } from './motif';
import { exportMidi } from '../src/midi/export';
import { inspectMidi } from '../src/midi/import';
import { transposeNotes,quantizeNotes } from '../src/modules/motif/commands';
import type { MotifView } from '../src/modules/motif/view';
import type { MotifSession } from '../src/modules/motif/session';
import type { FoundationServices } from '../src/application/services';
export { syntheticMotif,exportMidi,inspectMidi };
const stats=(values:number[])=>{const sorted=values.slice().sort((a,b)=>a-b);return{medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor(sorted.length*.95)]};};
/** Full real view/session subscriptions execute synchronously; requested Canvas frames are measured separately. */
export async function profileEditor(view:MotifView,services:FoundationServices,session:MotifSession,count:number){
 const ids=new Set(session.draft.data.notes.map(n=>n.id)),samples:Record<string,number[]>={export:[],parse:[],transpose:[],quantize:[],undo:[],redo:[]};
 const measure=(key:string,fn:()=>unknown,i:number)=>{const start=performance.now();fn();if(i>=2)samples[key]?.push(performance.now()-start);};
 for(let i=0;i<9;i++){
  measure('export',()=>exportMidi(session.draft),i);const bytes=exportMidi(session.draft);measure('parse',()=>inspectMidi(bytes),i);
  measure('transpose',()=>session.edit('Profile transpose',m=>transposeNotes(m,ids,1)),i);measure('undo',()=>session.undo(),i);measure('redo',()=>session.redo(),i);session.undo();
  session.edit('Profile offset',m=>({...m,data:{...m.data,notes:m.data.notes.map(n=>({...n,startTick:n.startTick+17}))}}));measure('quantize',()=>session.edit('Profile quantize',m=>quantizeNotes(m,ids,'sixteenth')),i);session.undo();session.undo();
  await new Promise(requestAnimationFrame);
 }
 const retained:number[]=[];for(let i=0;i<12;i++){const start=performance.now();session.edit('Profile retained history',m=>transposeNotes(m,ids,i%2?-1:1));retained.push(performance.now()-start);}const historyRetention={operations:12,kept:session.historySize,commit:stats(retained)};
 void view;void services;return{historyRetention,notes:count,method:'Two warmups/seven samples; full production MotifView + Canvas/list/session subscriptions, validation and history in actual Electron; synchronous command work, separate native pointer next-frame probe.',metrics:Object.fromEntries(Object.entries(samples).map(([key,values])=>[key,stats(values)])),historyEntries:session.historySize};
}
