import type { Entity, Motif } from '../../domain/entities';
import { HistorySession } from '../../application/history-session';
import type { DocumentSessionPort } from '../../application/document-session';
import type { EntityRecord } from '../../storage/repository';
import { sessionMotif } from './commands';
const isMotif=(entity:Entity):entity is Motif=>entity.kind==='motif';
export class MotifSession extends HistorySession<Motif>{
  /** 4I: every MOTIF transform builds new values (commands spread their input), so they receive the frozen draft; unchanged notes are then shared between snapshots. */
  protected override readonly shareTransformInput = true;
  private selection=new Set<string>();
  constructor(draft:Motif,base:EntityRecord|undefined,port:DocumentSessionPort<Motif>,checkpointDelay=500){super(draft,base,port,sessionMotif,isMotif,checkpointDelay);}
  get selected():ReadonlySet<string>{return new Set(this.selection);}
  /** 4G: validity is checked against the live draft (no clone); the id set is rebuilt only when the draft changes. */
  private known?:{version:number;ids:Set<string>};
  select(ids:Iterable<string>):void{if(this.known?.version!==this.changeVersion)this.known={version:this.changeVersion,ids:new Set(this.peek().data.notes.map(note=>note.id))};const known=this.known.ids;this.selection=new Set([...ids].filter(id=>known.has(id)));}
  protected override changed(reset=false):void{if(reset)this.selection.clear();else this.select(this.selection);}
  override dispose():void{this.selection.clear();this.known=undefined;super.dispose();}
}
