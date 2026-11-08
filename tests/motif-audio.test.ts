import { afterEach, expect, it, vi } from 'vitest';
import { SineSink, voiceGain } from '../src/music/audio';
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
 createDynamicsCompressor(){const p=()=>({value:0});const node={threshold:p(),knee:p(),ratio:p(),attack:p(),release:p(),connect:vi.fn(),disconnect:vi.fn()};this.limiters.push(node);return node;}
 limiters:{connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}[]=[];
}
afterEach(()=>{vi.unstubAllGlobals();Context.instances=[];});
function plan(){return compileSequence({ppq:960,lengthTicks:3840,tempos:[{tick:0,microsecondsPerQuarter:500000}],tracks:[{id:'t',channel:0,sourcePpq:960,notes:[{id:'n',pitch:69,startTick:0,durationTicks:480,velocity:127}]}]});}
it('schedules each voice release/stop at onset so a stalled UI cannot leave a sustained note',async()=>{
 vi.stubGlobal('AudioContext',Context);const sink=new SineSink();await sink.resume();const event=plan().events[0];if(!event)throw Error();sink.schedule(event,10);const ctx=Context.instances[0];expect(ctx?.oscillators[0]?.frequency.value).toBe(440);expect(ctx?.oscillators[0]?.stop).toHaveBeenCalledWith(10.265);expect(ctx?.gains[0]?.gain.setTargetAtTime).toHaveBeenCalledWith(0,10.25,.003);expect(sink.activeVoices).toBe(1);await sink.close();expect(sink.activeVoices).toBe(0);expect(ctx?.state).toBe('closed');expect(ctx?.oscillators[0]?.disconnect).toHaveBeenCalled();
});
it('disconnects all voices and closes the context even when cancellation fails',async()=>{
 vi.stubGlobal('AudioContext',Context);const sink=new SineSink();await sink.resume();const event=plan().events[0];if(!event)throw Error();sink.schedule(event,0);sink.schedule({...event,voiceId:'second'},0);const ctx=Context.instances[0],voice=ctx?.oscillators[0];if(!voice)throw Error();voice.stop.mockImplementation(()=>{throw Error('Device failure');});await expect(sink.close()).rejects.toThrow('cancellation failed');expect(sink.activeVoices).toBe(0);expect(ctx?.state).toBe('closed');expect(ctx?.oscillators[1]?.disconnect).toHaveBeenCalled();
});
it('routes every voice through one shared limiter to the destination', async () => {
 vi.stubGlobal('AudioContext', Context); const sink = new SineSink(); await sink.resume(); const event = plan().events[0]; if (!event) throw Error();
 sink.schedule(event, 0); sink.schedule({ ...event, voiceId: 'second' }, 0); const ctx = Context.instances[0], limiter = ctx?.limiters[0];
 expect(ctx?.limiters).toHaveLength(1); expect(limiter?.connect).toHaveBeenCalledWith(ctx?.destination);
 for (const g of ctx?.gains ?? []) expect(g.connect).toHaveBeenCalledWith(limiter);
 await sink.close(); expect(limiter?.disconnect).toHaveBeenCalled();
});
it('makes audition audible: single notes well above the old −50 dBFS test tone, never above full scale, louder with velocity', () => {
 const dbfs = (g: number): number => 20 * Math.log10(g);
 expect(dbfs(voiceGain(96))).toBeGreaterThan(-26);   // a normal note is clearly audible at ordinary system volume
 expect(voiceGain(127)).toBeLessThanOrEqual(0.5);      // headroom before the limiter for two-note intervals
 expect(voiceGain(1)).toBeGreaterThan(0);
 for (let v = 1; v < 127; v++) expect(voiceGain(v + 1)).toBeGreaterThanOrEqual(voiceGain(v)); // velocity never makes a note quieter
});
