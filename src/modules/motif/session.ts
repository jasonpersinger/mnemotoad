import type { Entity, Motif } from '../../domain/entities';
import { HistorySession } from '../../application/history-session';
import type { DocumentSessionPort } from '../../application/document-session';
import type { EntityRecord } from '../../storage/repository';
import { editableMotif } from './commands';
const isMotif=(entity:Entity):entity is Motif=>entity.kind==='motif';
export class MotifSession extends HistorySession<Motif>{
  private selection=new Set<string>();
  constructor(draft:Motif,base:EntityRecord|undefined,port:DocumentSessionPort<Motif>,checkpointDelay=500){super(draft,base,port,editableMotif,isMotif,checkpointDelay);}
  get selected():ReadonlySet<string>{return new Set(this.selection);}
  select(ids:Iterable<string>):void{const known=new Set(this.draft.data.notes.map(note=>note.id));this.selection=new Set([...ids].filter(id=>known.has(id)));}
  protected override changed(reset=false):void{if(reset)this.selection.clear();else this.select(this.selection);}
  override dispose():void{this.selection.clear();super.dispose();}
}
