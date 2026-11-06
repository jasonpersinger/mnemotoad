import type { Composition } from '../domain/entities';
import { checkActive } from '../domain/errors';
import type { EntityRepository, EntityRecord } from '../storage/repository';
import { contentRevision } from '../storage/content-revision';
import type { MidiFiles } from '../midi/files';
import { SourceCapture, CompilationFault, type ArrangementCapture } from './capture';
import { compileArrangementIsolated, type CompilationJob } from './job';
import { compilationInput, type CompileDiagnostic, type CompiledArrangement } from './compiled';
export type PreparationState='idle'|'resolving'|'compiling'|'ready'|'exporting'|'invalidated'|'error';
export interface PreparedArrangement {readonly capture:ArrangementCapture;readonly arrangement:CompiledArrangement;readonly bytes:Uint8Array;readonly baseSource?:string;readonly baseRevision?:string;readonly metrics:CompilationJob['metrics']}
export interface ExportOutcome {readonly path:string;readonly verified:boolean;readonly message:string}
/** Editor-owned ephemeral state; no writes to composition/source data, no audio ownership. */
export class ArrangementPreparation {
  state:PreparationState='idle';diagnostics:readonly CompileDiagnostic[]=[];prepared?:PreparedArrangement;
  private job?:AbortController;private generation=0;private closed=false;private writing=false;private pending?:ArrangementCapture;private listeners=new Set<()=>void>();
  constructor(private readonly capture:SourceCapture,private readonly repository:EntityRepository,private readonly files:MidiFiles,private readonly input:()=>{composition:Composition;base?:EntityRecord},private readonly execute=compileArrangementIsolated){}
  subscribe(listener:()=>void):()=>void{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private publish():void{if(!this.closed)for(const fn of this.listeners)fn();}
  invalidate(message='Arrangement changed; compile again.'):void{if(this.closed)return;this.generation++;this.job?.abort();this.job=undefined;this.pending=undefined;this.prepared=undefined;this.state='invalidated';this.diagnostics=[{code:'invalidated',severity:'warning',message}];this.publish();}
  private error(error:unknown):void{this.prepared=undefined;this.state='error';this.diagnostics=error instanceof CompilationFault?error.diagnostics:[{code:'operation-failed',severity:'error',message:error instanceof Error?error.message:String(error)}];this.publish();}
  async prepare():Promise<boolean>{
    checkActive(undefined,this.closed);if(this.writing||this.state==='resolving'||this.state==='compiling')return false;
    this.job?.abort();const job=new AbortController();this.job=job;const generation=++this.generation;this.prepared=undefined;this.state='resolving';this.diagnostics=[];this.publish();
    try{
      const input=this.input(),baseSource=input.base?.source,baseRevision=baseSource===undefined?undefined:await contentRevision(baseSource),snapshot=await this.capture.capture(input.composition,job.signal);this.pending=snapshot;
      await this.verify(snapshot,baseSource,job.signal);checkActive(job.signal,this.closed);this.state='compiling';this.publish();
      const result=await this.execute(snapshot.composition,snapshot.sources,snapshot.inputRevision,job.signal);
      if(!result.result.ok)throw new CompilationFault(result.result.diagnostics);
      if(!(result.bytes instanceof Uint8Array)||!result.bytes.length)throw Error('Compiler produced no complete MIDI payload.');
      await this.verify(snapshot,baseSource,job.signal);if(generation!==this.generation)return false;
      this.prepared={capture:snapshot,arrangement:result.result.arrangement,bytes:result.bytes,baseSource,baseRevision,metrics:result.metrics};this.pending=undefined;this.state='ready';this.diagnostics=result.result.arrangement.diagnostics;this.publish();return true;
    }catch(error){if(!this.closed&&generation===this.generation)this.error(error);return false;}finally{if(this.job===job)this.job=undefined;}
  }
  private async verify(snapshot:ArrangementCapture,baseSource:string|undefined,signal?:AbortSignal):Promise<void>{
    const check=():void=>{checkActive(signal,this.closed);const current=this.input();if(current.base?.source!==baseSource||compilationInput(current.composition,snapshot.sources)!==compilationInput(snapshot.composition,snapshot.sources))throw new CompilationFault([{code:'composition-changed',severity:'error',message:'Composition draft/save base changed. Compile the displayed state again.'}]);};
    check();if(baseSource!==undefined){const record=await this.repository.read(snapshot.composition.id,signal);if(record.source!==baseSource)throw new CompilationFault([{code:'composition-conflict',severity:'error',message:'The saved composition changed externally. Resolve the protected editing conflict before compiling/exporting.'}]);}
    await this.capture.verify(snapshot,signal);check();
  }
  async verifyPrepared():Promise<void>{const prepared=this.prepared;if(!prepared)throw Error('Compile a valid arrangement first.');await this.verify(prepared.capture,prepared.baseSource);}
  async export(path:string):Promise<ExportOutcome>{
    checkActive(undefined,this.closed);if(this.writing||this.state!=='ready'||!this.prepared)throw Error('Export requires a ready compilation and no other active export.');
    const prepared=this.prepared,job=new AbortController(),generation=this.generation;this.job=job;this.writing=true;this.state='exporting';this.publish();
    try{
      await this.verify(prepared.capture,prepared.baseSource,job.signal);
      const target=await this.files.create(path,prepared.bytes,job.signal,()=>this.verify(prepared.capture,prepared.baseSource,job.signal));
      try{await this.verify(prepared.capture,prepared.baseSource);if(job.signal.aborted||generation!==this.generation)throw Error('Operation was cancelled or invalidated after binary submission.');}
      catch(error){const message=`MIDI file created at ${target}, but final verification was not acknowledged: ${error instanceof Error?error.message:String(error)}. Retained file uses captured revisions; inspect it and retry at a new path after review.`;if(!this.closed)this.invalidate(message);return{path:target,verified:false,message};}
      if(!this.closed){this.state='ready';this.publish();}return{path:target,verified:true,message:`Export created: ${target}. Verified captured sources; authoritative records unchanged.`};
    }catch(error){if(!this.closed&&generation===this.generation)this.error(error);throw error;}finally{this.writing=false;if(this.job===job)this.job=undefined;}
  }
  get captured():ArrangementCapture|undefined{return this.prepared?.capture??this.pending;}
  dispose():void{this.closed=true;this.generation++;this.job?.abort();this.prepared=undefined;this.pending=undefined;this.listeners.clear();}
}
