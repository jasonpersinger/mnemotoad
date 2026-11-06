import { createEntity, type Motif } from '../../domain/entities';
import { checkActive, FoundationError } from '../../domain/errors';
import type { EntityIndex } from '../../storage/index';
import type { EntityRecord, EntityRepository } from '../../storage/repository';
import { CheckpointRecovery, type RecoveredDraft } from '../../storage/recovery';
import type { AssetPort } from '../../storage/asset-port';
import type { VaultPort } from '../../storage/vault-port';
import { object, validateEntity } from '../../domain/validation';
import { MotifSession } from './session';
import { editableMotif } from './commands';
import { MidiFiles } from '../../midi/files';
import { selectedMidiData, type MidiInspection } from '../../midi/import';
import { assetLink } from '../../domain/paths';
export class MotifLibrary {
  private sessions = new Map<string, MotifSession>(); private closed = false;
  readonly recovery: CheckpointRecovery<Motif>;
  readonly midiFiles: MidiFiles;
  private owners = new Map<MotifSession, Set<object>>();
  private draftListeners=new Set<()=>void>();
  isDirty(id:string):boolean{return this.sessions.get(id.toLowerCase())?.dirty??false;}
  subscribeDrafts(listener:()=>void):()=>void{this.draftListeners.add(listener);return()=>{this.draftListeners.delete(listener);};}
  private publishDrafts():void{if(!this.closed)for(const listener of this.draftListeners)listener();}
  constructor(readonly index: EntityIndex, private readonly repository: EntityRepository, vault: VaultPort & AssetPort) {
    this.midiFiles = new MidiFiles(vault);
    this.recovery = new CheckpointRecovery(vault, index, repository, raw => {
      const fields = object(raw, 'motif recovery'), title = fields.title;
      const entity = validateEntity({ ...fields, title: title === '' ? 'Untitled recovery' : title });
      if (entity.kind !== 'motif') throw new FoundationError('wrong-kind', 'This checkpoint belongs to another module.');
      if (title === '') entity.title = ''; return editableMotif(entity);
    });
  }
  items(search = ''): { path: string; entity: Motif; ambiguous: boolean }[] {
    const entries = this.index.all();
    return entries.flatMap(entry => entry.entity?.kind === 'motif' && entry.entity.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ? [{ path: entry.path, entity: entry.entity, ambiguous: this.index.resolve(entry.entity.id).status !== 'ready' }] : [])
      .sort((a, b) => a.entity.title.localeCompare(b.entity.title) || a.entity.id.localeCompare(b.entity.id));
  }
  drafts(): MotifSession[] { return [...this.sessions.values()].filter(session => session.dirty); }
  private session(draft: Motif, base?: EntityRecord): MotifSession {
    if (this.drafts().length >= 20) throw new FoundationError('invalid', 'Save or discard an existing draft before opening more than20 drafts.');
    const session = new MotifSession(draft, base, {
      save: (original, next, signal) => this.persist(original, next, signal),
      checkpoint: (next, original, signal) => this.repository.saveEditorDraft(next, original, signal),
    }); this.sessions.set(draft.id.toLowerCase(), session);session.subscribe(()=>this.publishDrafts());this.publishDrafts(); this.trimClean(); return session;
  }
  private async persist(base: EntityRecord | undefined, next: Motif, signal: AbortSignal): Promise<EntityRecord> {
    checkActive(signal, this.closed); await this.index.start(); checkActive(signal, this.closed); const value=editableMotif(next);
    if(value.patchId){const state=this.index.resolve(value.patchId);if(state.status==='ready'&&state.entity.kind==='patch'&&!state.entity.archived)value.patchLink=assetLink(`[[${state.path}]]`);
      else if(value.patchId.toLowerCase()!==(base?.entity.kind==='motif'?base.entity.patchId?.toLowerCase():undefined))throw new FoundationError('invalid','New association requires a unique active PATCHBOOK patch.');
    } else delete value.patchLink;
    return base?this.repository.save(base,value,signal):this.repository.create(value,signal);
  }
  importPart(preview: MidiInspection, track: number, channel: number, acknowledged: boolean, filename: string): MotifSession {
    checkActive(undefined,this.closed);const data=selectedMidiData(preview,track,channel,acknowledged),part=preview.parts.find(p=>p.track===track&&p.channel===channel);
    const value=createEntity('motif',Array.from(part?.name||filename.replace(/\.midi?$/i,'')).slice(0,240).join(''));value.data={...data,notes:data.notes.map(n=>({...n,id:crypto.randomUUID()})),midiImport:{filename:filename.split(/[\\/]/).at(-1)?.slice(0,256)??'MIDI',format:preview.format,track,channel,acknowledgedIssues:[...preview.issues,...(part?.issues??[])].filter(i=>i.severity==='warning').map(i=>i.code)}};return this.session(value);
  }
  associate(session: MotifSession,id?: string): void {
    checkActive(undefined,this.closed);let link: string|undefined;if(id){const state=this.index.resolve(id);if(state.status!=='ready'||state.entity.kind!=='patch'||state.entity.archived)throw new FoundationError('invalid','Choose a unique active PATCHBOOK patch. Missing/archived/ambiguous references are preserved until explicitly changed.');link=assetLink(`[[${state.path}]]`);}
    session.edit('Associate PATCHBOOK patch',m=>({...m,patchId:id,patchLink:link}));
  }
  /** Attached owners pin sessions. Only clean, idle, unowned sessions can be evicted. */
  retain(session: MotifSession,owner: object): void {const owners=this.owners.get(session)??new Set<object>();owners.add(owner);this.owners.set(session,owners);}
  release(session: MotifSession,owner: object): void {const owners=this.owners.get(session);owners?.delete(owner);if(!owners?.size)this.owners.delete(session);this.trimClean();}
  private trimClean(): void {const clean=[...this.sessions.values()].filter(s=>!s.dirty&&!s.busy&&!this.owners.has(s));while(clean.length>8){const old=clean.shift();if(old){old.dispose();this.sessions.delete(old.draft.id.toLowerCase());}}}
  create(): MotifSession { checkActive(undefined, this.closed); const value = createEntity('motif', 'Untitled motif'); value.data.lengthTicks = 15360; return this.session(value); }
  async open(id: string, signal?: AbortSignal): Promise<MotifSession> {
    checkActive(signal, this.closed); const existing = this.sessions.get(id.toLowerCase()); if (existing?.dirty) return existing;
    const record = await this.repository.read(id, signal); checkActive(signal, this.closed);
    if (record.entity.kind !== 'motif') throw new FoundationError('wrong-kind', 'Choose a motif record.'); editableMotif(record.entity);
    const current = this.sessions.get(id.toLowerCase()); if (current?.dirty) return current;
    if (current && !current.disposed) { current.reload(record); return current; } return this.session(record.entity, record);
  }
  recover(value: RecoveredDraft<Motif>): MotifSession {
    checkActive(undefined, this.closed); const existing = this.sessions.get(value.draft.id.toLowerCase());
    if (existing?.dirty || existing?.busy) throw new FoundationError('conflict', 'Save or explicitly discard the current motif draft before recovering.');
    if(existing)this.owners.delete(existing); existing?.dispose(); const session = this.session(value.draft, value.base); session.update(value.draft); session.recoveryPath = value.checkpoint; return session;
  }
  discard(session: MotifSession): void { this.owners.delete(session); session.dispose(); this.sessions.delete(session.draft.id.toLowerCase());this.publishDrafts(); }
  async checkpointAll(): Promise<void> { for (const session of this.drafts()) await session.checkpoint(); }
  dispose(): void { this.closed = true; this.recovery.dispose(); for (const session of this.sessions.values()) session.dispose(); this.sessions.clear(); this.owners.clear();this.draftListeners.clear(); }
}
