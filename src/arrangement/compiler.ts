import type { Composition, Motif } from '../domain/entities';
import { validateEntity } from '../domain/validation';
import { compileSequence, type MusicalTrack } from '../music/compiler';
import { hasTimingMap, summarizeSource } from './sources';
import { sourcePeriod, clipExtent } from './timing';
import { allocateChannels } from './routing';
import { collision } from './collisions';
import { ARRANGEMENT_LIMITS as LIMIT, lexical, type ArrangementNote, type CapturedSource, type CompilationResult, type CompileDiagnostic, type RoutedLane } from './compiled';

/** Domain-only input contract: no controllers/programs/per-note extensions are silently discarded. */
export function unsupportedSource(motif: Motif): string | undefined {
  if (hasTimingMap(motif)) return 'Timing maps are unsupported; no flattening is offered.';
  if (Object.keys(motif.data.meter).some(k => !['numerator','denominator'].includes(k))) return 'Unknown meter semantics are preserved but cannot be compiled.';
  const keys = new Set(['schemaVersion', 'ppq', 'lengthTicks', 'tempoMicrosecondsPerQuarter', 'meter', 'notes', 'importSourceChannel', 'midiImport', 'archived']);
  const unknown = Object.keys(motif.data).filter(k => !keys.has(k));
  const noteKey = motif.data.notes.flatMap(note => Object.keys(note).filter(k => !['id','pitch','startTick','durationTicks','velocity'].includes(k)))[0];
  if (unknown.length || noteKey) return `Unsupported musical/channel state (${unknown[0] ?? 'note.' + noteKey}). Inspect the source; unknown event fields cannot be assumed harmless.`;
  return undefined;
}
/** Bounded, deterministic symbolic compilation using the reviewed shared MusicalEvent model. */
export function compileArrangement(input: Composition, captured: readonly CapturedSource[], inputRevision: string): CompilationResult {
  const diagnostics: CompileDiagnostic[] = [];
  const fail = (code: string, message: string): CompilationResult => ({ ok: false, diagnostics: [...diagnostics, { code, severity: 'error', message }] });
  try {
    const entity = validateEntity(input);
    if (entity.kind !== 'composition') return fail('invalid-composition', 'Choose a composition.');
    const composition = entity, data = composition.data;
    if (!/^[0-9a-f]{64}$/.test(inputRevision)) return fail('invalid-fingerprint', 'Compilation requires a verified SHA256 input identity.');
    if (data.lengthTicks > LIMIT.ticks || data.lengthTicks > 960 * 4096) return fail('tick-limit', 'Arrangement exceeds the supported editor/tick bound.');
    if (['tempoMap','tempos','tempoChanges','meterChanges','timeSignatures'].some(k => data[k] !== undefined) || composition.extra.mnemobard_tempo_map !== undefined || composition.extra.mnemobard_meter_map !== undefined) return fail('unsupported-composition', 'Composition timing maps are protected.');
    const stateFields = ['program','programChange','programChanges','controllers','controlChanges','pitchBend','pitchBends','sustain','bank','bankMSB','bankLSB','channelState','events','automation'];
    const stateful = (value: object): boolean => stateFields.some(k => Object.prototype.hasOwnProperty.call(value,k));
    if (Object.keys(data.meter).some(k => !['numerator','denominator'].includes(k)) || stateful(data) || data.lanes.some(l => stateful(l) || l.clips.some(stateful))) return fail('unsupported-routing-state', 'Unknown channel-wide state or meter semantics are preserved in the composition but cannot be assumed safe for note-only routing/export. Inspect the original metadata; no data was changed.');
    if (captured.length > LIMIT.sources) return fail('source-limit', `At most${LIMIT.sources} saved sources can be compiled.`);
    const sources = new Map<string, CapturedSource>(); let bytes = 0;
    for (const source of [...captured].sort((a,b) => lexical(a.motif.id, b.motif.id))) {
      const checked = validateEntity(source.motif);
      if (checked.kind !== 'motif') return fail('wrong-source-kind', 'A captured source is not a motif.');
      const id = checked.id.toLowerCase();
      if (sources.has(id)) return fail('duplicate-source', 'Captured source UUIDs are ambiguous.');
      if (!/^[0-9a-f]{64}$/.test(source.revision)) return fail('invalid-source-revision', 'A saved source revision is invalid.');
      if (!Number.isSafeInteger(source.textBytes) || source.textBytes < 0 || source.textBytes > LIMIT.sourceBytes) return fail('source-size', 'A captured source exceeds8MiB.');
      bytes += source.textBytes; if (bytes > LIMIT.captureBytes) return fail('capture-limit', 'Saved source text exceeds16MiB.');
      if (checked.extra.mnemobard_archived === true || checked.data.archived === true) return fail('archived-source', `${checked.title} is archived.`);
      const unsupported = unsupportedSource(checked); if (unsupported) return fail('unsupported-source', `${checked.title}: ${unsupported}`);
      sources.set(id, { ...source, motif: checked });
    }
    let expanded = 0;
    for (const lane of data.lanes) for (const clip of lane.clips) {
      const source = sources.get(clip.motifId.toLowerCase());
      if (!source) { diagnostics.push({ code: 'missing-source', severity: 'error', message: `${lane.name}: saved source unavailable. Restore/relink it before compiling.`, laneId: lane.id, laneName: lane.name, clipId: clip.id, motifId: clip.motifId }); continue; }
      if (clip.sourceRevision !== source.revision) { diagnostics.push({ code: clip.sourceRevision ? 'source-changed' : 'source-unreviewed', severity: 'error', message: `${source.motif.title}: review and acknowledge this exact saved revision for the clip before compiling/exporting.`, laneId: lane.id, laneName: lane.name, clipId: clip.id, motifId: clip.motifId }); continue; }
      try {
        const period = sourcePeriod(summarizeSource(source.motif, source.revision, clip.sourcePath ?? ''), data.ppq), extent = clipExtent(clip.startTick, period, clip.repeatCount);
        if (extent.endTick > data.lengthTicks) throw Error('Full-length clip/repetitions exceed the composition endpoint.');
      } catch (error) { diagnostics.push({ code: 'inexact-timing', severity: 'error', message: `${source.motif.title}: ${error instanceof Error ? error.message : String(error)}`, laneId: lane.id, laneName: lane.name, clipId: clip.id, motifId: clip.motifId }); }
      expanded += source.motif.data.notes.length * clip.repeatCount;
      if (!Number.isSafeInteger(expanded) || expanded > LIMIT.notes) return fail('event-limit', `Expansion exceeds${LIMIT.notes} notes/${LIMIT.events} note events. Reduce repetitions or split the arrangement; no partial output was generated.`);
    }
    if (diagnostics.some(d => d.severity === 'error')) return { ok: false, diagnostics };
    const estimate = expanded * 1536 + bytes * 2 + JSON.stringify(composition).length * 4;
    if (estimate > LIMIT.workingBytes) return fail('memory-limit', 'Estimated compilation working budget exceeds64MiB. Split the arrangement.');
    const lanes: RoutedLane[] = [];
    for (const [order, lane] of data.lanes.entries()) {
      const notes: ArrangementNote[] = [], contexts = new Set<string>();
      for (const [clipIndex, clip] of [...lane.clips].sort((a,b) => lexical(a.id,b.id)).entries()) {
        const source = sources.get(clip.motifId.toLowerCase()); if (!source) throw Error('Verified source disappeared from immutable capture.');
        const motif = source.motif, period = sourcePeriod(summarizeSource(motif, source.revision, ''), data.ppq);
        contexts.add((lane.patchId ?? motif.patchId ?? 'unassigned').toLowerCase());
        if (motif.data.tempoMicrosecondsPerQuarter !== data.tempoMicrosecondsPerQuarter || motif.data.meter.numerator !== data.meter.numerator || motif.data.meter.denominator !== data.meter.denominator) diagnostics.push({ code: 'source-timing-context', severity: 'info', message: `${motif.title}: composition tempo/meter interpret exact ticks; source tempo/meter are not time-stretch commands.`, laneId: lane.id, clipId: clip.id, motifId: motif.id });
        const ordered = [...motif.data.notes].sort((a,b) => lexical(a.id,b.id));
        for (let repetition = 0; repetition < clip.repeatCount; repetition++) for (const [index, note] of ordered.entries()) {
          const convert = (tick: number): number => { const value = BigInt(tick) * BigInt(data.ppq), divisor = BigInt(motif.data.ppq); if (value % divisor) throw Error('Inexact endpoint; no rounding.'); return Number(value / divisor); };
          const offset = clip.startTick + repetition * period, startTick = offset + convert(note.startTick), endTick = offset + convert(note.startTick + note.durationTicks);
          notes.push({ id: `${clipIndex}.${repetition}.${index}`, pitch: note.pitch, startTick, durationTicks: endTick - startTick, velocity: note.velocity, provenance: Object.freeze({ laneId: lane.id, laneName: lane.name, clipId: clip.id, motifId: motif.id, noteId: note.id, repetition, sourceRevision: source.revision, startTick, endTick }) });
        }
      }
      const intra = collision(notes, [], lane.midiChannel ?? 0);
      if (intra) diagnostics.push({ ...intra, ...(lane.midiChannel === undefined ? { channel: undefined, message: `${lane.name}: overlapping same-pitch notes between clips/repetitions. Move clips or use another lane; no notes were altered.` } : {}) });
      lanes.push({ id: lane.id, name: lane.name, order, channel: lane.midiChannel, explicit: lane.midiChannel !== undefined, percussion: lane.percussion === true, stateKey: contexts.size <= 1 ? [...contexts][0] ?? 'unassigned' : 'mixed-context:' + lane.id, notes });
    }
    if (diagnostics.some(d => d.severity === 'error')) return { ok: false, diagnostics };
    const routing = allocateChannels(lanes); diagnostics.push(...routing.diagnostics);
    if (diagnostics.some(d => d.severity === 'error')) return { ok: false, diagnostics };
    const byChannel = new Map<number, ArrangementNote[]>();
    for (const lane of routing.lanes) if (lane.channel !== undefined) { const notes = byChannel.get(lane.channel) ?? []; notes.push(...lane.notes); byChannel.set(lane.channel, notes); }
    for (const [channel, notes] of byChannel) { const issue = collision(notes, [], channel, true); if (issue) diagnostics.push(issue); }
    if (diagnostics.some(d => d.severity === 'error')) return { ok: false, diagnostics };
    const tracks: MusicalTrack[] = routing.lanes.filter(l => l.notes.length && l.channel !== undefined).map(lane => ({ id: lane.id, channel: lane.channel ?? 0, sourcePpq: data.ppq, notes: lane.notes, provenance: new Map(lane.notes.map(n => [n.id,n.provenance])) }));
    const plan = compileSequence({ ppq: data.ppq, lengthTicks: data.lengthTicks, tempos: [{ tick: 0, microsecondsPerQuarter: data.tempoMicrosecondsPerQuarter }], tracks },128,{tracks:32,notesPerTrack:LIMIT.notes,totalNotes:LIMIT.notes});
    const events = plan.events.map(event => { if (event.tick.d !== 1n || !event.provenance) throw Error('Compiled event lacks exact ticks/provenance.'); return Object.freeze({ ...event, absoluteTick: Number(event.tick.n), provenance: event.provenance }); });
    diagnostics.push({ code: 'note-only', severity: 'info', message: 'Note-only MIDI/sine preview: PATCHBOOK sound, audio references, sections/markers and narrative metadata are not rendered or exported. Original records are unchanged.' });
    return { ok: true, arrangement: Object.freeze({ ...plan, events: Object.freeze(events), compositionId: composition.id, title: composition.title, inputRevision, ppq: data.ppq, lengthTicks: data.lengthTicks, tempo: data.tempoMicrosecondsPerQuarter, meter: Object.freeze({...data.meter}), lanes: routing.lanes, sources: [...sources.values()].map(s => ({ id:s.motif.id, revision:s.revision, ppq:s.motif.data.ppq, lengthTicks:s.motif.data.lengthTicks })).sort((a,b)=>lexical(a.id,b.id)), diagnostics, expandedNotes: expanded }) };
  } catch (error) { return fail('invalid-input', error instanceof Error ? error.message : String(error)); }
}
