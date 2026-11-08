import type { Entity } from '../domain/entities';
import { DocumentSession, type DocumentSessionPort } from './document-session';
import { FoundationError } from '../domain/errors';
import type { EntityRecord } from '../storage/repository';
import { jsonEqual, sameJson } from './json-equal';
import { isDeeplyFrozen } from './freeze';
import { RetainedSize } from './history-memory';
interface Edit<T> {
    before: T;
    after: T;
    label: string;
    group?: string;
    time: number;
}
/** Established history policy (since 1B): at most 100 undo entries and a 16 MiB budget; one entry is always kept. */
export const HISTORY_LIMITS = Object.freeze({ entries: 100, bytes: 16 * 1024 * 1024 });
/**
 * One bounded undo history per UUID; pointer previews do not call edit().
 * 4H ownership: the draft and every history snapshot are deeply frozen values (see DocumentSession.adopt). An edit gives
 * the transform a private copy, validates the result, and then installs that validated value directly; undo/redo
 * reinstall the frozen snapshots. Snapshots are shared between history and the draft, never copied and never mutated.
 * 4I memory budget: `historyBytes` estimates the memory retained by the undo and redo entries, counting every distinct
 * (frozen) object once however many entries or snapshots reach it (history-memory.ts). Before 4I each entry was costed
 * as 2 × the serialised length of its full before + after documents, which counted every shared snapshot twice and
 * every shared note once per snapshot.
 */
export class HistorySession<T extends Entity> extends DocumentSession<T> {
    private past: Edit<T>[] = [];
    private future: Edit<T>[] = [];
    /** 4I: identity-aware estimate of memory retained by past and future entries. */
    private readonly retained = new RetainedSize();
    /**
     * 4I: when true, transforms receive the frozen draft itself instead of a private copy (writes throw, so a transform
     * that mutates its input fails atomically). Only for sessions whose every transform builds new values (MOTIF).
     */
    protected readonly shareTransformInput: boolean = false;
    private dirtyCache?: {
        revision: number;
        source: string | undefined;
        dirty: boolean;
    };
    get canUndo(): boolean { return this.past.length > 0; }
    get canRedo(): boolean { return this.future.length > 0; }
    get historySize(): number { return this.past.length; }
    /** 4I: redo entries currently available. */
    get redoSize(): number { return this.future.length; }
    /** 4I: estimated bytes retained by undo/redo history (see history-memory.ts; an estimate, not a heap measurement). */
    get historyBytes(): number { return this.retained.bytes; }
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
    edit(label: string, transform: (entity: T) => T, group?: string): void {
        if (this.disposed)
            throw new FoundationError('disposed', 'Editing session is closed.');
        // `before` is the frozen draft itself; the transform works on its own copy and the result is fully validated.
        // Validators return a fresh deep copy (editableComposition → validateEntity) or, for MOTIF, a command result that
        // editableMotif validated and froze (sessionMotif). Any other object returned as is might still be held and
        // mutated by a caller, so it is copied: what the session installs is never writable by anyone.
        const before = this.peek() as T, candidate = transform(this.shareTransformInput ? before : structuredClone(before));
        let after = this.validate(candidate);
        if (after === candidate && !isDeeplyFrozen(after)) after = structuredClone(after);
        if (before.id !== after.id)
            throw new FoundationError('invalid', 'Entity identity cannot change.');
        // No-op: exactly the former JSON.stringify(before) === JSON.stringify(after) test, without the strings.
        if (sameJson(before, after))
            return;
        const now = performance.now(), latest = this.past.at(-1);
        if (group && latest?.group === group && now - latest.time < 750 && !this.future.length) {
            this.retained.release(latest.after);
            latest.after = after;
            latest.time = now;
            this.retained.retain(after);
        }
        else {
            this.past.push({ before, after, label, group, time: now });
            this.retained.retain(before); this.retained.retain(after);
        }
        for (const entry of this.future) { this.retained.release(entry.before); this.retained.release(entry.after); }
        this.future = [];
        // Eviction (unchanged policy): oldest first while over 100 entries, or over the budget with more than one entry.
        while (this.past.length > HISTORY_LIMITS.entries || (this.past.length > 1 && this.retained.bytes > HISTORY_LIMITS.bytes)) {
            const oldest = this.past.shift();
            if (oldest) { this.retained.release(oldest.before); this.retained.release(oldest.after); }
        }
        // History is updated before publishing (subscribers read canUndo/historySize). `after` is the validator's fresh
        // copy or a sealed frozen result, owned only by this session and untouched since validation: adopt() installs it
        // without another copy and freezes it, so the counted history graph only ever holds frozen values.
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
    override dispose(): void { this.past = []; this.future = []; this.retained.clear(); this.dirtyCache = undefined; super.dispose(); }
    override reload(record: EntityRecord): void {
        const changed = record.source !== this.base?.source;
        super.reload(record);
        if (changed) {
            this.past = [];
            this.future = [];
            this.retained.clear();
            this.changed(true);
        }
    }
}
