import { afterEach, expect, it, vi } from 'vitest';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { CanvasLibrary } from '../src/modules/canvas/library';
import { linkOnlyRewrite } from '../src/modules/canvas/rename-merge';
import { addSection, updateSection } from '../src/modules/canvas/structure';
import type { Composition } from '../src/domain/entities';
import { MemoryVault } from './support/memory-vault';

/** Milestone 4D: recording rename while the composition has unsaved edits. */
const disposals: (() => void)[] = []; afterEach(() => { for (const fn of disposals.splice(0)) fn(); });
const wav = new Uint8Array([82, 73, 70, 70, 9, 9]).buffer, section = '00000000-0000-4000-8000-00000000e001';
async function fixture() {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index);
  // Test resolver mirrors Obsidian: exact vault path, else a UNIQUE file whose name matches (shortest-form links).
  const resolve = (target: string): string | null => { if (vault.fileInfo(target)) return target; const hits = [...vault.binaries.keys()].filter(p => p.endsWith('/' + target)); return hits.length === 1 ? hits[0] ?? null : null; };
  const library = new CanvasLibrary(index, repository, vault, () => false, resolve); await index.start();
  await vault.createBinary('Takes/take.wav', wav); await vault.createBinary('Takes/other.wav', wav); await index.settled();
  const session = library.create(); session.edit('section', c => addSection(c, { label: 'Intro', startTick: 0, endTick: 3840 }, section));
  library.addRecording(session, { label: 'Take', path: 'Takes/take.wav', description: 'keep me', sectionId: section }); await session.save();
  disposals.push(() => { library.dispose(); repository.dispose(); index.dispose(); });
  const path = session.base?.path ?? ''; const refId = session.draft.data.audioRefs[0]?.id ?? '';
  return { vault, index, repository, library, session, path, refId };
}
/** Simulates Obsidian: move the file, then its link updater rewrites this note's frontmatter link. */
function obsidianRename(f: Awaited<ReturnType<typeof fixture>>, to: string, link = to) {
  const bytes = f.vault.binaries.get('Takes/take.wav'); f.vault.binaries.delete('Takes/take.wav'); if (bytes) f.vault.binaries.set(to, bytes);
  f.vault.modify(f.path, (f.vault.files.get(f.path) ?? '').replace('[[Takes/take.wav]]', `[[${link}]]`));
}

it.each([['full path', 'Takes/take-renamed.wav', 'Takes/take-renamed.wav'], ['shortest form', 'Takes/take-renamed.wav', 'take-renamed.wav']])('adopts a provable link-only rename (%s) without losing unsaved edits', async (_n, to, link) => {
  const f = await fixture(), bytes = f.vault.binaries.get('Takes/take.wav');
  f.session.edit('unsaved', c => updateSection(c, section, { label: 'Unsaved verse' })); obsidianRename(f, to, link); await f.index.settled();
  await expect(f.session.save()).rejects.toThrow('changed elsewhere'); expect(f.session.draft.data.sections[0]?.label).toBe('Unsaved verse');
  const offer = await f.library.renameConflict(f.session); expect(offer?.moves).toEqual([{ from: 'Takes/take.wav', to, referenceIds: [f.refId] }]);
  if (!offer) throw Error('offer'); const history = f.session.historySize; await f.library.adoptRename(f.session, offer);
  expect(f.session.historySize).toBe(history + 1); expect(f.session.draft.data.audioRefs[0]).toMatchObject({ id: f.refId, path: to, description: 'keep me', sectionId: section });
  await f.session.save(); const saved = f.vault.files.get(f.path) ?? '';
  expect(saved).toContain('Unsaved verse'); expect(saved).toContain(`[[${to}]]`); expect(saved).not.toContain('[[Takes/take.wav]]');
  expect(f.vault.binaries.get(to)).toBe(bytes); expect(f.session.dirty).toBe(false);
});
it('returns nothing for an unchanged note or a non-rename change', async () => {
  const f = await fixture(); expect(await f.library.renameConflict(f.session)).toBeUndefined();
  f.session.edit('unsaved', c => updateSection(c, section, { label: 'X' })); expect(await f.library.renameConflict(f.session)).toBeUndefined();
  f.vault.modify(f.path, (f.vault.files.get(f.path) ?? '') + '\nExternal prose\n'); await f.index.settled(); expect(await f.library.renameConflict(f.session)).toBeUndefined();
});
it('refuses when the rename also comes with another external edit, so the protected conflict remains', async () => {
  const f = await fixture(); f.session.edit('unsaved', c => updateSection(c, section, { label: 'X' })); obsidianRename(f, 'Takes/new.wav');
  f.vault.modify(f.path, (f.vault.files.get(f.path) ?? '').replace('mnemobard_audio', 'mnemobard_audio').replace(/title: .*/, 'title: Edited elsewhere')); await f.index.settled();
  expect(await f.library.renameConflict(f.session)).toBeUndefined(); await expect(f.session.save()).rejects.toThrow('changed elsewhere');
});
it('refuses to adopt if the note changes again after detection, leaving draft and base untouched', async () => {
  const f = await fixture(); f.session.edit('unsaved', c => updateSection(c, section, { label: 'X' })); obsidianRename(f, 'Takes/new.wav'); await f.index.settled();
  const offer = await f.library.renameConflict(f.session); if (!offer) throw Error('offer'); const draft = JSON.stringify(f.session.draft), base = f.session.base?.source;
  f.vault.modify(f.path, (f.vault.files.get(f.path) ?? '') + '\nLater\n');
  await expect(f.library.adoptRename(f.session, offer)).rejects.toThrow('changed again'); expect(JSON.stringify(f.session.draft)).toBe(draft); expect(f.session.base?.source).toBe(base);
});

describe_rules();
function describe_rules() {
  const base = { kind: 'composition', data: { audioRefs: [{ id: 'r', path: 'A/a.wav', label: 'a', atTick: 0 }] } } as unknown as Composition;
  const src = (link: string, body = 'Body') => `---\nmnemobard_kind: composition\nmnemobard_audio:\n  - "[[${link}]]"\n---\n${body}\n`;
  const files = new Set(['A/b.wav', 'A/c.wav', 'A/doc.pdf']), exists = (p: string) => files.has(p), resolve = (l: string) => exists(l) ? l : null;
  it('pure rule: accepts only link-target changes to existing audio from a missing referenced path', () => {
    expect(linkOnlyRewrite(src('A/a.wav'), src('A/b.wav'), base, base, exists, resolve)).toEqual([{ from: 'A/a.wav', to: 'A/b.wav', referenceIds: ['r'] }]);
    expect(linkOnlyRewrite(src('A/a.wav'), src('A/b.wav', 'Changed body'), base, base, exists, resolve)).toBeUndefined();
    expect(linkOnlyRewrite(src('A/a.wav'), src('A/doc.pdf'), base, base, exists, resolve)).toBeUndefined();
    expect(linkOnlyRewrite(src('A/a.wav'), src('A/missing.wav'), base, base, exists, resolve)).toBeUndefined();
    expect(linkOnlyRewrite(src('A/a.wav'), src('A/b.wav'), base, base, p => p === 'A/a.wav' || exists(p), resolve)).toBeUndefined();
    expect(linkOnlyRewrite(src('A/z.wav'), src('A/b.wav'), base, base, exists, resolve)).toBeUndefined();
    expect(linkOnlyRewrite(src('A/a.wav'), src('A/a.wav'), base, base, exists, resolve)).toBeUndefined();
    const two = `---\nmnemobard_audio:\n  - "[[A/a.wav]]"\n  - "[[A/a.wav]]"\n---\n`;
    expect(linkOnlyRewrite(two, two.replace('[[A/a.wav]]', '[[A/b.wav]]').replace('[[A/a.wav]]', '[[A/c.wav]]'), base, base, exists, resolve)).toBeUndefined();
  });
}
it('relink removes only mirror links that resolve to exactly the relinked file (Obsidian shortest-form leftovers)', async () => {
  const f = await fixture(); await f.vault.createBinary('Elsewhere/keep.wav', wav); await f.index.settled();
  // State a clean session reaches after Obsidian rewrote the mirror to shortest form and the note reloaded.
  const bytes = f.vault.binaries.get('Takes/take.wav'); f.vault.binaries.delete('Takes/take.wav'); if (bytes) f.vault.binaries.set('Takes/take-renamed.wav', bytes);
  f.session.edit('simulate reload', c => ({ ...c, assets: [{ role: 'audio', link: '[[Takes/take.wav]]' }, { role: 'audio', link: '[[take-renamed.wav]]' }, { role: 'audio', link: '[[Elsewhere/keep.wav]]' }] }));
  const history = f.session.historySize; f.library.relinkRecording(f.session, f.refId, 'Takes/take-renamed.wav');
  expect(f.session.historySize).toBe(history + 1);
  expect(f.session.draft.assets?.map(a => a.link)).toEqual(['[[Elsewhere/keep.wav]]', '[[Takes/take-renamed.wav]]']);
  expect(f.vault.binaries.get('Takes/take-renamed.wav')).toBe(bytes);
});
// 4E supersedes 4D's clean-session offer: a clean session now refreshes from the rewritten note automatically
// (no history entry), after which the explicit 4C relink suggestion repairs the reference in one undo step.
it('clean session: refreshes from the renamed-link note, then an explicit relink keeps the exact link', async () => {
  const f = await fixture(); const history = f.session.historySize; obsidianRename(f, 'Takes/clean.wav', 'clean.wav'); await f.index.settled();
  await vi.waitFor(() => expect(f.session.freshness.state).toBe('refreshed'));
  expect(f.session.dirty).toBe(false); expect(f.session.historySize).toBeLessThanOrEqual(history); expect(f.session.base?.source).toBe(f.vault.files.get(f.path));
  expect(await f.library.renameConflict(f.session)).toBeUndefined();
  const suggestion = f.library.relinkSuggestion(f.session.draft, f.path); expect(suggestion).toEqual({ referenceIds: [f.refId], from: 'Takes/take.wav', to: 'Takes/clean.wav' }); if (!suggestion) throw Error('suggestion');
  const before = f.session.historySize; f.library.relinkRecording(f.session, suggestion.referenceIds, suggestion.to); expect(f.session.historySize).toBe(before + 1);
  expect(f.session.draft.data.audioRefs[0]).toMatchObject({ id: f.refId, path: 'Takes/clean.wav', description: 'keep me', sectionId: section });
  expect(f.session.dirty).toBe(true); await f.session.save();
  const saved = f.vault.files.get(f.path) ?? ''; expect(saved).toContain('[[Takes/clean.wav]]'); expect(saved).not.toContain('[[clean.wav]]');
});

/** Milestone 4E: explicit repair of legacy duplicate mirror links (left by 4C relink before the 4D dedupe). */
function legacy(f: Awaited<ReturnType<typeof fixture>>, links: string[]) { f.session.edit('simulate legacy note', c => ({ ...c, assets: [...(c.assets ?? []).filter(a => a.role !== 'audio'), ...links.map(link => ({ role: 'audio' as const, link }))] })); }
it('4E: detects only duplicates Obsidian resolves to the same referenced file, keeping the exact link', async () => {
  const f = await fixture(); legacy(f, ['[[Takes/take.wav]]', '[[take.wav]]', '[[Takes/other.wav]]', '[[missing.wav]]']);
  expect(f.library.duplicateMirrors(f.session.draft, f.path)).toEqual([{ path: 'Takes/take.wav', keep: '[[Takes/take.wav]]', remove: ['[[take.wav]]'] }]);
  legacy(f, ['[[Takes/take.wav]]', '[[Takes/take.wav]]']); expect(f.library.duplicateMirrors(f.session.draft, f.path)).toEqual([{ path: 'Takes/take.wav', keep: '[[Takes/take.wav]]', remove: ['[[Takes/take.wav]]'] }]);
  legacy(f, ['[[take.wav]]', '[[take.wav]]']); expect(f.library.duplicateMirrors(f.session.draft, f.path)).toEqual([]); // no exact form: ambiguous which to keep
  // Aliased/heading links never reach here: entity validation already rejects them in `assets`.
});
it('4E: refuses a shortest-form link whose name matches several vault files even if a resolver picks one (no basename guessing)', async () => {
  const vault = new MemoryVault(), index = new EntityIndex(vault), repository = new EntityRepository(vault, index);
  const library = new CanvasLibrary(index, repository, vault, () => false, target => target === 'take.wav' ? 'Takes/take.wav' : vault.fileInfo(target) ? target : null); await index.start();
  disposals.push(() => { library.dispose(); repository.dispose(); index.dispose(); });
  await vault.createBinary('Takes/take.wav', wav); await vault.createBinary('Other/take.wav', wav); await index.settled();
  const s = library.create(); library.addRecording(s, { label: 'Take', path: 'Takes/take.wav' }); s.edit('legacy', c => ({ ...c, assets: [...(c.assets ?? []), { role: 'audio', link: '[[take.wav]]' }] }));
  expect(library.duplicateMirrors(s.draft)).toEqual([]); expect(() => library.removeDuplicateMirrors(s)).toThrow('No provable duplicate');
});
it('4E: explicit repair is one undo step, touches only mirror links and preserves references, notes, associations and audio bytes', async () => {
  const f = await fixture(); f.session.edit('legacy', c => ({ ...c, assets: [{ role: 'image', link: '[[cover.png]]' }, { role: 'audio', link: '[[Takes/take.wav]]' }, { role: 'audio', link: '[[take.wav]]' }, { role: 'audio', link: '[[unresolved.wav]]' }] }));
  const refs = JSON.stringify(f.session.draft.data.audioRefs), bytes = f.vault.binaries.get('Takes/take.wav'), history = f.session.historySize;
  expect(f.library.removeDuplicateMirrors(f.session)).toBe(1); expect(f.session.historySize).toBe(history + 1);
  expect(f.session.draft.assets?.map(a => a.link)).toEqual(['[[cover.png]]', '[[Takes/take.wav]]', '[[unresolved.wav]]']);
  expect(JSON.stringify(f.session.draft.data.audioRefs)).toBe(refs); expect(f.session.draft.data.audioRefs[0]).toMatchObject({ id: f.refId, description: 'keep me', sectionId: section });
  f.session.undo(); expect(f.session.draft.assets?.map(a => a.link)).toContain('[[take.wav]]'); f.session.redo();
  await f.session.save(); const saved = f.vault.files.get(f.path) ?? ''; expect(saved).toContain('[[Takes/take.wav]]'); expect(saved).not.toContain('"[[take.wav]]"');
  expect(f.vault.binaries.get('Takes/take.wav')).toBe(bytes); expect(f.library.duplicateMirrors(f.session.draft, f.path)).toEqual([]);
});
it('4E: after the repair, a later rename is provable again (the legacy duplicate no longer blocks the proof)', async () => {
  const f = await fixture(); legacy(f, ['[[Takes/take.wav]]', '[[take.wav]]']); await f.session.save(); f.session.edit('unsaved', c => updateSection(c, section, { label: 'Dirty' }));
  f.library.removeDuplicateMirrors(f.session); await f.session.save(); f.session.edit('unsaved', c => updateSection(c, section, { label: 'Dirty again' }));
  obsidianRename(f, 'Takes/after.wav', 'after.wav'); await f.index.settled();
  const offer = await f.library.renameConflict(f.session); expect(offer?.moves).toEqual([{ from: 'Takes/take.wav', to: 'Takes/after.wav', referenceIds: [f.refId] }]);
});
