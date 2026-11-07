import type { EntityIndex } from './index';
import type { Entity } from '../domain/entities';

/**
 * Milestone 4F shared reference classification (PATCHBOOK, MOTIF, CANVAS).
 * Read-only: scalar index heads only — no entity cloning, no I/O, never writes, never substitutes a similarly named record.
 * Musical source state (changed revision, unsaved draft) stays with CANVAS's SourceCatalog/plan, which owns those rules.
 */
export type ReferenceStatus = 'ready' | 'archived' | 'missing' | 'ambiguous' | 'malformed' | 'unsupported' | 'wrong-kind';
export interface ReferenceView { id: string; expected: Entity['kind']; status: ReferenceStatus; title?: string; path?: string; kind?: Entity['kind']; paths?: string[]; message: string }
const NOUN: Record<Entity['kind'], string> = { instrument: 'instrument', patch: 'patch', 'effects-chain': 'effects chain', motif: 'motif', composition: 'composition' };

/** Build once per render; `describe` is then O(1) per reference. */
export class ReferenceLookup {
  private readonly byId = new Map<string, ReturnType<EntityIndex['heads']>>();
  constructor(index: EntityIndex) { for (const head of index.heads()) if (head.id) { const rows = this.byId.get(head.id) ?? []; rows.push(head); this.byId.set(head.id, rows); } }
  describe(id: string, expected: Entity['kind']): ReferenceView {
    const rows = this.byId.get(id.toLowerCase()) ?? [], noun = NOUN[expected];
    if (!rows.length) return { id, expected, status: 'missing', message: `Missing ${noun}: no note has this ID. The reference is kept; restore the note or choose another ${noun}.` };
    if (rows.length > 1) { const paths = rows.map(r => r.path).sort(); return { id, expected, status: 'ambiguous', paths, message: `Ambiguous: ${paths.length} notes share this ${noun} ID. Resolve the duplicate; nothing is guessed.` }; }
    const head = rows[0]; if (!head) return { id, expected, status: 'missing', message: `Missing ${noun}.` };
    if (head.errorCode === 'unsupported-schema') return { id, expected, status: 'unsupported', path: head.path, message: `Unsupported schema in ${head.path}: read-only, never rewritten.` };
    if (head.errorCode) return { id, expected, status: 'malformed', path: head.path, message: `${head.path}: ${head.message ?? 'cannot be read.'}` };
    if (head.kind !== expected) return { id, expected, status: 'wrong-kind', path: head.path, title: head.title, ...(head.kind ? { kind: head.kind } : {}), message: `Points to a ${head.kind ? NOUN[head.kind] : 'record'}, not a ${noun}. The reference is kept.` };
    if (head.archived) return { id, expected, status: 'archived', path: head.path, title: head.title, kind: head.kind, message: `Archived ${noun}: still linked. Restore it or choose another.` };
    return { id, expected, status: 'ready', path: head.path, title: head.title, kind: head.kind, message: '' };
  }
}
