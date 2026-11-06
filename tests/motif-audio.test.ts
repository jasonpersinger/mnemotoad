import { afterEach, expect, it, vi } from 'vitest';
import { SineSink } from '../src/music/audio';
import { compileSequence } from '../src/music/compiler';
function oscillator(){return{frequency:{value:0},type:'sine',onended:null as (()=>void)|null,connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};}
function gain(){return{gain:{value:0,setTargetAtTime:vi.fn(),cancelScheduledValues:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};}
class Context {
 static instances: Context[]=[];
 state='running';currentTime=0;destination={};oscillators:ReturnType<typeof oscillator>[]=[];gains:ReturnType<typeof gain>[]=[];
 constructor(){Context.instances.push(this);}
 async resume(){this.state='running';}async close(){this.state='closed';}
 createOscillator(){const node=oscillator();this.oscillators.push(node);return node;}
 createGain(){const node=gain();this.gains.push(node);return node;}
}
afterEach(()=>{vi.unstubAllGlobals();Context.instances=[];});
function plan(){return compileSequence({ppq:960,lengthTicks:3840,tempos:[{tick:0,microsecondsPerQuarter:500000}],tracks:[{id:'t',channel:0,sourcePpq:960,notes:[{id:'n',pitch:69,startTick:0,durationTicks:480,velocity:127}]}]});}
it('schedules each voice release/stop at onset so a stalled UI cannot leave a sustained note',async()=>{
 vi.stubGlobal('AudioContext',Context);const sink=new SineSink();await sink.resume();const event=plan().events[0];if(!event)throw Error();sink.schedule(event,10);const ctx=Context.instances[0];expect(ctx?.oscillators[0]?.frequency.value).toBe(440);expect(ctx?.oscillators[0]?.stop).toHaveBeenCalledWith(10.265);expect(ctx?.gains[0]?.gain.setTargetAtTime).toHaveBeenCalledWith(0,10.25,.003);expect(sink.activeVoices).toBe(1);await sink.close();expect(sink.activeVoices).toBe(0);expect(ctx?.state).toBe('closed');expect(ctx?.oscillators[0]?.disconnect).toHaveBeenCalled();
});
it('disconnects all voices and closes the context even when cancellation fails',async()=>{
 vi.stubGlobal('AudioContext',Context);const sink=new SineSink();await sink.resume();const event=plan().events[0];if(!event)throw Error();sink.schedule(event,0);sink.schedule({...event,voiceId:'second'},0);const ctx=Context.instances[0],voice=ctx?.oscillators[0];if(!voice)throw Error();voice.stop.mockImplementation(()=>{throw Error('Device failure');});await expect(sink.close()).rejects.toThrow('cancellation failed');expect(sink.activeVoices).toBe(0);expect(ctx?.state).toBe('closed');expect(ctx?.oscillators[1]?.disconnect).toHaveBeenCalled();
});
