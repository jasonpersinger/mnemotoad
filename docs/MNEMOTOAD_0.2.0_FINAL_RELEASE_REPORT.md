# MNEMOTOAD 0.2.0 — final release report

Date: 2026-11-08. Repository `~/MNEMOBARD`, branch `main`. Environment: Linux 7.3.1 (CachyOS), AMD Ryzen 7 5700G, isolated Obsidian 1.15.0 on disposable vaults only (`dev-vault`, `dev-vault-final`). Evidence is under `output/release-final/` (git-ignored) unless a path below says otherwise.

## A. Executive summary

**Verdict: READY** for owner approval and publication. Publication itself remains a separate owner decision.

0.2.0 is the validated release candidate plus the owner’s final decisions:

- the approved mascot, **B2 — The Curmudgeon**;
- the **MIT License**;
- author **Jason Persinger**;
- final documentation.

Two small display fixes were made during final validation. **No musical, persistence or recovery code changed.**

Results:

- **Automated tests:** 689 tests in 56 files pass.
- **MIDI:** byte-identical to the release candidate on 72 arrangements and 4 motifs. REAPER imported the final export note-for-note.
- **Upgrade from 0.1.0:** left all 4,115 vault files byte-identical.
- **Fresh install:** from the release package; the 21-step workflow and the release smoke test both passed, including after a cold restart.
- **Native regression suites:** all pass.
- **Performance:** no regressions in 218 metrics.

The signed commit and the tag are covered in M.

## B. Identity

| Item | Value |
| --- | --- |
| Product | **MNEMOTOAD** |
| Tagline | *Remember what you’ve yet to compose.* |
| Author | **Jason Persinger** (`manifest.json`, `package.json`, About panel, README, `LICENSE`) |
| Version | **0.2.0** (`manifest.json`, `package.json`, `versions.json` `0.2.0 → 1.15.0`, About panel) |
| minAppVersion | 1.15.0 (unchanged) |
| Desktop only | yes |

**Internal compatibility identifiers, retained** and pinned by `tests/mnemotoad-compat.test.ts`:

- plugin ID `mnemobard`;
- view types `mnemobard-*` and command IDs `mnemobard:open-*`;
- the `MNEMOBARD/` folder and the `mnemobard_*` front-matter keys;
- the `mnemobard-motif` / `mnemobard-composition` data blocks;
- the recovery formats;
- the MIDI conductor name `MNEMOBARD conductor`;
- CSS classes.

There was no identifier migration. Native: Community plugins lists **“MNEMOTOAD v0.2.0 By Jason Persinger”**; commands read *MNEMOTOAD: Open PATCHBOOK / MOTIF / CANVAS*.

## C. Mascot

**Canonical: B2 — The Curmudgeon.**

- **Source:** `output/mascot-refinement/b2-curmudgeon.png`, the only B2 asset. It was proven identical to the B2 grid in the refinement `sprites.json` and to its tile in the approved comparison sheet. All of these files were written in the same second, 12:29:15–16.
- **Destination:** byte copies only, no regeneration:
  - `assets/mascot/mnemotoad-mascot.png` (SHA-256 `56b47400c0f133d1fc6b6ab3090ae28e14509c055024c914645096d49c0e2bb2`, 24×24);
  - `assets/mascot/mnemotoad-mascot@8x.png` (`07f88b62…`);
  - the same grid copied verbatim into `assets/mascot/mascot.json`, used at runtime and the only mascot data in the bundle.
- **References kept, not shipped:** concepts A–C and the refinement set (`assets/mascot/refinement/`).
- **Validation:** `node scripts/mascot-verify.mjs` passes. Concepts and canonical files use canonical colours only, with 0 partial-alpha pixels and exact nearest-neighbour ×8 copies. The canonical PNG is byte-identical to the approved refinement file, and `mascot.json` equals both. `tests/mascot.test.ts` (11 tests) pins the SHA-256 and proves rejection of a substituted sprite and of a drifted grid. Palette: `#070707`, `#28231c`, `#317b22`, `#f4e409` (violet not needed).
- **Placements, verified natively:**
  - PATCHBOOK, MOTIF and CANVAS module headers, 2×, decorative; all 262 rendered cells equal B2 in all three modules, before and after the restart;
  - the PATCHBOOK empty state, 2×;
  - the settings About panel, 4×, labelled *“MNEMOTOAD mascot: The Curmudgeon, a grumpy green toad”*.
  - No other placements. Concept A is no longer used anywhere.
- **Rendering:** rendered at 1×, 2×, 4× and 8× on dark and light and compared with the canonical PNG scaled by nearest neighbour: **8 of 8 pixel-identical**.
- **Fix made here:** at near-1 device ratios, the SVG viewport clip antialiased the outermost pixel column (9–72 blended pixels in some positions; the RC had this too). One CSS rule, `.mnemotoad-mark { overflow: visible; }`, made all eight exact, and is pinned by a test.

## D. Licensing

- `LICENSE`: the standard MIT text, *Copyright (c) 2026 Jason Persinger*. `package.json` has `"license": "MIT"` and stays `"private": true`, which only prevents accidental npm publication.
- **Bundled third-party code**, from the esbuild metafile for `main.js` and its inlined MIDI worker: only `yaml` 2.9.1 (ISC) and `midi-file` 1.2.4 (MIT). Both are permissive and MIT-compatible; their notices are in `THIRD_PARTY_NOTICES.md`, and esbuild keeps their legal comments inline.
- **Assets:** the mascot is an original project asset. The salamander image that set its fidelity is not in the repository or package.
- No third-party material with uncertain licensing is packaged.

## E. Compatibility

**Upgrade, natively.** Disposable `dev-vault`; MNEMOBARD 0.1.0 built from `e1a6684`, upgraded to the **packaged** 0.2.0 files (checksums verified in place). Evidence: `output/release-final/native/dev-vault-final-*.json` and `dev-vault-compare-final-before-upgrade-final-after-upgrade.json`.

- **Files:** all files under `MNEMOBARD/` were fingerprinted before the upgrade, after deploying 0.2.0, and after loading it: **4,115 files, 0 added, 0 removed, 0 changed**. `data.json` is byte-identical.
- **Records:** 795 (patch 121, motif 460, instrument 72, effects chain 31, composition 111) and **1,175 recovery checkpoints**. These are the same before and after, and settings are preserved.
- **Running build:** the saved views reopened with the B2 mark, commands read “MNEMOTOAD: …”, and there were 0 renderer exceptions.
- **References and acknowledgements:** UUID references, source-revision acknowledgements and unknown metadata are pinned in unit tests on a byte-exact corpus of 0.1.0 records (`tests/fixtures/legacy-mnemobard/`). Natively: stored revisions match, so there was no spurious review after the upgrade or the restart.
- **Covered natively by the regression suites (F, G):** missing references stay visible; unsaved drafts are protected (an unsaved MOTIF edit survived navigation, with the saved note byte-identical); stale-save conflicts are blocked; recovery browsing writes nothing.
- No migrations and no cleanup. Recovery checkpoints were never deleted.

## F. Automated testing

**`pnpm check`** (`tsc --noEmit`, ESLint, Vitest, production build): **689 tests in 56 files, all passing.** That is the RC baseline of 685, plus 3 canonical-mascot tests and 1 rendering rule test.

| Check | Result |
| --- | --- |
| `node scripts/arrangement-fixtures.mjs` (independent Python verification) | Passed: 10 valid fixtures, 4 rejections |
| Golden MIDI `tests/fixtures/arrangement-single.mid` | `85c8ecf3…` unchanged |
| `node scripts/mascot-verify.mjs` | Passed (`docs/validation/mnemotoad-mascot.json`) |
| Package check: `sha256sum -c SHA256SUMS` | Passed; the package equals the repository build |

**Tests changed** (none weakened or removed):

- `tests/mascot.test.ts`: provisional → approved mascot, and 3 new guards.
- `tests/brand-tokens.test.ts`: plus 1 rendering rule.
- `tests/support/obsidian.ts`: the mock manifest gains `author`, like the real `PluginManifest`.

## G. Native Obsidian testing

**Fresh install from the release package** into the new disposable vault `dev-vault-final`, files checksum-verified. Obsidian’s own *Trust author* prompt appeared and was accepted. Evidence: `output/release-final/{workflow,smoke,native}/`.

- **21-step cross-module workflow** (`scripts/mnemotoad-rc-workflow.mjs`, real UI): **21 of 21 passed**, including a cold restart.
  - Both arrangement exports passed the independent parser (Type 1, 960 PPQ, 16 note-ons).
  - Source review and acknowledgement were required, and the acknowledged velocity change reached MIDI.
  - Unsaved drafts were protected across navigation.

- **Release smoke test** (`scripts/mnemotoad-release-smoke.mjs`): **all passed**, 0 renderer exceptions.

  | Brief step(s) | What was checked |
  | --- | --- |
  | 1–4 | Load, name MNEMOTOAD, ID `mnemobard` |
  | 5–6 | B2 mark |
  | 7–9 | Instrument, patch and effects chain created |
  | 13–14 | Motif reopened identical; auditioned and stopped |
  | 20 | Clip repositioned, then undone |
  | 25–26 | Recovery register: checkpoint inspected; vault byte-identical |
  | 27 | Narrow panes: 0 overflow |
  | 28–29 | Dark and light: violet primary with white label; yellow and violet focus |
  | 30–32 | About panel: B2, *Version 0.2.0 · by Jason Persinger · MIT License* |
  | 33–34 | After a cold restart: everything resolves; B2 in all three modules |
  | — | Mascot pixel-exactness at four scales |

  Steps 10–12, 15–19 and 21–24 are covered by the workflow run above.
- **Regression suites on the final build** (`output/release-final/regressions/`). All match the RC counts:

  | Suite | Checks (part 1 + restart) |
  | --- | --- |
  | Foundation | 11 |
  | MOTIF | 7 + 12 |
  | MOTIF-MIDI | 11 + 5 |
  | PATCHBOOK assets | 6 + 6 |
  | CANVAS 4E | 18 + 2 |
  | 4I | 11 + 2 |
  | 4J | 7 + 2 |

  Renderer exceptions: 0. Console: only Electron’s own development CSP warning, which the host emits identically with 0.1.0.

- **Deviations, reported in full:**
  - The first chained run was made with the left sidebar open, left so by my RC screenshot script. At the suites’ 480 px window, the MOTIF pane shrank to about 165 px and two narrow-layout checks failed. With the sidebar collapsed as calibrated, they passed. Logs: `regressions-attempt1-sidebar-open/`.
  - **CANVAS 4E** timed out at its `renameFile` step in chained runs (3 of 4). Isolated runs with each build pass all 18 + 2 (`regressions-ab-4e/`). This matches the known host trap of `renameFile` wedging in long-lived processes.
  - **MOTIF**’s first native pointer drag intermittently timed out right after a cold start: 2 of 4 chained runs, and 0 failures in 8 other runs, including 3 alternating runs per build (`regressions-ab-motif/`).

  Neither failure is build-related. Both the RC and the final build pass under the same conditions.
- The final build’s CSS gained one rule after the regression runs (the mascot `overflow`). It was revalidated by the smoke run, the screenshots and the tests.

## H. MIDI validation

- **RC versus final, same Obsidian process, same records** (`output/release-final/midi/rc-vs-final.json`): **72 compiled arrangements and 4 motif exports** (Ascending choir, Low pulse, 5,000 and 10,000 notes) are **byte-identical**. The 15 compositions that could not compile (pending review and similar) refused for identical reasons on both builds.
- **Unit level:** golden fixtures unchanged; deterministic compile of the legacy corpus. No compiler code changed.
- **Independent parser** on the final export: Type 1, PPQ 960, 3 tracks (conductor; Lane 1: 8 notes on channel 0; Lane 2: 27 notes on channel 1).
- **REAPER 7.84** (real DAW, isolated configuration, personal REAPER configuration unchanged), importing `release-0.2.0-reaper-*.mid` with *Expand MIDI tracks* and *Import tempo map*:
  - 2 tracks, 120 BPM, 4/4;
  - **all 35 notes identical to the parser** in start, end, channel, pitch and velocity (`reaper-vs-parser.json`);
  - REAPER trims each item to its last note (16 s); the file keeps the composition length (documented).
- **REAPER caveats:**
  - The first-run quirk was avoided by reusing an already-initialised isolated configuration.
  - One attempt failed in the X11 helper (`BadWindow`, a window-listing race) before any import result. The retry passed.

## I. Performance

Same-process A/B, RC build against final build (`output/release-final/performance/`). A metric counts as a regression when it is more than 25 % **and** more than 5 ms slower.

- **4G benchmark: 86 metrics, no regressions.** It covers MOTIF at 16, 500, 5,000 and 10,000 notes; CANVAS at 4×20, 16×200 and 32×1,000; and PATCHBOOK.

  | Example (final median) | Value |
  | --- | --- |
  | MOTIF 10,000 notes: open | 164 ms |
  | MOTIF 10,000 notes: drag | 24.7 ms |
  | MOTIF 10,000 notes: undo | 8.3 ms |
  | MOTIF 10,000 notes: save | 428 ms |
  | CANVAS 32×1,000: open | 99 ms |
  | CANVAS 32×1,000: drag | 31 ms |
  | CANVAS 32×1,000: compile | 105 ms |
  | CANVAS 32×1,000: save | 216 ms |

- **Edit-commit profile: 64 metrics, no regressions.**
- **Recovery register benchmark: 68 metrics, no regressions.**
- **Methodology:** synthetic renderer timings over CDP with 5–7 samples (3 for some). Small medians fluctuate by ±10–20 % between runs. The RC report shows a 3-sample flag that a 20-sample A/B proved to be noise.

## J. Visual quality

Screenshots are in `output/release-final/screenshots/`, all real captures from Obsidian:

| Screenshot | Content |
| --- | --- |
| 01–06 | PATCHBOOK, MOTIF and CANVAS in dark and light |
| 07 | Header mark at 4× device scale |
| 08 | About panel (settings popout) |
| 09–11 | Narrow panes (680 px) |
| 12 | MOTIF MIDI export dialog |
| 13 | Recovery register |
| 14 | Source-revision review |
| 15 | Installed package in Community plugins (fresh vault) |

- **Dark-first, light-compatible:** violet primaries with white labels; yellow focus on dark and violet on light; transport Play buttons outlined, so Save is the only filled primary.
- **Narrow panes:** 0 horizontal overflow, with the header mark beside the identity.
- **Mascot:** pixel-exact (see C).
- **Nonblocking inconsistency, not changed:** the MOTIF and arrangement export dialogs’ *Create* buttons use Obsidian’s accent colour, because those modals don’t carry the brand dialog class (same as the RC).

## K. Packaging

The release package is `output/release-final/mnemotoad-0.2.0/` (listing in `output/release-final/PACKAGE_CONTENTS.md`). Install by copying the three files into `<vault>/.obsidian/plugins/mnemobard/`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `main.js` | 550,172 | `111b0587deb16f7e6ec9e069db1b4ef7dc975668b0bc5451ffd7a3f63b22a12d` |
| `manifest.json` | 278 | `0b989da7c14e40cbcee7a1ac5e769ed92fa1e34fd8eee4e22db52a5407dcce8a` |
| `styles.css` | 57,126 | `a1308b643fa09f8e4af675a0b7b88cbfe064b7bb7837d203b5e059baa29af7df` |

**Bundle audit:**

- production build (minified), no source map, MIDI worker inlined;
- no runtime imports besides `obsidian`, and no runtime asset paths: the mascot is inline SVG built from bundled JSON;
- no fixtures, benchmark data, checkpoints, vault data, development paths or secrets. The only "password" string is the URL validator *rejecting* credentials;
- no `console.*` from plugin code; the one `console.warn` belongs to `yaml`.

**Verified** by installing the package into the fresh vault (G).

## L. Documentation

| File | Change |
| --- | --- |
| `README.md` | Rewritten: features, requirements, installation and upgrade, usage, storage, backup and recovery, MIDI, limitations, privacy, compatibility identifiers, development, licence, author |
| `LICENSE` | New |
| `docs/RELEASE_0.2.0.md` | New: what’s new in 0.2.0 versus earlier milestones |
| `docs/RELEASE_NOTES.md` | Now an index |
| `docs/USER_GUIDE.md` | Updated known limitations |
| `docs/BRAND.md` | Approved mascot, files, verification |
| `docs/DECISIONS.md` | T03 updated; T08–T10 added |
| `docs/ARCHITECTURE.md` | Mascot section |
| `THIRD_PARTY_NOTICES.md` | MIT statement and bundle audit |
| `CLAUDE.md` | Naming and mascot rule |

Historical milestone reports and the RC report were not rewritten.

**Known limitations**, each checked against the implementation:

- not a DAW;
- sine audition is not a synthesizer;
- no rendered audio in MIDI;
- patches are references, not hosted sounds;
- fixed tempo and meter, note data only;
- Windows and macOS not validated; screen readers not validated;
- REAPER is the only verified DAW;
- MNEMOBARD internal identifiers retained.

## M. Git

At the start, the release-candidate work (68 files) was staged on signed `e1a6684`, never committed; there were no tags and no remotes. The release commit combines the RC work with these final changes.

- **Branch:** `main`.
- **Commit:** `release: MNEMOTOAD 0.2.0`, GPG-signed with the existing configuration. See `git log -1 --show-signature`.
- **Tag:** `v0.2.0`, annotated and signed, created only after the commit.

If a passphrase prompt cannot be answered, the commit or tag stays pending, and the exact commands are given in the session summary. **Nothing is pushed or published, and remotes are unchanged.**

Not committed (git-ignored): `output/`, `dev-vault*/`, `.runtime*/`, `main.js`.

## N. Outstanding issues

**Release blockers:** none.

**Nonblocking:**

- Windows and macOS unvalidated; screen-reader use unvalidated.
- REAPER is the only verified DAW.
- Brand violet doesn’t reach the MOTIF and arrangement export dialogs’ primary buttons (host accent).
- After an upgrade, unloaded tabs show the old title until opened.
- Exported track names include lane UUIDs.
- Harness flakes (G): chained-run `renameFile` and the first pointer drag after a cold start.

## O. Final recommendation

MNEMOTOAD 0.2.0 is **ready for owner approval and publication**: correct identity, approved mascot, MIT licence, verified compatibility, unchanged MIDI, passing tests and native validation, and a verified package.

To publish (separately authorised): push the signed commit and the `v0.2.0` tag. Create a GitHub release named `0.2.0` with `main.js`, `manifest.json` and `styles.css` from `output/release-final/mnemotoad-0.2.0/` attached as individual files, matching the checksums above. Then, if you choose, submit to the Obsidian community plugin directory with ID `mnemobard`.
