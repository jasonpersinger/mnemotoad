// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { compileArrangement } from '../src/arrangement/compiler';
import { exportArrangement } from '../src/arrangement/export';
import { clockTime, exportSummary, smfHeader } from '../src/arrangement/export-summary';
import type { CompiledArrangement } from '../src/arrangement/compiled';
import type { ArrangementPreparation } from '../src/arrangement/preparation';
import { ArrangementExportDialog } from '../src/modules/canvas/export-dialog';
import { COMPILE_HELP } from '../src/modules/canvas/performance-panel';
import { reaperGuidance } from '../src/ui/daw-guidance';
import { scanMidi } from '../src/midi/structure';
import { captured, composition, motif, revision } from './support/arrangement-fixtures';

/** Milestone 4H Workstream B: export summary and DAW guidance read existing results only and never change MIDI bytes. */
function compiled(c: ReturnType<typeof composition>, sources: ReturnType<typeof motif>[]): CompiledArrangement {
  const result = compileArrangement(c, sources.map(s => captured(s)), revision); if (!result.ok) throw Error(JSON.stringify(result.diagnostics)); return result.arrangement;
}
const golden = (): Uint8Array => readFileSync('tests/fixtures/arrangement-single.mid') // repository-relative: jsdom's import.meta.url is not a file URL;
function dialog(arrangement: CompiledArrangement | undefined, bytes = arrangement ? exportArrangement(arrangement) : new Uint8Array()) {
  const preparation = { prepared: arrangement ? { arrangement, bytes } : undefined, state: arrangement ? 'ready' : 'idle', export: vi.fn(), invalidate: vi.fn() } as unknown as ArrangementPreparation;
  const modal = new ArrangementExportDialog({} as never, preparation, 'MNEMOBARD', () => true); modal.open(); document.body.append(modal.contentEl); return modal.contentEl;
}
const rows = (root: HTMLElement): Record<string, string> => Object.fromEntries([...root.querySelectorAll('section[aria-label="Export summary"] dt')].map(dt => [dt.textContent ?? '', dt.nextElementSibling?.textContent ?? '']));

describe('4H export summary', () => {
  it('reads format, tracks and PPQ from the exported bytes and leaves the golden SMF byte-identical', () => {
    const m = motif(), a = compiled(composition([m]), [m]), bytes = exportArrangement(a), copy = bytes.slice();
    const s = exportSummary(a, bytes);
    expect(Buffer.from(bytes)).toEqual(Buffer.from(golden())); expect(bytes).toEqual(copy); // summary reads only
    expect(s).toMatchObject({ format: 1, midiTracks: 2, filePpq: 960, ppq: 960, tempoBpm: 120, meter: { numerator: 4, denominator: 4 }, lanes: 1, exportedLanes: 1, notes: 1, lengthTicks: 960 * 256, lastNoteTick: 960 });
    const midi = scanMidi(bytes); expect(midi.tracks).toHaveLength(s.midiTracks ?? -1); expect(midi.tracks.every(t => t.endTick === s.lengthTicks)).toBe(true);
    expect(s.durationSeconds).toBe(128); expect(clockTime(s.durationSeconds)).toBe('2:08.0');
  });
  it('summarises lanes, empty lanes and channel allocation exactly as compiled', () => {
    const a1 = motif(1), a2 = motif(2), c = composition([a1, a2], 3); const lanes = c.data.lanes;
    const third = lanes[2]; if (!third) throw Error(); third.clips = []; // empty lane: compiled, not exported
    Object.assign(lanes[1] ?? {}, { midiChannel: 9, percussion: true });
    const a = compiled(c, [a1, a2]), s = exportSummary(a, exportArrangement(a));
    expect(s.lanes).toBe(3); expect(s.exportedLanes).toBe(2); expect(s.midiTracks).toBe(3);
    expect(s.channels).toEqual([{ lane: 'Lane 1', channel: a.lanes[0]?.channel, explicit: false, percussion: false, notes: 1 }, { lane: 'Lane 2', channel: 9, explicit: true, percussion: true, notes: 1 }, { lane: 'Lane 3', channel: undefined, explicit: false, percussion: false, notes: 0 }]);
  });
  it('omits header fields it cannot read instead of guessing', () => {
    expect(smfHeader(new Uint8Array([1, 2, 3]))).toBeUndefined(); expect(smfHeader(new TextEncoder().encode('RIFF0000000000'))).toBeUndefined();
    const smpte = golden().slice(); smpte[12] = 0xe7; expect(smfHeader(smpte)).toBeUndefined();
    const m = motif(), a = compiled(composition([m]), [m]), s = exportSummary(a, new Uint8Array());
    expect(s.format).toBeUndefined(); expect(s.midiTracks).toBeUndefined(); expect(s.notes).toBe(1);
  });
});

describe('4H arrangement export dialog', () => {
  it('shows the summary, keeps REAPER guidance and technical detail collapsed, and explains the ending', () => {
    const m = motif(), root = dialog(compiled(composition([m]), [m])), r = rows(root);
    expect(Object.keys(r)).toEqual(['File', 'Tempo and meter', 'MIDI tracks', 'Lanes', 'Notes', 'Length', 'Last note ends', 'Channels']);
    expect(r).toMatchObject({ 'File': 'Standard MIDI File · Type 1 · 960 PPQ', 'Tempo and meter': '120 BPM · 4/4', 'MIDI tracks': '2: 1 tempo and meter track + 1 lane track', 'Lanes': '1 of 1 lane contain notes', 'Notes': '1', 'Length': '64 bars · 2:08.0 · ends at 65:1:0 (bar:beat:tick)', 'Last note ends': '1:2:0' });
    expect(r['Channels']).toBe('Lane 1: channel 1 · assigned automatically · 1 note');
    const guidance = root.querySelector<HTMLDetailsElement>('details.mnemobard-daw-guidance'); if (!guidance) throw Error('guidance');
    expect(guidance.open).toBe(false); expect(guidance.querySelector('summary')?.textContent).toBe('Importing into REAPER');
    expect(guidance.textContent).toContain('“Expand 1 MIDI tracks to new REAPER tracks”'); expect(guidance.textContent).toContain('“Import MIDI tempo map to project tempo map”');
    expect(guidance.textContent).toContain('Verified with REAPER 7.84 on Linux'); expect(guidance.textContent).toContain('120 BPM, 4/4, 1 lane track, last note ending at 1:2:0');
    guidance.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); guidance.open = true; expect(guidance.open).toBe(true);
    expect(root.textContent).toContain('The file ends exactly at the composition end (65:1:0)'); expect(root.textContent).toContain('No notes are missing');
    expect(root.querySelector<HTMLDetailsElement>('details.mnemobard-export-advanced')?.open).toBe(false);
    // Controls the native regression suites rely on are unchanged.
    expect(root.querySelector('input[aria-label="New arrangement MIDI destination"]')).not.toBeNull();
    expect([...root.querySelectorAll('button')].map(b => b.textContent)).toEqual(expect.arrayContaining(['Create arrangement MIDI', 'Cancel export']));
  });
  it('does not explain a shorter DAW item when the last note ends at the composition end', () => {
    const m = motif(1, 960, 960), c = composition([m]); c.data.lengthTicks = 960; const root = dialog(compiled(c, [m]));
    expect(rows(root)['Last note ends']).toBe('1:2:0'); expect(root.textContent).not.toContain('No notes are missing');
  });
  it('shows nothing to export before a compilation', () => {
    const root = dialog(undefined); expect(root.textContent).toContain('Compile a valid arrangement first.'); expect(root.querySelector('section[aria-label="Export summary"]')).toBeNull(); expect(root.querySelector('details.mnemobard-daw-guidance')).toBeNull();
  });
});

describe('4H DAW guidance and diagnostic help', () => {
  it('omits the expand step for single-track motif exports', () => {
    const root = document.createElement('div'), details = reaperGuidance(root, { multitrack: false });
    expect(details.open).toBe(false); expect(details.textContent).not.toContain('Expand'); expect(details.textContent).toContain('Import MIDI tempo map');
  });
  it('explains why and how to resolve every export-blocking source diagnostic', () => {
    for (const code of ['source-changed', 'source-unreviewed', 'missing-source', 'inexact-timing', 'archived-source', 'unsupported-source', 'composition-conflict']) expect(COMPILE_HELP[code]).toMatch(/\. .*(compile again|nothing was modified)/);
  });
});

describe('4J export dialog order', () => {
  it('puts the essentials first: summary, destination and Create before DAW guidance and technical details', () => {
    const m = motif(), root = dialog(compiled(composition([m]), [m]));
    const summary = root.querySelector('section[aria-label="Export summary"]'), destination = root.querySelector('input[aria-label="New arrangement MIDI destination"]');
    const create = [...root.querySelectorAll('button')].find(b => b.textContent === 'Create arrangement MIDI'), guidance = root.querySelector('details.mnemobard-daw-guidance'), advanced = root.querySelector('details.mnemobard-export-advanced');
    if (!summary || !destination || !create || !guidance || !advanced) throw Error('missing part');
    const before = (a: Node, b: Node): boolean => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(summary, destination) && before(destination, create) && before(create, guidance) && before(guidance, advanced)).toBe(true);
  });
});
