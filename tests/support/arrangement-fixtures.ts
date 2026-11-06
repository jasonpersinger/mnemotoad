import { createEntity, type Composition, type Motif } from '../../src/domain/entities';
import type { CapturedSource } from '../../src/arrangement/compiled';
export const revision='a'.repeat(64);
export const uuid=(n:number):string=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function motif(n=1,ppq=960,lengthTicks=ppq*4):Motif { const value=createEntity('motif',`Source${n}`);value.id=uuid(n);value.data={...value.data,ppq,lengthTicks,notes:[{id:'n',pitch:48+n%24,startTick:0,durationTicks:ppq,velocity:80}]};return value; }
export const captured=(m:Motif,hash=revision):CapturedSource=>({motif:m,revision:hash,textBytes:1024});
export function composition(sources:readonly Motif[],lanes=sources.length):Composition {
 const c=createEntity('composition','Synthetic arrangement');c.id=uuid(999999);c.data.lengthTicks=960*256;
 c.data.lanes=Array.from({length:lanes},(_,i)=>{const m=sources[i%sources.length];return{id:`lane${String(i).padStart(2,'0')}`,name:`Lane ${i+1}`,clips:m?[{id:`clip${i}`,laneId:`lane${String(i).padStart(2,'0')}`,motifId:m.id,startTick:0,repeatCount:1,sourceRevision:revision}]:[]};});return c;
}
