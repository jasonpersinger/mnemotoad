# Milestone 4F Report — Cross-Module Integration, Workflow Refinement & Reliability

Agent: Claude Code. Date: 2026-11-07. Baseline: signed 4E commit `295005f`. Evidence: `output/mnemobard/milestone-4f/`.

## A. Executive summary

PATCHBOOK, MOTIF and CANVAS now work as one composition workspace.

**What changed:**
- **Two-way navigation between all three modules:**
  - a patch lists the motifs that use it;
  - a motif shows its full sound chain (patch → instrument → effects chains) and the saved compositions that place it, with placement counts;
  - the CANVAS clip inspector shows its source motif and sound associations.
- **Navigation lands precisely:** every link goes through the 4E verified-navigation coordinator. Opening a composition from MOTIF selects the motif's clip.
- **Reverse references** come from a summary the index already computes while parsing notes. There's no new database, no entity cloning and no writes.
- **One shared reference classification and presentation**, used in all three modules.
- **CANVAS is grouped into four readable areas:**
  - composition header;
  - transport, with a status stating exactly what the compilation corresponds to;
  - arrangement tools;
  - inspector, with less-used tools under "More tools".
- **Shared styling:** tokens and a focus ring for every control, plus consistent reference rows.

**Why:** to close the gaps in the **PATCHBOOK → MOTIF → CANVAS → MIDI** workflow without changing persistence, MIDI semantics or the product's scope.

**Native validation found and fixed two product issues:**
- a CANVAS robustness gap: `reveal()` could reuse a disposed session;
- incorrect recovery advice in the modal guard. The stale-window condition **reproduced natively** for the first time; the guard behaved correctly, but its advice didn't work.

**One visual defect introduced in 4F was caught in screenshots and fixed:** a destructive button's label was invisible.

**Status:** all completion criteria are met, with the exceptions listed in §K. The most notable is that **REAPER import was not tested**.

## B. Baseline

**Verified before work:**
- The 4E working tree matched `docs/validation/milestone-4e-native.json` exactly: 41 paths, none unexpected, none missing.
- `pnpm check`: **573 tests across 43 files**, plus typecheck, lint and build.
- Golden MIDI `85c8ecf3…ab77` unchanged.
- Independent Python MIDI check: 10 valid / 4 rejections.
- Audit: 0 vulnerabilities.
- **Committed `295005f`** "feat: establish verified Milestone 4E document freshness and navigation readiness", with a good signature and no push.

**Existing capabilities verified against the code:**
- 4E freshness and the navigation coordinator;
- the index and repository;
- the CANVAS source catalog (motif status, changed and unsaved sources);
- the `ReferenceResolver` diagnostics;
- the draft and checkpoint lifecycle in every view.

**Missing in the code** (not just the reports):
- PATCHBOOK → MOTIF and MOTIF → CANVAS navigation;
- the instrument and effects chains in MOTIF and CANVAS;
- reverse lookups without cloning every motif and composition;
- CANVAS as a navigation target.

## C. Cross-module integration

| Path | How | Draft safety |
| --- | --- | --- |
| PATCHBOOK patch → MOTIF | "Motifs using this patch · N" rows → *Open in MOTIF* | PATCHBOOK draft checkpointed and kept |
| MOTIF → PATCHBOOK | "Sound and usage" → Patch / Instrument / Effects chain rows → *Open in PATCHBOOK* | MOTIF draft checkpointed and kept |
| MOTIF → CANVAS | "Used in saved compositions · N" (placement counts) → *Open in CANVAS*, which selects the first clip placing the motif | same |
| CANVAS clip → MOTIF / PATCHBOOK | Inspector "Source and sound": motif (with revision notes), motif patch, instrument, effects chains, lane patch | CANVAS draft checkpointed; pending (unapplied) forms refuse navigation |

**Reference resolution:**
- `ReferenceLookup` classifies each reference as valid, archived, missing, ambiguous, malformed, unsupported or wrong-kind.
- It never substitutes a similarly named record.
- It reads scalar index heads only, so it never writes.
- Changed-revision and unsaved-source states stay with CANVAS's existing catalog and plan, and are shown beside the motif row.
- Renamed notes still resolve by UUID, and references are never rewritten.
- Missing references stay visible, with an explanation and the kept ID.

**Acceptance chain** (Patch → Motif → Composition → Clip → Motif → Patch):
- **Automated:** `tests/navigation.test.ts`. MOTIF and CANVAS drafts survive, no source note is written, and the note count is unchanged.
- **Native** (steps 1–11): with an unsaved PATCHBOOK edit pending throughout.

## D. User-interface improvements (before → after)

- **CANVAS top:**
  - **Before:** one toolbar mixing Save, status, Add lane, Place motif, Undo, Redo and record actions; a separate transport bar; settings; and a navigation bar.
  - **After:**
    - **header:** name, Save, save status, freshness and record actions;
    - **transport panel:** compile and playback controls, compilation status, tempo/meter/PPQ/lanes summary;
    - **arrangement bar:** editing (Add lane, Place motif, Undo, Redo) plus grid, zoom and navigation;
    - then the sticky timeline (still a direct child, so it stays pinned), the inspector and "More tools".
- **Compilation status:** the raw `ready` / `invalidated` became, for example, "Compiled · matches the saved composition", "Compiled · matches this unsaved draft" or "Stale · compile again". A stale compilation can no longer read as current (tested).
- **Identifiers:**
  - the clip inspector headline no longer shows "source UUID …";
  - UUIDs and paths sit in a collapsed "ID" detail on each reference row;
  - long names truncate in lists, with the full name on hover;
  - record names were not changed.
- **Destructive styling:** "Delete clip" uses Obsidian's destructive style. It's a single undoable step, so there's no extra confirmation. Delete-lane and discard-draft keep their confirmations.
- **Responsive** (native; no horizontal overflow at any width):

  | Window | Content width | Notes |
  | --- | --- | --- |
  | Wide | 1865 px | the three CANVAS regions are single rows |
  | Standard | 1311 px | single rows |
  | ~900 px | 925 px | regions wrap |
  | ~600 px | 625 px | regions wrap |

## E. Design consistency

- **Tokens:** shared tokens on `.mnemobard-module`, using host variables only, so light themes stay compatible.
- **Focus:** one `:focus-visible` ring for every control in every module. Before this, CANVAS buttons had no ring.
- **Region labels:** they share the monospace eyebrow voice.
- **Shared reference rows**, with status colours from theme variables.
- **Obsidian's own styles:** `mod-cta` for primary actions and `mod-warning` for destructive ones. My first attempt recoloured the destructive text and made it invisible on the red fill; I found this in a screenshot and removed it.
- **Keyboard:** the native check confirmed a visible ring (`outline: solid`) on a keyboard-reached control. All new actions are real buttons with accessible names (`aria-label` includes the record name).

## F. Reliability

| Area | Result |
| --- | --- |
| Unsaved drafts | PATCHBOOK metadata, MOTIF notes and CANVAS clip/marker edits all survived cross-module navigation (unit and native). A CANVAS form with unapplied properties refuses navigation without loss. |
| External changes (§8.2) | Description, tags, sections and markers are organizational. Tempo, meter and clip placement are musical. Each is covered by a table test. Natively: a source-patch metadata edit kept the compilation `ready`; a source-motif duration edit invalidated it and blocked compiling (`source-changed`) until the exact text was restored. |
| Compilation lifecycle | The saved / unsaved-draft / stale status is shown and tested. Rules are unchanged; editing a motif requires per-clip acknowledgement (4B), which is friction, see §K. |
| Recovery | Conflict → recovery copy (contains the unsaved edit; disk note not overwritten) → listed after a cold restart. A plugin reload with an unsaved MOTIF draft left the checkpoint listed and the saved motif unchanged. Close/reopen was byte-identical. |
| Robustness fix | `CanvasView.reveal()` no longer reuses a session disposed underneath the view (unit test). |

## G. MIDI and playback

**Native, fixture "Night procession" (2 lanes, 3 clips, 32 bars):**
- **Transport:**
  - play, pause, resume and stop advanced the playhead (805 → 1364 ticks);
  - seek `2:1:0` → 3840;
  - playback completed from bar 32 with a clean stop.
- **Export:**
  - deterministic: two exports were byte-identical;
  - independently parsed: format 1, PPQ 960;
  - tracks: conductor, Choir, Pulse; channels 0 and 1;
  - 46 note-ons, equal to the count computed from the saved sources;
  - events ordered; end-of-track at 122880 on every track (trailing silence preserved).
- **Invalidation:** a clip move invalidated; overlapping notes (a pedal note under a melody) and repetitions were handled.
- **Golden fixture** unchanged; the Python fixture check passes.

**REAPER:** version 7.84 is installed but **was not run**, because it would use your personal REAPER configuration outside the project. **DAW interoperability is not claimed.** For a manual check, import `dev-vault/MNEMOBARD/Exports/night-procession-4f-*-a.mid` into REAPER (Insert → Media file, as a multitrack MIDI file) and confirm:
- two note tracks and one conductor track;
- 120 BPM, 4/4;
- the items end at bar 33.

## H. Performance

**Environment:** Ryzen 7 5700G, 16 threads, Obsidian 1.15.0 on Electron 43, isolated dev vault (~700 notes). Method: `scripts/mnemobard-4f-benchmark.mjs`, the same `time()` method as 4C–4E, with median and p95 over 7 samples (3 for open). Synthetic records only.

**PATCHBOOK** (30 instruments / 50 patches / 15 effects chains; 20 motifs use patches):

| Operation | Median |
| --- | --- |
| Search | 0.3 ms |
| Filter by instrument | 0.1 ms |
| Select a patch, including reverse references | 30.1 ms (p95 36.7) |
| 50 reverse-reference lookups | 1.2 ms |
| Map build + 50 lookups (approximation of a `ReferenceLookup` build) | 0.2 ms |

**MOTIF** (median ms):

| Notes | Open | Note navigation | Sound panel |
| --- | --- | --- | --- |
| 16 | 42.7 | 2.9 | 0.3 |
| 500 | 66.7 | 6.4 | 0.6 |
| 5,000 | **261** | 30.1 | 3.4 |

The 5,000-note open cost is in the existing piano roll and predates 4F.

**CANVAS** (lanes / clips; median ms):

| Workload | Open | Clip select + source and sound | Scroll | Zoom | Navigate to MOTIF | Reverse lookup |
| --- | --- | --- | --- | --- | --- | --- |
| 4 / 20 | 22.3 | 1.0 | 0.2 | 0.4 | 64.7 | ~0 |
| 16 / 200 | 23.2 | 1.7 | 0.3 | 0.3 | 70.8 | ~0 |
| 32 / 1,000 | 66.9 | 3.3 | 0.4 | 0.4 | 76.9 | ~0 |

There's no pre-4F baseline for the new interactions. The 4E same-process figures for the existing CANVAS operations are in the 4E report.

## I. Automated tests

**573 → 589 tests across 44 files**, plus typecheck, lint, build and the audit, all passing. New coverage:
- `tests/cross-module.test.ts` (3): reverse references, staying current through modify/rename/delete, all reference classes, no name substitution, no writes;
- `navigation.test.ts` +3: the full acceptance chain with draft preservation, CANVAS refusing to abandon pending forms, and the disposed-session reveal;
- `canvas-view.test.ts` +3: compilation status (saved / draft / stale), a missing source shown and kept, and source-patch metadata keeping the compilation;
- `canvas-freshness.test.ts` +7: the §8.2 classification table.

No tests were removed and no assertions were weakened. Responsive layout is verified natively, not in jsdom.

## J. Native Obsidian validation

**Final build** (`scripts/mnemobard-4f-native.mjs`): steps 1–22 in 10 checks, plus extras (missing reference, advanced controls, themes, 4 widths, keyboard focus, plugin reload), then steps 23–24 after a real cold restart. 0 renderer exceptions.

**Regressions** (first three after a cold restart, each with its restart phase; first-attempt passes):

| Suite | Checks |
| --- | --- |
| 4E CANVAS workflow | 18 + 2 |
| MOTIF | 19 |
| MOTIF-MIDI | 16 |
| PATCHBOOK assets | 12 |
| Foundation | 11 |

These suites ran on the build immediately before the final change. That change was styling and text only: the destructive-button style and the clip inspector headline. The 4F workflow and restart were rerun on the exact final build.

**Retries** (`retries.json`, 11 entries, all documented):

| Kind | What happened |
| --- | --- |
| Harness | Fixture missing step IDs; unselected Add note overlapping; draft resets; source acknowledgement; completion timing; note-count expectation; 4E start-state seeding |
| Product robustness | Disposed-session reveal (fixed) |
| Host | Stale active window (reproduced; guard advice fixed) |
| Host | `renameFile` wedge in a long-lived process (passed in a fresh one) |

**Stale-window evidence** (`stale-window-evidence.json`, screenshot `16-stale-window-modal-refusal.png`):
- `activeDocument` was a closed popout document with no `defaultView`.
- The guard refused; there were no pending forms and nothing invisible was mounted.
- None of these repaired it: a pane click, leaf activation, a tab switch, CDP bring-to-front, or a programmatic blur/focus.
- Only a window `focus` event did.
- I repaired the session from the harness with a synthetic event, which is not something the product does.
- The evidence file's `exportAfterRepair: false` was measured before the repair. After it, all suites opened their dialogs normally.

**Screenshots:** `output/mnemobard/milestone-4f/01–15` as required, plus `16-stale-window-modal-refusal.png`. Dark (`11`) and light (`12`) were both checked.

## K. Known issues

**Blockers:** none known.

**Non-blocking:**
1. **REAPER import not tested** (installed, not run, see §G).
2. **Stale host window:** the trigger is not isolated. The advice "switch to another application and back" is inferred from the evidence; the OS-level switch itself wasn't driven.
3. **Per-clip acknowledgement:** after saving a motif, every placing clip must be acknowledged separately before compiling.
4. **Unsaved drafts aren't in reverse lists:** they show saved records only (stated in the UI).
5. **PATCHBOOK edit mode:** a record with a pending draft reopens in edit mode, where the association list is hidden.
6. **MOTIF 5,000-note open** takes 261 ms.
7. **Host `renameFile` wedges** in long-lived processes.
8. **Historical harness:** `scripts/canvas-native.mjs` (4A) still expects the old "source UUID" inspector text. It isn't part of current validation.
9. **No screen-reader certification**; Linux only.

## L. Recommended next milestone

**4G — Source-revision review workflow and large-motif responsiveness:**
- a single explicit "review and acknowledge all clips of this motif" action, with a before/after summary;
- lighter MOTIF opening for 5,000+ note motifs;
- a long-task budget check in the native harness;
- a user-run REAPER import check documented as evidence.

Not implemented.

## M. Git status

- **Branch:** `main`.
- **Baseline:** signed 4E commit `295005f`.
- **4F:** committed locally after this report as a signed commit (see the final summary). No push.
- **Changed:** `src/` (index, reference status, navigation and modal-host advice, CANVAS/MOTIF/PATCHBOOK views, MOTIF sound panel, UI helpers), `styles.css`, tests, `scripts/mnemobard-4f-*.mjs`, `scripts/canvas-4e-native.mjs` (an output-directory override only), and the docs listed above.
- **Untouched:** the personal vault/instance, `~/troubadour` and REAPER configuration were not touched; only `dev-vault/` was used.
