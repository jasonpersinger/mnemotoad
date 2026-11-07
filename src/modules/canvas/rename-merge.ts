import type { Composition } from '../../domain/entities';
import { recordingPath } from './structure';

/**
 * Milestone 4D: provable "link-only" external change after a recording rename.
 *
 * When a referenced recording is renamed inside Obsidian, its link updater rewrites this composition's
 * `mnemobard_audio` frontmatter mirror. With unsaved CANVAS edits, the protected Save then (correctly)
 * reports a conflict. This pure check recognises the one external change that can be adopted without
 * losing data, and refuses everything else:
 *
 *  - identical line count, identical body, identical frontmatter delimiters;
 *  - every differing line is inside the frontmatter and differs ONLY in the target of exactly one wikilink;
 *  - each old target is a recording path the saved base referenced, and that path no longer exists;
 *  - each new target resolves (Obsidian link resolution from this note) to one existing vault audio file;
 *  - no old path maps to two different new paths.
 *
 * No basename guessing, no external paths, no automatic acceptance: the caller asks the user first.
 */
export interface RenameMove { readonly from: string; readonly to: string; readonly referenceIds: readonly string[] }

const LINK = /\[\[([^\]]+)\]\]/g;
function onlyLink(line: string): { target: string; rest: string } | undefined {
  const links = [...line.matchAll(LINK)];
  if (links.length !== 1) return undefined;
  const match = links[0], inner = match?.[1];
  if (!match || inner === undefined) return undefined;
  return { target: inner.split('|')[0]?.trim() ?? '', rest: line.slice(0, match.index) + '\u0000' + line.slice((match.index ?? 0) + match[0].length) };
}
function frontmatterEnd(lines: readonly string[]): number { return lines[0] === '---' ? lines.indexOf('---', 1) : -1; }

export function linkOnlyRewrite(
  baseSource: string, diskSource: string, base: Composition, draft: Composition,
  exists: (path: string) => boolean, resolve: (link: string) => string | null,
): RenameMove[] | undefined {
  if (baseSource === diskSource) return undefined;
  const before = baseSource.split('\n'), after = diskSource.split('\n'), end = frontmatterEnd(before);
  if (end < 1 || before.length !== after.length || frontmatterEnd(after) !== end) return undefined;
  const referenced = new Set(base.data.audioRefs.map(r => r.path)), moves = new Map<string, string>();
  for (let i = 0; i < before.length; i++) {
    const a = before[i] ?? '', b = after[i] ?? '';
    if (a === b) continue;
    if (i >= end) return undefined;
    const old = onlyLink(a), next = onlyLink(b);
    if (!old || !next || old.rest !== next.rest) return undefined;
    if (!referenced.has(old.target) || exists(old.target)) return undefined;
    const resolved = resolve(next.target);
    if (!resolved || !exists(resolved)) return undefined;
    try { recordingPath(resolved); } catch { return undefined; }
    const prior = moves.get(old.target);
    if (prior !== undefined && prior !== resolved) return undefined;
    moves.set(old.target, resolved);
  }
  if (!moves.size) return undefined;
  return [...moves].map(([from, to]) => ({ from, to, referenceIds: draft.data.audioRefs.filter(r => r.path === from).map(r => r.id) }));
}
