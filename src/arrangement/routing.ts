import type { RoutedLane, CompileDiagnostic } from './compiled';
import { lexical } from './compiled';
import { collision } from './collisions';
/** Stored explicit channels remain unique; derived Auto channels can share verified note-only state. */
export function allocateChannels(input: readonly RoutedLane[]): { lanes: readonly RoutedLane[]; diagnostics: CompileDiagnostic[] } {
  const assigned = new Map<string, RoutedLane>(), channels = new Map<number, RoutedLane[]>(), diagnostics: CompileDiagnostic[] = [];
  for (const lane of input.filter(l => l.explicit).sort((a, b) => lexical(a.id, b.id))) {
    const channel = lane.channel;
    if (channel === undefined || !Number.isInteger(channel) || channel < 0 || channel > 15 || ((channel === 9) !== lane.percussion)) { diagnostics.push({ code: 'invalid-routing', severity: 'error', laneId: lane.id, laneName: lane.name, message: `${lane.name}: choose a valid explicit channel; channel10 requires percussion.` }); continue; }
    if (channels.has(channel)) { diagnostics.push({ code: 'duplicate-explicit-channel', severity: 'error', laneId: lane.id, laneName: lane.name, channel, message: `${lane.name}: channel ${channel + 1} already has an explicit assignment. Schema1 keeps explicit channels unique; select Auto for verified sharing.` }); continue; }
    channels.set(channel, [lane]); assigned.set(lane.id, lane);
  }
  const melodic = Array.from({ length: 16 }, (_, i) => i).filter(c => c !== 9);
  for (const lane of input.filter(l => !l.explicit).sort((a, b) => lexical(a.id, b.id))) {
    if (!lane.notes.length) { assigned.set(lane.id, lane); continue; }
    const channel = melodic.find(c => !channels.has(c)) ?? melodic.find(c => {
      const others = channels.get(c) ?? [];
      return others.every(other => other.stateKey === lane.stateKey) && !collision(others.flatMap(l => l.notes), lane.notes, c, true);
    });
    if (channel === undefined) { diagnostics.push({ code: 'channel-exhausted', severity: 'error', laneId: lane.id, laneName: lane.name, message: `${lane.name}: no safe melodic channel remains. Sharing requires identical patch context and nonoverlapping same-pitch lifetimes. Use fewer concurrent contexts/notes or rearrange clips; explicit channels were not remapped.` }); continue; }
    const next = { ...lane, channel }; const group = channels.get(channel) ?? []; group.push(next); channels.set(channel, group); assigned.set(lane.id, next);
  }
  return { lanes: input.map(l => assigned.get(l.id) ?? l), diagnostics };
}
