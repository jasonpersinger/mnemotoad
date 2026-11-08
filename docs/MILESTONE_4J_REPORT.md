# Milestone 4J report — unified interface and composition workflow refinement

Prompt: MNEMOBARD Codex Prompt 018 (Milestone 4J), executed by Claude Code. Baseline: signed 4I commit `a847c3e`. Date: 2026-11-08.

## A. Executive summary

**What changed.** An audit-led refinement of the existing interface. All capabilities, labels, shortcuts and behaviours are preserved.
- **Shared page structure** (`ui/page.ts`): every module opens with the same compact header (identity left, module actions right), then the document with **one** filled primary action and a *Record actions* disclosure for secondary and destructive actions.
- **The musical surfaces take the remaining height.** At 1366×900:
  - the MOTIF piano roll now starts 357 px down instead of 525 px, and is 523 px tall instead of 382;
  - the CANVAS timeline starts at 347 px instead of 375, and is 525 px tall instead of 368;
  - the PATCHBOOK record starts at 252 px instead of 377.
- **CANVAS:**
  - the six previous/next buttons sit in one *Go to · [ ] , .* disclosure;
  - the transport state is a chip that states the condition in words;
  - Play is outlined so Save is the only filled primary.
- **MOTIF note inspector:**
  - shows the primary note's identity, and says when several notes are selected that only the primary one changes;
  - puts the musical position first;
  - adds live read-outs (note name, musical length);
  - validates in words, with Apply disabled until the values are valid.
- **Export dialog:** essentials first.
- **Recovery register:**
  - separates the filter panel from the results;
  - uses compact rows;
  - on narrow panes, opens the inspector inline under its row.
- **CSS:** one unified layer using host theme variables only, with one focus ring, sentence-case section labels and a reduced-motion rule.

**What did not change:** musical timing, the compiler, MIDI output (golden fixture `85c8ecf3…` unchanged; zero diff in `src/midi`, `src/music`, `src/arrangement`), schemas and persistence, recovery formats and protections, the undo policy and accounting, source-review safeguards, and keyboard shortcuts.

**Result: PASS.** All 25 acceptance criteria are met (K, L, M). Known issues are non-blocking or deferred.

## B. Baseline

- **Git:** `main` at `a847c3e`, good signature (G), clean tree.
- **Checks:** 652 tests / 51 files; typecheck, lint and build pass with no warnings. Audit clean. Golden `85c8ecf3…`; Python check 10 / 4.
- **Baseline screenshots and layout metrics:** `output/mnemobard/milestone-4j/baseline/` (`scripts/mnemobard-4j-audit.mjs`, all three modules at 1366 and 680 px). Findings:
  - module headers took about 200 px everywhere;
  - MOTIF showed five equal document buttons above a full-width transport strip, with 51 controls above the roll;
  - CANVAS showed 12 equal toolbar buttons, six of them duplicating the `[ ] , .` keys;
  - PATCHBOOK showed four equal record buttons;
  - empty status containers and a bordered collapsed library added more height.
- **Performance baseline:** the 4I build (`771cdd8c…`, built from `a847c3e` in a scratch worktree), measured in the same Obsidian process as 4J (J).

## C. Design system

`ui/page.ts`:
- `moduleHeader(root, {className, eyebrow, title, tagline})` returns `{header, identity, actions}`.
- `recordActions(parent, label?, className?)` creates an inline disclosure that expands in place and never floats over content.

The CSS layer at the end of `styles.css` defines shared tokens on `.mnemobard-module`:
- **Hierarchy:** one filled primary per row (`mod-cta`); secondary actions as default buttons or in disclosures; destructive actions (`.mnemobard-destructive`) in the error colour, confirming next to where they were chosen.
- **Focus and status:** one 2 px accent focus ring for every button, summary, input, select and textarea; status always stated in words.
- **Typography:** sentence-case section labels; product names stay capitalised.
- **Space and motion:** empty drafts containers collapse while the feedback live region stays rendered; `prefers-reduced-motion` removes transitions.

A static test (`tests/interface-styles.test.ts`) enforces host variables only, the focus ring, reduced motion and no uppercase transforms. Decisions: J01–J10.

## D. PATCHBOOK

- Shared header, with the register counts beside the title.
- *Edit record* is the primary action; *Record actions* holds Open Markdown record, Archive/Restore and Reload from note.
- Associations and effects-chain reading are unchanged and use human-readable names first, with UUIDs in ID details.
- The record now starts 125 px higher.
- Native workflow B: found "Night choir" with instrument and chain, opened and closed the editor, associated a new motif, navigated PATCHBOOK ↔ MOTIF, and the association persisted.

## E. MOTIF

- **Header:** shared.
- **Document row:** motif name · save status · *Save motif* · *Export MIDI* · *Record actions* (Open Markdown record, Reload saved motif, *Discard draft…* marked destructive; its confirmation appears beside the header).
- **Transport:** a slimmer strip; Play is outlined.
- **Roll height:** `clamp(360px, 100vh − 380px, 760px)`.
- **Toolbar:** keeps the 4H groups and the 4I undo-depth read-out.
- **Note inspector:**
  - an identity line such as "G4 at 1:3:0", plus "· N notes selected — only this primary note changes" when several notes are selected;
  - Position (bar:beat:tick) first, then pitch with its note-name read-out, exact start tick, duration in ticks with a musical-length read-out, and velocity;
  - an inline error such as "Velocity: enter a whole number from 1 to 127." with Apply disabled; nothing commits while typing (unit-tested).
- **Large documents:** verified at 16, 500, 5,000 and 10,000 notes; no per-pointer clones were added, and edit commits did not regress (J).

## F. CANVAS

- **Header:** shared.
- **Composition row:** unchanged, now with the shared *Record actions* styling.
- **Transport:**
  - Compile, Play (outlined), Pause, Resume, Stop and Return to start;
  - a state chip with the same words as before ("Ready to compile", "Compiled · matches this unsaved draft", "Compiled · matches the saved composition", "Stale · Source review required · 1 motif", "Not ready · fix arrangement errors", "Composition changed elsewhere · resolve before compiling", "Compile failed · see diagnostics", "Playing compiled arrangement");
  - `data-tone` gives emphasis (attention, active, ready, neutral), never meaning on its own.
- **Toolbar:** Add lane · Place motif · Undo · Redo | Placement grid · Time − · Time + · *Go to · [ ] , .* (previous/next clip, section, marker).
- **Timeline:** height `clamp(320px, 100vh − 420px, 720px)`. Clip, lane, ruler and section rendering on the canvas is unchanged (J10).
- **Source review:** the 4H hierarchy is kept (summary, changes, placements, technical details, sticky actions, *Open motif in MOTIF*); no automatic acknowledgement.
- **MIDI export:** summary → destination → *Create arrangement MIDI* / *Cancel export* → *Importing into REAPER* → note → technical details. Export behaviour unchanged.

## G. Recovery register

- **Presentation:** filters sit in a bordered panel apart from the results; rows are more compact; the selected row has an accent title and left rule.
- **Narrow panes** (stacked layout): the inspector opens inline directly under its row, so the place in the list is kept. A `ResizeObserver` moves it beside the list when the pane widens, and *Close inspector* returns focus to the row.
- **Preserved:** all search and filters, 25/50/100 pages, every checkpoint, module-specific inspection, missing-source and conflict protections, cross-module navigation, read-only browsing and explicit consent. No eager reads were added.
- **Native workflow E:**
  - search, CANVAS and "Unsaved draft of a saved record" filters → "Showing 1–1 of 1 checkpoint";
  - a changed-source conflict ("CONFLICT: authoritative source changed after this checkpoint…") kept *Load draft without saving* disabled until the consent box was ticked, and disabled again when unticked; nothing was loaded;
  - every vault file was identical before and after browsing;
  - the checkpoints were discoverable after a cold restart.

## H. Responsive behaviour

Native, all three modules at 1366, 980 and 680 px: no horizontal overflow, and no control outside the view (`native-part1.json` layouts).

| Width | Observation |
|---|---|
| 1366 px | Header in one row; document row in one row; roll and timeline about 523 px tall |
| 980 px | MOTIF document actions wrap under the name |
| 680 px | Headers wrap; toolbars wrap predictably; the roll and timeline keep their bounded height and scroll horizontally (musical time is never compressed); the register inspector opens inline |

A narrow Obsidian sidebar pane was not tested separately; 680 px covers the same stacked layouts.

## I. Accessibility

- **Keyboard:**
  - Tab from the motif name reached *Save motif* with a visible solid 2 px ring;
  - every disclosure is a native `summary`, so it is keyboard-operable;
  - Enter on register rows opens the inspector (4I);
  - existing shortcuts are unchanged and no new shortcuts were added.
- **Dialogs:**
  - focus was inside the MOTIF export and CANVAS export dialogs when they opened;
  - Escape closed the MOTIF export dialog;
  - the review dialog keeps its 4H keyboard behaviour.
- **Status announcements:** the save status, feedback, transport state, note-inspector identity (`aria-live`) and validation (`role=alert`) are announced; no state relies on colour alone.
- **Contrast:** host theme variables only, legible in both dark and light themes (screenshots 19 and 20).
- **Reduced motion:** honoured.
- **Canvas content:** accessible alternatives are the existing note list, clip list and inspectors.

## J. Performance

All comparisons use the 4I build against the 4J build in one Obsidian process.

**Full benchmark** (4G method, `performance-comparison.md`; rule: regression if over 25 % **and** over 5 ms):
- MOTIF 16 to 10,000 notes, all operations within the rule. 10,000-note drag 26.8 → 22.9 ms; resize 24.1 → 18.9 ms; undo 9.4 → 7.5 ms; warm open 126 → 131.9 ms (+4.7 %); note selection 2.1 → 2.7 ms.
- CANVAS 32×1,000: open 60.4 → 60.4 ms, drag 32.8 → 32.3 ms, clip selection 5.7 → 5.7 ms.
- PATCHBOOK patch selection 35.8 → 25.9 ms.
- **One flag:** *canvas/16x200/openWarm* 23.9 → 32.2 ms (3 samples). An alternating A/B with 20 samples three times per build measured 4J 20.7 / 21.3 / 21.1 ms against 4I 19.1 / 19.9 / 21.8 ms, about +1 ms. Not a regression (`retries.json`).

**Edit commits** (`edit-profile-baseline-4i.json` vs `edit-profile-final.json`, every size and operation): no regressions. At 10,000 notes, move 25.0 → 21.9 ms, resize 25.1 → 21.9 ms, undo 5.1 → 5.4 ms.

**Recovery register** (real collection, 1,027 / 1,055 checkpoints, which grew during the workflows):

| Operation | 4I | 4J |
|---|---:|---:|
| Listing | 11.3 ms | 11.1 ms |
| First page | 101.7 ms | 101.8 ms |
| Render | 4.9 ms | 6.2 ms |
| Search / filter / sort / next page | ~4.3–5.2 ms | ~6.2–6.3 ms |
| 100 per page | 7.8 ms | 10.8 ms |
| Small-checkpoint inspector | 2.6 ms | 3.0 ms |

Synthetic 10,000-checkpoint search: 8.1 → 11.4 ms. The register is about 1–3 ms slower per change because rows and inspector are re-placed; all values stay under the targets (first page under 250 ms, changes under 50 ms, small inspection under 50 ms) and under the 5 ms regression floor.

## K. Automated testing

**Totals:** 660 tests / 52 files (652 / 51 before). 8 new:
- `motif-view` (+2): page structure and Record actions with destructive placement; the note inspector's identity, read-outs, validation and no commit while typing.
- `canvas-view` (+1): header, *Go to* contents, the zoom buttons that stay visible, and the transport chip.
- `patchbook-view` (+1): primary *Edit record* and Record actions contents.
- `recovery-register` (+1): inline narrow inspector, re-render, widening and close focus.
- `export-guidance` (+1): essentials-first order.
- New `interface-styles` (2): host variables only, focus ring, reduced motion, no uppercase.

No existing test was changed, removed or weakened. Golden MIDI is unchanged. `pnpm check` (typecheck, ESLint, Vitest, production build) passes, and the audit is clean.

## L. Native validation

`scripts/mnemobard-4j-native.mjs` (part 1) and `--verify-restart` after a cold restart, in the isolated Obsidian 1.15.0 on the disposable `dev-vault`, with disposable "4J Lantern" records. The theme was recorded and restored. Both phases passed with **0 renderer exceptions**.

| Workflow | Result |
|---|---|
| A | New motif; 96 BPM 3/4; 4 notes; primary note edited to G4 at 1:3:0, 480 ticks, velocity 90; undo/redo exact; played and stopped; saved; reopened identical; exported and independently verified (2 tracks, 960 PPQ, 4 notes); export-dialog focus inside; Escape closed it |
| B | Patch found; editor opened and closed; motif associated and saved; PATCHBOOK lists it; navigation both ways; association persisted |
| C | New composition, 2 lanes; two placements; second clip moved to 3:1:0 and repeated ×3 (start 7680); section "Opening" and marker "Turn"; compiled ("Compiled · matches this unsaved draft", ready tone); played ("Playing compiled arrangement", active tone); saved and reopened identical; exported and verified (3 tracks, 35 notes) |
| D | Source changed and saved → "Stale · Source review required · 1 motif"; review summary with one placement and *Open motif in MOTIF*; explicit acknowledgement; recompiled; placements identical; motif and composition notes byte-identical until the explicit Save |
| E | As in G, plus the restart check |
| Layout | No overflow or unreachable control in 3 modules × 3 widths; keyboard focus visible; 10,000-note motif opened |

**Screenshots** (`output/mnemobard/milestone-4j/`): `01-patchbook-library`, `02-patchbook-record-editor`, `03-patchbook-associations`, `04-motif-workspace`, `05-motif-selected-note`, `06-motif-transformations`, `07-motif-10000-notes`, `08-canvas-arrangement`, `09-canvas-selected-clip`, `10-canvas-transport-active`, `11-canvas-source-review`, `12-canvas-midi-export`, `13-recovery-wide`, `14-recovery-selected`, `15-recovery-narrow`, `16-motif-narrow`, `17-canvas-narrow`, `18-patchbook-narrow`, `19-dark-overview`, `20-light-overview`. Before/after comparisons are in `baseline/` and `final/`, each with `metrics.json`.

**Regression suites** in fresh processes (`regressions/`), with counts identical to 4I: 4E CANVAS 18 + 2, MOTIF 7 + 12, MOTIF-MIDI 11 + 5, PATCHBOOK assets 6 + 6, Foundation 11.

## M. Known issues

| Issue | Class |
|---|---|
| Timeline lane-area labels (SECTIONS, MARKERS, LANE / SOURCE) and clip text are canvas-drawn and keep their 4D all-caps presentation | Deferred (would touch timeline rendering) |
| Open Markdown, Reload, Discard and Archive now take one extra click (*Record actions*) | Non-blocking (by design) |
| The note inspector shows "480 ticks" for durations shorter than a beat (no fractional-beat wording; exact by design) | Non-blocking |
| No assistive-technology (screen-reader) certification run | Deferred (pre-existing) |
| Three unsaved disposable compositions from failed script attempts are listed under *Pending arrangements* in the dev vault | Non-blocking |
| Large-checkpoint inspection is ~0.5 s (4I) | Deferred (outside 4J) |
| Pre-existing typo "up to50 rows" in the MOTIF note register | Non-blocking |

No blockers.

## N. Milestone 5 readiness

**Ready to enter integration and release preparation, subject to your review.**
- The composition journey (create, edit, associate, arrange, audition, export, recover) passed end to end natively.
- The interface is consistent across modules and works in both themes and at narrow widths.
- The safety contracts are unchanged and evidenced (MIDI bytes, timing, persistence, recovery, undo).

Items worth deciding at the start of Milestone 5:
- a checkpoint retention policy;
- a screen-reader pass;
- whether to modernise the canvas-drawn timeline labels;
- the DAW end-marker product question carried over from 4H.

## O. Git status

- **Commit:** one local, GPG-signed commit on `main` on top of `a847c3e`, using the existing signing configuration. The hash is given in the final summary and in `git log`. Nothing was pushed.
- **Changed source:**
  - new `ui/page.ts`
  - `modules/motif/{view,inspector}.ts`
  - `modules/canvas/{view,performance-panel,export-dialog}.ts`
  - `modules/patchbook/view.ts`
  - `ui/recovery-inspector.ts`
  - `styles.css`
- **Tests:** new `interface-styles`; extended `motif-view`, `canvas-view`, `patchbook-view`, `recovery-register`, `export-guidance`.
- **Scripts:** new `mnemobard-4j-audit.mjs`, `mnemobard-4j-native.mjs`; `mnemobard-4i-recovery-benchmark.mjs` gained an output-directory override.
- **Docs:** DESIGN_DIRECTION, ARCHITECTURE, DECISIONS (J01–J10), ROADMAP, RISKS, DEVELOPMENT, this report, `docs/validation/milestone-4j-native.json`, CLAUDE.md, AGENTS.md, progress.md.
- **Working tree:** clean after the commit.
