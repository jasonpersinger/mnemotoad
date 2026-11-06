import type { Entity, Motif } from '../../domain/entities';
import { DocumentSession, type DocumentSessionPort } from '../../application/document-session';
import { FoundationError } from '../../domain/errors';
import type { EntityRecord } from '../../storage/repository';
import { editableMotif } from './commands';
interface Edit { before: Motif; after: Motif; label: string; group?: string; time: number; bytes: number }
const isMotif = (entity: Entity): entity is Motif => entity.kind === 'motif';
/** One bounded undo history per UUID; pointer previews do not call edit(). */
export class MotifSession extends DocumentSession<Motif> {
  private past: Edit[] = [];
  private future: Edit[] = [];
  private dirtyCache?: { revision: number; source: string | undefined; dirty: boolean };
  private selection = new Set<string>();
  get selected(): ReadonlySet<string> { return new Set(this.selection); }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get historySize(): number { return this.past.length; }
  constructor(draft: Motif, base: EntityRecord | undefined, port: DocumentSessionPort<Motif>, checkpointDelay = 500) { super(editableMotif(draft), base, port, checkpointDelay, isMotif); }
  override get dirty(): boolean {
    if (this.dirtyCache?.revision === this.revisionNumber && this.dirtyCache.source === this.base?.source) return this.dirtyCache.dirty;
    const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
    const dirty = !this.base || canonical(this.draft) !== canonical(this.base.entity);
    this.dirtyCache = { revision: this.revisionNumber, source: this.base?.source, dirty }; return dirty;
  }
  select(ids: Iterable<string>): void { const known = new Set(this.draft.data.notes.map(note => note.id)); this.selection = new Set([...ids].filter(id => known.has(id))); }
  edit(label: string, transform: (motif: Motif) => Motif, group?: string): void {
    if (this.disposed) throw new FoundationError('disposed', 'Motif session is closed.');
    const before = this.draft, after = editableMotif(transform(structuredClone(before)));
    if (before.id !== after.id) throw new FoundationError('invalid', 'Motif identity cannot change.');
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const now = performance.now(), latest = this.past.at(-1);
    if (group && latest?.group === group && now - latest.time < 750 && !this.future.length) {
      latest.after = after; latest.time = now; latest.bytes = (JSON.stringify(latest.before).length + JSON.stringify(after).length) * 2;
    } else this.past.push({ before, after, label, group, time: now, bytes: (JSON.stringify(before).length + JSON.stringify(after).length) * 2 });
    this.future = [];
    while (this.past.length > 100 || (this.past.length > 1 && this.past.reduce((sum, edit) => sum + edit.bytes, 0) > 16 * 1024 * 1024)) this.past.shift();
    super.update(after); this.select(this.selection);
  }
  override async save(): Promise<EntityRecord> { const last = this.past.at(-1); if (last) last.group = undefined; return super.save(); }
  undo(): void { if (this.disposed) throw new FoundationError('disposed', 'Motif session is closed.'); const entry = this.past.pop(); if (!entry) return; this.future.push(entry); super.update(entry.before); this.select(this.selection); }
  redo(): void { if (this.disposed) throw new FoundationError('disposed', 'Motif session is closed.'); const entry = this.future.pop(); if (!entry) return; this.past.push(entry); super.update(entry.after); this.select(this.selection); }
  override dispose(): void { this.past = []; this.future = []; this.selection.clear(); this.dirtyCache = undefined; super.dispose(); }
  override reload(record: EntityRecord): void {
    const changed = record.source !== this.base?.source; super.reload(record);
    if (changed) { this.past = []; this.future = []; this.select([]); }
  }
}
