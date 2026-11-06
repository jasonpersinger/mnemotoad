import type { Composition, Entity } from '../../domain/entities';
import { HistorySession } from '../../application/history-session';
import type { DocumentSessionPort } from '../../application/document-session';
import type { EntityRecord } from '../../storage/repository';
import { editableComposition } from './commands';
export class CanvasSession extends HistorySession<Composition> {
    selectedLane?: string;
    selectedClip?: string;
    constructor(draft: Composition, base: EntityRecord | undefined, port: DocumentSessionPort<Composition>, delay = 500) { super(draft, base, port, editableComposition, (e: Entity): e is Composition => e.kind === 'composition', delay); }
    protected override changed(reset = false): void { if (reset) {
        this.selectedLane = undefined;
        this.selectedClip = undefined;
    } const draft = this.draft; if (!draft.data.lanes.some(l => l.id === this.selectedLane))
        this.selectedLane = draft.data.lanes[0]?.id; if (!draft.data.lanes.some(l => l.clips.some(c => c.id === this.selectedClip)))
        this.selectedClip = undefined; }
}
