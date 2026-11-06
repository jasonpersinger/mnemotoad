import type { Composition } from '../domain/entities';
import { validateEntity } from '../domain/validation';
import { checkActive, FoundationError } from '../domain/errors';
import type { EntityIndex } from '../storage/index';
import type { EntityRepository } from '../storage/repository';
import type { VaultPort } from '../storage/vault-port';
import type { AssetPort } from '../storage/asset-port';
import { contentRevision } from '../storage/content-revision';
import type { SourceCatalog } from './catalog';
import { ARRANGEMENT_LIMITS as LIMIT, compilationInput, lexical, type CapturedSource, type CompileDiagnostic } from './compiled';
export class CompilationFault extends Error {
  constructor(readonly diagnostics: readonly CompileDiagnostic[]) { super(diagnostics.map(d=>d.message).join('\n')); this.name='CompilationFault'; }
}
export interface CapturedDocument { readonly id:string; readonly path:string; readonly revision:string; readonly text:string; readonly source:CapturedSource }
export interface ArrangementCapture { readonly composition:Composition; readonly sources:readonly CapturedSource[]; readonly documents:readonly CapturedDocument[]; readonly inputRevision:string; readonly textBytes:number; readonly cacheHits:number }
function freeze<T>(value:T):T { if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value; }
/** Bounded read-only snapshot cache behind the existing identity catalog/repository. */
export class SourceCapture {
  private cache=new Map<string,CapturedDocument>();private closed=false;
  constructor(private readonly catalog:SourceCatalog,private readonly index:EntityIndex,private readonly repository:EntityRepository,private readonly vault:VaultPort&AssetPort){}
  private reject(code:string,message:string,motifId?:string):never {throw new CompilationFault([{code,severity:'error',message,...(motifId?{motifId}:{})}]);}
  private current(id:string){const state=this.catalog.get(id);if(state.status!=='ready')this.reject('source-'+state.status,`Saved motif is ${state.status}. Inspect/restore its original note; arrangement is unchanged.`,id);return state.source;}
  async capture(input:Composition,signal?:AbortSignal):Promise<ArrangementCapture>{
    checkActive(signal,this.closed);const entity=validateEntity(input);if(entity.kind!=='composition')this.reject('wrong-kind','Choose a composition.');const composition=entity;
    await this.index.start();checkActive(signal,this.closed);
    const ids=[...new Set(composition.data.lanes.flatMap(l=>l.clips.map(c=>c.motifId.toLowerCase())))].sort(lexical);
    if(ids.length>LIMIT.sources)this.reject('source-limit',`More than${LIMIT.sources} saved sources. Split this composition.`);
    const documents:CapturedDocument[]=[];let textBytes=0,cacheHits=0;
    for(const id of ids){
      checkActive(signal,this.closed);const current=this.current(id),info=this.vault.fileInfo(current.path);
      if(!info||info.size>LIMIT.sourceBytes)this.reject('source-size','Source is missing or exceeds8MiB.',id);
      const old=this.cache.get(id);let text:string,source:CapturedSource;
      try{
        if(old?.revision===current.revision){text=await this.vault.read(current.path);source=old.source;cacheHits++;}
        else{const record=await this.repository.read(id,signal);if(record.entity.kind!=='motif')this.reject('wrong-kind','Source identity is not a motif.',id);text=record.source;source={motif:record.entity,revision:await contentRevision(text),textBytes:new TextEncoder().encode(text).length};}
      }catch(error){if(error instanceof CompilationFault)throw error;this.reject(error instanceof FoundationError?'source-'+error.code:'source-read',error instanceof Error?error.message:String(error),id);}
      checkActive(signal,this.closed);
      const revision=old&&text===old.text?old.revision:await contentRevision(text);
      if(revision!==current.revision){await this.index.refresh(current.path);this.reject('source-raced','Saved source changed during capture. Review the new revision and retry.',id);}
      if(source.revision!==revision)this.reject('source-raced','Cached source and fresh source text disagree. Retry capture.',id);
      const size=new TextEncoder().encode(text).length;textBytes+=size;
      if(size>LIMIT.sourceBytes||textBytes>LIMIT.captureBytes)this.reject('capture-limit','Saved source text exceeds the8MiB/source or16MiB total capture budget.',id);
      const document=freeze({id,path:current.path,revision,text,source});documents.push(document);this.cache.delete(id);this.cache.set(id,document);
      while(this.cache.size>LIMIT.sources||[...this.cache.values()].reduce((sum,d)=>sum+d.source.textBytes,0)>LIMIT.captureBytes){const first=this.cache.keys().next().value;if(first===undefined)break;this.cache.delete(first);}
    }
    const snapshot:ArrangementCapture=freeze({composition,sources:documents.map(d=>d.source),documents,inputRevision:await contentRevision(compilationInput(composition,documents.map(d=>d.source))),textBytes,cacheHits});
    await this.verify(snapshot,signal);return snapshot;
  }
  async verify(snapshot:ArrangementCapture,signal?:AbortSignal):Promise<void>{
    checkActive(signal,this.closed);await this.index.settled();
    for(const document of snapshot.documents){
      checkActive(signal,this.closed);const current=this.current(document.id);
      if(current.revision!==document.revision)this.reject('source-raced','A saved source revision changed during the operation. Review/recompile; no older source is substituted.',document.id);
      let text:string;try{text=await this.vault.read(current.path);}catch(error){this.reject('source-missing',`Captured source cannot be rechecked: ${error instanceof Error?error.message:String(error)}`,document.id);}
      checkActive(signal,this.closed);if(text!==document.text){await this.index.refresh(current.path);this.reject('source-raced','Fresh source text changed during the operation. Review and retry.',document.id);}
    }
    await this.index.settled();checkActive(signal,this.closed);for(const d of snapshot.documents)if(this.current(d.id).revision!==d.revision)this.reject('source-raced','Source changed while the remaining documents were verified. Retry.',d.id);
  }
  dispose():void{this.closed=true;this.cache.clear();}
}
