# MNEMOTOAD release candidate report (0.2.0)

Date: 2026-11-08. Repository `~/MNEMOBARD` (not renamed). Environment: Linux 7.3.1 (CachyOS), AMD Ryzen 7 5700G, isolated Obsidian 1.15.0 (Electron, X11) on disposable vaults only. Evidence lives under `output/release-candidate/` (git-ignored) unless a path below says otherwise.

## A. Executive summary

MNEMOBARD is now presented as **MNEMOTOAD** (*Remember what you’ve yet to compose.*). Every technical identity is kept, so existing records, settings, workspaces and recovery checkpoints carry over unchanged. This was verified natively by a byte-level upgrade of a vault holding 782 records and 1,081 checkpoints: 0 files changed.

The five canonical colours are centralised as scoped tokens and applied only where the measured contrast allows. Three deliberately primitive 24×24 toad concepts were produced and verified programmatically. Concept A, *The Familiar*, is integrated **provisionally**; it is not approved artwork.

Stabilisation found and fixed **one product defect**: the recovery register labelled checkpoints of never-saved records as *Original missing*. It also found and fixed **two regressions this milestone itself introduced** before release: the header-mark layout, and Play buttons becoming filled.

Validation results:

- **Automated tests:** 685 tests in 56 files.
- **Native validation:** the 21-step cross-module workflow with a cold restart, a fresh install, an upgrade, and every existing native regression suite.
- **Performance:** a same-process A/B against 4J shows no regressions.
- **MIDI:** byte-identical golden output and independent parser validation.
- **REAPER:** import verified.

**Verdict: CONDITIONALLY READY — SPECIFIC ITEMS REMAIN.** The remaining items are owner decisions (licence, author field, mascot approval) and platforms not tested. No engineering blockers are known. See R.

## B. Starting baseline

- HEAD `e1a6684` (4J, GPG-signed), branch `main`, clean working tree.
- `pnpm check`: 660 tests in 52 files, typecheck, lint and build all passed.
- Golden `tests/fixtures/arrangement-single.mid` SHA-256 `85c8ecf3…3ab77`. Python fixture verification: 10 valid, 4 rejections.
- Plugin manifest: id `mnemobard`, name `MNEMOBARD`, 0.1.0, minAppVersion 1.15.0, desktop only. Runtime dependencies: `yaml` 2.9.1 (ISC) and `midi-file` 1.2.4 (MIT).
- Architecture: PATCHBOOK, MOTIF and CANVAS module views over a shared index, repository and recovery stack (see `docs/ARCHITECTURE.md`).
- Known issues carried in: the CLAUDE.md "Known limitations (as of 4J)".
- **Reference image:** the brief said `salamander-transparent.png` was attached, but no attachment reached this session. Two byte-identical copies with that exact name were found in the owner’s own repositories (`~/hellbenderdigital/` and `~/jasonpersinger.github.io/`, SHA-256 `68e11e27…`). They were read only, and treated as the intended reference. **Please confirm this is the right image.**

## C. Rebrand

**Public-facing changes**, MNEMOBARD → MNEMOTOAD, in:

- manifest name and description (author: see O);
- view titles (`MNEMOTOAD · MODULE`);
- module eyebrows (`MNEMOTOAD / …`);
- command names (Obsidian prefixes them with the manifest name: `MNEMOTOAD: Open PATCHBOOK`, …);
- notices and error messages (11 strings);
- the settings About panel;
- README and all new documentation.

The module names PATCHBOOK, MOTIF and CANVAS are unchanged.

**Retained identifiers** (documented in the README table and DECISIONS T01):

| Identifier | Why it is kept |
| --- | --- |
| Plugin ID `mnemobard` | Keys enabled state, settings and updates |
| View types `mnemobard-*` | Saved layouts reopen views by type |
| Command IDs `mnemobard:open-*` | Hotkeys bind to them |
| Content root `MNEMOBARD/` and `MNEMOBARD/Assets` defaults | Where existing records live; fresh installs use them too, so a vault is never split across two roots (T02) |
| `mnemobard_*` front-matter keys and `mnemobard-motif` / `mnemobard-composition` data blocks | The schema-1 storage format |
| Recovery formats `mnemobard-recovery` / `mnemobard-editor-draft` | Existing checkpoints must stay readable |
| MIDI conductor track name `MNEMOBARD conductor` | Part of the exported bytes, pinned by golden fixtures |
| CSS classes and the disposable-vault marker | Internal only |

`tests/mnemotoad-compat.test.ts` (10 tests) pins:

- the manifest and version consistency;
- the view types;
- the default folders;
- unchanged loading of a 0.1.0 `data.json`;
- a guard that scans source string literals: the only `MNEMOBARD` literals left are the storage root, the asset root, the conductor name and the one About sentence explaining the rename.

It also loads a byte-exact corpus of MNEMOBARD-era records (`tests/fixtures/legacy-mnemobard/`: the 4F patch, two motifs and a composition, plus a 0.1.0 pre-save checkpoint). Those records index, resolve their references, match their stored source revisions (so there is no spurious source review), compile deterministically, save in place keeping keys and unknown fields, and catalogue their checkpoint correctly.

**Upgrade behaviour:** tabs that Obsidian has not loaded yet keep the cached title `MNEMOBARD · …` until opened once. This is host behaviour, verified natively, and documented in the README and troubleshooting.

## D. Brand identity and mascot

**Colours.** `#070707` Near Black, `#28231c` Dark Umber, `#317b22` Swamp Green, `#801a86` Occult Violet, `#f4e409` Sulfur Yellow. They are defined exactly once as `--mnemotoad-*` tokens at the top of `styles.css`, scoped to `.mnemobard-module`, `.modal.mnemobard-wide-modal` and `.mnemobard-settings`. A variables-only brand layer sits at the end of the file. No global or host variable is redefined (`tests/brand-tokens.test.ts`, 4 tests).

**Theme integration.**

- Violet: primary fills with a white label, and the header rule.
- Focus ring: violet in light themes, yellow in dark themes.
- Selection bar: violet in light themes, green in dark themes.
- Green: the "ready" chip.
- Near black, with an umber edge: the mascot plate in dark themes.
- Everything else uses Obsidian’s theme variables. Warnings keep host colours; yellow is not used for warnings.

**Contrast**, measured as WCAG ratios and asserted in tests:

| Pairing | Ratio | Use |
| --- | --- | --- |
| White on violet | 8.71 : 1 | Primary button label |
| Violet on white | 8.71 : 1 | Light focus and selection |
| Green on white | 5.27 : 1 | Light "ready" border |
| Yellow on `#1e1e1e` | 12.66 : 1 | Dark focus |
| Green on `#1e1e1e` | 3.17 : 1 | Dark selection; non-text |
| Green on near black | 3.8 : 1 | Dark mascot plate |

Rejected pairings, never used: violet on dark (1.91 : 1), yellow on light (1.32 : 1), green on umber (2.96 : 1); the last is why the plate is not umber.

Native computed styles (`output/release-candidate/screens.json`) confirm both themes. Dark: primary `rgb(128,26,134)` with white text, focus `rgb(244,228,9)`. Light: focus `rgb(128,26,134)`. The real dark surface is `#1c1c1c`, slightly darker than the tested `#1e1e1e`, so the tested ratios are conservative. State is never conveyed by colour alone.

**Reference analysis** (`output/release-candidate/mascot/reference-stats.json`): the image is 690×478 px drawn on blocks of about 22.5 px (measured from the single white highlight block, 22×23 px). That gives a **30×21 logical grid**, about **302 opaque logical pixels**, **four flat colours** (orange 85 %, dark red 6.5 %, black 5 %, white 0.3 %) and **0 partial-alpha pixels**. Derived constraints:

- no outline, flat fills, no shading or gradients;
- a black square eye with one highlight block;
- one darker colour for spots in 1–2-block squares;
- detail made with gaps;
- detached toe blocks.

**Concepts** (`assets/mascot/`). All three are **24×24** and use four of the five colours; violet was not needed.

| | A — The Familiar | B — The Grump | C — The Watcher |
| --- | --- | --- | --- |
| Opaque logical pixels | 326 | 262 | 314 |
| Bounding box | 24×17 | 24×13 | 22×18 |
| Green share | 88.7 % | 85.1 % | 85.7 % |
| Silhouette | Squat, forward-facing, clearly a toad | Widest and lowest; reads at a glance | Compact, tall eye bumps; slightly frog-like |
| Expression | Neutral, minimal | Slanted lids, down-turned corners; the most personality | Large 4×4 eyes (the reference’s eye construction), observant |
| Readability at 24 px | Best | Good silhouette, expression subtle | Good |
| Dark / light UI | Green on `#1c1c1c` 3.2 : 1; on white 5.3 : 1 (all three) | Same | Same |

**Fidelity assessment.** All three match the reference’s low fidelity: the same order of logical pixels (262–326 against 302), the same colour count, flat fills, no outline, no antialiasing, and single-pixel highlights. None is more detailed than the salamander. None uses accessories, gradients, glow or a background. They read as toads, not salamanders: squat, with no tail or long body.

**Provisional recommendation:** A, *The Familiar*, the most legible at native size and a natural fit for "a small familiar". **B** is the strongest alternative if more attitude is wanted. *This is not final approval.*

**Palette compliance** (`node scripts/mascot-verify.mjs`, independent decoder; results in `docs/validation/mnemotoad-mascot.json`). All 7 PNGs pass:

| Files | Size | Check |
| --- | --- | --- |
| 3 masters | 24×24 | Pixels equal to `sprites.json` |
| 3 previews | 192×192 | Every 8×8 block uniform and equal to its master pixel (nearest neighbour proven) |
| Concept sheet | 608×192 | Every block equal to the masters |

- Colours used: `#070707`, `#28231c`, `#317b22`, `#f4e409`.
- 0 partial-alpha pixels.
- No ancillary chunks.
- The generator is deterministic: byte-identical across runs.
- `tests/mascot.test.ts` (8 tests) also proves the verifier *rejects* an off-palette pixel, a partial-alpha pixel, wrong dimensions and a non-nearest-neighbour preview.

**Integration (provisional).** `src/ui/mascot.ts` draws concept A from `sprites.json` as crisp SVG at integer scales:

- the module header mark, 48 px, decorative (`aria-hidden`);
- the PATCHBOOK empty detail pane, 48 px;
- the settings About panel, 96 px, `role="img"` with a label.

There is no animation. Measured layout cost against 4J (same audit script): the working surface moves down ≤ 4 px at 1366 px and ≤ 3 px at 680 px (PATCHBOOK at 680 px moves up 6 px). 0 overflow, and the number of controls above the working surface is unchanged (`output/mnemobard/milestone-4j/rc/metrics.json`).

## E. PATCHBOOK

- **Verified natively.** The foundation and PATCHBOOK-assets suites passed against the RC build, with counts identical to 4J (6 + 6, Foundation 11): create and edit instruments and patches, link assets, inert preset inspection, import of a confirmed copy, navigation, recovery, disable/enable and cold restart. The 21-step workflow created an instrument and a linked patch through the real forms, and the patch lists the motif after restart. Upgrade: 71 instruments, 119 patches and 31 chains were intact.
- **Fixed:** the recovery-register *Never saved* labelling (shared by all modules, see I).
- **Limitations:** unchanged from 4J.

## F. MOTIF

- **Verified natively.** The MOTIF (7 + 12) and MOTIF-MIDI (11 + 5) suites passed with 4J counts: native pointer drawing, moving and resizing; chords; exact numeric editing; undo and redo; save and reload; MIDI import with fidelity checks and preserved PPQ; export with independent parsing; restart; checkpoint recovery. The 4I undo-depth checks at 5,000 and 10,000 notes passed (30 edits retained; 2.5 and 5.1 MiB estimated).
- **Observation from the 21-step run:** lengthening a note into the next same-pitch note was **refused**. The live feedback said *overlapping same-pitch notes are unsupported*, and the form kept the unapplied values with a Discard option. This is the intended protection, observed working through the UI. It is not a defect.
- **Limitations:** fixed tempo and meter; sine audition only.

## G. CANVAS

- **Verified natively.** The 4E CANVAS suite (18 + 2) passed: open, edit, placement collisions, sections and markers, inspector keys and Escape focus restoration, sticky timeline, narrow pane, dark/light themes and high DPI, cold restart with byte-identical reopen, and byte-identical export against its baseline. The 4J workflows A–E (7 + 2) passed.
- **The 21-step run covered:** creating a composition and two lanes; placing ×1, then repeating ×4; compiling; play, pause, resume and stop; export; and the changed-source review.
- **Determinism:** the compiler is deterministic on the legacy corpus (unit test).
- **Unchanged:** golden MIDI is unchanged.
- **Limitations:** unchanged from 4J.

## H. Cross-module integration

`scripts/mnemotoad-rc-workflow.mjs` drove the **21-step workflow** through the real UI in the fresh-install vault `dev-vault-fresh`. Evidence is in `output/release-candidate/workflow/dev-vault-fresh-{part1,restart}.json`. **All 21 steps passed**, with 0 renderer exceptions in both phases.

| Steps | What happened |
| --- | --- |
| 1–2 | Instrument and linked patch created (`instrumentId` saved). |
| 3–5 | Motif associated with the patch; C4, E♭4, G4, B♭4 composed; saved. |
| 6 | CANVAS opened through the command `MNEMOTOAD: Open CANVAS`. |
| 7–10 | Composition created, 2 lanes added, motif placed, repetitions set to ×4. |
| 11 | Compiled: "Compiled · matches this unsaved draft". |
| 12 | Played, paused, resumed, stopped. |
| 13 | Exported; the independent parser reports Type 1, 960 PPQ, 2 tracks, 16 note-ons. |
| 14 | Saved motif modified (velocity 101). **First, the edit was left unsaved and CANVAS was visited:** the MOTIF draft stayed dirty, a checkpoint was written, the saved note stayed byte-identical, and CANVAS showed no review (an unsaved draft is not an authoritative source). Then saved. |
| 15–17 | CANVAS showed **Source review required · 1 motif**; the review listed 1 placement; acknowledged. The reviewed revision equals the motif note’s SHA-256. |
| 18 | Recompiled and exported again. The bytes differ from the first export, and velocity 101 is present only in the second, so the acknowledged change reached MIDI. |
| 19 | Composition saved. |
| 20 | Isolated Obsidian closed and reopened (cold). |
| 21 | Everything held after the restart. All 4 records resolved. Links held: patch → instrument, motif → patch, clip → motif (×4, revision equals the current note hash). Reverse references held: motifs using the patch, compositions using the motif. Both notes were byte-identical to before the restart; CANVAS compiled with no review banner; PATCHBOOK listed the motif. |

## I. Data integrity

- **Upgrade, natively, on `dev-vault`** (`scripts/mnemotoad-rc-upgrade.mjs`): fingerprints of every file under `MNEMOBARD/` were taken (3,991 files) before the upgrade, after deploying 0.2.0, and after loading 0.2.0.
  - **0 added, 0 removed, 0 changed**; `data.json` byte-identical.
  - The same 782 records (patch 119, motif 453, instrument 71, effects chain 31, composition 108) and 1,081 checkpoints.
  - Settings preserved; the three saved views reopened.
- **Fresh install, natively, on `dev-vault-fresh`:** Obsidian’s own first-open trust prompt appeared (screenshot `native/fresh-01-trust-dialog.png`) and was accepted as a user would. The plugin loaded. **No folder and no `data.json` were written until the first save.** All three modules showed MNEMOTOAD branding and their empty states.
- **Recovery:** never deleted or pruned. The 4I suite (11 + 2) verified that browsing and inspecting the register changes nothing (4,046 files, identical path, size and mtime), consent-gated loading, and conflict display.
- **Defect fixed:** a checkpoint of a never-saved record showed *Original missing*. It now shows **Never saved**, consistent with the inspector; a genuinely deleted original still shows *Original missing*. The unit-test expectation that had pinned the old label was corrected and is noted here.
- **Not done:** no storage path was migrated; no record was rewritten by the upgrade; no checkpoint was invalidated.

## J. Performance

Same-process A/B (`output/release-candidate/performance/`): 4J `e1a6684`, rebuilt in a scratch worktree, against the RC, in the same Obsidian instance. A metric counts as a regression when it is more than 25 % **and** more than 5 ms slower.

- **4G benchmark, 86 metrics** (`performance-comparison.md`): **no regressions**. It covers PATCHBOOK search, filter, reverse references and navigation (on hundreds of records); MOTIF at 16, 500, 5,000 and 10,000 notes (open, render, select, navigate, drag, resize, zoom, scroll, undo, redo, save); and CANVAS at 4×20, 16×200 and 32×1,000 (open, select, drag, zoom, scroll, source refresh, compile, save, batch acknowledge and undo).

  | Example (RC median) | Value |
  | --- | --- |
  | MOTIF 10,000 notes: open | 167 ms |
  | MOTIF 10,000 notes: drag | 23 ms |
  | MOTIF 10,000 notes: undo | 7.2 ms |
  | MOTIF 10,000 notes: save | 416 ms |
  | CANVAS 32×1,000: open | 108 ms |
  | CANVAS 32×1,000: drag | 32 ms |
  | CANVAS 32×1,000: compile | 103 ms |
  | CANVAS 32×1,000: save | 216 ms |

  Largest increase: canvas 16×200 compile, 74.3 → 83.9 ms (+12.9 %, within threshold).
- **Edit commits, 64 metrics:** no regressions. At 10,000 notes: move 24.5 ms, resize 22.7 ms, undo 6.1 ms.
- **Recovery register, 68 metrics.** One 3-sample flag: real first page 107.7 → 145.5 ms. An alternating A/B of 20 samples × 3 rounds per build measured **4J 106.3 / 106.3 / 106.7 ms against RC 106.2 / 106.0 / 105.0 ms**, so it was noise (`recovery-firstpage-ab.json`). Other measurements with about 1,175 checkpoints: list 12.6 ms, search 7.3 ms, 5.2 MB inspector 493 ms, synthetic 10,000-checkpoint search 11.2 ms.
- **Bundle:** `main.js` 551,422 B against 547,485 B (+3.9 KB); `styles.css` 56,959 B against 52,872 B.

## K. MIDI

- **Golden fixture** unchanged (`85c8ecf3…`), and regeneration leaves it byte-identical.
- **Independent Python verification** passed: 10 valid fixtures, 4 rejections.
- **RC exports**, through `scripts/verify-midi.py`, an independent parser:
  - 21-step exports: Type 1, 960 PPQ, a conductor plus 1 note track, 16 note-ons each.
  - MOTIF-MIDI and 4J suite exports: independently parsed (structure, PPQ, tempo, meter, pairing, end-of-track, duration).
- **REAPER 7.84 (real DAW, isolated configuration; personal REAPER config digest unchanged)** on the RC-built `4j-arrangement-1794147797000.mid`, with *Expand MIDI tracks* and *Import tempo map* ticked:
  - 2 tracks, 8 + 27 = 35 notes;
  - tempo marker 120 BPM, 4/4;
  - 16 s project (REAPER trims items to the last note, as documented).
- **REAPER harness limitation:** on a *brand-new* isolated configuration, REAPER’s first-run prompts replaced the *MIDI File Import* dialog with the "Import 2-channel MIDI as…" prompt, so the first run imported with defaults: one merged track, no tempo map. That first run is kept as evidence. The rerun on the same configuration reached the normal dialog. This is a test-harness limitation, not a file defect.
- Parser validation and DAW validation are reported separately above. No artificial notes were added.

## L. Visual QA

Screenshots 1–15 are in `output/release-candidate/` (plus `05b`/`07b` light variants and `native/` fresh-install shots). All were captured from the running plugin except 12–13, which are generated sprite renderings.

| Screenshot | Content |
| --- | --- |
| 01 / 02 | Settings About panel, dark / light |
| 03–08 | PATCHBOOK, MOTIF and CANVAS at 1366 / 680 px |
| 09 | Source review (21-step run) |
| 10 | Recovery register |
| 11 | MIDI export dialog (21-step run) |
| 12 / 13 | Mascot native / ×8 |
| 14 | Mascot mark in the interface |
| 15 | Cross-module navigation with an unsaved draft |

`output/release-candidate/mascot/comparison.png` puts the salamander beside the concepts at the same logical scale. It is a review sheet in git-ignored `output/`, not a released asset.

- **Layout:** the header mark stays beside the identity at 1366, 680 and 420 px with 0 horizontal overflow. The 4J and 4I layout checks found no control outside the view at 1366, 980 and 680 px.
- **Accessibility:** keyboard Tab focus is visible (4J and 4I suites), Enter opens recovery rows, dialog focus stays inside, and Escape closes.
- **Fixed during QA:**
  - the header mark wrapped above the identity (flex basis);
  - the brand rule made transport Play buttons filled, contradicting 4J decision J05 (a specificity tie); restored and pinned by a test;
  - the About heading inherited 16 px of padding from host settings styles.
- **Not certified:** no screen-reader testing.

## M. Automated testing

`pnpm check`: typecheck, ESLint, **685 tests in 56 files** (baseline 660/52) and the production build, all passing.

**New tests:**

| File | Tests | Covers |
| --- | --- | --- |
| `mnemotoad-compat` | 10 | Identity, paths, legacy records, checkpoints |
| `mascot` | 8 | Palette, dimensions, alpha, nearest neighbour, negative cases, SVG mark |
| `brand-tokens` | 4 | Exact tokens, scoping, contrast, transport style |
| `dev-target` | 3 | Disposable-vault selection guard |

**Changed tests, with reasons:**

- `recovery-register` now expects *Never saved* (the defect fix).
- `tests/support/obsidian.ts`: the mock `Plugin` now keeps its manifest, like the real API.
- `dev-vault.test.ts` copies the new `dev-target.mjs` into its sandbox.

No test was weakened or removed.

**Coverage gaps:** Windows and macOS; screen readers; DAWs other than REAPER.

## N. Native Obsidian testing

Isolated Obsidian 1.15.0, project-local profiles, CDP on localhost:9227. Two marked disposable vaults: `dev-vault`, and `dev-vault-fresh` with its own profile `.runtime-fresh`, selected by the new `MNEMOTOAD_DEV_VAULT` guard (`scripts/dev-target.mjs`).

Performed, all in fresh processes with restart parts after verified cold restarts:

- fresh install (with the trust prompt) and upgrade from 0.1.0;
- enable/disable (plugin reloads, and the MOTIF-MIDI and PATCHBOOK suites);
- several cold restarts;
- dark (`obsidian`) and light (`moonstone`) themes;
- wide and narrow panes, and multiple module views;
- the 21-step workflow;
- regression suites:

  | Suite | Checks (part 1 + restart) |
  | --- | --- |
  | Foundation | 11 |
  | MOTIF | 7 + 12 |
  | MOTIF-MIDI | 11 + 5 |
  | PATCHBOOK assets | 6 + 6 |
  | CANVAS 4E | 18 + 2 |
  | 4I | 11 + 2 |
  | 4J | 7 + 2 |

**Console:** renderer exceptions 0 in every phase. Startup console warnings: only Electron’s own *Insecure Content-Security-Policy* development warning, which comes from the host and appears identically with 0.1.0.

**Harness fixes made while running** (no product change):

- 4I and 4J native scripts accept `MNEMOBARD_4I_DIR` / `MNEMOBARD_4J_DIR`.
- The 4I script now finds its malformed fixture by folder UUID (a fresh output directory had created a second one with the same name; recovery files are never deleted).
- It now pages to find a missing-original row, instead of assuming page 1.
- It accepts 4J’s inline narrow inspector.

All regression suites ran on the build that included every product fix except the final CSS-only corrections (transport outline and About padding). Those were verified afterwards by computed styles in both themes and by the screenshot run (0 exceptions).

## O. Packaging

**Manifest:** `id mnemobard`, `name MNEMOTOAD`, `version 0.2.0`, `minAppVersion 1.15.0`, `isDesktopOnly true`, description starting with the tagline. `package.json` 0.2.0 and `versions.json` (`0.2.0 → 1.15.0`) are consistent, and tested.

**Release artifacts:** `main.js` (551 KB, minified, no source map, MIDI worker inlined, no external runtime imports besides `obsidian`), `manifest.json` and `styles.css`. Mascot PNGs are repository and documentation assets and are not needed at runtime (the SVG is bundled).

**Logging:** the plugin’s own source has no `console.*`. The only `console.warn` in the bundle is the `yaml` library’s warning hook.

**Licences:** `yaml` (ISC) and `midi-file` (MIT) are listed in `THIRD_PARTY_NOTICES.md`. Mascot art is original to this repository. The salamander reference is not included.

**For the owner:**

- **The distribution licence is unselected** (`UNLICENSED`).
- **`author` is set to "MNEMOTOAD"** as a placeholder.

Nothing was published, pushed or submitted, and no remote was changed.

## P. Known limitations

**Blockers to *publication* (owner decisions):**

- choose a licence;
- set the manifest author;
- approve, change or replace the mascot;
- confirm the reference image (see B).

**Not blocking:**

- Windows and macOS not verified.
- No screen-reader certification.
- DAW import verified only for REAPER 7.84 on Linux; on a brand-new REAPER configuration the first import can bypass the expansion dialog.
- Unloaded tabs keep the old title until opened once after the upgrade.
- Track names in exported MIDI include lane UUIDs (unchanged since 4G).
- Default content folder stays `MNEMOBARD/` for fresh installs (T02, revisitable).
- Everything in the user guide’s known limitations.

## Q. Git status

At the start: clean, at `e1a6684`. No unrelated or uncommitted work existed, and nothing outside this milestone was touched.

All milestone changes are **staged, not yet committed**. The signed commit attempt (`git commit -S`) failed because GPG’s passphrase prompt (pinentry) timed out waiting for input that only the owner can give. The signing configuration was not changed. To finish, run:

```
git commit -S
```

using the prepared message *feat: MNEMOTOAD 0.2.0 release candidate …* (or your own).

Staged explicitly by path: source, styles, tests (including `tests/fixtures/legacy-mnemobard/`), `assets/mascot/`, scripts, docs, `docs/validation/mnemotoad-mascot.json`, manifest, package and versions.

Ignored and not staged: `output/`, `dev-vault*/`, `.runtime*/`, `main.js`. No push.

## R. Final verdict

**CONDITIONALLY READY — SPECIFIC ITEMS REMAIN**

The engineering evidence supports a release candidate:

- compatibility is proven both byte-for-byte and in tests;
- the full automated suite and every native regression suite pass;
- the 21-step workflow and a cold restart pass on a fresh install;
- there are no performance regressions;
- MIDI is byte-identical and was validated both by an independent parser and in REAPER;
- the one product defect found was fixed.

It is not unconditionally ready, because publication needs owner decisions that the brief reserves for the owner:

1. **Distribution licence.**
2. **Manifest author.**
3. **Mascot artistic approval.** Concept A is provisional; B and C are alternatives.
4. **Confirmation that the salamander image found locally is the intended reference.**

Windows and macOS verification and screen-reader testing remain open, as before. Stopping here for human review.
