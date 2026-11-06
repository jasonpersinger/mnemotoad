import { Modal, TFile, type App } from 'obsidian';
import { element, button } from '../../ui/dom';
import { messageOf } from '../../domain/errors';
import { inspectMidiIsolated } from '../../midi/job';
import { MIDI_LIMITS } from '../../midi/structure';
import { selectedMidiData, type MidiInspection } from '../../midi/import';
import { exportMidi, exportWarnings } from '../../midi/export';
import type { Motif } from '../../domain/entities';
import type { MotifSession } from './session';
import type { MotifLibrary } from './library';

export class MidiImportDialog extends Modal {
  private lifetime = new AbortController(); private job?: AbortController; private generation = 0;
  private filename = ''; private preview?: MidiInspection; private status?: HTMLElement; private detail?: HTMLElement;
  constructor(app: App,private readonly library: MotifLibrary,private readonly loaded: (session: MotifSession)=>Promise<void>,private readonly inspect = inspectMidiIsolated){super(app);}
  override onOpen(): void {
    const root=this.contentEl;root.classList.add('mnemobard-midi-dialog');element(root,'h2','Import MIDI — selected musical part');
    element(root,'p','Preview only. Select one track/channel; original bytes remain untouched. Confirmation creates an unsaved draft, then Save motif explicitly.');
    const label=element(root,'label');element(label,'span','Choose local MIDI file');const input=element(label,'input');input.type='file';input.accept='.mid,.midi,audio/midi';input.setAttribute('aria-label','Choose local MIDI file');
    input.addEventListener('change',()=>{const file=input.files?.[0];if(!file)return;void this.read(file.name,file.size,()=>file.arrayBuffer());});
    const wrapper=element(root,'label');element(wrapper,'span','MIDI already in this vault');const select=element(wrapper,'select');select.setAttribute('aria-label','Vault MIDI file');element(select,'option','Choose a vault file').value='';
    const searchLabel=element(root,'label');element(searchLabel,'span','Find vault MIDI');const search=element(searchLabel,'input');search.type='search';search.setAttribute('aria-label','Find vault MIDI');const matches=element(root,'p',undefined,'mnemobard-hint');
    const files=this.app.vault.getFiles().filter(f=>/\.midi?$/i.test(f.name)).sort((a,b)=>a.path.localeCompare(b.path));const listFiles=():void=>{select.replaceChildren();element(select,'option','Choose a vault file').value='';const found=files.filter(f=>f.path.toLocaleLowerCase().includes(search.value.slice(0,1000).toLocaleLowerCase()));for(const file of found.slice(0,200)){const option=element(select,'option',file.path);option.value=file.path;}matches.textContent=`${found.length} matching files · showing at most200; refine search for another file.`;};search.addEventListener('input',listFiles);listFiles();
    button(root,'Preview vault MIDI',()=>{const file=this.app.vault.getAbstractFileByPath(select.value);if(!(file instanceof TFile)){this.say('Choose an existing MIDI file.');return;}void this.read(file.name,file.stat.size,()=>this.app.vault.readBinary(file));});
    this.status=element(root,'p','','mnemobard-midi-status');this.status.setAttribute('role','status');this.detail=element(root,'section',undefined,'mnemobard-midi-preview');button(root,'Cancel import',()=>this.close());
  }
  private say(value: string): void {if(!this.lifetime.signal.aborted&&this.status)this.status.textContent=value;}
  private async read(name: string,size: number,read:()=>Promise<ArrayBuffer>): Promise<void> {
    const generation=++this.generation;this.job?.abort();this.job=new AbortController();const job=this.job;this.preview=undefined;this.detail?.replaceChildren();this.filename=name;
    try{if(size>MIDI_LIMITS.bytes)throw Error('MIDI exceeds2MiB. Split it outside MNEMOBARD.');this.say('Inspecting MIDI in an isolated, cancellable worker…');const bytes=await read();if(this.lifetime.signal.aborted||generation!==this.generation)return;const preview=await this.inspect(bytes,job.signal);if(this.lifetime.signal.aborted||generation!==this.generation)return;this.preview=preview;this.render();}
    catch(error){if(generation===this.generation)this.say(messageOf(error));}
  }
  private render(): void {
    const root=this.detail,p=this.preview;if(!root||!p)return;root.replaceChildren();this.say(`${this.filename} · Type ${p.format} · PPQ ${p.ppq} · ${p.tracks.length} tracks · ${p.eventCount} events`);
    element(root,'p',`${(60000000/p.tempoMicrosecondsPerQuarter).toFixed(3)} quarter-note BPM · ${p.meter.numerator}/${p.meter.denominator} · file extent ${p.lengthTicks} ticks. Each selected part retains its own track ending.`);
    const inventory=element(root,'ul');for(const track of p.tracks)element(inventory,'li',`Track ${track.index+1}: ${track.name} · channels ${track.channels.map(c=>c+1).join(', ')||'none'} · ${track.noteCount} paired notes · end ${track.lengthTicks}`);
    const label=element(root,'label');element(label,'span','Source track / channel');const select=element(label,'select');select.setAttribute('aria-label','Source track / channel');
    element(select,'option','Choose one part explicitly').value='';for(const part of p.parts){const option=element(select,'option',`Track ${part.track+1} · ${part.name} / channel ${part.channel+1} · ${part.notes.length} notes`);option.value=`${part.track}:${part.channel}`;}
    const issues=element(root,'div',undefined,'mnemobard-midi-issues'),ackLabel=element(root,'label');const ack=element(ackLabel,'input');ack.type='checkbox';ack.setAttribute('aria-label','Acknowledge listed metadata losses');element(ackLabel,'span','I understand the listed omissions. The selected part alone becomes editable; other tracks/channels are not imported.');
    const confirm=button(root,'Create selected part as unsaved motif',()=>{void this.confirm(select.value,ack.checked,confirm);},'mod-cta');confirm.disabled=true;
    const refresh=():void=>{issues.replaceChildren();const part=p.parts.find(part=>`${part.track}:${part.channel}`===select.value),list=[...p.issues,...(part?.issues??[])];
      if(part&&!list.some(i=>i.severity==='block'))element(issues,'p',`Constant-tempo duration ≈ ${(part.lengthTicks/p.ppq*p.tempoMicrosecondsPerQuarter/1000000).toFixed(3)} seconds; source silence included.`);
      if(part)element(issues,'p',`Selected scope: track ${part.track+1}, channel ${part.channel+1}, ${part.notes.length} notes, ${part.lengthTicks} source ticks. All other parts remain only in the original file.`);
      for(const item of list)element(issues,'p',`${item.severity.toUpperCase()}: ${item.message}${item.count>1?` (${item.count} events)`:''}`);
      const blocked=list.some(i=>i.severity==='block'),loss=list.some(i=>i.severity==='warning');ackLabel.hidden=!loss;confirm.disabled=!part||!part.notes.length||blocked||(loss&&!ack.checked);element(issues,'p',blocked?'Import blocked; no flattening or partial note repair is offered.':part?loss?'Note-only import requires explicit loss acknowledgment.':'Supported musical subset retained exactly; unrelated parts excluded explicitly.':'Select a source part to assess fidelity.');
    };select.addEventListener('change',()=>{ack.checked=false;refresh();});ack.addEventListener('change',refresh);refresh();
  }
  private async confirm(value: string,acknowledged: boolean,button: HTMLButtonElement): Promise<void> {
    const p=this.preview;if(!p||this.lifetime.signal.aborted)return;const[track,channel]=value.split(':').map(Number);if(track===undefined||channel===undefined)return;
    try{selectedMidiData(p,track,channel,acknowledged);button.disabled=true;const session=this.library.importPart(p,track,channel,acknowledged,this.filename);await this.loaded(session);if(!this.lifetime.signal.aborted)this.close();}
    catch(error){this.say(messageOf(error));button.disabled=false;}
  }
  override onClose(): void {this.lifetime.abort();this.job?.abort();this.generation++;this.contentEl.replaceChildren();}
}
export class MidiExportDialog extends Modal {
  private lifetime=new AbortController();
  constructor(app: App,private readonly library: MotifLibrary,private readonly session: MotifSession,private readonly saved:()=>Promise<Motif>,private readonly defaultRoot: string){super(app);}
  override onOpen(): void {
    const root=this.contentEl;root.classList.add('mnemobard-midi-dialog');element(root,'h2','Export motif MIDI');element(root,'p','Type 1: conductor and one note track. Source PPQ and note endpoints are retained. This creates a new vault file; existing files are never replaced.');
    const modeLabel=element(root,'label');element(modeLabel,'span','Export state');const mode=element(modeLabel,'select');mode.setAttribute('aria-label','Export state');
    if(this.session.base)element(mode,'option','Saved vault record (fresh read)').value='saved';element(mode,'option','Current working draft (unsaved snapshot)').value='draft';
    const label=element(root,'label');element(label,'span','New vault MIDI destination');const path=element(label,'input');path.setAttribute('aria-label','New vault MIDI destination');path.value=`${this.defaultRoot}/Exports/motif-${this.session.draft.id.slice(0,8)}-${Date.now()}.mid`;
    for(const warning of exportWarnings(this.session.draft))element(root,'p',warning,'mnemobard-hint');
    const status=element(root,'p');status.setAttribute('role','status');
    const submit=button(root,'Create MIDI file',()=>{void(async()=>{submit.disabled=true;try{const snapshot=mode.value==='saved'?await this.saved():this.session.draft;if(this.lifetime.signal.aborted)return;const bytes=exportMidi(snapshot);const target=await this.library.midiFiles.create(path.value,bytes,this.lifetime.signal);if(!this.lifetime.signal.aborted)status.textContent=`Export created: ${target}. Musical record unchanged.`;}catch(error){if(!this.lifetime.signal.aborted)status.textContent=messageOf(error);}finally{if(!this.lifetime.signal.aborted)submit.disabled=false;}})();},'mod-cta');button(root,'Close export',()=>this.close());
  }
  override onClose(): void {this.lifetime.abort();this.contentEl.replaceChildren();}
}
