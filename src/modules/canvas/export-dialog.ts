import{Modal,Notice,type App}from'obsidian';
import{element,button}from'../../ui/dom';
import type{ArrangementPreparation}from'../../arrangement/preparation';
import{clockTime,exportSummary}from'../../arrangement/export-summary';
import{musicalDuration}from'../../music/durations';
import{musicalPosition}from'../../music/positions';
import{endingExplanation,reaperGuidance}from'../../ui/daw-guidance';
const plural=(n:number,word:string):string=>`${n} ${word}${n===1?'':'s'}`;
export class ArrangementExportDialog extends Modal{
  private closed=false;
  constructor(app:App,private readonly preparation:ArrangementPreparation,private readonly root:string,private readonly valid:()=>boolean,private readonly alive:()=>boolean=()=>true){super(app);}
  override onOpen():void{const root=this.contentEl;root.classList.add('mnemobard-arrangement-export');this.modalEl.classList.add('mnemobard-wide-modal');element(root,'h2','Export arrangement MIDI');
    element(root,'p','A multitrack Standard MIDI File: one tempo and meter track, then one track per lane that contains notes, in lane order. Tempo and meter are embedded. Exports the explicitly compiled working arrangement with acknowledged saved motifs; this does not save the composition.');
    const prepared=this.preparation.prepared;if(!prepared){element(root,'p','Compile a valid arrangement first.');return;}
    // 4H: summary read from the compiled arrangement and the exported bytes' header (export-summary.ts); unreadable fields are omitted.
    const a=prepared.arrangement,s=exportSummary(a,prepared.bytes),meter=`${s.meter.numerator}/${s.meter.denominator}`,bpm=String(+s.tempoBpm.toFixed(2)),end=musicalPosition(s.lengthTicks,s.ppq,s.meter);
    const section=element(root,'section',undefined,'mnemobard-export-summary');section.setAttribute('aria-label','Export summary');element(section,'h3','Export summary');const list=element(section,'dl');
    const row=(term:string,value:string):HTMLElement=>{element(list,'dt',term);return element(list,'dd',value);};
    row('File',['Standard MIDI File',s.format===undefined?undefined:`Type ${s.format}`,`${s.filePpq??s.ppq} PPQ`].filter(Boolean).join(' · '));
    row('Tempo and meter',`${bpm} BPM · ${meter}`);
    if(s.midiTracks!==undefined)row('MIDI tracks',s.midiTracks>0?`${s.midiTracks}: 1 tempo and meter track + ${plural(s.midiTracks-1,'lane track')}`:'0');
    row('Lanes',`${s.exportedLanes} of ${plural(s.lanes,'lane')} contain notes${s.lanes>s.exportedLanes?` · ${plural(s.lanes-s.exportedLanes,'empty lane')} not exported`:''}`);
    row('Notes',String(s.notes));
    row('Length',`${musicalDuration(s.lengthTicks,s.ppq,s.meter)} · ${clockTime(s.durationSeconds)} · ends at ${end} (bar:beat:tick)`);
    const last=s.lastNoteTick===undefined?undefined:musicalPosition(s.lastNoteTick,s.ppq,s.meter);if(last)row('Last note ends',last);
    const channels=element(row('Channels',''),'ul');for(const lane of s.channels)element(channels,'li',`${lane.lane}: ${lane.channel===undefined?'no notes, not exported':`channel ${lane.channel+1}${lane.percussion?' (percussion)':''} · ${lane.explicit?'set on the lane':'assigned automatically'} · ${plural(lane.notes,'note')}`}`);
    if(last&&s.lastNoteTick!==undefined&&s.lastNoteTick<s.lengthTicks)endingExplanation(section,end,last);
    const label=element(root,'label');element(label,'span','New vault MIDI destination');const path=element(label,'input');path.setAttribute('aria-label','New arrangement MIDI destination');path.value=`${this.root}/Exports/arrangement-${a.compositionId.slice(0,8)}-${Date.now()}.mid`;const status=element(root,'p');status.setAttribute('role','status');
    const actions=element(root,'div',undefined,'mnemobard-actions');
    const submit=button(actions,'Create arrangement MIDI',()=>{void(async()=>{submit.disabled=true;try{if(!this.valid())throw Error('Apply/discard pending controls and recompile the current arrangement first.');const outcome=await this.preparation.export(path.value);if(this.closed){if(this.alive())new Notice(outcome.message);return;}status.textContent=outcome.message;}catch(error){if(!this.closed)status.textContent=error instanceof Error?error.message:String(error);}finally{if(!this.closed)submit.disabled=false;}})();},'mod-cta');button(actions,'Cancel export',()=>{if(this.preparation.state==='exporting')this.preparation.invalidate('Export cancelled. Submitted host I/O may still complete; inspect its destination.');this.close();});
    // 4J: essentials first (summary, destination, create); DAW guidance and technical detail follow.
    reaperGuidance(root,{multitrack:true,laneTracks:s.midiTracks===undefined?undefined:s.midiTracks-1,check:`${bpm} BPM, ${meter}, ${plural(s.exportedLanes,'lane track')}${last?`, last note ending at ${last}`:''}`});
    element(root,'p','No audio, patch sounds, sections/markers or recording references are embedded. Existing files are never replaced.','mnemobard-hint');
    const advanced=element(root,'details',undefined,'mnemobard-export-advanced');element(advanced,'summary','Technical details');
    element(advanced,'p',`Input ${a.inputRevision} · ${a.expandedNotes} notes / ${a.events.length} note events · end ${a.lengthTicks} ticks${s.lastNoteTick===undefined?'':` · last note-off ${s.lastNoteTick} ticks`} · ${prepared.bytes.length} bytes`,'mnemobard-hint');
  }
  override onClose():void{this.closed=true;if(this.preparation.state==='exporting')this.preparation.invalidate('Export dialog closed; pending work cancelled.');this.contentEl.replaceChildren();}
}
