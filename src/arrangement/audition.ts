import type { MusicalPlan } from '../music/compiler';
/** Bound physical voice/lookahead work separately from exportable MIDI density. */
export function auditionDiagnostic(plan:MusicalPlan):string|undefined{
  if(plan.maxPolyphony>64)return 'Audition supports at most64 simultaneous notes. MIDI may still be exported; no notes are dropped.';
  const ons=plan.events.filter(e=>e.kind==='on');let first=0;
  for(let i=0;i<ons.length;i++){while(first<i&&(ons[i]?.seconds??0)-(ons[first]?.seconds??0)>.15)first++;if(i-first+1>128)return 'Audition exceeds128 note starts in150ms. Export remains available; split/rearrange this dense passage to audition safely.';}
  return undefined;
}
