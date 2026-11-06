import { expect, it } from 'vitest';
import { inspectMidi, selectedMidiData } from '../src/midi/import';
import { exportMidi, exportWarnings } from '../src/midi/export';
import { MIDI_LIMITS, scanMidi } from '../src/midi/structure';
import { createEntity } from '../src/domain/entities';
import { event, end, tempo, meter, smf, melody } from './support/midi-fixtures';
it.each([96,480,960,1000,32767])('retains supported musical events through MIDI→motif→MIDI at PPQ%i',ppq=>{
 const bytes=melody(ppq),copy=bytes.slice(),preview=inspectMidi(bytes),data=selectedMidiData(preview,0,0,false),motif=createEntity('motif','Round trip');motif.data=data;
 expect(data.notes.map(({pitch,startTick,durationTicks,velocity})=>({pitch,startTick,durationTicks,velocity}))).toEqual([{pitch:60,startTick:1,durationTicks:37,velocity:87},{pitch:60,startTick:38,durationTicks:39,velocity:43}]);expect(data.ppq).toBe(ppq);expect(data.lengthTicks).toBe(100);
 const output=exportMidi(motif),scanned=scanMidi(output),notes=scanned.tracks[1]?.events.filter(e=>e.channel!==undefined);expect(notes?.map(e=>[e.tick,e.status,e.data[0],e.data[1]])).toEqual([[1,0x90,60,87],[38,0x80,60,0],[38,0x90,60,43],[77,0x80,60,0]]);expect(scanned.format).toBe(1);expect(scanned.ppq).toBe(ppq);expect(scanned.tracks.map(t=>t.endTick)).toEqual([100,100]);expect(exportMidi(motif)).toEqual(output);expect(bytes).toEqual(copy);
 const round=inspectMidi(output);const again=selectedMidiData(round,1,0,false);expect({...again,notes:again.notes.map(n=>({pitch:n.pitch,startTick:n.startTick,durationTicks:n.durationTicks,velocity:n.velocity}))}).toEqual({...data,notes:data.notes.map(n=>({pitch:n.pitch,startTick:n.startTick,durationTicks:n.durationTicks,velocity:n.velocity}))});
});
it('preserves chords, different-pitch overlaps, interleaving and running status',()=>{
 const bytes=smf([[...event(0,0x93,60,70),...event(0,64,71),...event(0,67,72),...event(0,71,73),...event(120,60,0),...event(30,64,0),...event(30,67,0),...event(30,71,0),...end(10)]]),p=inspectMidi(bytes),d=selectedMidiData(p,0,3,false);expect(d.notes.map(n=>[n.pitch,n.durationTicks,n.velocity])).toEqual([[60,120,70],[64,150,71],[67,180,72],[71,210,73]]);expect(d.importSourceChannel).toBe(3);
});
it('exposes Type1 tracks/channels explicitly without merging or shortening trailing silence',()=>{
 const p=inspectMidi(smf([[...tempo(600000),...meter(6,3),...end(999)],[...event(0,0xff,3,4,76,101,97,100),...event(2,0x92,60,90),...event(0,0x95,72,100),...event(40,0x82,60,0),...event(0,0x85,72,0),...end(100)]]));expect(p.parts.map(t=>[t.track,t.channel,t.name])).toEqual([[1,2,'Lead'],[1,5,'Lead']]);const d=selectedMidiData(p,1,5,false);expect(d.lengthTicks).toBe(142);expect(d.notes[0]).toMatchObject({pitch:72,startTick:2,durationTicks:40});expect(d.meter).toEqual({numerator:6,denominator:8});expect(d.tempoMicrosecondsPerQuarter).toBe(600000);
});
it('requires loss acknowledgment but blocks stateful musical events across same-channel tracks',()=>{
 const notes=[...event(0,0x90,60,90),...event(10,0x80,60,64),...end()];let p=inspectMidi(smf([[...event(0,0xc0,12),...notes]]));expect(()=>selectedMidiData(p,0,0,false)).toThrow('acknowledgment');expect(selectedMidiData(p,0,0,true).notes).toHaveLength(1);
 for(const payload of [[0xb0,64,127],[0xe0,0,64],[0xa0,60,1],[0xd0,1]]){p=inspectMidi(smf([[...event(0,...payload),...end()],[...notes]]));expect(()=>selectedMidiData(p,1,0,true)).toThrow();}
 p=inspectMidi(smf([[...event(0,0xb1,64,127),...end()],[...notes]]));expect(selectedMidiData(p,1,0,true).notes).toHaveLength(1);
});
it.each([
 ['same-pitch overlap',[...event(0,0x90,60,90),...event(1,0x90,60,80),...event(4,0x80,60,0),...end()]],
 ['missing note-off',[...event(0,0x90,60,90),...end(10)]],['extra note-off',[...event(0,0x80,60,0),...end(10)]],
 ['zero duration',[...event(0,0x90,60,90),...event(0,0x80,60,0),...end(10)]]
])('blocks ambiguous/invalid pairing: %s',(_name,track)=>{const p=inspectMidi(smf([track]));expect(()=>selectedMidiData(p,0,0,true)).toThrow();});
it('rejects timing changes instead of flattening and accepts repeated identical declarations',()=>{
 const note=[...event(0,0x90,60,90),...event(480,0x80,60,0),...end()];
 for(const meta of [[...tempo(),...event(10,0xff,0x51,3,9,39,192)],[...meter(),...event(10,0xff,0x58,4,3,2,24,8)],[...event(10,0xff,0x51,3,9,39,192)]])expect(()=>selectedMidiData(inspectMidi(smf([[...meta,...end(600)],note])),1,0,true)).toThrow();
 expect(selectedMidiData(inspectMidi(smf([[...tempo(),...tempo(),...meter(),...meter(),...note]])),0,0,false).notes).toHaveLength(1);
});
it.each([[tempo(0)],[tempo(100000)],[meter(0,2)],[meter(4,6)],[event(0,0xf0,2,1,0xf7)]])('blocks unrepresentable timing or global device-state data',meta=>{const p=inspectMidi(smf([[...meta,...event(0,0x90,60,90),...event(10,0x80,60,0),...end()]]));expect(()=>selectedMidiData(p,0,0,true)).toThrow();});
it.each([
 ['header',()=>Uint8Array.from([0,0,0])],['missing track',()=>melody().slice(0,14)],['truncated',()=>melody().slice(0,-1)],['Type2',()=>smf([[...end()]],2)],['SMPTE',()=>smf([[...end()]],0,0xe328)],['PPQ0',()=>smf([[...end()]],0,0)],['Type0 multi-track',()=>smf([[...end()],[...end()]],0)],['running',()=>smf([[...event(0,60,90),...end()]])],['long VLQ',()=>smf([[128,128,128,128,0,...end()]])],['data high bit',()=>smf([[...event(0,0x90,128,1),...end()]])],['missing end',()=>smf([[...event(0,0x90,60,1)]])],['after end',()=>smf([[...end(),0]])],['bad meta length',()=>smf([[...event(0,0xff,0x51,2,0,1),...end()]])],['system',()=>smf([[...event(0,0xf8),...end()]])],['cancelled running',()=>smf([[...event(0,0x90,60,1),...tempo(),...event(2,60,0),...end()]])],['trailing',()=>Uint8Array.from([...melody(),0])]
])('strictly rejects %s',(_label,make)=>expect(()=>inspectMidi(make())).toThrow());
it('bounds file bytes, tracks, events, payload and total ticks before decoding',()=>{
 expect(()=>inspectMidi(new Uint8Array(MIDI_LIMITS.bytes+1))).toThrow('2MiB');expect(()=>scanMidi(smf(Array.from({length:129},()=>end()),1))).toThrow('track count');
 expect(()=>scanMidi(smf([[...Array.from({length:50001},()=>event(0,0xc0,0)).flat(),...end()]]))).toThrow('50000');
 expect(()=>scanMidi(smf([[...event(0,0xff,1,0x84,0x80,1),...Array(65537).fill(0),...end()]]))).toThrow('64KiB');
 expect(()=>scanMidi(smf([[...Array.from({length:5},()=>event(268435455,0xc0,0)).flat(),...end()]]))).toThrow('tick bound');
});
it('exports all128 distinct pitches without inheriting the64-voice audition restriction',()=>{const m=createEntity('motif','Dense chord');m.data.notes=Array.from({length:128},(_,i)=>({id:String(i),pitch:i,startTick:0,durationTicks:120,velocity:96}));expect(scanMidi(exportMidi(m)).tracks[1]?.events.filter(e=>e.status===0x90)).toHaveLength(128);});
it('names omitted annotations precisely and blocks unknown/device/sequencer metadata',()=>{const notes=[...event(0,0x90,60,90),...event(10,0x80,60,0),...end()];const lyrics=inspectMidi(smf([[...event(0,0xff,5,1,65),...notes]]));expect(lyrics.issues.find(i=>i.code==='meta-5')?.message).toContain('lyrics');expect(()=>selectedMidiData(lyrics,0,0,false)).toThrow('acknowledgment');expect(selectedMidiData(lyrics,0,0,true).notes).toHaveLength(1);for(const metaType of [9,0x7f,0x70]){const p=inspectMidi(smf([[...event(0,0xff,metaType,1,65),...notes]]));expect(()=>selectedMidiData(p,0,0,true)).toThrow('meaning');}});
it('requires acknowledgment for shortened/encoding-fallback/additional names and reports export title limits',()=>{const notes=[...event(0,0x90,60,90),...event(10,0x80,60,0),...end()];for(const names of [[...event(0,0xff,3,0x81,0x71),...Array(241).fill(65)],[...event(0,0xff,3,1,0xff)],[...event(0,0xff,3,1,65),...event(0,0xff,3,1,66)]]){const p=inspectMidi(smf([[...names,...notes]]));expect(()=>selectedMidiData(p,0,0,false)).toThrow('acknowledgment');expect(selectedMidiData(p,0,0,true).notes).toHaveLength(1);}const m=createEntity('motif','𝄞'.repeat(300));expect(exportWarnings(m).join(' ')).toContain('256');const name=scanMidi(exportMidi(m)).tracks[1]?.events.find(e=>e.metaType===3)?.data;expect(Array.from(new TextDecoder().decode(name)).length).toBe(256);});
it('blocks selected parts above note/phrase bounds without truncation',()=>{const track:number[]=[];for(let i=0;i<10001;i++)track.push(...event(1,0x90,60,90),...event(1,0x80,60,0));track.push(...end());const tooMany=inspectMidi(smf([track]));expect(tooMany.parts[0]?.notes).toHaveLength(10001);expect(()=>selectedMidiData(tooMany,0,0,true)).toThrow('10000');const tooLong=inspectMidi(smf([[...event(0,0x90,60,90),...event(10,0x80,60,0),...end(480*4096)]]));expect(()=>selectedMidiData(tooLong,0,0,true)).toThrow('4096');});
it('distinguishes unrepresentable notated beat scaling from optional metronome clicks',()=>{const notes=[...event(0,0x90,60,90),...event(10,0x80,60,0),...end()];const scaled=inspectMidi(smf([[...event(0,0xff,0x58,4,6,3,36,4),...notes]]));expect(()=>selectedMidiData(scaled,0,0,true)).toThrow('beat interpretation');const click=inspectMidi(smf([[...event(0,0xff,0x58,4,6,3,36,8),...notes]]));expect(()=>selectedMidiData(click,0,0,false)).toThrow('acknowledgment');expect(selectedMidiData(click,0,0,true).meter).toEqual({numerator:6,denominator:8});});
