import type { Clip, Composition, Lane } from '../../domain/entities';
import { validateEntity } from '../../domain/validation';
import type { SourceSummary } from '../../arrangement/sources';
import type { ReviewToken } from '../../arrangement/source-review';
import { sourcePeriod, clipExtent } from '../../arrangement/timing';
export function editableComposition(value: Composition): Composition {
    const entity = validateEntity({ ...value, title: value.title || 'Untitled composition' });
    if (entity.kind !== 'composition')
        throw Error('Choose a composition.');
    if (entity.data.lengthTicks > 960 * 4096)
        throw Error('CANVAS supports at most4096 quarter notes; the larger original remains available in Markdown.');
    if (['tempoMap', 'tempos', 'tempoChanges', 'meterChanges', 'timeSignatures'].some(key => entity.data[key] !== undefined) || entity.extra.mnemobard_tempo_map !== undefined || entity.extra.mnemobard_meter_map !== undefined)
        throw Error('Timing-map composition is protected; map editing is unsupported.');
    entity.title = value.title;
    return entity;
}
export function findClip(composition: Composition, id: string): {
    lane: Lane;
    clip: Clip;
} { for (const lane of composition.data.lanes) {
    const clip = lane.clips.find(c => c.id === id);
    if (clip)
        return { lane, clip };
} throw Error('Selected clip is unavailable.'); }
const laneAt = (c: Composition, id: string): Lane => { const lane = c.data.lanes.find(l => l.id === id); if (!lane)
    throw Error('Choose an existing lane.'); return lane; };
export function addLane(c: Composition, name: string): Composition { return editableComposition({ ...c, data: { ...c.data, lanes: [...c.data.lanes, { id: crypto.randomUUID(), name, clips: [] }] } }); }
export function renameLane(c: Composition, id: string, name: string): Composition { laneAt(c, id); return editableComposition({ ...c, data: { ...c.data, lanes: c.data.lanes.map(l => l.id === id ? { ...l, name } : l) } }); }
export function reorderLane(c: Composition, id: string, delta: number): Composition { const lanes = [...c.data.lanes], from = lanes.findIndex(l => l.id === id), to = from + delta; if (!Number.isInteger(delta) || Math.abs(delta) !== 1 || from < 0 || to < 0 || to >= lanes.length)
    throw Error('Lane cannot move beyond the first/last position.'); const [lane] = lanes.splice(from, 1); if (lane)
    lanes.splice(to, 0, lane); return editableComposition({ ...c, data: { ...c.data, lanes } }); }
export function deleteLane(c: Composition, id: string, confirmed: boolean): Composition { const lane = laneAt(c, id); if (lane.clips.length && !confirmed)
    throw Error('Confirm deletion of this lane and all its clips. Undo remains available.'); return editableComposition({ ...c, data: { ...c.data, lanes: c.data.lanes.filter(l => l.id !== id) } }); }
export function checkedPlacement(c: Composition, source: SourceSummary, startTick: number, repeatCount: number): number { const period = sourcePeriod(source, c.data.ppq), extent = clipExtent(startTick, period, repeatCount); if (extent.endTick > c.data.lengthTicks)
    throw Error('Clip exceeds composition length. Extend length explicitly before placement.'); return period; }
export function reviewFields(source: SourceSummary, period: number): Pick<Clip, 'sourceRevision' | 'sourcePath' | 'sourceTitle' | 'reviewedLengthTicks'> { return { sourceRevision: source.revision, sourcePath: source.path, sourceTitle: source.title, reviewedLengthTicks: period }; }
export function placeClip(c: Composition, laneId: string, source: SourceSummary, startTick: number, repeatCount: number): Composition {
    laneAt(c, laneId);
    const period = checkedPlacement(c, source, startTick, repeatCount), clip: Clip = { id: crypto.randomUUID(), laneId, motifId: source.id, startTick, repeatCount, ...reviewFields(source, period) };
    return editableComposition({ ...c, data: { ...c.data, lanes: c.data.lanes.map(l => l.id === laneId ? { ...l, clips: [...l.clips, clip] } : l) } });
}
export function editClip(c: Composition, id: string, laneId: string, startTick: number, repeatCount: number, label: string | undefined, source: SourceSummary): Composition {
    const current = findClip(c, id);
    laneAt(c, laneId);
    checkedPlacement(c, source, startTick, repeatCount);
    const next = { ...current.clip, laneId, startTick, repeatCount };
    if (label?.trim())
        next.label = label;
    else
        delete next.label;
    return editableComposition({ ...c, data: { ...c.data, lanes: c.data.lanes.map(l => ({ ...l, clips: [...l.clips.filter(clip => clip.id !== id), ...(l.id === laneId ? [next] : [])] })) } });
}
export function duplicateClip(c: Composition, id: string, source: SourceSummary): Composition { const { lane, clip } = findClip(c, id), period = sourcePeriod(source, c.data.ppq), startTick = clipExtent(clip.startTick, period, clip.repeatCount).endTick; checkedPlacement(c, source, startTick, clip.repeatCount); const next = { ...clip, id: crypto.randomUUID(), laneId: lane.id, startTick }; return editableComposition({ ...c, data: { ...c.data, lanes: c.data.lanes.map(l => l.id === lane.id ? { ...l, clips: [...l.clips, next] } : l) } }); }
export function deleteClip(c: Composition, id: string): Composition { findClip(c, id); return editableComposition({ ...c, data: { ...c.data, lanes: c.data.lanes.map(l => ({ ...l, clips: l.clips.filter(clip => clip.id !== id) })) } }); }
export function acknowledgeSource(c: Composition, id: string, source: SourceSummary): Composition { const { lane, clip } = findClip(c, id), period = checkedPlacement(c, source, clip.startTick, clip.repeatCount); return editableComposition({ ...c, data: { ...c.data, lanes: c.data.lanes.map(l => l.id === lane.id ? { ...l, clips: l.clips.map(item => item.id === id ? { ...item, ...reviewFields(source, period) } : item) } : l) } }); }
/**
 * 4G batch review: records `source`'s current saved revision on every clip in `token` — and only those — as ONE composition
 * edit (one undo step). The clips that are currently out of date for this motif must be exactly the reviewed ones (same ids,
 * lanes, positions, repetitions and previous revisions); otherwise the review is stale and nothing changes. Each placement is
 * re-checked with the same rules as single-clip acknowledgement. Sources, notes, positions, repetitions, lanes and routing
 * are never modified.
 */
export function acknowledgeSourceClips(c: Composition, token: ReviewToken, source: SourceSummary): Composition {
    const id = token.motifId.toLowerCase();
    if (source.id.toLowerCase() !== id || source.revision !== token.revision)
        throw Error('The saved motif changed since this review was prepared. Nothing was acknowledged; review the new revision.');
    const current = c.data.lanes.flatMap(lane => lane.clips.filter(clip => clip.motifId.toLowerCase() === id && clip.sourceRevision !== source.revision).map(clip => ({ lane, clip })));
    const reviewed = new Map(token.clips.map(t => [t.id, t]));
    const same = current.length === reviewed.size && current.every(({ lane, clip }) => { const t = reviewed.get(clip.id); return !!t && t.laneId === lane.id && t.startTick === clip.startTick && t.repeatCount === clip.repeatCount && t.previousRevision === clip.sourceRevision; });
    if (!same)
        throw Error('The composition changed while this review was open (a placement of this motif was added, removed, moved, retargeted or acknowledged). Nothing was acknowledged; review again.');
    const fields = new Map(current.map(({ clip }) => [clip.id, reviewFields(source, checkedPlacement(c, source, clip.startTick, clip.repeatCount))]));
    return editableComposition({ ...c, data: { ...c.data, lanes: c.data.lanes.map(l => ({ ...l, clips: l.clips.map(clip => { const update = fields.get(clip.id); return update ? { ...clip, ...update } : clip; }) })) } });
}
/** Existing schema preferences only; duplicate explicit channels remain protected. */
export function setLaneRouting(c:Composition,id:string,channel:number|undefined,percussion:boolean):Composition{
  const lane=laneAt(c,id);
  if(channel!==undefined&&(!Number.isInteger(channel)||channel<0||channel>15))throw Error('Choose Auto or a channel1–16.');
  const other=c.data.lanes.find(l=>l.id!==id&&channel!==undefined&&l.midiChannel===channel);
  if(other)throw Error(`Channel ${Number(channel)+1} is explicitly assigned to ${other.name}. Choose Auto for verified sharing or another explicit channel. Arrangement unchanged.`);
  const next={...lane,percussion};if(channel===undefined)delete next.midiChannel;else next.midiChannel=channel;
  return editableComposition({...c,data:{...c.data,lanes:c.data.lanes.map(l=>l.id===id?next:l)}});
}
