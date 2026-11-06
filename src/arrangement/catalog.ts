import type { EntityIndex } from '../storage/index';
import { hasTimingMap, summarizeSource, type SourceState } from './sources';
/** Saved index only. Immutable summaries never contain note arrays or editor drafts. */
export class SourceCatalog {
    private states = new Map<string, SourceState>();
    private revision = -1;
    constructor(private readonly index: EntityIndex) { }
    refresh(): void {
        if (this.revision === this.index.currentRevision)
            return;
        this.revision = this.index.currentRevision;
        const old = this.states, next = new Map<string, SourceState>(), byId = new Map<string, ReturnType<EntityIndex['heads']>>();
        for (const head of this.index.heads())
            if (head.id) {
                const rows = byId.get(head.id) ?? [];
                rows.push(head);
                byId.set(head.id, rows);
            }
        for (const [id, rows] of byId) {
            if (rows.length > 1) {
                next.set(id, Object.freeze({ status: 'duplicate', paths: Object.freeze(rows.map(r => r.path)) }));
                continue;
            }
            const head = rows[0];
            if (!head)
                continue;
            if (head.errorCode) {
                next.set(id, Object.freeze({ status: head.errorCode === 'unsupported-schema' ? 'unsupported' : 'malformed', paths: [head.path], message: head.message }));
                continue;
            }
            if (head.kind !== 'motif') {
                next.set(id, { status: 'wrong-kind', paths: [head.path] });
                continue;
            }
            const previous = old.get(id);
            if (previous?.status === 'ready' && previous.source.revision === head.revision && previous.source.path === head.path) {
                next.set(id, previous);
                continue;
            }
            const resolved = this.index.resolve(id);
            if (resolved.status !== 'ready' || resolved.entity.kind !== 'motif' || !head.revision) {
                next.set(id, { status: 'malformed', paths: [head.path], message: 'Source revision unavailable; wait for indexing.' });
                continue;
            }
            if (hasTimingMap(resolved.entity)) {
                next.set(id, { status: 'unsupported', paths: [head.path], message: 'Timing-map metadata cannot be flattened.' });
                continue;
            }
            if (resolved.entity.extra.mnemobard_archived === true || resolved.entity.data.archived === true) {
                next.set(id, { status: 'archived', paths: [head.path] });
                continue;
            }
            next.set(id, Object.freeze({ status: 'ready', source: summarizeSource(resolved.entity, head.revision, head.path) }));
        }
        this.states = next;
    }
    get(id: string): SourceState { this.refresh(); return this.states.get(id.toLowerCase()) ?? { status: 'missing', paths: [] }; }
    items(search = ''): SourceState[] { this.refresh(); const query = search.toLocaleLowerCase(); return [...this.states.values()].filter((s): s is Extract<SourceState, {
        status: 'ready';
    }> => s.status === 'ready' && s.source.title.toLocaleLowerCase().includes(query)).sort((a, b) => a.source.title.localeCompare(b.source.title) || a.source.id.localeCompare(b.source.id)); }
}
