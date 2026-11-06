import type { Motif } from '../../domain/entities';
import type { FoundationServices } from '../../application/services';
import type { MotifSession } from './session';
import { element,button } from '../../ui/dom';
export class PatchAssociation {
  private readonly status: HTMLElement;private readonly list: HTMLSelectElement;private readonly optionsStatus: HTMLElement;private search: HTMLInputElement;
  constructor(root: HTMLElement,private readonly services: FoundationServices,private readonly session: MotifSession,private readonly act:(action:()=>void)=>boolean,private readonly navigate:(id:string)=>void){
    const details=element(root,'details',undefined,'mnemobard-motif-patch');element(details,'summary','PATCHBOOK context');this.status=element(details,'p');this.status.setAttribute('role','status');
    const label=element(details,'label');element(label,'span','Find PATCHBOOK patch');this.search=element(label,'input');this.search.type='search';this.search.setAttribute('aria-label','Find PATCHBOOK patch');
    const choice=element(details,'label');element(choice,'span','Choose active patch');this.list=element(choice,'select');this.list.setAttribute('aria-label','Choose active patch');this.optionsStatus=element(details,'p',undefined,'mnemobard-hint');this.search.addEventListener('input',()=>this.options());
    button(details,'Associate chosen patch',()=>this.act(()=>{if(!this.list.value)throw Error('Explicitly select an active patch.');services.motifs.associate(session,this.list.value);}));
    button(details,'Remove patch association',()=>this.act(()=>services.motifs.associate(session)));button(details,'Open associated PATCHBOOK record',()=>{const id=session.draft.patchId;if(id)this.navigate(id);});
    element(details,'p','Organizational context only. Sine audition and MIDI export do not reproduce this preset sound. Removing the association does not modify PATCHBOOK.','mnemobard-hint');this.options();this.refresh();
  }
  private options():void{const old=this.list.value;this.list.replaceChildren();element(this.list,'option','Select a patch explicitly').value='';const choices=this.services.patchbook.query({kind:'patch',search:this.search.value}).filter(item=>!item.ambiguous);for(const item of choices.slice(0,100)){const option=element(this.list,'option',item.entity.title);option.value=item.entity.id;}if([...this.list.options].some(o=>o.value===old))this.list.value=old;this.optionsStatus.textContent=`${choices.length} active matches · up to100 shown; refine search for another patch.`;}
  refresh(motif:Motif=this.session.draft):void{if(!motif.patchId){this.status.textContent='No patch association.';return;}const state=this.services.index.resolve(motif.patchId);this.status.textContent=state.status==='ready'?state.entity.kind!=='patch'?`Wrong record kind for ${motif.patchId}; reference retained.`:`${state.entity.title}${state.entity.archived?' · archived':''} · ${motif.patchId}${motif.patchLink&&motif.patchLink!==`[[${state.path}]]`?' · navigational link differs/moved; UUID remains authoritative':''}`:`Patch ${motif.patchId}: ${state.status}. Stored reference retained; explicitly reassociate to repair.`;}
}
