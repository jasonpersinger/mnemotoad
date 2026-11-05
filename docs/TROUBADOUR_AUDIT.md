# TROUBADOUR technical audit

Audit date: 2026-11-05. Method: read-only source, configuration, tests, documentation, dependency metadata, and Git inspection. No legacy scripts, tests, builds, application code, migrations, or dependency installations were executed.

## 1. Executive summary

TROUBADOUR is a substantial private Obsidian songwriting prototype, version 0.4.3, with implemented MIDI editing, synthesis, motif transformations, section-based arrangement playback, sound comparisons, and Markdown persistence. It is valuable prior work, particularly for domain logic, audio safeguards, persistence patterns, and regression scenarios. It is not a ready-made implementation of MNEMOBARD’s patch library or multilane composition planner.

Recommend **A + C: selectively refactor authorized components and reimplement the application/model/UI around MNEMOBARD’s requirements**. Do not fork the whole plugin or inherit its product restrictions. No component currently qualifies for unconditional REUSE DIRECTLY: licensing/provenance is unresolved, tests were not rerun, and model integration needs review.

The kickoff path `/home/troubadour` does not exist. The user subsequently corrected the location to `~/troubadour`, explicitly authorizing `/home/jason/troubadour`. All source findings below refer to that corrected root. No other path was silently substituted.

Baseline: clean Git working tree; HEAD `bc2749e2877738bd443a1d3ace66f919d23fe837`. There are 121 tracked files and 18 commits dated 2026-10-28 through 2026-10-30. Tracked-file aggregate SHA-256: `4e217cc4f22b1a049470feb31d5955ece52542619497e97c0924e592f6928ff2`. Final preservation check is recorded in [the milestone report](MILESTONE_0_REPORT.md). Local source links below are for verification; paths are relative to the corrected root.

## 2. Original project purpose

`README.md` and `docs/superpowers/specs/2026-10-28-troubadour-design.md` describe a songwriting workspace for a dungeon/fantasy synth musician, supporting Linux and iPhone. Its first useful session connects a song notebook, short motifs, synthesized preview voices, A/B recordings, section roles, and saved musical notes. Sound/preset details are freeform writing rather than a structured instrument catalog.

The initial design deferred MIDI and full arrangement playback; later commits implemented them. Treat current source and dated test reports as evidence of additions, rather than reading the initial plan as the current feature list.

## 3. Existing functionality and limits

| Area | Source-backed implementation | Limitation or incomplete work |
| --- | --- | --- |
| Notebook and records | Songs, motifs, sound experiments, sections; native note opening and summaries | All non-song entities owned by one song; no standalone shared patch catalog. |
| Piano roll | Draw/select/pan, move, both-edge resize, keyboard edits, note inspector, undo/redo, fit/zoom, pitch range | DOM button per note; single selected ID; validation caps motifs at 512 notes, 8 bars, 16-note polyphony. No general marquee/multiselect located. |
| MIDI | Types 0/1 PPQ import, track/bar-window selection, source PPQ/ticks/channel/velocity, Type 0 motif export, optional accompaniment | No arrangement MIDI exporter; no tempo/meter maps, Type 2/SMPTE, or controller reproduction. |
| Development | Transpose, double length, inversion, reversal, cyclic shift, bar fragment, seeded scale changes | Coupled to motif/song schema and harmony; fresh IDs rely on crypto. No separate quantize-existing-selection command located. Snap during editing is implemented. |
| Harmony | Modal guides, drone/fifth/triad, chord timeline, inversions, pedal | Useful later; outside MNEMOBARD’s essential MVP. |
| Arrangement | Ordered sections with role assignments, once/repeat, calculated duration, song/section preview | Form/card-oriented section planner; not arbitrary clips on independently positioned lanes. Clips notes at section ends. |
| Audio | Four Web Audio synth voices; shared transport; local WAV A/B loops, trim, short crossfade, blind preference | Restricted PCM WAVs; no sample catalog, general waveform renderer, microphone recording, external plugin hosting, or mixed recording arrangement playback found. |
| Library | Cross-song motif search, filters, independent copies, provenance | Linear in-memory search and whole-vault indexing; not patch metadata search. |
| Persistence | YAML identity + one managed JSON block, conditional writes, collision-safe create, duplicate/missing IDs, recovery snapshots | Explicit Save; normal-close snapshot is not crash recovery. No migration framework or transactional multi-file save. |

“Implemented” means concrete code paths and associated tests were found. It does not mean current behavior was dynamically verified in this audit.

## 4. Repository structure

```text
src/main.ts, settings.ts        Obsidian integration and preferences
src/core/                      models, validation, Markdown codec, MIDI,
                               note edits, harmony, progressions, development
src/storage/                   VaultStore, parent/child creation, motif library
src/audio/                     plans, transport, voices, gain, WAV loading
src/ui/                        workspace, piano roll, arrangement, sound lab,
                               development/library/forms/drafts/navigation
tests/{core,midi,storage,audio,ui}/
tests/support/fake-app.ts       in-memory host fixture
dev/                           browser workbench, Obsidian shim, synthetic fixtures
scripts/                       build packaging/harness/device and REAPER helpers
docs/                          design/specs/plans/guides/test reports
main.js, styles.css, manifest.json, versions.json
dist/, output/, dev-vault/      generated packages, evidence, development vault
node_modules/, package-lock.json
```

Source totals: 7,303 lines across the inventoried `src/core`, `src/audio`, `src/storage`, and `src/ui` TypeScript files, excluding `main.ts`/`settings.ts`. `piano-roll.ts` is 1,050 lines and `workspace.ts` 638. Build artifacts and a dependency directory exist; their presence is not proof of successful execution. Private ignored runtime/sync configuration was not inspected or copied.

## 5. Technology stack

`package.json`: private ESM development package, version 0.4.3, npm scripts/lockfile, TypeScript 6.0.3, esbuild 0.28.2, Vitest 5.0.5, jsdom 30.1.3, ESLint 10.13.0, Obsidian API 1.12.0. These are local declared versions, not recommendations or independently checked latest releases. `tsconfig.json` enables strict checking, DOM libraries, ES2022 target, Bundler resolution, and no emit.

`esbuild.config.mjs` bundles `src/main.ts` as browser-targeted CommonJS/ES2021, externalizes `obsidian`, minifies output, and rejects third-party runtime inputs in its metafile. The metafile check happens after build output is written; it is a build guard, not proof about every shipped artifact. Runtime source import inventory found relative imports and `obsidian` only. `js-yaml` is used by the development Obsidian shim; no UI framework or MIDI runtime dependency is used by `src`.

Manifest: `minAppVersion: 1.12.0`, `isDesktopOnly: false`. Mobile ambition and selected iPhone reports do not establish full mobile certification.

## 6. Architecture overview

Entry point `TroubadourPlugin.onload` constructs `VaultStore` and one `Transport`, registers an `ItemView`, settings, commands, and a Markdown block renderer. `TroubadourView` mounts `mountWorkspace`; the workspace coordinates tabs, per-record `Draft` objects, guards, and native note navigation.

Data flow: vault Markdown → document parser/validator → in-memory ID records → draft → panel/editor commands → `VaultStore.save` → `Vault.process(updateDocument)` → refresh subscribers. Audio flows from motif or section records into `PlaybackPlan` seconds, then `Transport.playPlan` and `scheduleVoice`. Sound experiments resolve two vault wikilinks and decode bounded WAVs before comparison playback.

The layering is recognizable and useful. Domain math is often independent, but validation, MIDI import/export, development, playback compilation, and UI are tied to `MotifData`/`AnyEntity`. Entity ownership and cardinality rules live in both validation and storage. A meaningful wholesale refactor would touch most layers.

## 7. Most relevant source components

- `src/core/music.ts`: `barsToTicks`, `sectionSeconds`, `maxPolyphony`, `transpose`, `stretchDouble`, `motifPpq`.
- `src/core/note-edit.ts`: `moveNote`, `resizeNote`, `insertNote`, `musicalPosition`, `positionTicks`; edits retain imported timing phase.
- `src/core/development.ts`: `developMotif`, `melodySignature`; immutable transformations, seeded pitch choice, fragment/loop splitting.
- `src/core/midi.ts`: `Reader`, `parseMidi`, `importMidiTrack`, `encodeMidi`.
- `src/core/document.ts`: `DocumentError`, `parseDocument`, `updateDocument`, `documentProse`.
- `src/storage/vault-store.ts`: `VaultStore.refresh/save/createCopy/snapshot/dispose`, `RecordState`, `readyEntity`.
- `src/audio/plans.ts`: `motifPlan`, `arrangementPlan`, `checkPlan`; `src/audio/levels.ts`: `previewGain`.
- `src/audio/voices.ts`: `VOICE_PRESETS`, `voicePeak`, `scheduleVoice`; `src/audio/transport.ts`: `Transport`.
- `src/ui/piano-roll.ts`: `mountPianoRoll`; `src/ui/draft.ts`: `Draft`; `src/ui/view-context.ts` and `editor-state.ts`: editor/navigation context.
- `tests/core`, `tests/midi/midi.test.ts`, `tests/storage/vault-store.test.ts`, `tests/audio`, and `tests/ui/workspace-races.test.ts`: useful behavioral scenarios, subject to authorization before reuse.

## 8. MIDI findings

`parseMidi` is a custom bounded SMF parser: maximum 1 MiB, 64 tracks, 100,000 events, four-byte VLQ; Types 0/1 only; PPQ division only. It reads chunk boundaries, running status, velocity-zero note-offs, track names, tempo and meter; uses FIFO active-note queues by channel/pitch; requires end-of-track and no undeclared trailing bytes. Tempo/meter changes are rejected; unsupported controller/program/bend data and some unmatched events produce warnings. SysEx is skipped, not sent. Defaults are 120 BPM and 4/4.

`importMidiTrack` selects 1–8 bars, intersects notes with that range, explicitly warns about clipping, regenerates IDs, and preserves source PPQ. `validateEntity` imposes 512 notes and 16-note authored polyphony. It selects a track, not a separate channel; MNEMOBARD’s proposed importer has a different contract.

`encodeMidi` writes a single-track **Type 0** file, including tempo, meter, title, channel/velocity, off-grid ticks, and trailing silence. It sorts note-offs before note-ons; nested same-channel/same-pitch endings are rejected, while FIFO-compatible overlap is possible. Accompaniment is allocated free non-percussion channels and exhaustion fails visibly. It is not an arrangement exporter and should not be stretched into one through UI code.

The most useful assets are the bounded-input policy, exact source-time handling, event-ordering rules, and adversarial fixtures. A maintained library adapter is provisionally preferable to adopting the custom parser wholesale; compare against its existing test cases before choosing. Existing code does not implement variable tempo maps or hardware MIDI.

## 9. Audio findings

`Transport` lazily prepares one AudioContext, uses abort/generation guards for async loads, manages node ownership, stops on hidden/pagehide, and closes context on disposal. `playPlan` schedules from `currentTime + 0.035`, polls every 25 ms, and schedules 150 ms ahead. Playback state is observable. A/B uses two looping buffer sources, attenuation trims, and a 15 ms switch ramp. `requestPlaybackAudio` conditionally changes the optional shared audio-session mode for iPhone and restores it; leave this out of desktop MVP until separately justified.

`scheduleVoice` provides four oscillator recipes with release envelopes and ended-node disconnection. `previewGain` accounts for partial amplitudes and release tails across loop boundaries. `checkPlan` caps 20,000 notes, 32 simultaneous authored voices, and 128 starts/200 ms. These are unusually valuable prior safeguards, though not timing measurements.

Static concern: the scheduling loop continues submitting every due note, including notes whose intended time is already past after a long main-thread stall. Catch-up bursts and repeated historical cycles are possible. This is a code-path risk, not a reproduced audible defect in this audit. Add an underrun policy before adapting transport.

`validateWav`, `validatePair`, `loadClip` support PCM16 WAV, mono/stereo, 44.1/48 kHz, ≤30 s, ≤4,000,000 bytes per clip and 32 MiB combined decoded memory. File-size and RIFF metadata validation precede decoding. Useful for bounded A/B comparisons, but too restrictive as a general PATCHBOOK reference player. No waveform/recording engine was found.

## 10. UI findings

The piano roll’s variable named `canvas` is an HTML **div**, not Canvas 2D. `patch()` creates/updates a button for every note and a select option for every note; hidden pitch rows do not provide time-based viewport culling. It supports pointer capture, both-edge resize, backward drawing, keyboard operations, undo/redo, pitch/position inspector, fitted time/pitch range, cancellation, ResizeObserver cleanup, and 50 ms playhead updates.

This is a useful interaction reference for a bounded 512-note editor. It is not demonstrated scalable to MNEMOBARD’s proposed 10,000 notes and multilane timelines. The 1,050-line editor mixes rendering, gestures, history, validation, and forms; use interaction rules/tests, rebuild rendering/controller separation. Native labels and buttons are positive accessibility foundations, not a completed accessibility audit.

`mountArrangement` edits ordered sections and roles, not arbitrary lane clips. `mountSoundEditor` implements A/B/blind workflow; it is not PATCHBOOK. General helpers in `ui/dom.ts` build DOM using `textContent`, label controls, report contextual errors, and guard duplicate async clicks. Consider Obsidian built-in controls before importing custom dialogs/helpers. No global runtime HTML-string injection found in the inspected `src` scan.

## 11. Data model and persistence findings

`model.ts` has `song`, `motif`, `experiment`, `section`, `NoteEvent`, `Assignment`, and schema 1. Every non-song payload owns `songId`. Songs keep arrays of children; sections hold role assignments; experiments hold two trims, common loop and optional preference. Defaults use 96 PPQ, with source PPQ retained on import. This differs from standalone motifs/patches and arbitrary composition lanes.

`document.ts` discovers one closed managed `troubadour` block while recognizing other fenced blocks, validates identity/schema, preserves prose surrounding the block, and serializes YAML plus JSON. `managedToken = JSON.stringify([yaml, block.json])` includes frontmatter and exact JSON text. A concurrent prose-only edit can coexist; frontmatter/managed-data changes cause stale conflict. This is a useful, more targeted alternative to MNEMOBARD’s proposed whole-text expected-content check. Unknown YAML is preserved semantically; formatting can normalize.

`VaultStore.save` serializes per-ID operations and compares tokens within `Vault.process`; `refresh` explicitly represents ambiguous/invalid/missing records. `createCopy` uses collision-safe names. `addChild` creates a child first and links the parent second, deliberately retaining recoverable orphan work on failure. `snapshot` stores draft plus full original note in Markdown that does not become a duplicate entity. No automatic schema migration, pre-save backup, transaction journal, or crash-proof flush exists.

Performance concern: every debounced create/modify/rename/delete calls `refresh`, which concurrently reads **all Markdown files**, rebuilds the map, and notifies the union of old/new IDs. Unrelated vault edits can trigger full scans and broad rerenders. Generation/disposal guards prevent stale publish but do not bound read fan-out. Refactor to incremental/coalesced indexing before adapting.

## 12. Code quality assessment

Strengths: strict types, small domain functions, explicit invariants, typed error/status unions, validation before mutation, immutable variation candidates, conditional writes, intentional recovery, lifecycle disposal, and regression tests for races and musical boundaries. The code reflects iterative correction rather than an abandoned empty shell.

Costs: bespoke binary parser; schema coupling across layers; large imperative editor/workspace modules; eager indexing; direct globals (`document/window/navigator`) complicating pop-outs; release limits embedded in validators; no measured coverage report; no distribution license. Runtime source scans did not find Node/Electron or remote fetch imports, but cannot certify all behavior or generated bundles.

Per-component review below covers completeness, coupling, dependencies, tests, performance, host compatibility, maintenance, integrity, and effort. Quality labels are static judgments, not numerical scores or a fresh pass certificate.

For candidates classified REFACTOR AND REUSE, the detailed quality disposition is:

| Candidate | Completeness, coupling and dependencies | Tests and performance evidence | Integrity/maintenance conditions |
| --- | --- | --- | --- |
| Music helpers | Implemented; TypeScript/domain only, but some helpers depend on progression/model and fixed default grid. | `tests/core/foundation.test.ts`; polyphony sorts 2n edges; no benchmark. | Validate inputs at boundary; split small reusable math from harmony/limits. Low maintenance after separation. |
| Note-edit math | Implemented pure edit results; depends on old motif length/meter/default PPQ. | `tests/core/note-edit.test.ts`; constant work per edit, no large-selection measurement. | Existing per-note clamping must not distort a future multiselect group. New interval/boundary tests required. |
| Development | Implemented transformations; coupled to validation/harmony and global UUID generation. | `tests/core/development.test.ts`; linear mapping plus sort; bounded legacy notes. | Range validation and immutable source are positive; inject IDs and preserve new semantics. Moderate maintenance. |
| Document codec | Implemented; host YAML helpers and old schema, not wholly host-independent. | Foundation/storage tests exercise fences, prose and stale writes; scans/serializes full note. | Preserve unknown data/prose; review malformed fence/YAML/large-file behavior. Moderate maintenance. |
| Vault store | Implemented create/save/index/snapshot; host APIs and old graph ownership. | `tests/storage/vault-store.test.ts`, motif-library tests; full-vault concurrent scan per event is a scale risk. | Conditional saves/duplicate states are valuable; new index/backups and graph remove substantial coupling. High adaptation burden. |
| Draft versioning | Implemented in-flight save/version/stale state; coupled to VaultStore and legacy UI forms. | `tests/ui/recovery.test.ts`, `workspace-races.test.ts`; clone/save work scales with document size. | Retain edits arriving during save; distinguish saved snapshot from saved original; add shared-session/disposal cases. Moderate burden. |
| Transport | Implemented synth/A-B scheduling/cancellation; Web Audio plus app-global visibility/audio-session policy. | `tests/audio/audio.test.ts`, playback-state/audio-session tests; density caps, no fresh jitter test. | Stop/abort ownership is useful; fix overdue-event policy and test repeated disposal, seek and main-window ownership. High responsibility. |
| Voice/gain logic | Implemented recipes and conservative release-tail gain; Web Audio for voices, pure plan math for levels. | `tests/audio/levels.test.ts` and audio tests; historical OfflineAudioContext measurements only. | No external sound assets; review source rights, peak/voice limits and node release. Low-to-medium maintenance. |
| Search/copy logic | Implemented filtering/provenance; domain/library schema plus store for copying. | `tests/core/library.test.ts`, `tests/storage/motif-library.test.ts`; linear scan then sort; no indexed-search benchmark. | New IDs/copy ownership are positive; relative prose links need explicit context. Moderate generalization cost. |
| Selected tests and fixtures | Broad scenarios exist; fake host, old schema and some device-specific expectations. | 29 test files; no fresh pass or branch-coverage report. | Synthetic fixture provenance and adapted expectations must be reviewed; never import private vault/config artifacts. Moderate maintenance. |

All pure helpers are compatible with a browser/Electron TypeScript bundle in principle; host-dependent codec/store/draft and browser-dependent audio need the narrow adapters shown in the architecture. This is static compatibility reasoning, not execution evidence. Effort ranges are in the reuse table; every candidate also shares the unresolved licensing gate.

## 13. Testing and validation findings

There are **29 `.test.ts` files**. A lexical scan found 126 direct `it`/`test` declarations; parameterized cases make that different from an executed test count. The latest private-beta report states **134 tests / 29 files** passed with typecheck/lint/build. The long results document also retains older 58/111/115/117/120-test checkpoints. These are historical claims, not contradictory current audit results and not freshly reproduced.

Inspected tests cover MIDI truncation at every byte, Type 1/running status, velocity-zero ends, exact source ticks, malformed headers/timing, nested overlaps, stale writes and prose preservation, renamed/duplicate IDs, collision races, note-edit timing phase, harmony/arrangement, gain bounds, AudioContext resume cancellation, audio-session modes, recovery, and delayed-navigation races. `vitest.config.ts` uses jsdom with a custom Obsidian shim; it is not the real host. No instrumented percentage/branch coverage result was located.

`docs/testing/results.md` records Linux Obsidian and browser checks. `external-workflow-checks.md` documents REAPER 7.83/Linux receiving 16-note melody and 29-note combined exports with note/timing/channel/trailing-rest fidelity; the project tempo/meter was set manually. It explicitly leaves reverse import and automatic tempo import unverified. `private-beta.md` distinguishes user-reported iPhone Silent Mode/background/basic edit/reopen success from remaining A/B, MIDI handoff, lock/call, sync, accessibility and worst-case performance work. This audit did not open those apps or modify a vault.

### Optional isolated validation, approval required before execution

Dynamic validation is useful to establish reproducibility before source adoption; it is not necessary to finish this static milestone. After explicit authorization:

1. Provision a disposable VM/container with no mounted home directory, vaults, credentials, audio devices, or writable TROUBADOUR mount. Network initially disabled. Create an allowlisted snapshot at `/work/troubadour-review` from the audited commit containing `src`, `tests`, `dev`, reviewed configs, manifest, and lockfile. Exclude `.git`, `output`, `dist`, `dev-vault`, `.planning`, `.playwright-cli`, and existing `node_modules`.
2. Separately review the exact pinned dependencies and approve acquisition. In that isolated copy only, run `npm ci --ignore-scripts --no-audit --no-fund` with a restricted package-registry connection or trusted cache; disable network again before code execution. Some build tools may need an explicitly reviewed installation step; stop if so. Never authorize arbitrary postinstall scripts implicitly.
3. With working directory `/work/troubadour-review`, run `npm run typecheck`, `npm run lint`, and `npm test` individually, capture versions/counts, and compare to the documented 134 cases. These commands execute configs/tests and are permitted only within that authorized isolation. A build, if approved, writes only there.
4. New feasibility tests should simulate a scheduler stall exceeding 150 ms, 10,000-note rendering, unrelated edits in a 10,000-note-file vault fixture, and a delayed save at shutdown. Test a separate new Type 1 compiler/export contract, not the existing Type 0 encoder alone.
5. If host validation is later approved, use a newly created disposable vault and separate Obsidian profile. Native DAW/loopback tests require their own isolated setup; never run the existing REAPER helper unchanged because it embeds legacy output paths.

No step above has run. The proposed commands are concrete future tests, not a request to perform them during Milestone 0.

## 14. Dependency and licensing concerns

No LICENSE/NOTICE filename is tracked; `package.json` has `private: true` and no `license`. `docs/testing/private-beta.md` explicitly lists distribution/license selection as outstanding. A local Git author or manifest author does not prove ownership of every contribution. Obtain confirmation of ownership, permissible reuse, provenance and distribution license before extraction.

The v3 lockfile has 230 package entries including the root; all named tools inspected are development dependencies. Declared licenses include MIT (177), MIT-0 (2), Apache-2.0 (16), PSF-2.0 (1), BSD-2-Clause (8), BSD-3-Clause (3), ISC (7), MPL-2.0 (12), BlueOak-1.0.0 (2), CC0-1.0 (1), and one undeclared entry (the root). These are metadata declarations, not an exhaustive file-level license clearance or vulnerability scan.

Examples: Obsidian typings/esbuild/Vitest/jsdom/ESLint/js-yaml/Moment declare MIT; TypeScript declares Apache-2.0. Runtime `src` uses the host API only; shim/testing dependencies need not be shipped. Verify actual bundled inputs and notices in a future authorized build. Do not copy the old lockfile, node_modules, packaged plugin, test vault, audio/image artifacts, or browser shim wholesale. The shim includes hardcoded icon path data; provenance must be checked if reused. User-provided palette/reference art and synthetic audio are not automatically licensed for a new public plugin. No third-party source attribution inventory was found; absence of a notice is uncertainty, not clearance.

## 15. Obsidian compatibility assessment

This is already an Obsidian plugin, so no external application runtime or framework port is needed for candidate modules. Public ItemView, Plugin, Vault, metadata and commands are used; synth playback is browser compatible. A browser-targeted bundle and explicit cleanup are positive.

Remaining host work: defer indexing/UI until layout/metadata readiness as appropriate; handle restored/deferred leaves without an unchecked `leaf.view as TroubadourView`; make module lifecycles independent; bound indexing; verify multi-pane/window ownership and theme behavior; keep crash recovery separate from ordinary close callbacks. `main.ts` already reveals leaves before casting, but an explicit instance check remains safer and clearer. Mobile-specific shared audio-session changes and same-song data restrictions should not enter MNEMOBARD by default. Development scripts using Node/Python/REAPER are tooling, not plugin runtime requirements.

## 16. Component reuse classification

Classifications are technical recommendations pending rights and human approval. REFACTOR AND REUSE does not authorize copying. REUSE DIRECTLY: **none recommended at this stage**.

| Component | Source Path | Current Function | Quality | Reuse Classification | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Tick/polyphony helpers | `src/core/music.ts`: `barsToTicks`, `sectionSeconds`, `maxPolyphony` | Meter arithmetic and sweep-line note overlap | Strong small functions; core tests; sorting O(n log n) | REFACTOR AND REUSE | Separate generic contracts and limits; inject/default PPQ explicitly. 0.5–1.5 engineer-days. |
| Note editing math | `src/core/note-edit.ts`: `moveNote`, `resizeNote`, `positionTicks` | Delta snap, boundary resize, musical coordinates | Strong regression intent; tied to 8-bar motif/96-default schema; O(1) per note | REFACTOR AND REUSE | Adapt pure functions to new note/length types; preserve imported phase; test multiselect invariants. 1–3 days. |
| Development algorithms | `src/core/development.ts`: `developMotif`, `melodySignature` | Inversion/reversal/shift/fragment/seeded variations | Readable; tests; validates via song model and regenerates IDs | REFACTOR AND REUSE | Extract approved operations with injected ID creation. Most remain post-MVP. 2–4 days. |
| Harmony/chord compiler | `src/core/harmony.ts`, `progression.ts` | Modal pitches, voicings, backing | Compact tested domain; optional broader feature | REFERENCE ONLY | Defer; adopt only after a separately approved harmonic feature. |
| MIDI parser/import | `src/core/midi.ts`: `Reader`, `parseMidi`, `importMidiTrack` | Bounded Type0/1 import and bar-window clipping | Useful defensive checks/tests; custom parser maintenance and schema coupling | REFERENCE ONLY | Prefer reviewed library adapter; use adversarial scenarios and source-tick policy. Rebuilding adapter: 3–6 days plus fixture review. |
| MIDI encoder | `src/core/midi.ts`: `encodeMidi` | Type0 motif/accompaniment export | Explicit event order/trailing rests; tested, one-direction DAW report | REFERENCE ONLY | Build Type1 arrangement export from shared tick compiler; avoid lifting small Type0 writer into incompatible model. 3–5 days. |
| Markdown codec | `src/core/document.ts`: `parseDocument`, `updateDocument`, `documentProse` | One owned JSON block, token conditional write, prose retention | Strong preservation cases; Obsidian YAML dependency and legacy envelope | REFACTOR AND REUSE | Extract fence/preservation/token behavior into new codec with reviewed unknown-field and future-schema rules. 2–4 days. |
| Vault store | `src/storage/vault-store.ts`: `VaultStore` | Index, collision-safe create, serialized save, snapshots | Good integrity states/tests; all-vault fan-out, ownership coupling | REFACTOR AND REUSE | Preserve patterns and selected helpers; rebuild incremental index/new repository boundary. 4–7 days. |
| Song parent/child graph | `src/storage/song-actions.ts`: `addChild`; `core/model.ts` | Song-owned motifs/sections/experiments | Purposeful orphan recovery; unsuitable ownership contract | REBUILD | New standalone patch/motif and composition-lane graph; keep child-first failure lesson. 3–6 days. |
| Draft version handling | `src/ui/draft.ts`: `Draft.save/stale` | In-flight save/draft revision protection | Useful race safeguards/tests; UI/store coupling, explicit-save semantics | REFACTOR AND REUSE | New shared entity sessions/autosave; adapt revision and stale-result rules. 2–4 days. |
| Playback planning | `src/audio/plans.ts`: `motifPlan`, `arrangementPlan`, `checkPlan` | Seconds-based section repeats/clipping and density checks | Pure/tested but song/section/voice coupled; linear lookup per reference | REFERENCE ONLY | Build tick-domain lane compiler; retain bounds/loop-seam test ideas. 3–6 days. |
| Transport | `src/audio/transport.ts`: `Transport.playPlan/stop/dispose` | Lookahead schedule, cancellation, A/B and app visibility | Good ownership, bounded authored plans; overdue catch-up risk and shared mobile API | REFACTOR AND REUSE | Split synth transport from preview/A-B/mobile policy; add seek/underrun and disposal tests. 4–7 days. |
| Synth voices/gain | `src/audio/voices.ts`, `levels.ts`: `scheduleVoice`, `previewGain` | Offline oscillator recipes and release-tail headroom | Strong focused logic/tests; browser-only; no external assets | REFACTOR AND REUSE | Most valuable audio candidate. Review provenance, simplify voice contract and measure levels/timing. 1–3 days. |
| WAV/A-B loading | `src/audio/clips.ts`: `validateWav`, `validatePair`, `loadClip`; `ui/sounds.ts` | Strict bounded clips and comparison UI | Sensible memory/abort checks; intentionally narrow formats/lengths | REFERENCE ONLY | General preview via media elements; optional A/B after MVP. 1–3 days for bounded policy adaptation. |
| Piano-roll UI | `src/ui/piano-roll.ts`: `mountPianoRoll` | DOM grid, gestures, selection, inspector, undo | Featureful, tests; 1,050 lines and all-note DOM updates | REBUILD | Reuse interaction/test knowledge; new culled grid/controllers with accessible list. 8–15 days. |
| Arrangement UI | `src/ui/arrangement.ts`: `mountArrangement`, `sectionEditor` | Reorder sections and assign roles | Functional section planner/tests; different semantics | REBUILD | New lane/clip view and edit model. 10–18 days. |
| Search/copy library | `src/core/library.ts`: `searchIdeas`; `storage/motif-library.ts` | Linear motif filtering/copy/provenance | Understandable tested filters; song-specific and whole-record search | REFACTOR AND REUSE | Generalize selected filtering/provenance concepts after catalog model; no indexed-scale claim. 1–3 days. |
| UI utilities/context | `src/ui/dom.ts`, `editor-state.ts`, `view-context.ts` | Labeled helpers, dialogs, context and async guards | Useful scenarios; host globals/custom controls increase maintenance | REFERENCE ONLY | Prefer native APIs and focused controllers; retain async-navigation lessons. |
| Tests/fixtures/evidence | `tests/`, `dev/iphone-fixtures.ts`, `docs/testing/` | Regression examples and synthetic workflows | Valuable broad source scenarios; jsdom and historical results have limits | REFACTOR AND REUSE | Authorize selected fixtures/scenarios; adapt expected model and run independently. 2–4 days. |
| Legacy bootstrap/build/settings | `src/main.ts`, `settings.ts`, root build/config files | Single product workspace and npm packaging | Suitable for prototype; distinct product/settings and toolchain | REBUILD | Scaffold from current official host contract in Milestone 1; no old lockfile/build import. |
| Generated artifacts/test vault/private sync setup | `dist/`, `output/`, `dev-vault/`, generated `main.js` | Prior distribution and device validation | Not source modules; may include private or local assumptions | DISCARD | Exclude from MNEMOBARD adoption. “Discard” means do not reuse; delete nothing in TROUBADOUR. |

Estimates are rough adaptation/replacement effort for an experienced engineer, not commitments; rows overlap and must not be summed into a project schedule. Rights clearance, independent validation and user review are additional gates.

## 17. Recommended integration strategy

Use A (selective extraction) for approved pure math/editing utilities, document preservation, synth/gain logic and useful tests, with refactoring at new boundaries. Use C (reference-informed reimplementation) for MIDI adapters, the arrangement compiler, high-density UI, patch catalog, and application sessions. Avoid B, a broad legacy refactor: the ownership/model/UI differences would retain constraints while touching much of the code. D, an entirely independent implementation, remains a fallback if ownership clearance or isolated validation fails.

The new architecture stands independently. No source has been copied, and no reuse is approved. [ARCHITECTURE.md](ARCHITECTURE.md) defines proposed placement; [DECISIONS.md](DECISIONS.md) identifies decisions awaiting review.

## 18. Technical debt and risks

Highest legacy debts are no distribution license, eager all-vault scanning, UI/rendering concentration, bespoke MIDI codec, tightly song-owned data, no lane arrangement exporter, incomplete worst-case performance/accessibility/device validation, and async-close recovery limitations. Do not inherit the existing 8-bar/512-note limits, source default PPQ96, broad UI globals, A/B requirement, or iPhone audio-session policy without independent justification.

Recent development history shows scope expanded quickly over three days. Commits `b190560` (draft/playback protection), `3273276` (MIDI/harmony/arrangement), `5caafef` (development/library), `4b218b3` (quiet playback), `ad17001` (UI), `9a47c50` (leftward editing), `cb7859b` (iPhone audio), and `6072e21` (REAPER check) supply useful decision context. Test-fix history is evidence of attention to defects, not proof no others remain.

## 19. Adaptation complexity

Browser/host compatibility work is low because the legacy already targets Obsidian. Domain/codec/storage extraction is medium due to schema and ownership differences. Transport adaptation is medium to high due to deadlines, cancellation, voice lifetimes and lifecycle. Piano-roll/timeline reconstruction is high and dominates the UI work. A broad port is high complexity with little benefit over selective extraction.

A proposed first authorized adoption tranche is 5–10 engineer-days for selected math/edit rules, synth/gain and preservation/race fixtures, including new contracts and validation; larger repository/session work follows separately. This is a planning range with substantial uncertainty, not guaranteed savings. New model, PATCHBOOK and Type1 lane compiler remain necessary. Plan the MVP so it can finish without legacy source if reuse is denied.

## 20. Final recommendations

1. Preserve TROUBADOUR as a reference and maintain its clean tree; do not run packaging/device/sync helpers during MNEMOBARD research.
2. Confirm rights/provenance and authorize specific components before copying any code or fixtures.
3. Prioritize tick/edit math, release-tail gain/voice logic, and preservation/race tests; adapt contracts instead of importing the old entity graph.
4. Preserve source PPQ in imported motifs; use an explicit composition-resolution conversion policy. This is a justified improvement to the initial fixed-PPQ draft.
5. Build a new lane compiler and dense-grid UI; validate storage, scheduling and rendering experiments before feature expansion.
6. Use current official Obsidian guidance and the independent product requirements as architectural authority. Stop after Milestone 0; implementation requires explicit approval.
