import type { Entity } from '../domain/entities';
import { DocumentSession, type DocumentSessionPort } from './document-session';
import { FoundationError } from '../domain/errors';
import type { EntityRecord } from '../storage/repository';
interface Edit<T> {
    before: T;
    after: T;
    label: string;
    group?: string;
    time: number;
    bytes: number;
}
/** One bounded undo history per UUID; pointer previews do not call edit(). */
export class HistorySession<T extends Entity> extends DocumentSession<T> {
    private past: Edit<T>[] = [];
    private future: Edit<T>[] = [];
    private dirtyCache?: {
        revision: number;
        source: string | undefined;
        dirty: boolean;
    };
    get canUndo(): boolean { return this.past.length > 0; }
    get canRedo(): boolean { return this.future.length > 0; }
    get historySize(): number { return this.past.length; }
    constructor(draft: T, base: EntityRecord | undefined, port: DocumentSessionPort<T>, private readonly validate: (value: T) => T, accepts: (entity: Entity) => entity is T, checkpointDelay = 500) { super(validate(draft), base, port, checkpointDelay, accepts); }
    get changeVersion(): number { return this.revisionNumber; }
    protected changed(reset = false): void { void reset; }
    override get dirty(): boolean {
        if (this.dirtyCache?.revision === this.revisionNumber && this.dirtyCache.source === this.base?.source)
            return this.dirtyCache.dirty;
        const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
        const dirty = !this.base || canonical(this.draft) !== canonical(this.base.entity);
        this.dirtyCache = { revision: this.revisionNumber, source: this.base?.source, dirty };
        return dirty;
    }
    edit(label: string, transform: (entity: T) => T, group?: string): void {
        if (this.disposed)
            throw new FoundationError('disposed', 'Editing session is closed.');
        const before = this.draft, after = this.validate(transform(structuredClone(before)));
        if (before.id !== after.id)
            throw new FoundationError('invalid', 'Entity identity cannot change.');
        if (JSON.stringify(before) === JSON.stringify(after))
            return;
        const now = performance.now(), latest = this.past.at(-1);
        if (group && latest?.group === group && now - latest.time < 750 && !this.future.length) {
            latest.after = after;
            latest.time = now;
            latest.bytes = (JSON.stringify(latest.before).length + JSON.stringify(after).length) * 2;
        }
        else
            this.past.push({ before, after, label, group, time: now, bytes: (JSON.stringify(before).length + JSON.stringify(after).length) * 2 });
        this.future = [];
        while (this.past.length > 100 || (this.past.length > 1 && this.past.reduce((sum, edit) => sum + edit.bytes, 0) > 16 * 1024 * 1024))
            this.past.shift();
        super.update(after);
        this.changed();
    }
    override async save(): Promise<EntityRecord> { const last = this.past.at(-1); if (last)
        last.group = undefined; return super.save(); }
    undo(): void { if (this.disposed)
        throw new FoundationError('disposed', 'Editing session is closed.'); const entry = this.past.pop(); if (!entry)
        return; this.future.push(entry); super.update(entry.before); this.changed(); }
    redo(): void { if (this.disposed)
        throw new FoundationError('disposed', 'Editing session is closed.'); const entry = this.future.pop(); if (!entry)
        return; this.past.push(entry); super.update(entry.after); this.changed(); }
    override dispose(): void { this.past = []; this.future = []; this.dirtyCache = undefined; super.dispose(); }
    override reload(record: EntityRecord): void {
        const changed = record.source !== this.base?.source;
        super.reload(record);
        if (changed) {
            this.past = [];
            this.future = [];
            this.changed(true);
        }
    }
}
