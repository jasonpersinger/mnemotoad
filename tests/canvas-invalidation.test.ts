import {afterEach,describe,expect,it} from 'vitest';
import {EntityIndex} from '../src/storage/index';
import {EntityRepository} from '../src/storage/repository';
import {CanvasLibrary} from '../src/modules/canvas/library';
import {addLane,renameLane,setLaneRouting} from '../src/modules/canvas/commands';
import {addSection,updateSection,moveSection,addMarker,updateMarker,addReference,updateReference} from '../src/modules/canvas/structure';
import {ArrangementPreparation} from '../src/arrangement/preparation';
import {compileArrangement} from '../src/arrangement/compiler';
import {exportArrangement} from '../src/arrangement/export';
import {musicalInput,compilationInput} from '../src/arrangement/compiled';
import type {compileArrangementIsolated} from '../src/arrangement/job';
import type {Composition} from '../src/domain/entities';
import {MemoryVault} from './support/memory-vault';
import {motif,captured,composition} from './support/arrangement-fixtures';

/** Milestone 4D: musical vs organizational invalidation. */
const execute=async(...args:Parameters<typeof compileArrangementIsolated>)=>{const result=compileArrangement(args[0],args[1],args[2]);return{result,bytes:result.ok?exportArrangement(result.arrangement):undefined,metrics:{compileMs:0,serializeMs:0}};};
const disposals:(()=>void)[]=[];afterEach(()=>{for(const fn of disposals.splice(0))fn();});
const wav=new Uint8Array([82,73,70,70,1,2,3,4]).buffer;
async function fixture(){
  const vault=new MemoryVault(),index=new EntityIndex(vault),repository=new EntityRepository(vault,index),library=new CanvasLibrary(index,repository,vault);await index.start();
  const source=await repository.create(motif()),session=library.create();session.edit('lane',c=>addLane(c,'Melody'));const lane=session.draft.data.lanes[0];if(!lane)throw Error();
  library.place(session,lane.id,source.entity.id,0,2);await vault.createBinary('Takes/take.wav',wav);await index.settled();
  session.edit('section',c=>addSection(c,{label:'Intro',startTick:0,endTick:3840},'00000000-0000-4000-8000-00000000a001'));
  session.edit('marker',c=>addMarker(c,{label:'Cue',tick:960},'00000000-0000-4000-8000-00000000b001'));
  library.addRecording(session,{label:'Take',path:'Takes/take.wav',description:'first'});
  await session.save();
  const preparation=new ArrangementPreparation(library.capture,repository,library.midiFiles,()=>({composition:session.draft,base:session.base}),execute);
  disposals.push(()=>{preparation.dispose();library.dispose();repository.dispose();index.dispose();});
  const clip=session.draft.data.lanes[0]?.clips[0];if(!clip)throw Error();
  return{vault,index,repository,library,source,session,preparation,laneId:lane.id,clipId:clip.id};
}
const section='00000000-0000-4000-8000-00000000a001',marker='00000000-0000-4000-8000-00000000b001';

describe('musicalInput',()=>{
  const m=motif(1),c=composition([m]),src=[captured(m)];
  it('is deterministic and independent of object key order',()=>{
    const reverse=(v:unknown):unknown=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
    const reordered=reverse(c) as Composition;expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(c));
    expect(musicalInput(c,src)).toBe(musicalInput(structuredClone(c),src));expect(musicalInput(reordered,src)).toBe(musicalInput(c,src));
  });
  it.each<[string,(c:Composition)=>Composition]>([
    ['section rename',c=>updateSection(addSection(c,{label:'A',startTick:0,endTick:960},section),section,{label:'B'})],
    ['section move',c=>moveSection(addSection(c,{label:'A',startTick:0,endTick:960},section),section,1920)],
    ['marker rename/move',c=>updateMarker(addMarker(c,{label:'A',tick:0},marker),marker,{label:'B',tick:960})],
    ['reference description',c=>{const x=addReference(c,{label:'T',path:'Takes/t.wav'});return updateReference(x,x.data.audioRefs[0]?.id??'',{description:'notes'});}],
    ['composition prose/tags',c=>({...c,description:'d',notes:'n',tags:['x']})],
  ])('ignores organizational change: %s',(_name,edit)=>{
    const base=musicalInput(c,src),next=edit(structuredClone(c));expect(musicalInput(next,src)).toBe(base);expect(compilationInput(next,src)).not.toBe(compilationInput(c,src));
  });
  it.each<[string,(c:Composition)=>Composition]>([
    ['clip position',c=>{const x=structuredClone(c);const clip=x.data.lanes[0]?.clips[0];if(clip)clip.startTick=960;return x;}],
    ['clip repetition',c=>{const x=structuredClone(c);const clip=x.data.lanes[0]?.clips[0];if(clip)clip.repeatCount=2;return x;}],
    ['routing',c=>setLaneRouting(c,'lane00',4,false)],
    ['lane name (MIDI track name)',c=>renameLane(c,'lane00','Bass')],
    ['tempo',c=>({...c,data:{...c.data,tempoMicrosecondsPerQuarter:400000}})],
    ['meter',c=>({...c,data:{...c.data,meter:{numerator:3,denominator:4}}})],
    ['title',c=>({...c,title:'Other'})],
    ['unknown data field (fail-safe musical)',c=>({...c,data:{...c.data,futureField:1}} as Composition)],
  ])('changes on musical change: %s',(_name,edit)=>{expect(musicalInput(edit(structuredClone(c)),src)).not.toBe(musicalInput(c,src));});
  it('changes when a source revision changes',()=>{expect(musicalInput(c,[captured(m,'b'.repeat(64))])).not.toBe(musicalInput(c,src));});
  it('produces byte-identical MIDI for metadata-only edits',()=>{
    const a=compileArrangement(c,src,'c'.repeat(64)),edited=updateMarker(addMarker(addSection(c,{label:'A',startTick:0,endTick:960},section),{label:'M',tick:0},marker),marker,{tick:960}),b=compileArrangement(edited,src,'c'.repeat(64));
    if(!a.ok||!b.ok)throw Error('compile');expect(exportArrangement(b.arrangement)).toEqual(exportArrangement(a.arrangement));
  });
});

describe('ArrangementPreparation with organizational edits',()=>{
  it('keeps prepared notes valid across section/marker/reference edits and exports identical bytes',async()=>{
    const f=await fixture();expect(await f.preparation.prepare()).toBe(true);const first=await f.preparation.export('Exports/before.mid');
    f.session.edit('rename section',c=>updateSection(c,section,{label:'Verse',description:'d'}));
    f.session.edit('move section',c=>moveSection(c,section,3840));
    f.session.edit('rename marker',c=>updateMarker(c,marker,{label:'Drop',tick:1920}));
    f.session.edit('reference notes',c=>updateReference(c,c.data.audioRefs[0]?.id??'',{description:'second'}));
    expect(f.preparation.musicallyCurrent(f.session.draft)).toBe(true);expect(f.preparation.state).toBe('ready');
    await f.preparation.verifyPrepared();const second=await f.preparation.export('Exports/after.mid');
    expect(second.verified).toBe(true);expect(f.vault.binaries.get(second.path)).toEqual(f.vault.binaries.get(first.path));
  });
  it.each<[string,(f:Awaited<ReturnType<typeof fixture>>)=>void]>([
    ['clip move',f=>f.library.move(f.session,f.clipId,f.laneId,960,2)],
    ['clip repetition',f=>f.library.move(f.session,f.clipId,f.laneId,0,1)],
    ['routing',f=>f.session.edit('route',c=>setLaneRouting(c,f.laneId,5,false))],
    ['tempo',f=>f.session.edit('tempo',c=>({...c,data:{...c.data,tempoMicrosecondsPerQuarter:600000}}))],
  ])('treats %s as musical and refuses stale export',async(_n,edit)=>{
    const f=await fixture();expect(await f.preparation.prepare()).toBe(true);edit(f);
    expect(f.preparation.musicallyCurrent(f.session.draft)).toBe(false);await expect(f.preparation.verifyPrepared()).rejects.toThrow('changed');
  });
  it('invalidates on a source revision change even when the composition is unchanged',async()=>{
    const f=await fixture();await f.preparation.prepare();f.vault.modify(f.source.path,f.source.source+'\nEdited\n');await f.index.settled();
    await expect(f.preparation.verifyPrepared()).rejects.toThrow();await expect(f.preparation.export('Exports/x.mid')).rejects.toThrow();expect(f.vault.binaries.has('Exports/x.mid')).toBe(false);
  });
  it('adopts its own metadata-only save without recompiling; export fails closed before adoption',async()=>{
    const f=await fixture();await f.preparation.prepare();const prepared=f.preparation.prepared;
    f.session.edit('rename',c=>updateSection(c,section,{label:'Chorus'}));await f.session.save();
    await expect(f.preparation.verifyPrepared()).rejects.toThrow('base changed');
    expect(await f.preparation.adoptSavedBase()).toBe(true);expect(f.preparation.prepared?.arrangement).toBe(prepared?.arrangement);
    expect(f.preparation.prepared?.baseRevision).toMatch(/^[0-9a-f]{64}$/);expect(f.preparation.prepared?.baseRevision).not.toBe(prepared?.baseRevision);
    expect((await f.preparation.export('Exports/adopted.mid')).verified).toBe(true);
  });
  it('refuses adoption when the saved record changed externally (save conflict stays protected)',async()=>{
    const f=await fixture();await f.preparation.prepare();f.session.edit('rename',c=>updateMarker(c,marker,{label:'Other'}));await f.session.save();
    const path=f.session.base?.path??'';f.vault.modify(path,(f.vault.files.get(path)??'')+'\nExternal prose\n');
    expect(await f.preparation.adoptSavedBase()).toBe(false);expect(f.preparation.state).toBe('invalidated');expect(f.preparation.prepared).toBeUndefined();
    expect(f.vault.files.get(path)).toContain('External prose');
  });
  it('refuses adoption after a musical edit was saved',async()=>{
    const f=await fixture();await f.preparation.prepare();f.library.move(f.session,f.clipId,f.laneId,960,2);await f.session.save();
    expect(await f.preparation.adoptSavedBase()).toBe(false);expect(f.preparation.state).toBe('invalidated');
  });
  it('preserves unknown future metadata through organizational edits and save',async()=>{
    const f=await fixture(),path=f.session.base?.path??'',id=f.session.draft.id,text=f.vault.files.get(path)??'';expect(text).toContain('"sections": [');
    f.vault.modify(path,text.replace('"sections": [','"futureOrganizer": {"keep": true},\n    "sections": ['));await f.index.settled();f.session.dispose?.();
    const reopened=await f.library.open(id);reopened.edit('rename',c=>updateSection(c,section,{label:'Bridge'}));await reopened.save();
    const saved=f.vault.files.get(path)??'';expect(saved).toContain('futureOrganizer');expect(saved).toContain('Bridge');
  });
  it('never modifies recording bytes',async()=>{
    const f=await fixture(),before=f.vault.binaries.get('Takes/take.wav');f.session.edit('notes',c=>updateReference(c,c.data.audioRefs[0]?.id??'',{description:'x'}));await f.session.save();
    expect(f.vault.binaries.get('Takes/take.wav')).toBe(before);
  });
});
