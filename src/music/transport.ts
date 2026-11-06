import type { MusicalPlan, MusicalEvent } from './compiler';
import { SineSink, type MusicalSink } from './audio';
import { messageOf } from '../domain/errors';
export interface MusicalClock { readonly now: number; every(callback: () => void, milliseconds: number): () => void }
const clock: MusicalClock = { get now() { return performance.now() / 1000; }, every(callback, milliseconds) { const id = setInterval(callback, milliseconds); return () => clearInterval(id); } };
/** One audio-clock owner for MOTIF/CANVAS; UI frames never schedule musical events. */
export class MusicalTransport {
  state: 'stopped' | 'starting' | 'playing' | 'paused' | 'disposed' = 'stopped'; diagnostic = '';
  private sink?: MusicalSink; private owner?: object; private generation = 0; private clearTimer?: () => void;
  private diagnosticOwner?:object;
  private plan?: MusicalPlan; private cursor = 0; private origin = 0; private lastAudio = 0; private lastWall = 0; private held = 0;
  private starts: MusicalEvent[] = []; private prefixEnds: number[] = []; private scheduled = new Set<string>();
  private listeners = new Set<() => void>(); private closing = new Set<Promise<void>>();
  readonly measurements: { leadSeconds: number; wallGap: number }[] = [];
  constructor(private readonly beforeStart: () => void = () => {}, private readonly factory: () => MusicalSink = () => new SineSink(), private readonly timer: MusicalClock = clock) {}
  get position(): number { return this.state === 'playing' && this.sink ? Math.max(this.held, Math.min(this.plan?.durationSeconds ?? 0, this.sink.now - this.origin)) : this.held; }
  get activeVoices(): number { return this.sink?.activeVoices ?? 0; }
  get timerCount(): number { return this.clearTimer ? 1 : 0; }
  get closingCount(): number { return this.closing.size; }
  ownedBy(owner: object): boolean { return this.owner === owner; }
  diagnosticFor(owner:object):string{return this.diagnosticOwner===owner?this.diagnostic:'';}
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish(): void { for (const listener of this.listeners) listener(); }
  private releaseAudio(): void {
    this.generation++; this.clearTimer?.(); this.clearTimer = undefined; this.scheduled.clear();
    const sink = this.sink; this.sink = undefined;
    if (sink) {
      try { sink.cancel(); } catch (error) { this.diagnostic = `Audio cancellation failed: ${messageOf(error)}`; }
      const closing = sink.close().catch(error => { this.diagnostic = `Audio cleanup failed: ${messageOf(error)}`; if (this.state !== 'disposed') this.publish(); });
      this.closing.add(closing); void closing.finally(() => { this.closing.delete(closing); });
    }
  }
  private finish(position=0):void { this.releaseAudio();this.owner=undefined;this.plan=undefined;this.starts=[];this.prefixEnds=[];this.held=position;if(this.state!=='disposed')this.state='stopped';this.publish(); }
  stop(owner?: object): void { if (owner && this.owner !== owner) return;this.finish(); }
  private validatePosition(seconds:number,plan:MusicalPlan):void{if(!Number.isFinite(seconds)||seconds<0||seconds>plan.durationSeconds)throw Error('Seek position is outside the compiled arrangement.');}
  async start(owner: object, plan: MusicalPlan, offsetSeconds=0): Promise<void> {
    if (this.state === 'disposed') throw Error('Transport is disposed');
    if (!Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0 || plan.events.some((event, i) => !Number.isFinite(event.seconds) || event.seconds < 0 || event.seconds > plan.durationSeconds || event.seconds < (plan.events[i - 1]?.seconds ?? 0))) throw Error('Playback plan has invalid timing');
    this.validatePosition(offsetSeconds,plan);
    const starts=plan.events.filter(e=>e.kind==='on');let end=0;const prefixEnds=starts.map(e=>{if(!Number.isFinite(e.durationSeconds)||!(Number(e.durationSeconds)>0))throw Error('Playback note has invalid duration');end=Math.max(end,e.seconds+Number(e.durationSeconds));return end;});this.starts=starts;this.prefixEnds=prefixEnds;
    await this.begin(owner,plan,offsetSeconds);
  }
  private lowerBound(events:readonly MusicalEvent[],seconds:number):number{let low=0,high=events.length;while(low<high){const middle=(low+high)>>>1;if((events[middle]?.seconds??Infinity)<seconds)low=middle+1;else high=middle;}return low;}
  private async begin(owner:object,plan:MusicalPlan,offset:number):Promise<void>{
    this.releaseAudio();this.owner=owner;this.diagnosticOwner=owner;this.plan=plan;this.held=offset;this.diagnostic='';
    if(offset===plan.durationSeconds){this.finish(offset);return;}
    this.state='starting';this.publish();const generation=this.generation;
    try {
      this.beforeStart();
      const sink=this.factory();this.sink=sink;await sink.resume();if(generation!==this.generation)return;
      this.cursor=this.lowerBound(plan.events,offset);this.origin=sink.now+.05-offset;this.lastAudio=sink.now;this.lastWall=this.timer.now;
      // Retrigger only notes crossing the seek point, for their remaining duration.
      let index=this.lowerBound(this.starts,offset)-1;
      while(index>=0&&(this.prefixEnds[index]??0)>offset){const event=this.starts[index];if(event&&event.seconds+Number(event.durationSeconds)>offset){sink.schedule({...event,seconds:offset,durationSeconds:event.seconds+Number(event.durationSeconds)-offset},this.origin+offset);this.scheduled.add(event.voiceId);}index--;}
      this.state='playing';this.clearTimer=this.timer.every(()=>{if(generation===this.generation)this.pump();},25);this.pump();this.publish();
    }catch(error){if(generation===this.generation){this.stop();this.diagnostic=`Playback failed: ${messageOf(error)}`;this.publish();throw error;}}
  }
  pause(owner:object):void{if(this.owner!==owner||!this.plan||!['playing','starting'].includes(this.state))return;const position=this.position;this.releaseAudio();this.held=position;this.state='paused';this.publish();}
  async resume(owner:object):Promise<void>{if(this.owner!==owner||this.state!=='paused'||!this.plan)return;await this.begin(owner,this.plan,this.held);}
  async seek(owner:object,seconds:number):Promise<void>{if(this.owner!==owner||!this.plan)return;this.validatePosition(seconds,this.plan);if(this.state==='playing'||this.state==='starting')await this.begin(owner,this.plan,seconds);else{this.releaseAudio();this.held=seconds;this.state='paused';this.publish();}}
  private pump(): void {
    const sink = this.sink, plan = this.plan; if (this.state !== 'playing' || !sink || !plan) return;
    const now = sink.now, gap = Math.max(now - this.lastAudio, this.timer.now - this.lastWall); this.lastAudio = now; this.lastWall = this.timer.now;
    try {
      if (!sink.running) throw Error('Audio context suspended; press Play to restart');
      if (gap > .1) throw Error(`Scheduler stalled for${(gap * 1000).toFixed(1)}ms; no catch-up burst`);
      let work = 0;
      while (this.cursor < plan.events.length) {
        const event = plan.events[this.cursor]; if (!event) break;
        const at = this.origin + event.seconds; if (at > now + .1) break;
        if (at < now) throw Error('An event became late; press Play to restart');
        if (++work > 20000) throw Error('Scheduling work bound exceeded');
        // At a seek boundary, an off for an already ended note needs no voice.
        if(event.kind==='on'||this.scheduled.has(event.voiceId)){
          sink.schedule(event,at);if(event.kind==='on')this.scheduled.add(event.voiceId);else this.scheduled.delete(event.voiceId);
          if (this.measurements.length < 1000) this.measurements.push({ leadSeconds: at - now, wallGap: gap });
        }
        this.cursor++;
      }
      if (now >= this.origin + plan.durationSeconds + .02) this.finish(plan.durationSeconds);
    } catch (error) { this.stop(); this.diagnostic = `Playback stopped: ${messageOf(error)}`; this.publish(); }
  }
  async settled(): Promise<void> { await Promise.all([...this.closing]); }
  dispose(): void { if (this.state === 'disposed') return; this.state = 'disposed'; this.stop(); this.listeners.clear(); }
}
