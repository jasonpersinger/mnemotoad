# MNEMOTOAD 0.2.0 — publication report

Date: 2026-11-08. Release engineer actions in `~/MNEMOBARD`. Each public action was taken only after its approval gate: A (repository), B (push), C (release). D (community submission) was answered “owner submits”.

## A. Publication summary

| State | Status |
| --- | --- |
| Prepared | ✅ Yes |
| **Published on GitHub** | ✅ **Yes**: public repository, signed history and tags pushed, stable release `0.2.0` with assets, verified by public download |
| Submitted to the Obsidian community directory | ⏳ **Not yet.** The submission is prepared; the owner submits it at community.obsidian.md, which needs his Obsidian account and his agreement to the Developer policies. No submission URL exists yet. |
| Approved and listed in the directory | ❌ No. That follows the directory’s automated review after submission and is not claimed here. |

**Verdict: PUBLISHED — COMMUNITY REVIEW PENDING.** The GitHub publication is complete. The community step is waiting on the owner’s submission, which has not been confirmed. The verdict becomes accurate in full once the owner has submitted.

## B. Git verification

| Item | Value |
| --- | --- |
| Branch | `main` (GitHub default branch) |
| Release commit | `194f8738bf2fc54374d00e9c9adffc02c51e538f`: “release: MNEMOTOAD 0.2.0”, GPG “Good signature” (jasonpersinger 2026c) |
| Release tag `v0.2.0` | Annotated and signed (Good signature) → `194f873`. Unchanged since its creation. |
| Obsidian release tag `0.2.0` | **New**, annotated and signed (Good signature) → the same commit `194f873`. Authorised at Gate B, because Obsidian requires *“the Tag version of the release must match the version in your manifest.json”* (`0.2.0`). |
| Post-release commit | `c95a4de`, signed: “docs: README outside-vault disclosure, screenshots and known issues”. Documentation only (README, `docs/KNOWN_ISSUES.md`, 3 screenshots); no code or binaries. Authorised at Gate B. |
| Remote | `origin` = `https://github.com/jasonpersinger/mnemotoad.git` (added after Gate B; there was no previous remote) |
| Pushed | `main` (`c95a4de`), `v0.2.0`, `0.2.0`. No force push; history not rewritten. |
| Working tree | Clean at publication. This report and one test-harness fix (`scripts/mnemotoad-release-smoke.mjs`) were committed locally afterwards; see M. |
| GitHub signature display | **Verified.** At publication GitHub showed “Unverified” (`unknown_key`) because the owner’s GPG public key was not on the account. *Correction, 2026-11-08:* the owner uploaded key `55AC4CD519321124` (email verified). GitHub now reports `194f873`, `c95a4de`, `v0.2.0` and `0.2.0` as **verified (reason: valid)**, checked through the GitHub API. |

**Artifact provenance.** Rebuilding `main.js`, `styles.css` and `manifest.json` from the signed tag in a clean worktree produced **byte-identical** files to the validated release artifacts. The package therefore corresponds exactly to the signed release.

## C. Release artifacts

`output/release-final/mnemotoad-0.2.0/` (validated in the final release report):

| File | Bytes | SHA-256 | Verification |
| --- | ---: | --- | --- |
| `main.js` | 550,172 | `111b0587deb16f7e6ec9e069db1b4ef7dc975668b0bc5451ffd7a3f63b22a12d` | `SHA256SUMS` OK; equals rebuild from tag; equals public download |
| `manifest.json` | 278 | `0b989da7c14e40cbcee7a1ac5e769ed92fa1e34fd8eee4e22db52a5407dcce8a` | OK; equals tagged tree; equals public download |
| `styles.css` | 57,126 | `a1308b643fa09f8e4af675a0b7b88cbfe064b7bb7837d203b5e059baa29af7df` | OK; equals tagged tree; equals public download |

Packaged manifest: id `mnemobard`, name `MNEMOTOAD`, version `0.2.0`, minAppVersion `1.15.0`, author `Jason Persinger`, `isDesktopOnly: true`.

## D. GitHub publication

- **Repository:** https://github.com/jasonpersinger/mnemotoad (public, default branch `main`; licence detected as MIT by the GitHub licence API).
- **Release:** https://github.com/jasonpersinger/mnemotoad/releases/tag/0.2.0, titled “MNEMOTOAD 0.2.0”, stable (not a draft, not a prerelease), GitHub’s *latest* release, published 2026-11-08T18:40:22Z.
- **Assets** (attached individually):
  - https://github.com/jasonpersinger/mnemotoad/releases/download/0.2.0/main.js
  - https://github.com/jasonpersinger/mnemotoad/releases/download/0.2.0/manifest.json
  - https://github.com/jasonpersinger/mnemotoad/releases/download/0.2.0/styles.css
  - https://github.com/jasonpersinger/mnemotoad/releases/download/0.2.0/SHA256SUMS (optional verification asset)
- **Independent verification:** all four URLs returned HTTP 200 without authentication. The downloaded files match the published `SHA256SUMS` and are byte-identical (`cmp`) to the validated artifacts.
- **Release notes:** based on `docs/RELEASE_0.2.0.md`, written for new readers. They state the Linux validation, the REAPER testing, the untested Windows, macOS and screen-reader support, and the not-a-DAW limitations. Source: `output/release-final/github-release-notes.md`.

## E. Public installation test

- **Vault:** new disposable vault `dev-vault-public` with its own isolated profile; no personal vault was touched.
- **Installed files:** only the three files **downloaded from the public release URLs**, checksum-verified in the plugin folder.
- **Logs:** `output/release-final/public-install/` and `output/release-final/smoke/dev-vault-public-*.json`.

| # | Check | Result |
| --- | --- | --- |
| 1–4 | Recognised, enabled, name MNEMOTOAD, version 0.2.0 (author Jason Persinger) | ✅ |
| 5 | All three modules open | ✅ |
| 6 | PATCHBOOK: instrument, patch and effects chain created; records reopen after the restart | ✅ |
| 7–8 | MOTIF: phrase composed and saved; MIDI export | ✅ |
| 9–10 | CANVAS references the saved motif; arrangement created, repeated and saved | ✅ |
| 11 | Arrangement playback (play, pause, resume, stop); motif audition | ✅ |
| 12 | Arrangement MIDI export: Type 1, 960 PPQ, 16 note-ons, checked by the independent parser | ✅ |
| 13 | Recovery register opened; checkpoint inspected; vault byte-identical | ✅ |
| 14 | B2 mascot: all 262 cells in the headers and About panel; pixel-exact at 1×, 2×, 4× and 8× | ✅ |
| 15 | Console: no errors or warnings after enabling; 0 renderer exceptions in every phase | ✅ |
| 16 | Cold restart: all records and relationships intact, B2 in all three modules | ✅ |

Also passed: the 21-step workflow (source review and acknowledgement, unsaved-draft protection), narrow panes, and dark and light themes. Keyboard focus is yellow in dark themes and violet in light themes, measured with a real Tab key press.

**Deviations, reported in full:**

- **No trust prompt.** Unlike earlier fresh vaults, Obsidian did not show its trust prompt here. The plugin was already enabled through `community-plugins.json`. Observed, not investigated further.
- **Accidental duplicate run.** An operator error launched the 21-step workflow a second time; it was cut off by a closed pipe and created an extra instrument and patch in the disposable vault. The workflow was then rerun cleanly, and those results are the ones reported.
- **Smoke-test harness fix.** The test’s theme check measured the focus ring after *programmatic* focus, which Chromium does not always treat as `:focus-visible`. It now presses a real Tab key, which is how a keyboard user focuses a control. The product was correct in both measurements; only the harness changed.
- **Regression suites** were not rerun on the downloaded files. Those files are byte-identical to the build that passed every suite (see the final release report, section G).

## F. Obsidian submission

**Current official process** (from Obsidian’s developer-docs source, `obsidianmd/obsidian-developer-docs`: *Submit your plugin*, *Set up and claim*, *Submission requirements for plugins*, *Developer policies*, *Manifest*):

1. Sign in at community.obsidian.md.
2. Connect GitHub; this lets the directory verify repository ownership.
3. Plugins → **New plugin** → enter the GitHub repository URL and the owner.
4. Agree to the Developer policies → Submit.

Review is automated. The directory reads `manifest.json` at the HEAD of the default branch, and installs from the release whose tag equals the manifest version. This process replaces the pull request to `obsidian-releases`; that repository’s PR template now returns 404.

**Prepared values:**

| Field | Value |
| --- | --- |
| GitHub repository URL | `https://github.com/jasonpersinger/mnemotoad` |
| Owner | Myself (Jason Persinger) |
| Manifest at `main` | id `mnemobard`, name `MNEMOTOAD`, version `0.2.0` |
| Release | tag `0.2.0`, assets `main.js`, `manifest.json`, `styles.css` |

**Compliance check:**

| Requirement | Result |
| --- | --- |
| ID: lowercase letters and hyphens only, no trailing “plugin”, no “obsidian” | ✅ `mnemobard` |
| ID unique | ✅ absent from `community-plugins.json` (10,112 entries) |
| Name: basic Latin, no punctuation, not “Obsidian”, unique | ✅ `MNEMOTOAD` (ID and name may differ; no rule requires them to match each other or the repository) |
| Description: ≤ 250 characters, ends with a period, no emoji | ✅ |
| `fundingUrl` | ✅ absent |
| `isDesktopOnly` | ✅ `true` |
| Command IDs | ✅ unprefixed |
| No sample code | ✅ |
| `README.md`, `LICENSE` and `manifest.json` in the repository root | ✅ |
| README: purpose and usage | ✅ |
| Developer policies: no obfuscation, ads, client-side telemetry or self-updating; no network use | ✅ |
| Outside-vault file access disclosed in the README | ✅ added in `c95a4de` |
| Release tag equals the manifest version | ✅ `0.2.0` |

**Possible automated-review guidance.** These are guideline recommendations, not hard rules:

- three uses of the global `app` object (`src/modules/patchbook/view.ts:220`, `src/ui/navigate.ts:11`, `src/ui/recovery-inspector.ts:263`);
- an `<h2>` in the settings About panel where `setHeading()` is recommended.

If flagged, the documented remedy is a new release with an incremented version (0.2.1). That needs separate authorisation for the code change.

**Status: not submitted.** Gate D was answered “I’ll submit it myself”. There is no submission URL yet, and approval is **not** claimed.

## G. Security review

Scope: all 345 tracked files, the whole history (`git grep` over every revision), and the shipped bundle.

**Clean:**

- no tokens, keys, credentials or `password=`-style secrets in any revision;
- no `fetch`, XMLHttpRequest, WebSocket, beacon, Obsidian `requestUrl`, `eval`, `new Function` or dynamic import in the bundle; the only URL is the SVG namespace;
- no telemetry or analytics;
- bundled third-party code is only `yaml` 2.9.1 (ISC) and `midi-file` 1.2.4 (MIT), both MIT-compatible;
- no vault data, recovery checkpoints or disposable vaults are tracked (`.gitignore` covers `output/`, `dev-vault*/`, `.runtime*/`, `main.js`);
- test fixtures are synthetic.

**Accepted by the owner at Gate A** (now public):

1. Commit metadata shows `jason.persinger@gmail.com` (also in the GPG key’s UID).
2. `docs/TROUBADOUR_AUDIT.md` (38 KB) and related notes describe the owner’s private TROUBADOUR project.
3. Paths such as `/home/jason/...` and internal development notes (`AGENTS.md`, `CLAUDE.md`, `findings.md`, `progress.md`, `task_plan.md`, validation JSON) are tracked.

Removing any of these would require a history rewrite, which was not authorised.

**Outstanding risk:** none involving credentials.

## H. Documentation

- **README:** checked as a first-time visitor would read it. It explains what MNEMOTOAD is and isn’t, the three modules, local-first behaviour, installation (from the Releases page), basic use, MIDI, storage and recovery, platform limitations, privacy (including the outside-vault disclosure), compatibility identifiers, licence and author.
- **Screenshots:** CANVAS, PATCHBOOK and MOTIF, captured from a new disposable demo vault with plainly named example records. They contain no paths, vault names, benchmark data or desktop information, and show the dark-first look with the B2 mark. They live in `docs/screenshots/`.
- The internal `output/release-final/screenshots/` set (benchmark records in the tab bar) was not published.
- `docs/RELEASE_0.2.0.md`, `docs/USER_GUIDE.md` and `docs/BRAND.md` are unchanged from the signed release.

## I. Known limitations (unresolved; see `docs/KNOWN_ISSUES.md`)

- Windows and macOS not independently validated.
- Screen-reader testing outstanding.
- REAPER is the only independently tested DAW.
- Exported arrangement track names include internal lane identifiers.
- The MIDI export dialogs’ *Create* buttons use Obsidian’s accent colour instead of brand violet.
- After an upgrade, unloaded tabs keep the old MNEMOBARD title until opened.
- Two in-Obsidian regression suites occasionally fail when run back to back, but pass independently on both builds.
- Plugin-guideline recommendations: the global `app` object and the settings `<h2>`.

**GitHub issues were not created.** That was not separately authorised, so the list lives in `docs/KNOWN_ISSUES.md`.

## J. Final recommendation

**PUBLISHED — COMMUNITY REVIEW PENDING.** MNEMOTOAD 0.2.0 is publicly released on GitHub exactly as validated: signed commit and tags, assets byte-identical to the signed build, and a clean public install. The community-directory submission is prepared and **awaits the owner’s submission** at community.obsidian.md, then the directory’s automated review.

Owner next steps:

1. Submit at community.obsidian.md with the values in F.
2. ~~Upload your GPG public key to GitHub~~: done; all signatures now show as Verified.
3. If the automated review flags the guideline items, authorise a 0.2.1 fix.

## Addendum — 0.2.1 (2026-11-08)

0.2.0 audition played at about −50 dBFS, which is inaudible. **0.2.1** fixes this: about −17.6 dBFS at velocity 96, through a shared limiter. The owner confirmed it by ear. It was published at https://github.com/jasonpersinger/mnemotoad/releases/tag/0.2.1 (signed commit `fc68d56` and tag `0.2.1`, both Verified on GitHub) and is the latest release. Its public assets are byte-identical to the validated package, and `main.js` rebuilds byte-identically from the tag. Notes: `docs/RELEASE_0.2.1.md`. The community-directory submission has still not been confirmed.

