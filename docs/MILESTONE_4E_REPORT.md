# Milestone 4E Report — Document Freshness, Navigation Readiness & Regression Closure

Authority: Prompt012. Agent: Claude Code. Date: 2026-11-07. Signed baseline: `1e11155` (4D). 4E is **uncommitted** for human review.

## A. Executive Summary

**CONDITIONAL PASS.**

Confirmed fixes (unit-tested and verified natively on the final build):

- Open CANVAS compositions now stay fresh. A clean session refreshes from its note without an undo entry and keeps its selection by UUID. A dirty session is never modified: it gets a protected conflict with recovery choices. Malformed, future-schema, duplicate-UUID and deleted notes never replace the draft. A renamed note is followed by UUID.
- External changes respect the 4D musical/organizational split. Metadata-only changes keep the compilation **and** playback; musical changes stop playback and invalidate.
- Cross-module navigation has an explicit readiness contract:
  - completion is verified against the displayed UUID;
  - the latest request wins and earlier ones are superseded;
  - every navigation is bounded and fails with a meaningful message;
  - a development trace records event ordering.
- Legacy duplicate mirror links can be repaired explicitly and provably. The real 4C duplicate was repaired natively, and audio bytes were unchanged.
- **Section selection, the 4D regression, is fixed:** 15.3 → 5.5 ms on the large workload, measured in the same process against the signed 4D build. Most other structure operations got faster too.
- **A pre-existing defect surfaced by 4E is fixed:** every index publish cloned the whole vault, taking 127 ms. That stalled the audio scheduler, and its 4B safety guard stopped playback during external refreshes.

Why the pass is conditional:

- **MOTIF → PATCHBOOK intermittent failure:** not reproduced in any 4E run, including two cold starts. Its root cause remains unproven; it's now guarded rather than explained (§G).
- **Stale active window:** the guard's native refusal path is still unexercised, because the stale-host state couldn't be reproduced safely (§H).
- **PATCHBOOK → MOTIF and MOTIF → CANVAS** are not product navigation paths. Returning to those modules was verified as ordinary tab activation (X09).
- **Undo history:** a clean-session refresh resets the session's undo history.
- **Play pressed before a refresh:** pressing Play or Export in the instant between an external write and its refresh invalidates the compilation (fail-closed by design).

## B. Signed Baseline

- **Inspection:** inspected 31 pending 4D paths (including `progress.md`) against `docs/validation/milestone-4d-native.json`.
- **Validation:**
  - `pnpm check`: 538 tests across 41 files, plus typecheck, lint and build;
  - golden MIDI `85c8ecf3…ab77`;
  - Python fixture check: 10 valid, 4 rejections;
  - `pnpm audit`: 0 vulnerabilities.
- **Hygiene:** `dev-vault/` and `output/` are git-ignored; no secrets; TROUBADOUR mentioned only in a "not accessed" statement.
- **Discrepancies, recorded rather than edited** (4D evidence is preserved):
  - the 4D JSON lists `GENTS.md`, which is a truncated `AGENTS.md`;
  - `progress.md` was modified (only its 4D line) but not listed.
- **Commit:** `1e11155 feat: establish verified Milestone 4D canvas stabilization`, with a good EdDSA signature using the existing configuration. No push.

## C. Document Freshness Architecture

`CanvasFreshness` (`src/modules/canvas/freshness.ts`) is owned by `CanvasLibrary`. It subscribes to `EntityIndex` publishes and watches every session it creates.

1. **Detection.**
   - The index already re-reads a changed note and stores its SHA-256 revision.
   - The watcher compares that revision with a cached revision of the session's `base.source`. Timestamps are never used.
   - If they're equal and the path is unchanged, the state is `current`.
2. **Decision.**
   - The watcher calls `repository.read(id)`, which parses, validates the UUID and resolves duplicates, then validates the result with `editableComposition`.
   - `externalChanges(before, after)` names the changed areas and classifies them as musical using the same 4D `musicalInput` denylist. Unknown fields count as musical.
3. **Own Save vs external change.** Save marks the session `busy` while its own index publish arrives. The watcher skips busy sessions and re-checks when Save settles; the saved bytes then equal the base, so the state is `current`. If Save failed because of an external change, the re-check classifies it as `conflict`.
4. **Race protection.**
   - Each check takes a per-session generation and records the base it started from. Any async result is dropped if a newer check started, the base changed, or the session or library was disposed.
   - A renamed note publishes its removal before the new path is re-read; the watcher awaits `index.settled()` (the index's own queue) rather than a timer.
   - There is no global event bus, and no delay is used for correctness.
5. **States** are `current`, `checking`, `refreshed {areas, musical}`, `conflict {areas, musical, rename, kept?}` and `unavailable {reason, message, path?}`. They are ephemeral, live on `CanvasSession.freshness`, and publish like any session change.

## D. Clean Session Behavior

A valid external change is applied with the existing `HistorySession.reload()`:
- the session's base and draft are replaced together and the session stays clean;
- **no history entry** is added, but the existing history is reset because it described the previous note;
- clip and lane selection are kept by UUID (`CanvasSession.changed` no longer clears them on reload) and fall back safely when deleted;
- structure selection is kept by UUID, or cleared if its object is gone;
- the timeline, sections, markers, clip list, lanes, routing and recording references re-render;
- source status is re-evaluated (the plan key includes the index revision).

The indicator reads "Refreshed from the note · compilation kept" or "· compile again". The banner names the composition, the changed areas and the undo-history consequence, and retires on the next edit.

Native evidence:
- **B 8–12:** a section label rewritten externally while playing.
  - The selection was kept, `canUndo` was false, the compilation stayed ready with the new base adopted, and playback was **still playing** when the refresh published, with 0 stop calls.
  - Additional trials: `playback-during-external-refresh.json`, 3 of 3 playing with zero stops.
- **B 22:** three writes 15 ms apart converged on the latest note.

## E. Dirty Session Behavior

The draft, base, undo/redo history and recovery copies are never touched by the watcher.

**What you see:**
- **Indicator:** "Note changed elsewhere · your edits are kept · Save blocked".
- **Banner** (`role=alert`): the composition title, and a note when the change is a provable recording rename.
- **Choices, in this order:**
  - *Open composition Markdown*;
  - *Keep working draft* (collapses the banner);
  - *Store recovery copy and open recovery*;
  - *Review external changes* (areas, musical or not);
  - *Reload note version…* (destructive, so last). It needs explicit confirmation, stores a checkpoint first and aborts if that fails.
- Protected Save is unchanged: it refuses and stores a recovery copy.

**Native evidence (B 15–20):**
- The draft is unchanged and history length is preserved (1).
- Save showed "Not saved: The note changed elsewhere…", and the recovery file contains the unsaved edit.
- The recovery panel opened.
- The confirmed reload loaded the external notes and named the recovery copy.

**Invalid notes (B 21):**
- Malformed JSON gives `unavailable/invalid`; a future schema gives "Unsupported entity schema…".
- The draft byte-matches throughout, and the note is never rewritten.
- Restoring the bytes returns the state to `current`.

**Rename and deletion (B 23–24):**
- A note renamed in Obsidian is followed by UUID, and Save writes to the new path only.
- A deleted scratch composition keeps its draft and shows "Note unavailable · draft kept · Save blocked".
- Save refused, and the Compositions folder count dropped by exactly the deleted note (80 → 79); no replacement was created.
- After the note was restored with the same UUID, Save succeeded.

## F. Musical Invalidation

Compilation validity and persistence validity remain separate guarantees:

- **Clean external metadata change:** reload → `musicallyCurrent` → `adoptSavedBase()`, which re-reads the note and verifies sources. Compilation and playback are kept, and MIDI bytes are unchanged (F: export byte-identical after all freshness work).
- **Clean external musical change** (B 13–14, tempo): stop and invalidate with "Musical arrangement changed…; compile again".
- **Dirty external change:** invalidates, because the compiled base is no longer trusted.
- **`unavailable`:** invalidates.
- **Source motif changes:** unchanged 4B/4D protection. Source revisions are never rewritten.
- **Play/Export verification is still fail-closed.** If Play is pressed between an external write and its refresh, verification sees different bytes and invalidates. Native attempt 3 hit exactly this; see the retries.

## G. Cross-Module Navigation

**Contract** (`src/application/navigation.ts`):
- `NavigationCoordinator.navigate(from, to, id, steps)`: module enabled → `modules.open()` → leaf view loaded (`loadIfDeferred`) → `view.reveal(id, signal)`.
- `reveal` waits for the view's `ReadyGate` (opened at the end of `onOpen`, including its restored selection), applies the request, and verifies `session.draft.id === id`. Otherwise it rejects with the view's own message.
- **Latest request wins** per target module. Earlier requests are aborted and resolve `superseded`, so they can't report or fail visibly.
- A **10 s bound**; disabling the module mid-flight produces an explicit message.
- **Host restoration** `setState` arriving during a reveal is deferred and traced as `host-state-deferred`. Unit tests cover both orderings, before the reveal and during it.

**Native results:**
- **C 25–28:** CANVAS → MOTIF and MOTIF → PATCHBOOK selected the requested UUIDs. Returns were by tab activation.
- **C 30–34:** with several tabs, with PATCHBOOK closed, after disable/re-enable, and after a failed request ("Entity not found…"), the correct UUID was selected each time.
  - Concurrent requests: only the latest was `selected`; the earlier one was `superseded`, with 0 failures.
  - Exactly one leaf per module and 0 new empty leaves.
- **C 29**, as the first action after a cold start, in both restarts: request → leaf-ready → view-loaded → view-ready → state-applied → selected, with one host `setState` *before* the request.

**Investigation of the 4D intermittent failure:**
- **Not reproduced** across the matrix: cold start, warm start, one or several tabs, target open, target closed, disable/re-enable, rapid requests, after returning from CANVAS, and after a failed attempt.
- The root cause is **not proven**. The suspected late host restoration is now neutralised *during* a reveal.
- A restoration arriving *after* a completed navigation would still be honoured, because it can't be distinguished from user intent.
- Traces: `output/canvas/milestone-4e/navigation-trace.json` and `navigation-trace-cold-start.json` (phases, module names and UUIDs only).

## H. Modal and Window Stability

**All 5 Modal subclasses open through `openModal`.**

**View-level test** (stale `activeDocument` simulated with a detached document; no DOM patching):
- the refusal shows the actionable message;
- it leaves no pending form, the draft and history are unchanged, and nothing is mounted;
- a retry after recovery opens normally;
- view disposal closes the open dialog.

**Native (D 35–42):**
- The picker, MOTIF MIDI import and export, the PATCHBOOK asset inspector, and the CANVAS export all mounted visibly in the main window.
- The recording-reference picker built 201 options when opened.
- Popout open/close: during the popout, `activeDocument` pointed to the popout; afterwards it pointed to the main window, and the next dialog was visible.
- **The stale state was not reproduced**, so the native refusal path remains unexercised (unit and view-level evidence only).
- `activeDocument` was the main document at every run start.

## I. Recording References

**Native (E 43–50):**
- **Clean rename:** Obsidian's link rewrite refreshed the session automatically, and the explicit 4C relink kept the UUID and notes. Exactly one link for the file remained (the shortest-form leftover was deduplicated).
- **Dirty rename:** the conflict was flagged `rename: true`, and "Adopt rename and keep my edits" saved both the unsaved marker edit and the new link.
- **Rename plus an unrelated external edit:** no offer and no guessing. Save was blocked with a recovery copy, and a confirmed reload followed by an explicit relink saved.
- **Legacy duplicate** (the real 4C one): an explicit repair removed `[[1793989797193-station-renamed.wav]]` and kept the exact link. References were unchanged and no duplicates remain.
- **Audio integrity:** all 36 pre-existing recording hashes were unchanged, plus 2 files created by the run (`audio-hashes.json`).

**Repair rules (X10):**
- Obsidian's own resolution only;
- the exact form must be present;
- shortest-form names must be unique in the vault, otherwise the repair is refused, even if a resolver would pick a file;
- one undo step;
- frontmatter mirror only.

The `# [ ] |` filename restriction and the picker explanation are unchanged.

## J. Performance

**Method:** 4E benchmark script = the 4D script unchanged plus new steps (`scripts/canvas-4e-benchmark.mjs`). Synthetic workloads: small (5/10/3), medium (25/100/20) and large (100/500/100) sections/markers/references. Medians over 7 samples (3 for compile, export and save), with p95. Host: Ryzen 7 5700G, Obsidian 1.15.0, Electron 43.8.7. Both builds were measured **in the same Obsidian process**.

**Large workload, median ms, 4D build → 4E:**

| Step | 4D build | 4E |
| --- | --- | --- |
| Initial render | 70.0 | 52.5 |
| Panel render | 13.0 | 4.2 |
| **Section select** | 15.3 | **5.5** |
| Marker navigation | 16.7 | 6.4 |
| Clip select | 3.1 | 3.3 |
| Inspector switch | 13.7 | 5.3 |
| Section move | 29.9 | 24.0 |
| Undo + redo | 56.9 | 36.1 |
| Save | 82.3 | 70.2 |
| Compile | 98.0 | 97.4 |
| Compile + export | 166.7 | 150.8 |
| Metadata edit | 29.6 | 22.5 |
| Musical edit + invalidation | 28.1 | 20.8 |
| Zoom / scroll | 0.2 / 0.2 | 0.2 / 0.2 |
| Cross-module navigation | 114.8 | 50.8 |
| Clean external refresh* | — | 119.9 (p95 159.2) |
| Metadata refresh keeping compilation* | — | 115.8 |
| Musical refresh + invalidation* | — | 93.1 |
| Dirty conflict detection* | — | 115.2 |

\* Measured from the external write to the session publishing the classified result. That includes Obsidian's watcher, the index re-read and the SHA-256. Small/medium: 41.0/59.9, 40.2/52.3, 35.9/46.4 and 45.3/55.0 ms.

**Section-selection investigation:**
- **Hypothesis refuted by profiling:** rebuilding the clip register costs 0.10 ms and `placeContext` 0.01 ms, so neither explains the regression.
- **Where the time goes:** 93% is the structure-panel render. Inside it, the *collapsed* add-recording form built 829 nodes (803 `<option>` elements) and re-validated every vault audio path on each render. The path validation was the 4D addition (about 2.3 ms); the option nodes were inherited from 4C.
- **Inspector focus:** focusing the inspector heading costs about 1.8 ms. It's intentional accessibility behaviour, so I kept it.
- **Fix:** build the form when its disclosure opens (X11a).
- **Evidence:** `section-select-*.json` and `cpu-profile-*.json`.

**Index publish:**
- **Measured:** a 127 ms long task, before and after profiles in `refresh-profile-*.json`.
- **Fix:** `ofKind()`/`heads()` (X11b), after which there were no long tasks and the publish fan-out was about 29 ms.

**Limitations:**
- With only 3 samples, Save is noisy: its p95 is 3–5× its median on both builds.
- The small-workload section select has one 30.7 ms p95 outlier.
- Absolute numbers vary between Obsidian processes (`performance-4d-build-earlier-process.json`, `performance-4e-before-index-fix.json`), so only same-process comparisons are quoted.
- Composition limits are unchanged.

## K. Automated Validation

- **Tests:** 538 → **573**, across 41 → 43 files.
  - new: `canvas-freshness` (12) and `navigation` (13);
  - added: `canvas-rename` +4, `canvas-view` +5, `index-references` +1.
- **Checks:** strict typecheck, ESLint and production build pass; dependency audit: 0 vulnerabilities.
- **MIDI:** golden MIDI `85c8ecf39936d1de7612f65d17d3df2f4599472cda8027096bced1c93bb3ab77` unchanged; the independent Python check passes (10 valid / 4 rejections).
- **No assertion weakened.**
  - One 4D test, whose premise §6.2 now contradicts, was replaced with an equal-or-stronger test (X13).
  - Two view tests gained a line that opens the add-recording disclosure.
  - The navigation fixtures gained the new service.

## L. Native Obsidian Verification

All checks below ran against the **final production build** in the isolated Obsidian 1.15.0 instance on `dev-vault/` (CDP 127.0.0.1:9227).

**4E workflow** (`scripts/canvas-4e-native.mjs`):
- 18 checks in part 1 (prompt steps 1–28 and 30–79), then 2 checks after a real cold restart (step 29 and steps 80–84);
- 0 renderer exceptions;
- passed on the first attempt on the final build.

**Regressions on the final build**, under `output/canvas/milestone-4e/regressions/`:
- MOTIF: 19 checks;
- MOTIF-MIDI: 16 checks;
- PATCHBOOK assets: 12 checks;
- foundation smoke: 11 checks.

The first three include their `--verify-restart` phases after a further cold restart. All passed on the first attempt with 0 exceptions.

**Retries and failures** (`retries.json`, 6 entries; nothing was converted into an undocumented pass):

| Attempt | Step | What failed | Cause | Change |
| --- | --- | --- | --- | --- |
| 1 | B 8–12 | Playback stopped | Harness timing (stop probe) | Harness only |
| 2 | Start | Indicator not "Matches the saved note" | The harness's restore was refreshed into an open clean session | Harness only |
| 3 | B 8–12 | Compilation invalidated | Play pressed right after an external write; fail-closed verification (§F) | Harness ordering |
| 4 | E 43–44 | Two drone links counted | The harness counted the 4D drone link too | Harness only |
| 5 | B 8–12 | Not playing at the refresh | Timing-dependent assertion | Harness only |
| — | B 8–12 probe (after the passing pass 1) | Playback stopped in 3 of 3 trials ("Scheduler stalled for 170.7 ms") | **Product defect** | X11b index fix |

After the defect fix, the full native suite, the restart and all regressions were rerun on the final build.

**Pass-1 evidence** (before the index fix) is kept as `native-part1-pass1-before-index-fix.json` and `native-restart-pass1-before-index-fix.json`. The superseded failure is `failure-superseded-attempt5.json`.

**Harness side effect:** the B 23 rename step runs on each attempt. The disposable composition's file name therefore now carries a repeated " (4E renamed)" suffix.

**Screenshots** (`output/canvas/milestone-4e/`, 20 in total):

| # | File | # | File |
| --- | --- | --- | --- |
| 01 | `01-workspace` | 11 | `11-recording-rename` |
| 02 | `02-clean-external-refresh` | 12 | `12-legacy-duplicate` |
| 03 | `03-dirty-conflict` | 13 | `13-contextual-inspector` |
| 04 | `04-freshness-recovery-controls` | 14 | `14-sticky-timeline` |
| 05 | `05-musical-invalidation-external` | 15 | `15-narrow-pane` |
| 06 | `06-metadata-refresh-compilation-ready` | 16 | `16-dark-theme` |
| 07 | `07-motif-to-patchbook` | 17 | `17-light-theme` |
| 08 | `08-patchbook-to-motif` (tab return) | 18 | `18-high-dpi` |
| 09 | `09-canvas-to-motif` | 19 | `19-keyboard-focus` |
| 10 | `10-modal` | 20 | `20-final-reopened` |

**Interface (G 65–76):**
- `]` lands on the section inspector with focus on its H4 heading, and `.` on the marker inspector.
- Escape clears the selection, focuses the timeline and keeps CANVAS as the active leaf.
- The timeline stays sticky while scrolling: its top moved from 487 to 91 px with the pane top at 79 px, after a 699 px scroll.
- The narrow pane (565 px) has no horizontal overflow.
- High-DPI rendering uses a 2× backing store.

## M. Regression and Compatibility

- **Schema:** schema 1 unchanged, no migration, no new persisted field.
- **MIDI:**
  - the baseline export is byte-identical to the 4D baseline export;
  - after all freshness work, after Undo + recompile, and after the cold restart, exports stayed byte-identical;
  - the export is independently verified (Python).
- **Playback:**
  - continued through an in-app section rename;
  - a clip move stopped playback and invalidated the compilation;
  - disabling CANVAS during playback gave `stopped`, 0 voices, 0 timers and 0 leaves.
- **Data:**
  - source motif files were not rewritten;
  - unknown metadata is preserved (codec unchanged);
  - protected saves and recovery were exercised natively;
  - future-schema notes stay read-only.

## N. Architecture Decisions

Decisions X01–X13 are recorded in `docs/DECISIONS.md`. Deviations:

- **X09:** no new PATCHBOOK → MOTIF or MOTIF → CANVAS links.
- **X11b:** small changes to the MOTIF and PATCHBOOK libraries. They were justified by measured evidence and required to deliver §8's playback guarantee.
- **X12:** the isolated launcher pins X11. A system Electron update broke the launch (Electron exited silently because Wayland was auto-selected).
- **X13:** a superseded 4D test.

## O. Outstanding Risks

1. **MOTIF → PATCHBOOK intermittent failure:** unproven root cause, not reproduced. It's mitigated by the readiness contract, but a host `setState` arriving after completion is still honoured.
2. **Stale active window:** the native refusal path is unverified because the condition couldn't be reproduced.
3. **Refresh resets undo:** a clean-session refresh resets its undo history.
4. **Play/Export race:** pressing either during the window between an external write and its refresh invalidates the compilation (safe, but needs a recompile).
5. **Index publish cost:** still O(vault). MOTIF's `items()` resolves every motif on each publish; it costs about 29 ms in the dev vault but could grow in very large vaults.
6. **Accessibility:** no screen-reader certification; Linux only.
7. **Electron updates:** future updates may change platform selection for the harness again.
8. **Pending forms across a refresh:** an unapplied (pending) inspector form survives a clean-session refresh. When applied, it acts on the refreshed draft and is validated, but it was typed against the earlier note.
9. **Minor inefficiency:** `renderFreshness` takes one extra `session.draft` clone per status update to read the draft's ID. It's included in the measured numbers. I found it during the final review, after the final native run, and left it unchanged to avoid invalidating that run.

## P. Next-Milestone Recommendation

**4F — Large-vault responsiveness and publish-path budgeting.** The goals:
- make index publish handling incremental (changed paths only) for MOTIF, PATCHBOOK and CANVAS browsers;
- add a long-task budget test to the native harness, so audio playback is protected by measurement rather than chance;
- use the 4E navigation trace in CI-style native runs to keep watching for the unproven MOTIF → PATCHBOOK race.

This is not implemented.

## Q. Repository State

- **Branch and commits:** `main` with HEAD `1e11155` (signed 4D). 4E is uncommitted. There was no remote activity, no push and no publish.
- **Signing:** configuration untouched.
- **Boundaries:** the personal Obsidian instance and vaults were not touched; TROUBADOUR was not accessed; only `dev-vault/` was used.
- **Changed and new files:** see `docs/validation/milestone-4e-native.json#repository.pendingPaths`. In summary:
  - **Source:** `src/application/{document-session,services,navigation}.ts`, `src/main.ts`, `src/storage/index.ts`, `src/modules/canvas/{freshness,library,performance-panel,session,structure-panel,view}.ts`, `src/modules/motif/{library,view}.ts`, `src/modules/patchbook/{library,view}.ts`, `styles.css`.
  - **Tests:** 7 test files.
  - **Scripts:** 6 new 4E scripts, plus `scripts/dev-obsidian.mjs`.
  - **Docs:** `AGENTS.md`, `CLAUDE.md`, `progress.md`, the docs listed above, this report and its validation JSON.
