import type { Entity } from '../domain/entities';
import { DocumentSession, type DocumentSessionPort } from './document-session';
import { FoundationError } from '../domain/errors';
import type { EntityRecord } from '../storage/repository';
import { jsonEqual } from './json-equal';
import { isDeeplyFrozen } from './freeze';
interface Edit<T> {
    before: T;
    after: T;
    label: string;
    group?: string;
    time: number;
    bytes: number;
    /** 4H: serialised length of `before`, so a grouped edit re-estimates `bytes` without serialising it again. */
    beforeLength: number;
}
/**
 * One bounded undo history per UUID; pointer previews do not call edit().
 * 4H ownership: the draft and every history snapshot are deeply frozen values (see DocumentSession.adopt). An edit gives
 * the transform a private copy, validates the result, and then installs that validated value directly; undo/redo
 * reinstall the frozen snapshots. Snapshots are shared between history and the draft, never copied and never mutated.
 */
export class HistorySession<T extends Entity> extends DocumentSession<T> {
    private past: Edit<T>[] = [];
    private future: Edit<T>[] = [];
    /** 4H: JSON text of the current draft (computed by edit for the value it installs), keyed by identity. */
    private text?: { value: Readonly<T>; json: string };
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
        // 4H: same key-order-insensitive JSON comparison as before, without serialising either document (json-equal.ts).
        const dirty = !this.base || !jsonEqual(this.peek(), this.base.entity);
        this.dirtyCache = { revision: this.revisionNumber, source: this.base?.source, dirty };
        return dirty;
    }
    private json(value: Readonly<T>): string {
        if (this.text?.value !== value) this.text = { value, json: JSON.stringify(value) };
        return this.text.json;
    }
    edit(label: string, transform: (entity: T) => T, group?: string): void {
        if (this.disposed)
            throw new FoundationError('disposed', 'Editing session is closed.');
        // `before` is the frozen draft itself; the transform works on its own copy and the result is fully validated.
        // Validators return a fresh deep copy (editableComposition → validateEntity) or, for MOTIF, a command result that
        // editableMotif validated and froze (sessionMotif). Any other object returned as is might still be held and
        // mutated by a caller, so it is copied: what the session installs is never writable by anyone.
        const before = this.peek() as T, candidate = transform(structuredClone(before));
        let after = this.validate(candidate);
        if (after === candidate && !isDeeplyFrozen(after)) after = structuredClone(after);
        if (before.id !== after.id)
            throw new FoundationError('invalid', 'Entity identity cannot change.');
        const beforeText = this.json(before), afterText = JSON.stringify(after);
        if (beforeText === afterText)
            return;
        const now = performance.now(), latest = this.past.at(-1);
        if (group && latest?.group === group && now - latest.time < 750 && !this.future.length) {
            latest.after = after;
            latest.time = now;
            latest.bytes = (latest.beforeLength + afterText.length) * 2;
        }
        else
            this.past.push({ before, after, label, group, time: now, bytes: (beforeText.length + afterText.length) * 2, beforeLength: beforeText.length });
        this.future = [];
        while (this.past.length > 100 || (this.past.length > 1 && this.past.reduce((sum, edit) => sum + edit.bytes, 0) > 16 * 1024 * 1024))
            this.past.shift();
        // `after` is the validator's fresh copy, owned only by this session: install it without another copy.
        this.text = { value: after, json: afterText };
        this.adopt(after);
        this.changed();
    }
    override async save(): Promise<EntityRecord> { const last = this.past.at(-1); if (last)
        last.group = undefined; return super.save(); }
    undo(): void { if (this.disposed)
        throw new FoundationError('disposed', 'Editing session is closed.'); const entry = this.past.pop(); if (!entry)
        return; this.future.push(entry); this.adopt(entry.before); this.changed(); }
    redo(): void { if (this.disposed)
        throw new FoundationError('disposed', 'Editing session is closed.'); const entry = this.future.pop(); if (!entry)
        return; this.past.push(entry); this.adopt(entry.after); this.changed(); }
    override dispose(): void { this.past = []; this.future = []; this.dirtyCache = undefined; this.text = undefined; super.dispose(); }
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
