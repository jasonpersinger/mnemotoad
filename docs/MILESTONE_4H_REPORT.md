# Milestone 4H report — large-document editing performance and export usability

Prompt: MNEMOBARD Codex Prompt 015 (Milestone 4H), executed by Claude Code. Baseline: signed 4G commit `a473533`. Date: 2026-11-08.

## A. Executive summary

**Implemented.**
- **Large-MOTIF edit commits** (Workstream A) are about twice as fast without weakening validation, undo, persistence or recovery. The session draft and history snapshots are now frozen shared values, so an edit no longer copies or serialises the whole document repeatedly. In-app MOTIF commands hand the session an already validated, frozen result instead of being validated twice.
  - 10,000-note drag: 93.9 → 45.5 ms median; resize: 94.3 → 41.0 ms; undo/redo: 39.5 → 7 ms. These use the 4G benchmark method, both builds in the same Obsidian process.
  - Native commit-only latency at 10,000 notes: 32.3 ms median.
- **MIDI export guidance** (B): a CANVAS export summary read from the compiler result and the file's own header, collapsed REAPER import guidance and a plain explanation of why a DAW item can end at the last note. The MIDI serializer is untouched, and the same saved composition exported by the 4G and 4H builds is byte-identical.
- **Interface** (C): the source-review dialog leads with a summary and keeps the action in a sticky footer; MOTIF controls form one grouped toolbar (the roll starts 77 px higher at 1366×900); export-blocking diagnostics say why and what to do. Checked at 1366, 980 and 680 px, in dark and light themes.

**Deferred.**
- Counting shared history snapshots once in the undo budget, which would deepen undo for very large motifs but change established behaviour.
- An opt-in export end marker for DAWs (product decision).
- Guidance for DAWs other than REAPER 7.84 on Linux.

**Verdict: PASS.** Every §14 acceptance criterion is met. Known issues (K) are non-blocking or deferred.

## B. Baseline

- **Git:** branch `main`, HEAD `a473533` ("Milestone 4G …"), good signature (G); working tree clean at start.
- **Checks:** `pnpm check` 608 tests / 47 files, typecheck, lint, production build: pass. `pnpm audit`: no known vulnerabilities.
- **Golden MIDI:** `tests/fixtures/arrangement-single.mid` SHA-256 `85c8ecf39936d1de7612f65d17d3df2f4599472cda8027096bced1c93bb3ab77`; independent Python verification 10 valid fixtures / 4 rejections.
- **Performance baseline:** measured on the 4G build (`main.js` `a351b2f9…`, built from `a473533` in a scratch worktree) in the same Obsidian 1.15.0 process as the final 4H build: `output/mnemobard/milestone-4h/performance-baseline.json`, `edit-profile-baseline-4g.json`. An earlier baseline taken in another process is kept as `*-run1.json`.
- **Discrepancy noted:** the 4G report attributed the remaining edit cost to "whole-document validation, history snapshots, subscriber copies and canonical dirty checks". Profiling confirmed all four, and found that copies and serialisation, not validation logic, dominated.

## C. Performance profiling

**Method.** `scripts/mnemobard-4h-edit-profile.mjs` drives the same UI paths a user does (PianoRoll gesture `move()`/`up()`, transform-panel buttons, `act(undo/redo)`) at 16, 500, 5,000 and 10,000 notes, for single-note move, resize, velocity, transpose, quantize (up to 100 notes), 100-note move, undo and redo. Each operation runs twice:
1. **Uninstrumented:** the cost of the edit.
2. **Instrumented:** temporary wrappers on the session instance (transform, validator, publish, each subscriber, `draft`/`dirty` getters) and on `structuredClone`/`JSON.stringify` attribute time and call counts per commit. Instrumentation overhead is reported per operation in the JSON (10,000-note move: −3.5 ms on the 4G build, +7.9 ms on the 4H build, i.e. within run-to-run noise), never subtracted.

A CDP sampling profile (100 µs) of the 10,000-note move confirmed the attribution.

**Original bottlenecks** (4G build, 10,000-note move, median of 6; phases overlap):

| Phase | Time | Calls per commit |
|---|---:|---:|
| `HistorySession.edit` total | 82 ms | 1 |
| Whole-document `structuredClone` | 60 ms | 9 |
| `session.draft` copies (edit's `before`, piano roll, view, harness) | 29 ms | 4 |
| Subscribers (view 18.1 ms, roll 8.9 ms) | 27.1 ms | 1 |
| `JSON.stringify` (no-op check ×2, history bytes ×2, …) | 15.5 ms | 8 |
| Session validation (duplicate of the command's own) | 14.8 ms | 1 |
| Command transform incl. its validation | 10.8 ms | 1 |
| `dirty` (key-sorted canonical string of 1.1 MB) | 10 ms | 5 (1 computed) |
| Piano-roll draw | 0.2 ms | 1 |

CPU profile self time: `get draft` 33.6 %, a minified clone helper 14.6 %, `edit` 12.7 %, `update` (another copy) 7.2 %.

**Allocation findings** (counted, not heap-measured). The 10,000-note document serialises to 1.1 M characters. A 4G move commit made nine whole-document copies and eight serialisations of about that size. A 4H commit makes four `structuredClone` calls: three whole-document copies (transform input, validator output and the harness's own read) and one single-note copy inside `changeNotes`, plus one serialisation.

## D. Optimization implementation

**Files changed:**
- `src/application/freeze.ts` (new)
- `src/application/json-equal.ts` (new)
- `src/application/document-session.ts`
- `src/application/history-session.ts`
- `src/modules/motif/{commands,session,view,piano-roll,inspector,transform-panel}.ts`

**Changes:**
1. **Frozen drafts (H01).** `freezeDeep` freezes children before parents and records what it froze, so already-frozen values cost nothing. The draft is always frozen; `update()` copies untrusted input, and protected `adopt()` installs a value the caller owns exclusively. The public `snapshot` getter returns the frozen draft (no copy); `draft` is unchanged (an editable copy).
2. **History (H02).** `edit` uses the frozen draft as `before` without copying it. The transform still gets its own copy and the result is still validated; the validated result is adopted. Undo/redo reinstall stored snapshots in O(1) instead of copying. History entries and the draft share frozen objects. A validator that returned the transform's own unfrozen object would be copied, so the installed value is never writable by anyone.
3. **One serialisation per edit (H03).** The draft's JSON is cached by identity; no-op detection compares the same strings as before.
4. **Dirty (H04).** `jsonEqual` gives the canonical comparison without building strings: an O(n) walk with early exit and no allocation, replacing O(n log k) string building. Its result is exactly equal to the old comparison (property test), with a canonical-string fallback for non-JSON values.
5. **Sealed command results (H05).** Each MOTIF command takes optional `finish` (default `editableMotif`, the unchanged mutable-copy contract). `sealedMotif` validates, freezes and registers. The MOTIF session validator `sessionMotif` returns a registered value as is (the check is pure and the value cannot have changed) and fully validates anything else.
6. **Subscribers (H06).** The MOTIF view and the piano roll read `session.snapshot` instead of copying on every publish.

**Complexity.** Per commit the work went from about 9 document copies, 8 serialisations, 2 validations and 1 sort-heavy canonicalisation to about 2 copies, 1 serialisation, 1 validation and 1 allocation-free walk. All remain O(n); undo/redo are now O(1) in copying, plus subscriber work.

**Ownership and immutability guarantees.** Every value reachable as `session.snapshot`, in history, or returned by `sealedMotif` is deeply frozen and the bundle runs in strict mode, so any write throws instead of corrupting shared state. Tests assert the throw.

Values are installed without a copy only when the session owns them exclusively (validator output) or they are frozen. `draft`, `update()` and every default command keep their 4G behaviour. No public API was removed; `snapshot`, `finish`, `sealedMotif` and `sessionMotif` are additive.

**Stop gate.** Not reached (H07): no new document representation, history engine, mutable shared state, schema or validation architecture was needed.

## E. Performance results

**Edit commits** (`edit-profile-baseline-4g.json` vs `edit-profile-final.json`, same process). The harness boundary still includes one harness `session.draft` copy for move, resize and multiMove, so these figures are conservative.

| Notes | Operation | 4G median | 4G p95 | 4G long tasks | 4H median | 4H p95 | 4H long tasks | Change |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 16 | move | 3.7 | 6.7 | 0 | 4 | 5.9 | 0 | 8% |
| 16 | resize | 3.6 | 3.9 | 0 | 3.5 | 4.1 | 0 | -3% |
| 16 | velocity | 3.6 | 3.7 | 0 | 4.5 | 7.7 | 0 | 25% |
| 16 | transpose | 3.5 | 4 | 0 | 3.2 | 3.4 | 0 | -9% |
| 16 | quantize | 3.7 | 4.7 | 0 | 3.4 | 4.5 | 0 | -8% |
| 16 | multiMove | 3.4 | 3.7 | 0 | 3.6 | 3.7 | 0 | 6% |
| 16 | undo | 3 | 3.1 | 0 | 2.7 | 3.1 | 0 | -10% |
| 16 | redo | 3.2 | 3.3 | 0 | 3 | 3.1 | 0 | -6% |
| 500 | move | 8 | 10.5 | 0 | 6 | 8 | 0 | -25% |
| 500 | resize | 7.8 | 8 | 0 | 5.7 | 6.1 | 0 | -27% |
| 500 | velocity | 7.3 | 7.7 | 0 | 4.9 | 5.4 | 0 | -33% |
| 500 | transpose | 7.6 | 7.7 | 0 | 5.1 | 5.4 | 0 | -33% |
| 500 | quantize | 8 | 8.8 | 0 | 5.5 | 6.2 | 0 | -31% |
| 500 | multiMove | 7.7 | 8.6 | 0 | 5.6 | 5.8 | 0 | -27% |
| 500 | undo | 4.9 | 5.1 | 0 | 3.4 | 4.1 | 0 | -31% |
| 500 | redo | 4.8 | 5.1 | 0 | 3.5 | 4 | 0 | -27% |
| 5,000 | move | 48.8 | 51.8 | 2 | 23.5 | 28.7 | 1 | -52% |
| 5,000 | resize | 47.7 | 48.8 | 0 | 23 | 27 | 0 | -52% |
| 5,000 | velocity | 41.3 | 44.4 | 0 | 17.8 | 36.9 | 0 | -57% |
| 5,000 | transpose | 42.3 | 44.3 | 0 | 16.6 | 17.6 | 0 | -61% |
| 5,000 | quantize | 41.6 | 54.8 | 1 | 18.7 | 19.9 | 0 | -55% |
| 5,000 | multiMove | 48.3 | 48.7 | 0 | 21.3 | 26.6 | 0 | -56% |
| 5,000 | undo | 19.4 | 21.7 | 0 | 3.6 | 3.7 | 0 | -81% |
| 5,000 | redo | 19.4 | 19.6 | 1 | 4 | 5 | 0 | -79% |
| 10,000 | move | 95.5 | 118.9 | 7 | 45 | 87.7 | 2 | -53% |
| 10,000 | resize | 91.7 | 92.2 | 6 | 48.1 | 50.7 | 1 | -48% |
| 10,000 | velocity | 82.7 | 102.9 | 6 | 32.9 | 42.5 | 0 | -60% |
| 10,000 | transpose | 80.7 | 83.8 | 6 | 33.3 | 44.9 | 0 | -59% |
| 10,000 | quantize | 82.8 | 84 | 6 | 42.6 | 47.8 | 0 | -49% |
| 10,000 | multiMove | 91.7 | 94.4 | 6 | 52.9 | 83.4 | 3 | -42% |
| 10,000 | undo | 37.2 | 40.8 | 0 | 4.5 | 5.6 | 0 | -88% |
| 10,000 | redo | 37.3 | 39.6 | 1 | 5.4 | 6.6 | 1 | -86% |

**Full benchmark** (4G method, same process; `performance-baseline.json` vs `performance-final.json`, rule: regression if > 25 % **and** > 5 ms): **no regressions**. Comparison: `performance-comparison.md`.

| Workload | 4G | 4H |
|---|---:|---:|
| MOTIF 10,000 · drag | 93.9 ms | 45.5 ms |
| MOTIF 10,000 · resize | 94.3 ms | 41.0 ms |
| MOTIF 10,000 · undo / redo | 39.5 / 39.8 ms | 7.0 / 7.8 ms |
| MOTIF 10,000 · save | 503.5 ms | 409.2 ms |
| MOTIF 10,000 · warm open | 141.9 ms | 120.0 ms |
| MOTIF 5,000 · drag / resize | 47.9 / 49.3 ms | 25.5 / 23.6 ms |
| MOTIF 5,000 · undo / redo | 22.1 / 22.3 ms | 6.9 / 7.2 ms |
| MOTIF 5,000 · save | 264.9 ms | 220.9 ms |
| MOTIF 500 · drag | 11.1 ms | 8.2 ms |
| MOTIF 16 · drag | 5.2 ms | 5.7 ms |
| CANVAS 32×1,000 · drag / save | 38.1 / 212.4 ms | 31.5 / 204.1 ms |
| CANVAS 32×1,000 · batch acknowledgement (50 placements) | 32.5 ms | 29.8 ms |
| PATCHBOOK patch selection with reverse references | 14.4 ms | 16.8 ms (ok) |

**Native commit-only latency** (pointer-up commit + draw; no harness copy; 4H workflow step 16): 10,000 notes, 32.3 ms median, max 55.7 ms (first sample). At 5,000 notes: move 21.9 ms, resize 19.0 ms.

**Long tasks** (> 50 ms): 10,000-note move dropped from 7 to 2 per 6-sample workload, velocity, transpose and quantize from 6 to 0, and undo/redo stay at 0–1.

## F. Correctness validation

- **Atomic editing:** one `edit` call validates the complete candidate and either installs it with exactly one history entry or throws with nothing changed and nobody notified. Unit tests cover bounds, pitch and same-pitch overlap failures through both the sealed command path and the fully validated inline path, at every size.
- **Undo/redo:** exact JSON equality of every reachable state through undo and redo chains at 16, 500, 5,000 and 10,000 notes. Natively: 2 × undo + 2 × redo exact at 10,000 notes, and acknowledgement undo/redo in CANVAS.
- **No mutation of history or saved base:** every captured snapshot keeps its JSON and stays deeply frozen after the whole chain; `session.base` and the repository base are unchanged.
- **Untouched notes and identities:** after each edit every note outside the edited set deep-equals its previous value; note IDs and order are unchanged.
- **Unknown metadata:** entity-, data- and note-level unknown fields survive edits, save and reopen.
- **Validation is never bypassed:** non-sealed values (inline transforms, settings, recovered or imported drafts) are fully validated. Sealing requires `editableMotif` to have passed. Tests show that a validated-then-mutated value and a frozen-but-unsealed value are both re-validated.
- **Persistence and recovery:** save/reopen exact at all sizes (unit) and at 5,000 and 10,000 notes (native). Stale-save conflict on a 5,000-note draft keeps the draft, history and a recovery copy (unit). The native external-change conflict blocks Save, the recovery copy survives a cold restart, and the 10,000-note save is intact after restart (notes SHA-256 `458b2190…`).
- **MIDI determinism:** two exports are byte-identical, and the 4G and 4H builds export the same bytes (G).

## G. MIDI export improvements

- **Export summary** (`arrangement/export-summary.ts`, CANVAS export dialog):
  - From the exported bytes' MThd header: file format, track count and PPQ.
  - From the compiled arrangement that was serialised: tempo (BPM), meter, lanes containing notes, empty lanes not exported, note count, length (bars, m:ss, end position), where the last note ends, and per-lane channel allocation (explicit or automatic, percussion).
  - Unreadable fields are omitted. Natively, every summary field matched the independent parse (`verify-midi.py`): Type 1, 960 PPQ, 3 tracks, 43 notes, end-of-track 122880, last note-off 23040 = 7:1:0.
- **REAPER guidance** (`ui/daw-guidance.ts`): collapsed "Importing into REAPER" with four steps.
  - It quotes the labels captured in the 4G isolated check: "MIDI File Import", "Expand 2 MIDI tracks to new REAPER tracks" (with the number filled in from this export) and "Import MIDI tempo map to project tempo map". It ends with a check against this export's tempo, meter, lane count and last note.
  - It states that it was verified with REAPER 7.84 on Linux, where both options were unticked by default, and that other versions may differ. The REAPER menu path was not captured, so it is not named.
  - MOTIF exports show the same guidance without the expand step.
- **Composition end:** when the last note ends early, the summary explains that every track ends at the composition end and that REAPER sizes the item to its last note, with exact positions. Nothing is added to the file.
- **Diagnostics (§6.5):** `COMPILE_HELP` adds why export cannot proceed and what resolves it for changed, unreviewed, missing, archived, unsupported and inexact sources and for the external composition conflict, plus the affected clip's lane and position. Compiler messages and codes are unchanged.
- **Serialization unchanged:** `git diff a473533 -- src/midi src/music src/arrangement/{compiler,compiled,export,preparation}.ts` is empty. Golden fixture `85c8ecf3…` is byte-identical (unit test plus SHA-256), the Python verification passes 10/4, and the native same-process export of the same saved composition is `83d8f48b…` from both the 4G and the 4H build.

## H. Interface refinements

- **Source-review dialog:**
  - **Order:** Summary (revision status, affected clips and lanes, length per repetition, status, blockers, *Open motif in MOTIF*) → *Changes* (collapsed; recorded before/after, "not recorded", timing) → *Affected placements* (open for 8 or fewer; columns Lane, Clip, Position, Repetitions, Duration before, Duration now, Eligibility) → *Technical details* (collapsed: UUID, paths, full SHA-256, raw ticks).
  - **Actions:** a sticky footer in normal flow holds *Acknowledge this source for all N eligible clips* / *Confirm acknowledgement* / *Back to review* and an explicit *Close review*. Natively the acknowledge button was visible without scrolling at 1366, 980 and 680 px, after scrolling, and in the light theme.
  - **Width and narrow layouts:** MNEMOBARD's own dialogs use an 880 px `--dialog-width`, set on their own `modalEl`. In narrow layouts each placement value carries its column name.
  - **Protections unchanged:** one motif at a time, one undo transaction, all-or-nothing, revalidation, unsaved-MOTIF and conflict blocking, no save, no multi-motif acknowledgement, no note-by-note history.
- **MOTIF toolbar:** labelled groups *Grid and drawing* · *Note editing* · *Zoom and navigation*, plus the *Transform notes* and *Roll gestures and keys* disclosures on one wrapping row. All 25 controls stay reachable at 1366, 980 and 680 px. Keyboard shortcuts and command semantics are unchanged, and the roll gains about 77 px of height.
- **Musical terminology:** summaries use bars, beats, BPM, meter, repetitions and bar:beat:tick through the existing `musicalDuration`/`musicalPosition`; raw ticks sit in technical details.
- **Themes:** host variables only; dark (Obsidian) and light (Moonstone) captured. Obsidian's theme is restored after the run, never forced.
- **Narrow layouts:** no horizontal overflow in MOTIF, the review or the export dialog at 980 and 680 px; the roll keeps 601×382 px at 680 px; status and focus rings stay visible (keyboard Tab inside the review: `:focus-visible`, solid outline).

## I. Automated tests

- **Totals:** 631 tests / 49 files (608 / 47 before). 23 new:
  - `tests/motif-edit-ownership.test.ts` (13): frozen values; `jsonEqual` property test over 6,000 pairs plus fallbacks; sealed contract; per-size exactness, atomicity, undo/redo, history and base immutability, save/reopen and metadata at 16, 500, 5,000 and 10,000 notes; stale-save conflict; selection; key-order dirty; validator identity guard.
  - `tests/export-guidance.test.ts` (8): summary values; golden bytes unchanged; header omission; dialog structure (collapsed guidance and technical details, ending explanation, preserved controls); single-track guidance; diagnostic help coverage.
  - `tests/source-review.test.ts` (+1): hierarchy and order, default open states, footer actions, cell labels, cancel without effect.
  - `tests/motif-view.test.ts` (+1): toolbar groups contain every operation; add, transpose, undo and redo through the regrouped controls.
- **Changes to existing tests:** none removed or weakened. The test Obsidian `Modal` stub gained `modalEl`, as the real API has.
- **Failures and resolutions** (`retries.json`): freezing all command results broke two existing tests that mutate command output. That was a real contract change, so the design was changed (H05), not the tests. Other failures were harness mistakes.
- **Final run:** `pnpm check` (typecheck, ESLint, Vitest, production build) passes; audit clean.

## J. Native Obsidian validation

- **Host:** isolated Obsidian 1.15.0 (Electron 43.8.7, X11) on the disposable `dev-vault`; every CDP evaluation verifies that vault.
- **Workflow:** `scripts/mnemobard-4h-native.mjs` (part 1) and `--verify-restart` after a real cold restart. All 40 steps and step 33b passed, with **0 renderer exceptions** in both phases.
- **Fixtures:** the 4F Night procession fixture (restored byte-for-byte at the start) and two disposable large motifs (5,000 and 10,000 notes).

| Steps | Result |
|---|---|
| 1–3 | PATCHBOOK "Night choir" → *Open in MOTIF* → "Ascending choir"; toolbar groups present |
| 4–8 | Velocity 74 → 101; Undo → 74 and clean; Redo; saved; reopened from a fresh leaf: 101, clean |
| 9–14 | 5,000 notes open 61 ms; select + *Next note*; move 21.9 ms, resize 19.0 ms; both undone, draft equals the saved notes and is clean |
| 15–19 | 10,000 notes open 94 ms; commit median 32.3 ms; 6 repeated edits; 2 × undo/redo exact (3 reachable entries); saved and reopened identical, clean |
| 20–23 | "Source review required · 1 motif"; summary/sections/placements as in H; footer visible at all widths, after scrolling and in light; keyboard focus visible |
| 24–26 | Confirmed in place (focus on *Confirm acknowledgement*); +1 history entry; Undo restored 2 pending placements; Redo re-acknowledged |
| 27–33 | Compiled; summary matches the independent parse; REAPER guidance collapsed by default; two exports byte-identical; golden unchanged |
| 33b | Same saved composition exported by the 4G build and the 4H build in one process: both `83d8f48b…` |
| 34–36 | External edit with an unsaved marker → Save refused, compile blocked with the §6.5 explanation, disk note kept, recovery copy holds the cue |
| 37–38 | Cold restart: recovery listed ("816 checkpoints · showing 1–100") and intact; composition, MOTIF edit and 10,000-note save intact; compiles |
| 39 | Light theme (Moonstone) for MOTIF, review and export; MOTIF at 1366/980/680 px without overflow, all controls reachable |
| 40 | 0 renderer exceptions (part 1 and restart) |

**Screenshots** (`output/mnemobard/milestone-4h/`): `01`–`16` as required, plus `12b-conflict-export-diagnostic`, `15b-light-source-review` and `15c-light-export-summary`.

**Regression suites** in fresh processes (`regressions/`), all passing with counts identical to 4G: 4E CANVAS 18 + 2 (export byte-identical to its 4D baseline), MOTIF 7 + 12, MOTIF-MIDI 11 + 5, PATCHBOOK assets 6 + 6, Foundation 11.

## K. Known issues

| Issue | Class |
|---|---|
| Undo depth at 10,000 notes is about three steps: the unchanged 16 MiB estimate counts each entry's full before and after, although 4H snapshots are shared (pre-existing behaviour, measured) | Deferred (H07) |
| 100-note move on a 10,000-note motif: 45–53 ms median across two runs under the conservative harness boundary, p95 up to ~85 ms with occasional long tasks | Non-blocking |
| REAPER guidance verified only with REAPER 7.84 on Linux; the REAPER menu path to insert media is not named | Non-blocking |
| DAWs still show the imported item ending at the last note (explained, file unchanged); an opt-in end marker is a product decision | Deferred |
| `snapshot`, history entries and sealed results now throw on write; any future code needing a writable value must take `draft` or the default command path (documented in CLAUDE.md) | Non-blocking |
| Benchmarks, profiles and the native workflow leave recovery checkpoints and two disposable large motifs in the dev vault (never deleted by design) | Non-blocking |
| Pre-existing typo in the MOTIF note register ("up to50 rows"), noticed but left alone because it is out of 4H scope | Non-blocking |

No blockers.

## L. Recommended next milestone

The smallest logical step: **undo budget accounting for shared snapshots, plus the DAW end-marker decision.**
- **Undo budget:** count each frozen snapshot once in the history budget (a measured, opt-in behaviour change), so very large motifs keep a useful undo depth, with tests that keep the 100-entry bound and memory ceiling.
- **End marker:** decide, as a product question, whether to offer an explicit, opt-in arrangement-end marker in MIDI exports. It would be off by default, with golden fixtures for both modes.

Not started.

## M. Git status

- **Commit:** one local, GPG-signed commit on `main` on top of `a473533`, using the existing signing configuration. The hash is given in the final summary and in `git log`.
- **Nothing was pushed**, published or released.
- **Changed source:**
  - `application/{document-session,history-session}.ts`; new `application/{freeze,json-equal}.ts`
  - `modules/motif/{commands,session,view,piano-roll,inspector,transform-panel,midi-dialog}.ts`
  - `modules/canvas/{source-review-modal,export-dialog,performance-panel}.ts`
  - new `arrangement/export-summary.ts`, `ui/daw-guidance.ts`
  - `styles.css`
- **Tests:** two new files, two extended, plus the `Modal` stub.
- **Scripts:** new `mnemobard-4h-edit-profile.mjs` and `mnemobard-4h-native.mjs`; `mnemobard-4g-benchmark.mjs` gained an output-directory override.
- **Docs:** ARCHITECTURE, DECISIONS (H01–H14), DESIGN_DIRECTION, RISKS, ROADMAP, DEVELOPMENT, this report, `docs/validation/milestone-4h-native.json`, CLAUDE.md, AGENTS.md, progress.md.
- **Working tree:** clean after the commit. `output/` and `dev-vault/` content are ignored evidence and fixtures.
