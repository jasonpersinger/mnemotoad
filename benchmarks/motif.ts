import { createEntity, type Motif } from '../src/domain/entities';
import { NoteIndex, noteHit, noteRect, anchoredStart, type RollViewport } from '../src/modules/motif/geometry';
import { renderRoll, rollColors } from '../src/modules/motif/renderer';
import { editableMotif, moveNotes } from '../src/modules/motif/commands';
function stats(values:number[]){const ordered=values.slice().sort((a,b)=>a-b);return{medianMs:ordered[Math.floor(ordered.length/2)],p95Ms:ordered[Math.floor(ordered.length*.95)]};}
export function syntheticMotif(count:number):Motif{
 const motif=createEntity('motif',`Synthetic ${count}`);motif.data.lengthTicks=Math.max(15360,(Math.ceil(count/36)+2)*240);
 motif.data.notes=Array.from({length:count},(_,i)=>({id:`note-${i}`,pitch:48+i%36,startTick:Math.floor(i/36)*240,durationTicks:120,velocity:48+i%80}));return motif;
}
export async function runMotifBenchmark(root:HTMLElement){
 const canvas=root.ownerDocument.createElement('canvas');canvas.width=960;canvas.height=360;canvas.style.width='960px';canvas.style.height='360px';root.append(canvas);
 const context=canvas.getContext('2d');if(!context)throw Error('Canvas2D unavailable');const colors=rollColors(root),results=[];
 try{for(const count of[100,1000,5000,10000]){
  const fixture=syntheticMotif(count),start=performance.now(),motif=editableMotif(fixture),index=new NoteIndex(motif.data.notes);
  const viewport:RollViewport={width:960,height:360,startTick:0,topPitch:76,pixelsPerQuarter:80,rowHeight:20,ppq:960},selected=new Set(['note-12']);
  const draw=(view:RollViewport,ghost=false)=>renderRoll(context,motif,index,view,selected,colors,240,undefined,ghost&&motif.data.notes[12]?[noteRect({...motif.data.notes[12],startTick:120},view)]:[]);
  const visible=draw(viewport).length;canvas.getBoundingClientRect();const initialMs=performance.now()-start;
  const measure=(operation:(i:number)=>unknown)=>{for(let i=0;i<5;i++)operation(i);const values=[];for(let i=0;i<30;i++){const begin=performance.now();operation(i);values.push(performance.now()-begin);}return stats(values);};
  const redraw=measure(()=>draw(viewport)),scroll=measure(i=>draw({...viewport,startTick:i*240,topPitch:76-i%8}));
  const zoom=measure(i=>{const pixels=48+i*3;draw({...viewport,startTick:anchoredStart(viewport,pixels,480),pixelsPerQuarter:pixels});});
  const selection=measure(i=>{const rects=index.query(viewport),hit=rects[i%Math.max(1,rects.length)];if(hit){const target=noteHit(rects,hit.x+1,hit.y+1);selected.clear();if(target)selected.add(target.id);}draw(viewport);});
  const dragPreview=measure(()=>draw(viewport,true));const commandCommit=measure(()=>moveNotes(motif,selected,120,0));
  results.push({notes:count,visible,initialMs,redraw,scroll,zoom,selection,dragPreview,commandCommit,serializedUtf16Bytes:JSON.stringify(motif).length*2});await new Promise(requestAnimationFrame);
 }}finally{canvas.remove();}
 return{methodology:'Actual Electron Canvas2D,960x360 CSSpx,DPR1; production validation/index/renderer/hit/command functions. Fixture generation excluded;5warmups,30samples. Initial includes validation/index/first draw/forced layout. Scroll/zoom mutate viewport, drag is preview plus render; command commit measures pure validated move. JS submission excludes physical presentation, storage and full session/DOM work.',results};
}

import { MotifSession } from '../src/modules/motif/session';
import { PianoRoll } from '../src/modules/motif/piano-roll';
/** Native CDP drives this actual controller/session; its port performs no vault IO. */
export function prepareInteractiveRoll(root:HTMLElement,count:number){
 const motif=syntheticMotif(count),session=new MotifSession(motif,{entity:motif,source:'synthetic benchmark only',path:'benchmark-only.md'},{save:async()=>{throw Error('Benchmark saving disabled');},checkpoint:async()=>{throw Error('Benchmark checkpointing disabled');}},60000);
 const surface=root.ownerDocument.createElement('section');surface.style.width='960px';surface.style.maxWidth='100%';root.append(surface);const roll=new PianoRoll(surface,session,session.draft,()=>{},()=>{},()=>undefined);roll.grid='off';
 const samples:number[]=[];let active=true;const listener=(event:PointerEvent)=>{requestAnimationFrame(()=>{if(active)samples.push(performance.now()-event.timeStamp);});};roll.canvas.addEventListener('pointerup',listener);
 return{points(forward:boolean){roll.canvas.scrollIntoView({block:'center'});roll.draw();const note=session.draft.data.notes.find(note=>note.id==='note-12');if(!note)throw Error('Missing benchmark note');const v=roll.viewport,r=roll.canvas.getBoundingClientRect();const x=r.x+56+(note.startTick-v.startTick)/v.ppq*v.pixelsPerQuarter+3,y=r.y+28+(v.topPitch-note.pitch)*v.rowHeight+v.rowHeight/2;return{from:{x,y},to:{x:x+(forward?120:-120)/v.ppq*v.pixelsPerQuarter,y}};},finish(){active=false;roll.canvas.removeEventListener('pointerup',listener);const result={notes:count,pointerUpToFrame:stats(samples),samples:samples.length,historyEntries:session.historySize};roll.dispose();session.dispose();surface.remove();return result;}};
}
