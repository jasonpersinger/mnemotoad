# Milestone 4D Report — CANVAS Usability, Workflow Refinement & Stability

Authority: Prompt011 (Milestone 4D only). Agent: Claude Code. Platform verified: CachyOS Linux, Obsidian 1.15.0 (isolated profile, disposable `dev-vault/`). Date: 2026-11-06.

## A. Executive summary

**CONDITIONAL PASS** within the verified Linux desktop scope.

Delivered: a selection-driven contextual inspector beneath a sticky timeline. Narrower compilation invalidation means organizational edits no longer stop playback or force recompiles. Musical edits, external changes, source revisions and save conflicts remain fully protected. Every plugin modal now goes through a host-state guard. Provable recording-rename adoption that keeps unsaved edits replaces a forced conflict in the safe case. Additional changes:
- documented keyboard navigation;
- actionable diagnostics with navigation;
- duplicate mirror-link cleanup;
- picker transparency for unlinkable files.

Conditions and incomplete items:
1. **The stale-`activeDocument` host condition was not reproduced in 4D.** The guard is unit-tested; its native refusal path is unexercised.
2. **The intermittent MOTIF→PATCHBOOK navigation failure has no proven root cause.** It passed every 4D run, including the first run after a cold restart.
3. **Section selection is +15% slower** (+3.7 ms) on the large workload, measured against the signed 4C build on the same host.
4. **Some screenshots predate a fix.** Screenshot 05 and the native part-1 run were captured before the sticky-overlap fix; the final scan-merge refactor followed native part 2. Both were later exercised by tests, the benchmark and screenshot 18, but the 58-step workflow was not re-run end to end on the final build.

## B. Git baseline

All 29 pending 4C paths matched `docs/validation/milestone-4c-native.json`. The secret scan was clean, and `dev-vault/` and `output/` are git-ignored. Validation results:
- `pnpm check`: 492 tests / 38 files, strict typecheck, ESLint and production build;
- golden MIDI hash `85c8ecf3…ab77`;
- independent Python fixture check: 10 valid, 4 rejections;
- audit: 0 vulnerabilities.

The signed commit **`0a3dc72` "feat: establish verified Milestone 4C composition structure"** has a good EdDSA signature from the existing key. Signing configuration was not changed and nothing was pushed.

## C. Workspace refinement

New DOM hierarchy, in order:
1. composition identity, toolbar and transport;
2. navigation row;
3. the timeline with the section/marker ruler, **sticky** when the viewport is at least 720 px tall, with a shorter scroller and `scroll-margin-top` so focused content never lands beneath it;
4. a collapsed "Timeline gestures and keys" disclosure;
5. **one contextual inspector**;
6. **secondary tools**, all collapsed: structure lists, lane management, seek/export, MIDI routing, compilation diagnostics, clip list, description/tags/notes.

Native layout at 1360×1100: timeline 128–744 px, inspector from 773 px, 11 tool disclosures collapsed. A defect found in native screenshot review was fixed: the tall sticky timeline covered the inspector when it scrolled into view. The fix is visible in `18-keyboard-focus.png`. PATCHBOOK and MOTIF were not redesigned.

## D. Contextual inspector

Exactly one context is visible: empty, clip, lane, section, marker or recording reference.
- **Clip:** the existing `clipInspector`, showing title, lane, position, repetitions, source review and *Open source MOTIF*.
- **Lane:** a facts grid (lane, clips, stored routing, last compiled channel) plus the existing lane manager and routing form, **moved** into the context and returned to their homes afterwards.
- **Section, marker and reference:** `CanvasStructurePanel` renders its existing editors into the inspector slot (`editorRoot`), with no business logic duplicated. References show file, availability, section, marker, anchor, notes and the existing safe actions.

Selection is ephemeral: no history entries and no data change (tests compare the serialized draft). Pending forms block context switches, and all edits use the existing `session.edit` transactions. The 50-row paging is unchanged.

## E. Navigation

Paths between objects:
- clip → *Open source MOTIF*, verified natively against the exact saved motif, returning to a clean CANVAS whose compilation is still ready;
- recording → *Open recording*;
- section/marker list or keys → timeline position;
- diagnostics → *Select clip*.

The 4C semantics are preserved: playhead-relative stepping, deterministic duplicate-marker order, no wraparound, stop-before-seek, no history, never autoplay.

Keys, available without modifiers and ignored while typing:
- `[` / `]` — previous/next section;
- `,` / `.` — previous/next marker;
- **Escape** — clears the selection and focuses the timeline. It is always consumed inside CANVAS.

Focus moves to the inspector heading, or to the selected list row when the Structure list is open. Native: Tab then enters the next control.

## F. Musical invalidation

The compiler's actual inputs were read: entity `title`, `extra` (map guards), every data/lane/clip field (the unknown-state guard), lane names (MIDI track names), source revisions and notes. `musicalInput()` is the existing canonical `compilationInput` with a **denylist** removed:
- `data.sections`, `data.markers`, `data.audioRefs`;
- entity `description`, `notes`, `tags`, `assets`.

Unknown fields stay musical, so they fail safe. Capture `inputRevision` hashes it.

Three guards previously invalidated on any edit:
1. the change-version check in `CanvasPerformancePanel.refresh`;
2. the head-revision check, which fired after our own save;
3. `verify()`'s base equality.

Now:
- the panel invalidates only when the musical input differs;
- after this editor's own Save, `adoptSavedBase()` re-reads the note (it must equal the session base), re-verifies sources and adopts the base. Until that completes, export fails closed;
- external changes, source changes, failed saves and in-flight compiles still invalidate.

Document save validity (exact base equality) is untouched.

Tests: 27 in `canvas-invalidation.test.ts` cover all 13 required cases, including unknown-field preservation and byte-identical MIDI; there is also a panel-level playback test.

Native:
- metadata edits kept the compilation `ready`, and the export was byte-identical;
- playback stayed `playing` through a section rename;
- moving a clip stopped playback and invalidated;
- undo + recompile was byte-identical to the baseline and verified by Python;
- a source annotation blocked compilation (`source-changed`);
- an own metadata Save kept the compilation ready.

## G. Host stability

**Modal/window.** All five modals (CANVAS export, motif picker, MOTIF MIDI import/export, PATCHBOOK asset inspector) now open via `ui/modal-host.ts#openModal`. It:
- reads only the public `activeDocument` / `activeWindow`;
- treats a document without a live, open window as unusable;
- asks the owner window to focus once, the host's own mechanism;
- otherwise refuses with an actionable message and leaves nothing pending.

There is no private state access and no DOM patching. Five unit tests cover live, detached, closed-window, repair and refusal.

Native: the condition was **not reproduced**. `activeDocument === document` held at every start, and a popout open/close probe left it valid. The export dialog mounted visibly in the main window. Classification: host defect (4C evidence, 4B build), plugin mitigation implemented, reproduction unresolved.

**Cross-module navigation.** The 4C `failure.json` shows a PATCHBOOK `selectedId` timeout with no exception and the MOTIF editor still present. Static analysis excludes:
- leaf reuse (`getLeaf('tab')` always creates a new tab);
- ModuleController generations (they change only on enable/disable);
- MOTIF `active` (it clears only on close).

The remaining suspect is a race between `navigatePatch`'s `setState` and Obsidian's deferred-view state restore after a restart. In 4D the MOTIF-MIDI regression **passed, including as the first run after a cold restart**. It is not declared fixed, and no speculative change was made.

**Harness defects found and fixed in 4D:** wrong link-format expectations (Obsidian writes shortest-form links), a popout probe leaving an empty active leaf, and an over-strict focus assertion.

**Plugin defect found natively and fixed:** an Escape bubbling out of CANVAS made Obsidian switch to an empty leaf.

## H. Recording-reference workflow

- **Provable link-only adoption** (`rename-merge.ts`) is offered, with an explicit button, only when every external difference is a frontmatter wikilink target change from a missing, exactly referenced path to one existing vault audio file, with an unchanged body and no ambiguity. Adoption re-verifies the note, relinks (one undo step, same UUID/notes/associations) and adopts the base (`DocumentSession.adoptBase`). Nothing is written until Save. It works for clean and unsaved drafts; open clean drafts are not reloaded by Obsidian.
- **Native results:**
  - the clean rename was adopted;
  - a rename with an unsaved marker edit was adopted and saved with the edit and the new link;
  - audio SHA-256 values were unchanged;
  - a rename combined with an external edit got **no offer**, Save reported the protected conflict, and the recovery copy contained the edit; a reload kept the external edit, then an explicit relink.
- **4C defect fixed:** relink left Obsidian's shortest-form mirror link as a duplicate. Relink now removes mirror links that *resolve* to exactly the relinked file; there is no basename guessing. Legacy duplicates already on disk make the proof refuse, which is correct (`legacy-duplicate-refusal.json`).
- **`# [ ] |` filenames:** a supported-path limitation of the shared `vaultPath` portability and wikilink contract. It is deferred, because broadening it would need a link-encoding scheme and a schema-compatibility review. The picker now states how many audio files are hidden and why.

## I. Diagnostics

Plan diagnostics now state four things:
- **what** happened (existing text);
- the **object**: clip title, lane and bar:beat:tick;
- **whether you can continue**: Blocks compile/export, Can continue · review, or Note;
- **how to resolve it**: a per-code action.

There is also a *Select clip* button. UUIDs appear only in the row tooltip, and severity is shown by a theme-coloured rule. Blocking validation is unchanged. Compile diagnostics, overlap warnings, missing-recording warnings and save-conflict messages keep their existing explicit text.

## J. Accessibility

- semantic buttons and forms;
- focusable inspector headings with a visible focus ring;
- the inspector header is a `role=status`;
- selection is not shown by colour alone (`aria-pressed`, ▸ marker, header text);
- keys never use modifiers and are ignored while typing;
- Escape behaviour is documented;
- focus returns to the timeline after clearing;
- pending forms are protected.

Native real-CDP key events verified Escape, `]`, Tab and Escape while typing. The narrow pane (620 px) showed no horizontal overflow.

**No screen-reader certification.** Focus restoration after closing a modal relies on Obsidian's `Modal`. That path was exercised, but focus after it was not asserted.

## K. Performance

Same workloads and method as 4C (100 sections / 500 markers / 100 references, 400 bars; medians of 7). **Same-host A/B** against the signed 4C build (`performance-4c-build-same-host.json`):

| Large workload (ms) | 4C report | 4C build, same host | 4D final |
| --- | --- | --- | --- |
| Initial render | 80.5 | 77.8 | 76.9 |
| Structure panel render | 13.0 | 10.0 | 10.2 |
| Section selection | 24.4 | 24.7 | **28.4** |
| Marker navigation | 24.7 | 25.6 | 25.8 |
| Section move / resize | 41.5 / 42.7 | 40.3 / 40.7 | 40.1 / — |
| Undo + redo | 72.9 | 75.1 | 74.7 |
| Save | 106.5 | 107.3 | 104.0 |
| Zoom / scroll | 0.8 / 0.4 | 0.6 / 0.3 | 0.6 / 0.3 |

New 4D measurements (large): inspector switch 22.9, clip select 3.8, metadata edit 37.4 (compilation stays ready), musical edit + invalidation 38.2, compile 101, compile + MIDI export 188.6. Small and medium are in `performance.json`.

A first 4D measurement showed regressions of 15–25%. The cause was a second vault scan per Structure render (the unlinkable-file count). Merging it into one pass (`recordingCandidates`) restored parity. The residual +3.7 ms on section selection (inspector context plus clip-list refresh) is reported as accepted. Viewport culling, 50-row paging and expansion limits are unchanged, and composition limits were not increased.

## L. Automated tests

**538 tests** across 41 files (492 baseline + 46 new), with strict typecheck, ESLint and the production build passing. The dependency audit shows 0 vulnerabilities, and no dependency or lockfile changed. Golden MIDI is unchanged; the independent Python check passes (10/4).

New files: `canvas-invalidation.test.ts` (27), `canvas-rename.test.ts` (8), `modal-host.test.ts` (5), plus 6 view tests:
- inspector exclusivity;
- keys and focus;
- playback invalidation;
- rename offer UI;
- diagnostics;
- Escape containment.

**One existing-test change:** the 4C `structureView` helper's query root moved from `.mnemobard-canvas-structure` to the editor region, because selected-item editors now render in the inspector. Every assertion is unchanged.

## M. Native Obsidian verification

`scripts/canvas-4d-native.mjs` ran in two parts plus a restart: **17 workflow checks + 1 cold-restart check, 0 renderer exceptions**. They cover prompt steps 1–55. Steps:
- **2–11:** startup, clip, lane, MOTIF navigation.
- **12–19:** inspector edits.
- **20–24:** playback.
- **25–28:** export and Python check.
- **29–30:** source protection.
- **31–35:** rename workflow.
- **36–37:** modals and popout probe.
- **40–41:** keyboard.
- **42–45:** themes, narrow pane, high DPI.
- **46–48:** close and reopen.
- **49–50:** conflict and recovery.
- **51–53:** disabling CANVAS during playback (state `stopped`, 0 voices, 0 timers, 0 leaves).
- **54–55:** cold restart (byte-identical, compiles).

Regressions, run pre-restart and with restart phases into `output/canvas/milestone-4d/*-regression/`: MOTIF (19 checks), MOTIF-MIDI (16, including MOTIF↔PATCHBOOK navigation), PATCHBOOK assets (12) and the foundation smoke. All passed with no exceptions.

Evidence (all in `output/canvas/milestone-4d/`):
- `native-part1.json`, `native-part2.json`, `native-restart.json`;
- `legacy-duplicate-refusal.json`;
- `failure-superseded-keyboard-assertion.json`;
- 18 screenshots, `01`–`18`.

**Limits of this evidence:**
- `05-section-inspector.png` shows the pre-fix sticky overlap (`18` shows the fixed layout).
- The detached-window refusal path was not exercised natively.
- Escape behaviour was verified after its fix by a dedicated real-key trace and part 2.

## N. Regression and compatibility

- Schema 1, with no migration and no new fields.
- Existing compositions open clean and unchanged; the 4D baseline export matched the 4C structured export byte for byte.
- Source UUIDs, clip UUIDs, reference UUIDs and exact PPQ are preserved.
- Unknown metadata survives organizational edits and saves (tested).
- Protected saves, recovery and future-schema read-only behaviour are unchanged.
- Source motifs are never written by CANVAS.
- Audio bytes were verified unchanged.

## O. Architecture decisions

These are W01–W10 in `docs/DECISIONS.md`. Deviations from the prompt:
1. The `# [ ] |` path broadening is deferred (W09).
2. The 4C test-helper scope was widened (section L).
3. The recording rename offer also applies to **clean** sessions, because Obsidian does not reload open clean drafts. The proof and safety rules are the same.

## P. Next-milestone readiness

Remaining risks:
- stale `activeDocument` reproduction;
- MOTIF→PATCHBOOK root cause;
- open clean CANVAS drafts not reloaded after external note changes;
- legacy duplicate mirror links;
- +15% section-selection cost;
- no screen-reader or non-Linux verification.

**Recommended next scoped milestone (not implemented):** "4E — CANVAS document freshness and navigation readiness":
- explicit, conflict-safe reload of clean CANVAS drafts on external note change;
- an explicit readiness handshake for cross-module navigation (await view open and state restore), with native instrumentation to prove or retire the PATCHBOOK race;
- optional selection-render optimisation.

Section/marker MIDI meta export and colour categories remain later candidates.

## Q. Repository state

Signed baseline: `0a3dc72` (4C). 4D is **uncommitted**, pending human review. No remote push, no publish, and signing configuration was untouched. TROUBADOUR was not accessed, and only the disposable `dev-vault/` was used.

Modified files (21): AGENTS.md, CLAUDE.md, docs/{ARCHITECTURE, DATA_MODEL, DECISIONS, DESIGN_DIRECTION, RISKS, ROADMAP}.md, and:
- `src/application/document-session.ts`;
- `src/arrangement/{capture,compiled,preparation}.ts`;
- `src/modules/canvas/{library,performance-panel,structure-panel,timeline,view}.ts`;
- `src/modules/{motif,patchbook}/view.ts`;
- `styles.css`;
- `tests/canvas-view.test.ts`.

New files:
- `scripts/canvas-4d-{native,benchmark}.mjs`;
- `src/modules/canvas/rename-merge.ts`, `src/ui/modal-host.ts`;
- `tests/{canvas-invalidation,canvas-rename,modal-host}.test.ts`;
- this report, `docs/validation/milestone-4d-native.json`.

`scripts/canvas-4c-benchmark.mjs` was temporarily patched (null-safe prefix) for the same-host A/B run and then restored. The 4C performance evidence file was backed up and restored byte-identical.
