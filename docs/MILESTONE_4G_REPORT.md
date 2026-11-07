# Milestone 4G Report — Source-Revision Review, Large-MOTIF Responsiveness & DAW Interoperability

**Verdict: PASS WITH QUALIFICATIONS.** Every 4G completion criterion is met and verified. The qualifications are stated, not hidden:

- **REAPER item length.** REAPER sizes imported MIDI items to their last note, so the composition's trailing silence and final boundary are not shown as item length. The file does carry its end-of-track at the right tick.
- **REAPER import defaults.** REAPER's default import settings merge every track onto one track; separate tracks need two options ticked explicitly.
- **Large-motif edits.** Committing an edit to a 10,000-note motif still takes about 93 ms.

Agent: Claude Code. Evidence is in `output/mnemobard/milestone-4g/` (git-ignored) and the summary is in `docs/validation/milestone-4g-native.json`.

## A. Executive summary

**What was implemented**

- **Source-revision review.**
  - CANVAS now has **Review changed sources**: one saved motif at a time, its last acknowledged revision against the current saved one, every affected placement, and one explicit, confirmed **acknowledgement for all eligible clips**.
  - It is a single undo step and never saves. It is all-or-nothing, and it is revalidated against the motif file on disk immediately before committing.
  - It is reachable from a compact banner, the arrangement and compile diagnostics, and the clip inspector. Acknowledging a single clip still works as before.
- **Large-MOTIF responsiveness.**
  - Profiling showed the piano roll was not the cost. The dominant costs were a second, YAML-based parse of every motif's JSON (used only to detect duplicate keys), an O(n²) note lookup on save, and repeated full copies of large motifs for status, listing and selection checks.
  - Fixing these made a 5,000-note motif open in **70 ms** (warm) / **114 ms** (cold, new pane) instead of 280 / 437 ms, and save in **280 ms** instead of 1,335 ms.
  - Note selection now takes **2.8 ms** instead of 21 ms.
- **Performance budgets.**
  - A native benchmark covers MOTIF at 16, 500, 5,000 and 10,000 notes, CANVAS at 4/20, 16/200 and 32/1,000 lanes/clips, and PATCHBOOK, with cold/warm opens and browser-observed long tasks.
  - A comparison script fails when a median grows by more than 25% *and* by more than 5 ms, against a baseline measured on the same machine.
- **REAPER interoperability.**
  - Tested in a REAPER 7.84 instance with a **disposable configuration**: `-cfgfile` and `-newinst`, both documented in the binary's own usage text. A metadata-only digest of the personal `~/.config/REAPER` was unchanged.
  - With REAPER's "Expand tracks" and "Import tempo map" options ticked, **every note matched the independent parser exactly** for Night procession and for a 96 BPM 6/8 probe: tick, duration, channel, pitch and velocity. Tracks, tempo and meter, repetitions and simultaneous notes were all correct.
- **Usability.**
  - Musical duration labels ("2 bars / repeat"), with raw ticks kept in tooltips and advanced detail.
  - Compilation status that names what blocks compiling.
  - PATCHBOOK keeps its association summary visible, read-only, while a patch is edited.

**What passed**

- **Tests:** 608 tests in 47 files (589 / 44 before), typecheck, lint, production build and the dependency audit.
- **MIDI:** golden MIDI `85c8ecf3…` unchanged; independent Python verification 10 valid / 4 rejected.
- **Native workflow:** all 40 steps plus native race checks, including a cold restart, with 0 renderer exceptions.
- **Native regression suites:** 4E CANVAS, MOTIF, MOTIF-MIDI, PATCHBOOK assets and foundation, all first-attempt passes.

**What remains:** see L and M.

## B. Baseline

| Item | Value |
| --- | --- |
| Branch / HEAD | `main` at `3fb5113` ("feat: Milestone 4F …"), GPG signature good (`G`), on 4E `295005f` |
| Working tree | Clean at start; no unexplained changes |
| `pnpm check` | 589 tests / 44 files pass; typecheck, lint, build pass |
| Golden MIDI | `tests/fixtures/arrangement-single.mid` SHA-256 `85c8ecf39936d1de7612f65d17d3df2f4599472cda8027096bced1c93bb3ab77`; `scripts/arrangement-fixtures.mjs`: Python 10 valid / 4 rejected |
| Audit | `pnpm audit`: no known vulnerabilities |
| Environment | AMD Ryzen 7 5700G (16 threads), 28 GiB, Linux 7.3.1-1-cachyos; Obsidian 1.15.0 / Electron 43.8.7 / Chrome 150; Node 26.13.0; REAPER 7.84-1 (Arch package) |

All six values match the 4F report.

**Discrepancies between earlier reports and the code**

1. **Cause of slow large-motif opening.** The 4F report put it down to a "pre-existing piano-roll cost". Profiling contradicts that: drawing and viewport culling are negligible, and the cost was in parsing and copying (F).
2. **Markers in exported MIDI.** `PRODUCT_SPEC` AC-05 lists markers among what a parser and a DAW must agree on. Since 4C, markers and sections are deliberately not written to MIDI (the export dialog says so), so 4G did not verify markers.
3. **Earlier REAPER entry.** The 4F entry "REAPER not run" is superseded by section H.

## C. Source-revision review

**Model.** A clip already records the saved motif revision it last acknowledged: `sourceRevision`, a SHA-256 of the saved note, plus `sourceTitle`, `sourcePath` and `reviewedLengthTicks`.

- **No schema change.** The batch review writes exactly these existing fields; no new field and no migration.
- **Compilation.** It still requires every clip's acknowledged revision to equal the current one (the 4B rule).

**Data flow (all planning is pure; the UI is separate from mutation)**

1. **Planning.** `arrangement/source-review.ts#sourceReview(composition, catalog, unsavedMotif, keep?)` groups, per stable motif UUID (case-insensitive), the clips whose acknowledged revision is not the current saved one, including never-reviewed clips.
   - For each group it computes:
     - the previous revision(s), title, location and per-repetition length;
     - the current per-repetition length, via the existing exact `sourcePeriod`;
     - each placement's before/after duration, its end, and its eligibility.
   - It reuses the established `SourceCatalog`; no second reference index.
2. **Token.** `reviewToken(item, baseSource)` freezes exactly what was reviewed:
   - the motif UUID and current revision;
   - each clip's id, lane, start, repetitions and previous revision;
   - the composition's saved-base text.
3. **Commit.** `CanvasLibrary.reviewAll(session, token)` revalidates, then performs **one** `session.edit(…)` with `canvas/commands.ts#acknowledgeSourceClips(composition, token, source)`.
   - It refuses unless the clips currently out of date for that motif are *exactly* the reviewed ones (same lanes, positions, repetitions and previous revisions).
   - Each placement is re-checked with the same `checkedPlacement` rule as single-clip acknowledgement, then `reviewFields(source, period)` is written.
   - Nothing else changes: not notes, source, position, repetitions, lane nor routing.
4. **Compilation.** The acknowledgement is a musical edit (clip review fields are part of the compiler input), so any compilation is invalidated and must be recompiled. The status then reads "Ready to compile".

**Eligibility and blocking (all-or-nothing per motif).** A motif's batch is blocked, with an explanation, when any of these hold:

- the source is missing, duplicated (ambiguous UUID), malformed, unsupported (schema or timing map), archived, or not a motif;
- its timing cannot be converted exactly (PPQ / length / note endpoints);
- **MOTIF holds unsaved edits to it** (stricter than single-clip review, which only warns; see Z03);
- **any** affected placement would end after the composition with the new length.

There is no silent partial acknowledgement. The dialog explains that the remaining clips can be fixed, or reviewed one at a time in the inspector.

**Stale-state protection (§9).** `reviewAll` checks the following before and after its asynchronous part. Any failure stops the batch with an explanation, and nothing is acknowledged.

- the editor is still open;
- no unsaved MOTIF draft of the motif exists;
- the composition's freshness is not `checking`, `conflict` or `unavailable` (an external change);
- the composition's saved base is unchanged (no save or reload in between);
- **the motif note re-read from disk hashes to the reviewed revision**, which catches a change the index has not seen yet;
- the in-memory catalog agrees;
- the reviewed placements are exactly the current ones.

The dialog also re-renders live on every index or draft change, and withdraws an open confirmation if its reviewed state changed.

**UI**

- **Banner.** A compact banner appears only while placements await review: "N saved source(s) have changed or are unreviewed · acknowledge before compiling", with a **Review changed sources** button.
- **Other entry points.**
  - arrangement diagnostics rows (`changed` / `unreviewed`);
  - compile diagnostics (`source-changed` / `source-unreviewed`);
  - the inspector's *Review saved source*, as "Review all placements of this motif (N)".
- **Dialog contents:**
  - the changed sources;
  - for the selected one: its stable identity (collapsed), a before/after table (D), timing compatibility, any blockers, and the affected placements;
  - placements show lane, clip, bar:beat:tick position, repetitions, before/after musical duration and status, with raw ticks in row titles and a collapsed "Raw ticks (advanced)".
- **Action.** **Acknowledge this source for all N eligible clips** → a confirmation stating exactly what is and is not changed → **Confirm acknowledgement**.
- **Modal guard.** The dialog opens through the existing `openModal` guard.

## D. Revision comparison

| Field | Last acknowledged | Current saved |
| --- | --- | --- |
| Revision | Fingerprint(s) (short; full SHA-256 in the tooltip), or "never reviewed" | Fingerprint |
| Name, note location | Recorded `sourceTitle`, `sourcePath` | Index title and path |
| Length per repetition | Recorded `reviewedLengthTicks`, as a musical duration | Exact converted period |
| Notes, PPQ, tempo/meter, note range | **"not recorded"** | Note count, PPQ (noting exact conversion to 960), tempo/meter, earliest–latest note |

**What cannot be compared.** Only the previous revision's fingerprint, name, location and per-repetition length were ever stored; its notes never were. The dialog says so ("a note-by-note comparison is not possible") and offers **Open motif in MOTIF** for the current notes. No history database was added (Z04).

**Durations.** Per placement, the previous duration is the recorded period × repetitions and the new duration is the converted period × repetitions. Both are shown only when calculable.

## E. Undo/redo and persistence

**Unit tests** (`tests/source-review.test.ts`, 9 tests, plus a view-level test in `tests/canvas-view.test.ts`):

- **One step.** Acknowledging 5 placements across 2 lanes (4 on one lane) adds exactly one history entry.
- **Undo/redo.**
  - Undo restores the draft exactly (deep-equal), with all 5 placements pending again.
  - Redo re-acknowledges them.
  - Save → reopen shows them persisted.
  - The composition holds no note data, and the motif note's bytes are unchanged.
- **1,000 placements** of one motif (the schema maximum) are acknowledged in one edit, and Undo restores all 1,000.
- **Pure command** (input unchanged):
  - moves, repetition changes, deletion, duplication, retargeting or prior acknowledgement during review → refused;
  - a changed source revision → refused;
  - other motifs' clips are untouched.
- **Revalidation:**
  - a disk change before the index notices, an unsaved MOTIF draft, a composition save in between, and an external conflict → each refused, with nothing acknowledged;
  - Save stays blocked during the conflict;
  - a recovery copy is readable from a newly constructed library.

**Native** (section K, steps 15–31):

- **Confirm** added one history entry; the banner disappeared and the status became "Ready to compile".
- **Undo** brought the review back (2 placements, "Source review required · 1 motif"); **Redo** re-acknowledged.
- **Recompile → export:** byte-identical, independently verified.
- **Save → close → reopen:** byte-identical, clean, every placement on the current revision.
- **External note edit with an unsaved marker:** protected conflict, Save refused, disk untouched, recovery copy stored.
- **Cold restart:** the recovery copy is listed and intact, the acknowledgement is still current, and the composition compiles.

## F. MOTIF performance

**Profiling first** (`scripts/mnemobard-4g-profile.mjs`: phase timing plus a CDP sampling CPU profile at 100 µs; non-minified build; same host).

Phases of a 5,000-note open, baseline median:

| Phase | Time |
| --- | --- |
| Raw vault read | 2.9 ms |
| `repository.read` (parse + validate) | **138.9 ms** |
| Library open (session init) | 166.2 ms |
| Full view open | 261 ms |

**Findings**

- **The duplicate-key check was the biggest single cost.** Every motif/composition note was parsed twice: `JSON.parse`, then a full YAML JSON-schema parse used only to detect duplicate keys. That was about 43% of open time and dominated save.
- **Full clones of the large motif:**
  - `index.resolve()` copied the whole entity just to read a status (MOTIF `updateStatus`, `repository.read`, `repository.create`);
  - `motifs.items()` copied **every** motif (all their notes) on each library render and index publish;
  - the view and its panels each took their own `session.draft` copy per render and publish;
  - `MotifSession.select()` copied the draft to validate ids;
  - the attach subscriber serialised the whole draft on every publish.
- **The note register** re-serialised all notes for its change signature and re-sorted them on every selection; `navigateNote` sorted on every step.
- **Save:** `retainExtensions` looked up each note's previous version with `Array.find`, which is O(n²) and took ~370 ms at 5,000 notes.
- **The piano roll** (viewport culling via `NoteIndex`, drawing) was already cheap: zoom and scroll take ~0.5 ms at every size.

**Optimizations** (least complicated first; no new framework, no persistence or format change):

1. **Duplicate-key scan.** `storage/json-keys.ts#duplicateJsonKey`, a linear scan of text `JSON.parse` has already accepted (keys compared after decoding), replaces the YAML pass.
   - An equivalence test against the old detector covers 200 generated payloads.
   - It rejects exactly the duplicate-key documents the old pass rejected; see Z09 for the edge relaxation.
2. **`retainExtensions`** uses an id → item map, with the first occurrence winning as `Array.find` did.
3. **`EntityIndex.locate()`** gives the same classification as `resolve()` without copying the entity; used for status/path checks.
4. **`MotifLibrary.listing()`** lists rows from index scalars; `items()` is unchanged for its callers and tests.
5. **One draft snapshot per render or publish,** shared by every MOTIF panel. Signatures and caches are keyed by the session's `changeVersion`, which increments on every edit, undo, redo and reload, rather than by serialising the draft. Concretely:
   - the register signature and cached sorted order;
   - navigation order;
   - `MotifSession.select()` validity, via a protected non-copying `peek()`;
   - a status cache with an explicit `force` after a discarded form.
6. **`HistorySession.dirty`** caches the saved base's canonical text per base.
7. **`DocumentSession.draftTitle`** for draft lists, and leaving a disposed session no longer computes `dirty`.

**Results** (warm open; full table in `performance-comparison.md`)

| Notes | Open before → after | Save before → after |
| --- | --- | --- |
| 16 | 58.8 → 17.9 ms | 161.6 → 52.7 ms |
| 500 | 68.8 → 23.1 ms | 261.3 → 77.2 ms |
| 5,000 | **279.8 → 70.0 ms** (cold, new pane: 437 → 114) | 1,335 → 280 ms |
| 10,000 | 550 → 133 ms | 2,844 → 500 ms |

At 5,000 notes:

| Interaction | Before → after |
| --- | --- |
| Note selection | 21 → 2.8 ms |
| Navigation | 31 → 4.3 ms |
| Drag/resize commit | 83 → 49 ms |
| Undo | 63 → 22 ms |

**Target met:** the 5,000-note open is below 150 ms, and 16 and 500 notes improved.

**Correctness of the optimizations**

- `tests/motif-performance.test.ts` (2,000/3,000 notes):
  - the register, selection and musical-order navigation stay exact across delete, undo, redo and save;
  - saved notes deep-equal the original (none lost, reordered or altered);
  - a selection-only change makes zero draft copies once warm;
  - `listing()` equals `items()`, including ambiguity;
  - `locate()` equals `resolve()` without the entity;
  - per-note extension fields survive reordering and removal.
- Natively, steps 32–35 deleted and undid on the 5,000-note motif, and the draft matched the saved record exactly.

**Remaining bottleneck.** Each edit validates the whole motif, copies it for history and subscribers, and canonicalises it once for the dirty check. At 10,000 notes a drag/resize commit takes about 93 ms, above the 50 ms long-task threshold. These are the established atomic-validation and immutable-snapshot guarantees; going further needs structural sharing or incremental validation, which is out of 4G's scope.

## G. Performance budgets

**Harness.** `scripts/mnemobard-4g-benchmark.mjs <label>` writes `performance-<label>.json`.

- Synthetic records are tagged and deleted afterwards; recovery checkpoints are not touched.
- Each sample yields first, so browser `longtask` entries attribute to operations.
- The environment is recorded.

**Workloads**

| Module | Sizes | Measured |
| --- | --- | --- |
| MOTIF | 16 / 500 / 5,000 / 10,000 notes | Cold open (new pane) / warm open / first useful render / selection / navigation / drag / resize / zoom / scroll / undo / redo / save |
| CANVAS | 4×20, 16×200, 32×1,000 | Cold / warm open, clip selection, drag, zoom, scroll, source-resolution refresh, compile, save, **batch acknowledgement and its undo** |
| PATCHBOOK | 30 instruments / 15 chains / 50 patches | Search, filter, select with reverse references, reverse-reference resolution, navigation to MOTIF |

**Regression mechanism.** `scripts/mnemobard-perf-compare.mjs <baseline> <candidate> [--ratio 1.25] [--floor 5]` exits 1 when a median grows by more than 25% **and** by more than 5 ms.

- It compares only runs from the same machine and method; it is never part of `pnpm check`.
- It caught a single-sample cold-open artefact during this milestone. A same-host A/B against the 4F build showed no product regression; 5-sample cold opens are now used.
- 4F (v2) vs 4G (v2): **no regressions**.

**Long tasks (browser-observed)**

| Workload | 4F | 4G |
| --- | --- | --- |
| MOTIF 5,000 open | 30, max 256 ms | 15, max 83 ms |
| MOTIF 5,000 edit | 19, max 89 ms | 1, max 50 ms |
| MOTIF 5,000 save | 16, max 528 ms | 10, max 111 ms |
| MOTIF 10,000 save | max 1,304 ms | max 227 ms |
| MOTIF 16 / 500 | Some up to 165 ms | **None** |

All are real Obsidian main-thread tasks. The harness's own record setup falls in the same windows, so counts are upper bounds.

## H. REAPER interoperability

**Status: completed in an isolated REAPER environment** (REAPER 7.84-1, evaluation licence, Linux). It was not completed manually by the user.

**Isolation**

- `reaper -newinst -nosplash -cfgfile <repo>/output/mnemobard/milestone-4g/reaper/<run>/isolated-config/reaper.ini <probe>.lua`.
- `-cfgfile` ("use full path for alternate resource directory") and `-newinst` come from the installed binary's own usage text.
- Guards in `scripts/reaper-isolated-check.mjs`:
  - it refuses if any REAPER process is running;
  - the configuration must be inside this repository's `output/`;
  - it takes a metadata-only digest (names, sizes, mtimes, never contents) of `~/.config/REAPER` before and after.

Result: the digest is identical (`76bb9b32…`) before the first REAPER launch, after every completed run, and afterwards. It therefore also covers one probe run whose harness timed out; that instance was stopped by PID after its command line was checked. REAPER wrote its whole resource directory into the disposable folder (kept: `reaper.ini`, `reapack.ini`, the probe script and its results). The REAPER project was never saved, and the process was stopped at the end.

**Files**

| Label | File | SHA-256 | Shape |
| --- | --- | --- | --- |
| night-procession | `MNEMOBARD/Exports/night-procession-4g-1794088232392-a.mid` | `8871eacb…` | Type 1, 960 PPQ, conductor + Choir + Pulse, 46 notes, end-of-track 122880 |
| probe-96bpm-6-8 | `…/reaper-probe-96bpm-6-8-1794088749981.mid` | `dea95f95…` | Made with MNEMOBARD's own compile/export from the same saved motifs at **96 BPM, 6/8**, because 120 BPM 4/4 equals REAPER's defaults and would prove nothing; 32 notes, end 23040 |

**Import options matter (recorded).**

- REAPER's "MIDI File Import" dialog offers "Expand 2 MIDI tracks to new REAPER tracks" and "Import MIDI tempo map …", **both unticked by default**. A second dialog defaults to "Multichannel item on a single track".
- **With defaults** (run A, `reaper/run-a-defaults/`), REAPER merged both note tracks into one item (46 notes) and kept its own 120/4/4. That is a DAW import preference, not a malformed file; REAPER correctly detected 2 MIDI tracks.
- **Final runs:** the harness ticked both options by keyboard; the `…-options-chosen.png` screenshots show both ticked.

**Results with both options ticked** (`reaper/comparison.json`)

| Check | Night procession | Probe |
| --- | --- | --- |
| Accepted | Yes | Yes |
| Track separation | Choir, Pulse | Choir, Pulse |
| Tempo / meter marker at 0 | 120, 4/4 | **96, 6/8** (ruler, transport and master tempo envelope) |
| Notes vs independent parser | **identical** (30 + 16) | **identical** (20 + 12) |
| Channels | 1 / 2 | 1 / 2 |
| Repetitions | ×2 + ×1 and ×4 expanded at the right positions | ✓ |
| Simultaneous notes | 6 shared onsets retained | 4 retained |
| Item extent | 0–24 QN and 0–16 QN | 0–20 and 0–12 QN |

"Identical" compares start and end tick (exact at 960 PPQ, no fractional QN), channel, pitch and velocity.

**Trailing silence and final boundary.** The file ends every track at the composition end (122880 / 23040 ticks, independently verified). REAPER 7.84 sizes each imported item to its last note-off, so the trailing silence and the 32-bar boundary are not represented as item or project length. This is REAPER's import behaviour; the serializer was **not** changed (§7.5, Z13).

**Event counts:** source 46 notes → compiled 46 → serialized 46 note-ons → REAPER 46.

**Evidence:** `17-reaper-import-tracks.png`, `18-reaper-midi-editor.png` (Pulse take: 16 notes, C2 C2 G2 C2 ×4), `19-reaper-tempo-meter.png` (probe at 96 / 6/8), the import-dialog captures, `reaper-evidence.json` per run, and `comparison.json`.

**Limitations**

- The isolated REAPER showed its first-run dialogs: ReaPack "Manage repositories", "Error opening devices" (no JACK server), and a "New Version Notification". The harness accepted each default button.
- **REAPER contacted its update server** (its own version check), and ReaPack has its default repositories configured. Nothing was installed (`autoinstall=0`), and no MNEMOBARD data was sent.
- The audio system was not pre-configured: I could not verify a documented ini value for "Dummy Audio".
- Interoperability is verified only for REAPER 7.84 on Linux with these import options.

## I. UI refinements

- **Musical durations** (`music/durations.ts#musicalDuration`). Exact, meter-aware output: "2 bars", "1 bar 2 beats", "3 beats 240 ticks"; 6/8 counts eighths; never rounded.
  - The raw tick count is returned unchanged when a beat is not a whole number of ticks.
  - Used for the timeline label ("2 bars / repeat"), the inspector's review lines (raw ticks in the tooltip) and the review dialog.
- **Compilation status** in the transport:
  - "Ready to compile";
  - "Compiled · matches the saved composition" / "Compiled · matches this unsaved draft";
  - "Stale · compile again";
  - "Source review required · N motif(s)" (also "Stale · Source review required …");
  - "Not ready · fix arrangement errors";
  - "Composition changed elsewhere · resolve before compiling";
  - "Compile failed · see diagnostics".

  Details stay in the expandable diagnostics.
- **Source-review visibility.** One banner (only when needed) and one dialog; buttons in diagnostics rows, the inspector and compile diagnostics open the same dialog. Single-clip acknowledgement is unchanged.
- **Dense and narrow layouts.**
  - The review dialog's tables wrap to two columns below 700 px.
  - Natively, there is no horizontal overflow at 1366, 980 or 680 px, and the timeline keeps the full content width.
  - Tokens come from the host theme only; dark and light themes were captured; there is one focus ring.
  - No redesign; dark mode is not forced.
- **PATCHBOOK edit mode.** The saved "Motifs using this patch · N" summary stays visible as a collapsed, read-only section while editing, with no navigation buttons, so nothing can leave the form or risk the draft. A native check and a unit test cover it.

## J. Automated tests

**608 tests / 47 files pass** (589 / 44 before; **+19 tests, +3 files**). No test was removed and no assertion weakened.

| File | Tests | Covers |
| --- | --- | --- |
| `json-keys.test.ts` (new) | 4 | Nested duplicates, decoded-key equality, keys vs values and escaped quotes, 200-payload equivalence with the old YAML detector, motif note rejection |
| `motif-performance.test.ts` (new) | 4 | Cache correctness across delete / undo / redo / save; zero copies on selection; `listing` = `items`; `locate` = `resolve`; extension retention |
| `source-review.test.ts` (new) | 9 | Grouping across and within lanes; one motif only; the pure command; every stale case; every blocking source state; incompatible PPQ; unsaved MOTIF; mixed eligibility; renamed source; one undo step; undo / redo / save / reopen; no source writes; 1,000 placements; the dialog flow including withdrawal of a stale confirmation; durations in 4/4, 3/4 and 6/8 |
| `canvas-view.test.ts` | +1 | Banner, diagnostics button, status vocabulary, dialog acknowledgement, undo/redo through `CanvasView` |
| `navigation.test.ts` | +1 | PATCHBOOK read-only associations in edit mode |

**Also verified:**

- typecheck, ESLint, production build;
- `pnpm audit` (no known vulnerabilities);
- golden MIDI hash unchanged;
- `scripts/arrangement-fixtures.mjs` (Python 10 / 4).

## K. Native Obsidian validation

**Run.** `scripts/mnemobard-4g-native.mjs` (part 1) and `--verify-restart` after a real cold restart. Disposable `dev-vault` only; every CDP evaluation verifies it. Both phases passed on the first attempt, with **0 renderer exceptions**.

| Steps | Result |
| --- | --- |
| 1–3 | PATCHBOOK → "Night choir" lists 1 motif; in edit mode the summary stays read-only (`11-…`) |
| 4–7 | Open in MOTIF → Open in CANVAS selects the motif's clip |
| 8–11 | A note added and saved in MOTIF → the banner and "Source review required · 1 motif" (`01-…`) |
| 12–14 | Review dialog: 2 placements (positions 1:1:0 ×2 and 5:1:0 ×1, before/after "4 bars"/"2 bars"); comparison with "not recorded" fields; timing exact; Tab focus ring inside the dialog (`02`–`04`, `15`) |
| §9 races | The saved motif changed while the confirmation was shown → withdrawn. Changed on disk right before Confirm → refused ("The saved motif changed during the review…"). Nothing acknowledged; bytes restored |
| 15–16 | Confirmed → +1 history entry, banner hidden, "Ready to compile" (`05`, `06`) |
| 17–19 | Undo → review state back; Redo → acknowledged |
| 20–23 | Recompiled "Compiled · matches this unsaved draft" (`07`). Inspector "2 bars per repetition" [7680 ticks] (`08`). Two exports byte-identical; Python verification: Type 1, 960 PPQ, 3 tracks, 46 notes (= expected and = compiled), end 122880, channels 0/1, ordered |
| 24–26 | Save → close → reopen: identical, clean, all placements on the current revision |
| 27–29 | External conflict → Save refused, disk kept, recovery copy holds the unsaved cue (`16`) |
| 30–31 | **After a cold restart:** recovery listed and intact; acknowledgement current; compiles |
| 32–35 | 5,000-note motif opened in 68.6 ms (`09`). Selection "5000 notes / 1 selected"; scroll to tick 600,339 (33 visible); zoom; ArrowDown in the note list; delete → 4,999 → undo → 5,000; notes identical to the saved record and clean (`10`) |
| 36–38 | No overflow at 1366 / 980 / 680 px (`12`); dark (`13`) and light (`14`) |
| 39 | 0 renderer exceptions in both phases |
| 40 | No personal vault touched (CDP guard; writes only under `dev-vault/MNEMOBARD`); the personal REAPER configuration's metadata digest was unchanged before and after |

**Regression suites** in fresh processes, outputs in `regressions/`, all first-attempt passes:

| Suite | Checks |
| --- | --- |
| 4E CANVAS | 18 + 2 (restart) |
| MOTIF | 7 + 12 |
| MOTIF-MIDI | 11 + 5 |
| PATCHBOOK assets | 6 + 6 |
| Foundation | 11 |

These match the 4F counts.

**Retries.** All are listed in `retries.json`. Every one was harness or environment: benchmark harness (3), REAPER harness (5, including a broken `xdotool` on the host), and test-expectation fixes (2). No product defect was found.

**Screenshots.** `13`/`14` show CANVAS in the external-conflict state (the clip inspector's review section open) rather than the review dialog: by then every source was acknowledged. The dialog itself is shown in `02`–`06`.

## L. Known issues

**Blockers:** none.

**Non-blocking**

1. **REAPER import defaults and item length.**
   - REAPER's import defaults merge tracks and ignore the tempo map; users must tick "Expand MIDI tracks" and "Import MIDI tempo map".
   - REAPER trims items to the last note, so the trailing silence and the arrangement end are not shown in REAPER.
   - Only REAPER 7.84 on Linux was verified.
2. **Large-motif edit commits.** About 93 ms at 10,000 notes (49 ms at 5,000), still above the long-task threshold at the largest size (F).
3. **Stricter batch rule.** Batch acknowledgement is blocked while the composition has an external-change conflict (even after "Keep working draft") and while MOTIF holds an unsaved draft of the motif (Z03, Z05). Single-clip acknowledgement keeps its previous rules.
4. **Duplicate-key check relaxation.** Valid-JSON owned blocks that only the YAML parser used to reject for YAML-specific reasons (for example implicit keys over 1,024 characters) are now accepted. Duplicate keys are still rejected (Z09).
5. **Benchmark residue.** Benchmark runs leave the recovery checkpoints of their synthetic drafts in `dev-vault/MNEMOBARD/Recovery/`. They were kept, per the rule never to delete recovery files.
6. **Limitations carried over from 4F:**
   - reverse references list saved records only;
   - a stale host `activeDocument` needs an application switch;
   - the `renameFile` wedge in long-lived dev processes was not seen in 4G.

## M. Recommended next milestone

A focused **"large-document editing" milestone**:

1. **Edit commit cost at 5,000–10,000 notes.** Structural sharing or incremental validation for MOTIF edits (history entries and subscriber snapshots without whole-draft copies), keeping atomic validation. Measure with the 4G budgets (target: drag commit under 50 ms at 10,000 notes).
2. **Product decision: carry the arrangement end into DAWs.** The options are documenting REAPER's import settings in the export dialog or a marker. Changing MIDI output would need explicit review.
3. **Multi-select batch review.** Acknowledging several motifs in one step is a product decision; 4G deliberately does one motif at a time.

Do not start it without approval.

## N. Git status

- **Commit:** a single local, GPG-signed commit on `main` on top of `3fb5113`, using the existing signing configuration. The hash is given in the final summary and in `git log`.
- **Nothing was pushed**, published or released.
- **Changed source:**
  - `storage/{document,index,repository,json-keys}.ts`
  - `application/{document-session,history-session}.ts`
  - `arrangement/source-review.ts`
  - `music/durations.ts`
  - `modules/canvas/{commands,library,inspector,performance-panel,timeline,view,source-review-modal}.ts`
  - `modules/motif/{inspector,library,patch-association,piano-roll,session,view}.ts`
  - `modules/patchbook/view.ts`
  - `styles.css`
  - `benchmarks/motif.ts` (constructor argument)
- **Tests:** three new files and two extended (J).
- **Scripts:**
  - `mnemobard-4g-benchmark.mjs`
  - `mnemobard-4g-profile.mjs`
  - `mnemobard-perf-compare.mjs`
  - `mnemobard-4g-native.mjs`
  - `reaper-isolated-check.mjs`
  - `x11-window-tool.py`
- **Docs:** this report, `docs/validation/milestone-4g-native.json`, DECISIONS (Z01–Z14), ARCHITECTURE, DATA_MODEL, ROADMAP, RISKS, DESIGN_DIRECTION, DEVELOPMENT, CLAUDE.md, AGENTS.md (authority line), progress.md.
