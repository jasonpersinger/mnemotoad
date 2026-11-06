import type { CompiledArrangement } from './compiled';
import { serializeTypeOne } from '../midi/serialize';
/** Lane order is authored order; channel sharing never creates another MIDI port. */
export function exportArrangement(arrangement: CompiledArrangement): Uint8Array {
  return serializeTypeOne(arrangement.ppq,arrangement.tempo,arrangement.meter,arrangement.lengthTicks,arrangement.lanes.filter(l=>l.notes.length).map(lane=>({name:`${lane.id} · ${lane.name}`,events:arrangement.events.filter(e=>e.trackId===lane.id)})));
}
