import type { Composition } from '../domain/entities';
import type { CapturedSource, CompilationResult } from './compiled';
import { isolatedMidiWork } from '../midi/job';
export interface CompilationJob { readonly result:CompilationResult; readonly bytes?:Uint8Array; readonly metrics:{compileMs:number;serializeMs:number} }
export function compileArrangementIsolated(composition:Composition,sources:readonly CapturedSource[],inputRevision:string,signal:AbortSignal,factory?:(url:string)=>Worker):Promise<CompilationJob>{
  return isolatedMidiWork({kind:'arrangement',composition,sources,inputRevision},[],signal,data=>data.compiled as CompilationJob|undefined,factory,'Arrangement compilation');
}
