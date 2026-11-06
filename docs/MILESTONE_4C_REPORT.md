# Milestone 4C — Arrangement structure, sections, markers and recording references

Date: 2026-11-06. Authority: Prompt010 only. Agent: Claude Code (takeover from Codex). **PASS for the verified Linux desktop scope**, with the limitations in sections F, I, M and O. No 4D/5 work, publication or remote push.

## A. Executive summary

CANVAS can now plan a whole piece. You can create named **sections** and edit them by name, exact `bar:beat:tick` bounds, description, move, resize, reorder-by-swap and delete, under a non-overlap policy. You can create named point **markers** (positions can be shared and are never merged). Sections and markers can be reached with **playhead-relative navigation**. **Recording references** point to existing vault audio, with notes, section/marker association, an availability state, an Open action, explicit relink, a rename suggestion and confirmed removal. Everything persists in the existing composition note, survives save, close and cold restart, and undoes and redoes as one history entry per operation. Navigation creates no history entries.

There's no schema bump, migration, new dependency or MIDI-format change. Golden arrangement MIDI is byte-identical. A native arrangement exported after adding 3 sections, 5 markers and 2 references is **byte-identical** to the export taken before any structure existed.

Automated: **492 tests across 38 files** (449 baseline + 43 new), strict TypeScript, ESLint and production build pass. In the real host (Obsidian 1.15.0, Linux), the 4C workflow passes 15 checks plus a cold-restart phase, and the MOTIF, MOTIF-MIDI, PATCHBOOK-assets and foundation native regressions pass, including their restart phases.

## B. Claude Code handoff

Onboarding read AGENTS.md, the product, architecture, data-model, decisions, design, risks and roadmap docs, and the 3B, 4A and 4B reports, plus the actual sources for composition persistence (`storage/document.ts`), schema validation, sessions and history, CANVAS view/timeline/geometry/commands, the arrangement compiler and capture, transport and seek, and the asset ports.

What was learned, as source facts:
- Schema 1 already defines and validates `sections`, `markers` and `audioRefs`, created empty on every new composition. 4C activates them instead of inventing structures.
- `HistorySession.edit` clones, transforms and re-validates before pushing one entry, so failed edits leave no entry.
- The writer's `retainExtensions` re-merges old object fields by ID. Any new optional field must be registered per array context, or clearing it is silently undone on save.
- `DocumentSession.draft` deep-clones on every read (see K for the consequence).
- The 4B input fingerprint hashes the whole composition.

Discrepancies between reports and source:
- DATA_MODEL describes listening for renames of `audioRefs.path`; **no such code existed**. 4C implements the documented user-approved alternative (S04).
- DATA_MODEL's historical export proposal mentions section/marker labels in the conductor track. That was never implemented and stays excluded (prompt §14).
- The 4B report states "No remote configured"; this is still true.

Context preserved: AGENTS.md remains the governing file; only its "Current authority" paragraph was updated (Prompt010/4C, with the 4B paragraph kept as historical). A concise **CLAUDE.md** was created that links to AGENTS.md and the docs rather than duplicating them.

## C. Git baseline

All 57 pending 4B paths matched `docs/validation/milestone-4b-native.json` exactly. A diff and secret scan found only documentation prose, a local runtime path already in 4B evidence, and the binary golden fixture; dev-vault, output, node_modules and main.js are gitignored. Baseline `pnpm check`: typecheck, lint and **449 tests across 37 files** pass, and the build passes. Signed local commit **a64b267** (`feat: establish verified Milestone 4B arrangement compilation and playback`) has a good EdDSA signature. Signing configuration is unchanged, and there's no remote.

## D. Sections

**Schema:** `{id, label, startTick, endTick, description?}` plus preserved unknown fields. Ticks are exact integers at PPQ 960; ranges are half-open. Existing local IDs remain valid; new records use UUIDs.

**Validation:**
- At load (unchanged schema 1 plus optional text): nonempty label; `0 ≤ start < end ≤ length`.
- At edit time (`structure.ts`): positive duration, inside the composition, ≤200-character label, ≤10,000-character description, ≤256 sections, and **no overlap with any other section**. Adjacency and gaps are allowed; neighbours are never moved; the rejection names the conflicting section.
- Overlaps written by another tool still load, are preserved, and show as `!` in the ruler and as a panel warning (S02).

**Editing:** create, rename, describe, exact start/end, move (duration preserved), resize, reorder (swap timeline order with the neighbour, keeping durations and the gap; clips never move), delete (dependent reference associations are cleared in the same transaction; the records are kept). Pointer: drag a body to move, drag an inner edge zone to resize, double-click empty band to create (4 bars, clamped to the next section). The keyboard/numeric panel offers every operation.

**UI:** a 22px SECTIONS band in a fixed ruler canvas above the scroller, sharing the timeline's `TimelineViewport`, culling and DPI backing (S07). Labels are clipped to the visible width. Selection is shown by bold text, a ▸ glyph and an outline, not color alone. The current section during audition gets an underline. Dashed boundary guides run through the lanes.

## E. Markers

**Schema:** `{id, label, tick, description?}`; the tick may equal the composition end. Duplicate positions are kept; ordering is deterministic (tick, then label, then ID, by code-point comparison), never merged. The ruler shows `Label +N` for shared positions, and the panel says "shares position".

**Editing:** create, rename, describe, exact position, pointer drag (grid-snapped), double-click create, delete (dependent associations cleared, records kept). Limit 1,024.

**Navigation (S08):** the Previous/Next section and marker buttons and the list rows. Stepping is playhead-relative; while the selected item sits at the playhead, stepping walks the ordered list, so markers sharing a tick are each reachable; there's no wrap-around. Navigating reveals the viewport and places the **stopped** playhead. During audition it stops first (it never starts playback), and it creates no history entry.

## F. Recording references

**Storage:** `{id, label, path, atTick, description?, sectionId?, markerId?}`. `atTick` stays required (user decision S03) and acts as the timeline anchor; the default is the associated marker, else the section start, else `1:1:0`. Paths are vault-relative and validated by the existing `vaultPath()` (rejecting absolute paths, traversal, URI schemes and reserved characters) and must have an audio extension (`wav mp3 flac ogg oga m4a aif aiff opus webm`, user decision). Hidden folders are excluded from the picker.

**Safety:** add, edit, relink and remove change only composition metadata. Recording **bytes are never read**: availability comes from vault metadata. Files are never copied, moved, renamed, played, analysed or deleted. Native evidence: three synthetic WAVs (including a renamed, a moved and a removed-reference file) are SHA-256-identical to their creation hashes, and the memory-vault tests show zero reads of audio files.

**Navigation:** "Open recording" uses the host's `openLinkText` (Obsidian's own audio view). "Jump to anchor" places the playhead.

**Missing files:** the record is preserved with "⚠ Missing recording … The reference is preserved; relink it explicitly", its metadata stays inspectable, Open is disabled, the summary counts it as unavailable, and it survives save and cold restart. Explicit relink keeps the identity, notes, anchor and associations, and is undoable.

**Renames (S04):** each reference is mirrored in the existing `mnemobard_audio` frontmatter list. In-app renames are rewritten by Obsidian (natively observed: "Updated 1 link in 1 file"). When exactly one stored path is missing and exactly one mirrored link resolves to an otherwise unused file, the panel *suggests* "Relink to renamed file", applied as one undoable edit only on confirmation. There's no basename matching. Renames made outside Obsidian, or ambiguous cases, fall back to Missing plus explicit Relink.

**Removal:** an inline confirmation states that the file "is not deleted or changed"; only the exact mirror link is removed, and only when no other reference uses that file. User-authored links are untouched.

**Limitations:**
- Renaming a referenced file while the composition has *unsaved* edits rewrites its frontmatter, so the next Save hits the protected conflict path (safe; requires discard or reload).
- A rename to a filename containing `# [ ] |` would yield a link that schema 1 rejects. This is pre-existing for all asset links.
- No external, absolute or non-vault files are supported.

## G. Persistence and compatibility

There's no schema bump. Additive optional fields are listed in the DATA_MODEL 4C section, and each is registered in `retainExtensions`, so clearing a description or association deletes it. A test confirms it isn't resurrected from the file.

Round-trip tests cover all fields, stable IDs and the frontmatter mirror; unknown `color`, `futureCategory` and `x-cue` fields survive edits. 4A/4B-style records (local IDs, no optional fields) load unchanged and remain editable. Future schema stays protected, and malformed optional fields are rejected at load. Opening never writes (natively: the 4B composition opened clean, with data identical to the saved Markdown).

Protected Save is unchanged. In the native run, an external modification made Save refuse; the vault kept the external prose and the draft kept the new marker. The recovery checkpoint contains the marker and shows the existing CONFLICT warning; discard plus reopen restores the external version with all structure intact. The cold-restart phase compared saved Markdown byte-for-byte.

## H. Undo/redo

Every persisted operation (section create/edit/move/resize/swap/delete, marker create/edit/move/delete, reference add/edit/relink/remove, suggested relink of several references) is exactly one `HistorySession.edit` entry: validated, atomic, and with **no entry for rejected edits** (tested: 3 successful edits produce 3 entries; overlap rejections produce none). Pointer gestures preview locally and commit once on release. Selection, navigation, paging, opening a file and the panel's Discard create no entries. The history budget (100 entries / 16 MiB) is unchanged.

## I. Compiler and playback regression

The compiler, routing, collision and export code are unchanged; nothing in `src/arrangement` or `src/midi` reads structure fields. A unit test shows byte-identical MIDI and identical events and lanes with and without structure. `node scripts/arrangement-fixtures.mjs` passes 10 valid fixtures and 4 rejections with independent Python verification; the golden fixture SHA-256 is unchanged (`85c8ecf3…ab77`). Natively, the baseline export matched the 4B native export bytes, and the export after structure matched the baseline (532 bytes) and parsed independently.

Playback: navigation during audition stops and then places the playhead; the compiled state stays `ready`, ownership is released, and playback can restart from the new position. **A structure *edit* during audition invalidates and stops it**, because the 4B fingerprint covers the whole composition (S09, retained deliberately). Disabling the module during audition stopped audio and disposed the structure panel.

## J. Visual review

Dark-first, using Obsidian theme variables only, with a muted violet accent for selection. The timeline remains dominant; the ruler is 42px and the Structure panel is a collapsed `<details>` below the timeline. Screenshot review led to four fixes:
- an empty fourth grid track (groups now have their own grid);
- clipped missing-file warnings (taller reference list);
- cramped description fields (textareas now take a full row);
- a stray tail of an off-screen marker label.

All screenshots below are from the final build, in [`output/canvas/milestone-4c/`](../output/canvas/milestone-4c/) (actual Obsidian captures; earlier milestone evidence is preserved).

| File | Evidence |
| --- | --- |
| 01-section-ruler.png | Arrangement with section ruler. |
| 02-named-sections.png | Three named sections, list view. |
| 03-selected-section.png | Selected section (bold, ▸, outline) and dashed guides. |
| 04-section-editor.png | Numeric section editor. |
| 05-overlap-rejected.png | Rejected overlap naming the conflicting section. |
| 06-marker-ruler.png | Marker band, `Choir entrance +1` for a shared position. |
| 07-multiple-markers.png | Five markers, deterministic order, "shares position". |
| 08-marker-editor.png | Marker editor. |
| 09-marker-navigation.png | Playhead placed by Next marker. |
| 10-reference-panel.png | Recording reference panel. |
| 11-reference-section.png | Reference associated with a section. |
| 12-missing-reference.png | Missing warning, Open disabled, actions available. |
| 13-saved-reopened.png | After cold restart. |
| 14-dark-workspace.png | Dark full workspace. |
| 15-light-theme.png | Light (Moonstone) compatibility. |
| 16-narrow-pane.png, 16b-narrow-structure-panel.png | 650px, no horizontal overflow (571 = 571). |
| 17-high-dpi.png | 2× DPI (ruler backing 2554 for 1277 CSS px). |
| 18-save-conflict.png | Protected Save conflict. |
| 19-recovery.png | Recovery checkpoint with CONFLICT warning. |
| 20-rename-suggestion.png | Rename relink suggestion. |

Accessibility: semantic buttons, labeled inputs and selects, `aria-pressed` list rows, a `role=status` region, a focusable ruler with a visible focus ring, and keyboard Enter/Tab verified natively through CDP key events. **No screen-reader certification is claimed.**

## K. Performance

Measured in the actual host (AMD Ryzen 7 5700G, 16 logical CPUs, 29.3 GB RAM, CachyOS 7.3.1, Obsidian 1.15.0 / Electron 43.8.6, `--disable-gpu`). Synthetic 4/4, 400-bar compositions reuse the 4B lanes and clips; every reference points to a real WAV. Values are the median of 7 samples (3 for open and save), timing production paths through the UI's own callbacks. Raw samples: `output/canvas/milestone-4c/performance.json`.

| Median ms | Small 5/10/3 | Medium 25/100/20 | Large 100/500/100 |
| --- | ---: | ---: | ---: |
| Initial render (open composition) | 35.2 | 50.5 | 80.5 |
| Structure panel render | 3.9 | 9.3 | 13.0 |
| Timeline + ruler draw | 0.2 | 0.2 | 0.3 |
| Section selection | 8.2 | 14.3 | 24.4 |
| Marker navigation | 8.3 | 14.2 | 24.7 |
| Section move | 10.6 | 19.0 | 41.5 |
| Section resize | 10.8 | 19.0 | 42.7 |
| Marker move | 10.8 | 20.1 | 39.7 |
| Undo + redo (2 ops) | 22.0 | 35.4 | 72.9 |
| Save | 12.1 | 29.8 | 106.5 |
| Zoom | 0.4 | 0.6 | 0.8 |
| Horizontal scroll | 0.2 | 0.2 | 0.4 |
| Reference resolution (all) | 0.1 | 0.3 | 1.1 |

**Defect found and fixed during measurement.** The first large run took ≈2.5 s to open and ≈1.5 s per edit. Profiling attributed 1,369 of 1,498 ms to position-label formatting. The root cause wasn't the timing math: the panel read `session.draft`, which deep-clones the composition on every access (0.5 ms each), twice per label. One snapshot per render fixed it, and 50-row paging (the clip-register convention) keeps DOM and layout flat. Per-frame work (draw, zoom, scroll) is ≤1 ms at every tier. Commit-time costs scale with composition JSON size (validation and cloning).

The 4B arrangement limits are unchanged. Benchmarks ran on the final build minus the final cosmetic label-visibility guard (one comparison in `drawStructure`).

## L. Automated testing

`pnpm check`: typecheck, ESLint, **492 tests across 38 files**, and the production build all pass. That's +43 tests: `tests/canvas-structure.test.ts` (36), the geometry hit-testing test (1), and 6 jsdom view tests (keyboard panel CRUD and overlap, navigation without history, duplicate stepping, references and missing files, paging, subscription disposal). No existing test was modified or weakened.

`pnpm audit`: 0 vulnerabilities across 229 dependencies. `package.json` and `pnpm-lock.yaml` are unchanged, and nothing was installed.

## M. Native Obsidian verification

Scripts: `scripts/canvas-4c-native.mjs` (phase 1, then `--verify-restart`) and `scripts/canvas-4c-benchmark.mjs`, run in the marked `dev-vault` through the existing guarded CDP client. Results are in `docs/validation/milestone-4c-native.json`.

| Prompt steps | Result |
| --- | --- |
| 1–4 | Startup; 4B composition opened clean; lanes, clips, routing and revisions intact; baseline export equals the 4B export. |
| 5–11 | Three sections; rename; **real pointer** move and resize; numeric and drag overlap rejected; undo/redo. |
| 12–16 | Markers incl. duplicates; pointer move; navigation; pixel-sampled alignment over 4 zoom/scroll states. |
| 17–25 | Synthetic WAV references; notes; section and marker association; Open in Obsidian's audio view; rename suggestion; missing file preserved; confirmed removal; files unchanged. |
| 26–30 | Save, close and reopen; MIDI byte-identical and independently parsed. |
| 31–32 | Playback plus navigation stop-and-locate; edit-invalidation behavior. |
| 33–37 | Narrow 650px, dark, light, 2× DPI, keyboard Enter/Tab, ruler focus. |
| 38–39 | Protected Save conflict and recovery. |
| 40–41 | Module and plugin disable/enable, including during audition. |
| 42–44 | Cold restart: Markdown byte-identical, structure identical, missing reference relinked. |
| 45–46 | MOTIF and PATCHBOOK-assets regressions pass, including restart phases; MOTIF-MIDI and foundation pass. |

**Host problems found and how they were handled.** These are not 4C defects; both reproduce with the signed 4B build:
- **Stale active window.** After some cold restarts, Obsidian's `activeDocument` referenced a *detached* document (a closed popout's), so every `Modal` mounted invisibly and its buttons never fired (MOTIF and CANVAS export both stalled with an empty status). Proven with `document.contains(button) === false` and `defaultView === null`. Refocusing the main window repairs it. The 4C harness now asserts `activeDocument === document` (the final run needed no repair).
- **Wedged rename.** In that same long-lived degraded process, `fileManager.renameFile` never settled. A fresh process resolved it; in the final process the rename completed normally.
- **MOTIF-MIDI first-run failure.** The first MOTIF-MIDI run after a restart failed once at PATCHBOOK cross-navigation. A control run with the **4B build** in the same healthy process passed, and the 4C build then also passed (phase 1 and restart). This is order-dependent harness state, not a 4C regression; its root cause was not determined.

Harness defects corrected along the way: off-screen drag coordinates, Enter key events without `text`, leftover drafts from aborted runs (the harness now restores the recorded 4B bytes of its own test composition), the recovery textarea assertion, the export dialog's button label, CDP 20 s budgets, and the zsh word-splitting loop.

Unverified: Windows, macOS, and other installers; screen readers; touch input; audible output (recordings are never played by MNEMOBARD).

## N. Architecture decisions

See [S01–S11](DECISIONS.md#prompt010--milestone4c). User-confirmed: `atTick` stays required, a frontmatter mirror plus suggested relink, audio-only references, and color/category deferred.

Alternatives rejected:
- an in-schema overlap check (would break loading of existing data);
- enlarging the in-canvas ruler (would alter lane geometry and an existing test);
- a separate scroll container;
- excluding structure from the 4B fingerprint (a compiler-policy change);
- modifying the shared `musicalPosition` (it wasn't the bottleneck).

New production files: `src/modules/canvas/structure.ts` and `structure-panel.ts`. Narrow changes:
- `entities.ts`: optional field types;
- `validation.ts`: optional text checks;
- `document.ts`: optional-field registration;
- `library.ts`: recording helpers;
- `geometry.ts`: ruler hit testing;
- `timeline.ts`: ruler canvas and gestures;
- `performance-panel.ts`: `locate()` and `currentTick`;
- `view.ts`: wiring and nav buttons;
- `main.ts`: link resolver;
- `styles.css`.

Deviations: none from the prompt's recommended policies. Reorder is interpreted as an exchange of timeline order (sections are positioned in time).

## O. Next-milestone readiness

Ready for human review. Recommendations for a separately scoped next milestone, **not started**:
1. Structure-aware audition invalidation: fingerprint only musical inputs, so marker edits don't stop playback. Needs compiler-policy review.
2. Investigate and defensively handle the host stale-active-window condition (affects every Modal in all modules).
3. Optional section/marker export as MIDI meta events, with independent-reader verification.
4. Color/category for sections and markers.
5. Cross-platform and screen-reader validation.
6. Unchanged 4B items: DAW import evidence, audible latency.

## P. Repository state

HEAD is **a64b267** (the signed 4B baseline). All 4C work is **uncommitted for review**; the manifest is in `docs/validation/milestone-4c-native.json`. Changed tracked paths: `AGENTS.md`, `docs/{ARCHITECTURE,DATA_MODEL,DECISIONS,RISKS,ROADMAP}.md`, `findings.md`, `progress.md`, `task_plan.md`, `src/domain/{entities,validation}.ts`, `src/main.ts`, `src/storage/document.ts`, `src/modules/canvas/{geometry,library,performance-panel,timeline,view}.ts`, `styles.css`, `tests/canvas-{geometry,view}.test.ts`. New: `CLAUDE.md`, `docs/MILESTONE_4C_REPORT.md`, `docs/validation/milestone-4c-native.json`, `scripts/canvas-4c-{native,benchmark}.mjs`, `src/modules/canvas/{structure,structure-panel}.ts`, `tests/canvas-structure.test.ts`.

There's no remote and **no push occurred**; signing configuration is unchanged. All host work used the marked `dev-vault`, the project-local `.runtime` profile and CDP port 9227, and the isolated instance was stopped at the end. Synthetic recordings and benchmark compositions were added only to the disposable vault. No personal vault, recordings or music projects were accessed, and TROUBADOUR was not accessed. Historical reports and earlier screenshots are untouched. A temporary `git worktree` of a64b267 used for the 4B control builds was removed. **Stop after 4C for human review.**
