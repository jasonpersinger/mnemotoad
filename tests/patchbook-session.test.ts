import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntity, type LibraryEntity } from '../src/domain/entities';
import { createEntityDocument } from '../src/storage/document';
import type { EntityRecord } from '../src/storage/repository';
import { LibrarySession, type SessionPort } from '../src/modules/patchbook/session';
import { deferred } from './support/memory-vault';
const sessions: LibrarySession[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const session of sessions.splice(0)) session.dispose(); vi.useRealTimers(); });
function setup() {
  const entity = createEntity('instrument', 'First'), base = { entity, source: createEntityDocument(entity), path: 'Instrument.md' };
  const save = vi.fn(async (_record: EntityRecord | undefined, draft: LibraryEntity) => ({ entity: draft, source: createEntityDocument(draft), path: base.path }));
  const checkpoint = vi.fn(async () => 'Recovery/draft.json');
  const port: SessionPort = { save, checkpoint }, session = new LibrarySession(entity, base, port); sessions.push(session); return { session, save, checkpoint, base, port };
}
describe('library draft ownership', () => {
  it('debounces recovery checkpoints without treating them as saved records', async () => {
    const { session, checkpoint } = setup(); session.update({ ...session.draft, notes: 'One' }); session.update({ ...session.draft, notes: 'Two' });
    expect(checkpoint).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(500);
    expect(checkpoint).toHaveBeenCalledTimes(1); expect(checkpoint.mock.calls[0]).toBeTruthy(); expect(session.dirty).toBe(true); expect(session.status).toContain('recovery copy stored');
  });
  it('retains edits arriving while a submitted version is being saved', async () => {
    const { session, port, base } = setup(), pending = deferred<EntityRecord>(); let submitted: LibraryEntity | undefined;
    port.save = async (_record, draft) => { submitted = draft; return pending.promise; };
    session.update({ ...session.draft, title: 'Submitted' }); const saving = session.save();
    session.update({ ...session.draft, title: 'Newer edit' });
    if (!submitted) throw Error('Missing submitted draft'); pending.resolve({ ...base, entity: submitted, source: createEntityDocument(submitted) }); await saving;
    expect(session.draft.title).toBe('Newer edit'); expect(session.base?.entity.title).toBe('Submitted'); expect(session.dirty).toBe(true);
    port.save = async (_record, draft) => ({ ...base, entity: draft, source: createEntityDocument(draft) }); await session.save(); expect(session.dirty).toBe(false);
  });
  it('blocks duplicate saves while allowing continued form input', async () => {
    const { session, port, base } = setup(), pending = deferred<EntityRecord>(); port.save = () => pending.promise;
    session.update({ ...session.draft, title: 'Changed' }); const first = session.save(); await expect(session.save()).rejects.toThrow('already running');
    pending.resolve(base); await first; expect(session.busy).toBe(false);
  });
  it('surfaces checkpoint failures and preserves draft text', async () => {
    const { session, port } = setup(); port.checkpoint = async () => { throw Error('Disk full'); }; session.update({ ...session.draft, title: 'Keep me' });
    await vi.advanceTimersByTimeAsync(500); expect(session.status).toContain('Disk full'); expect(session.draft.title).toBe('Keep me');
  });
  it('cancels timers and post-dispose notifications during an in-flight checkpoint', async () => {
    const { session, port } = setup(), pending = deferred<string>(); port.checkpoint = () => pending.promise;
    const changed = vi.fn(); session.subscribe(changed); session.update({ ...session.draft, notes: 'Keep' }); const checkpoint = session.checkpoint();
    session.dispose(); const count = changed.mock.calls.length; pending.resolve('Recovery/new.json'); await checkpoint;
    expect(changed).toHaveBeenCalledTimes(count); expect(session.recoveryPath).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  });
  it('clears recovery debounce on save and rejects identity replacement', async () => {
    const { session, checkpoint } = setup(); session.update({ ...session.draft, title: 'Saved' }); await session.save(); await vi.advanceTimersByTimeAsync(1000);
    expect(checkpoint).not.toHaveBeenCalled(); expect(session.status).toBe('Saved');
    expect(() => session.update({ ...session.draft, id: crypto.randomUUID() })).toThrow('identity');
  });
  it('coalesces concurrent checkpoint requests while retaining edits made during a pending write', async () => {
    const { session, port } = setup(), first = deferred<string>(), second = deferred<string>(); let count = 0;
    port.checkpoint = () => ++count === 1 ? first.promise : second.promise;
    session.update({ ...session.draft, notes: 'First version' }); const a = session.checkpoint();
    session.update({ ...session.draft, notes: 'Second version' }); const b = session.checkpoint(), c = session.checkpoint();
    first.resolve('Recovery/first.json'); await a; await Promise.resolve(); second.resolve('Recovery/second.json'); await Promise.all([b,c]);
    expect(count).toBe(2); expect(session.recoveryPath).toBe('Recovery/second.json'); expect(session.draft.notes).toBe('Second version');
  });
  it('rejects a reload that would discard a dirty draft', () => {
    const { session, base } = setup(); session.update({ ...session.draft, notes: 'Pending' });
    expect(() => session.reload(base)).toThrow('discard'); expect(session.draft.notes).toBe('Pending');
  });
});
