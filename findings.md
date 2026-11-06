# Milestone4B active — Prompt009

Signed4A baseline3f5c67f verifies good after386/33 check;60 reviewed paths matched manifest. Plan: docs/superpowers/plans/2026-11-06-milestone-4b.md. Preserve unique stored explicit channels; safe derived Auto reuse, exact acknowledged source capture and shared compiler/transport.4C excluded. Historical entries follow.

# Milestone4A complete — Prompt008

Signed3B baseline50583e1 verifies good.386 tests/33 files, strict typecheck/lint/build and audits pass. CANVAS21 native groups and58 MOTIF/MIDI/PATCHBOOK/foundation regressions passed, including cold restart/conflicts/recovery/cleanup.17 actual screenshots, exact saved-source preflight and32-lane/1,000-clip measurements are recorded in docs/MILESTONE_4A_REPORT.md and docs/validation/milestone-4a-native.json. Final drag p95≈45.4ms/Save maximum≈411.7ms remain host-specific costs; preceding slower repeats are retained. No new dependency, legacy copying/modification, personal-vault or remote changes.4A remains uncommitted after the signed baseline. Stop before4B; human review and separate authorization required.

# Milestone3B complete — Prompt007

Signed3A baseline90eed00 verifies good.349 tests/30 files, typecheck/lint/build and audit pass. Native MIDI16 groups, MOTIF19, PATCHBOOK12 and foundation11 pass, including cold restart/conflicts/recovery/cleanup. Independent Python/raw-fixture checks preserve supported events/source PPQ;14 actual screenshots and full-view100/1000/5000 profiles are in docs/MILESTONE_3B_REPORT.md and docs/validation/milestone-3b-native.json.5k pointer p95≈60.8ms remains a limitation; exact musical/unknown-state import restrictions remain explicit. No legacy/personal-vault/remote changes.3B work remains uncommitted; stop before CANVAS. Historical entries follow.

# Milestone3A complete — Prompt006

Signed2B baselinec63125b verifies good. Production MOTIF editing/history/audition/save/recovery passed278 tests/26 files, typecheck/lint/build,24 native MOTIF groups,12 PATCHBOOK groups and11 foundation checks. Cold restart, conflicts, keyboard/group gestures,12 screenshots,100/1000/5000/10000 benchmarks and preservation evidence are in docs/MILESTONE_3A_REPORT.md and docs/validation/milestone-3a-native.json. No new dependency or legacy/personal-vault/remote changes.3A remains uncommitted for review; stop before3B/CANVAS. Historical entries follow.

# Milestone 2B complete — Prompt005

Signed baseline300eba2 verified;209 tests/21 files, typecheck/lint/build pass. Native2B workflow/cold restart plus keyboard/image/hash probes passed (14 groups), foundation11 and clean-start2A17 passed. Nine actual screenshots,100/1000/5000 benchmarks, limits and host queue stress are in docs/MILESTONE_2B_REPORT.md / docs/validation/milestone-2b-native.json. Legacy hash matches baseline; no copy/personal-vault/remote changes. Implementation uncommitted for review; stop pending separate authorization. Historical entries follow.

# Milestone 2A findings

- Signed baseline f0d90d1 preserves reviewed1B work; good signature, no signing override/remote. Production library independently implemented on the shared repository/codec/index.
- Instruments/effects-chain schema1 kinds and namespaced patch fields are additive. Legacy text patches remain valid; UUID links survive native rename; metadata/prose and unknown surviving stage values are preserved.
- Native library CRUD/queries/relations, explicit Save and keyboard scope, draft conflicts/checkpoints, confirmed archive/restore and module/plugin reload work. Invalid drafts remain recoverable without unsafe detail links or invalid authoritative notes.
- Cold restart preserved5 source notes exactly plus IDs/settings/commands/selection/search. Host layout preferences are debounced; the view requests updates and cold-stop tooling flushes them. Saved entity durability is independent of preferences.
-165 tests/17 files pass; native2A17 checks, original foundation smoke and1B15 checks/21cases pass. Light/dark/narrow desktop screenshots inspected. Windows/macOS/screen readers/large libraries remain unverified.
- Recovery is append-only/manual; recent unacknowledged changes are not crash/unload-durable. Removal is reversible archive, not physical deletion. Assets remain metadata only. No2B, dependency, experiment source, legacy or personal-vault change.

# Milestone 0 findings

## Confirmed local facts
- Inspection date: 2026-11-05.
- pwd: /home/jason/MNEMOBARD; ls -la showed only . and ...
- No Git repository or existing project documents/configuration/source.
- /home/troubadour: No such file or directory. No alternate path searched or used.
- Parent agent guidelines read; project documentation must preserve data and distinguish evidence from assumptions.

## Evidence policy
Official sources support external technical claims. Research recommendations remain unapproved. Missing legacy evidence is unknown, never proof that functionality is absent or unsuitable.

## Initial external research
- Official submission requirements: minAppVersion must reflect tested compatibility; Node/Electron APIs are desktop only; sample code must be removed. Source: https://docs.obsidian.md/community-directory/submission-requirements-for-plugins
- Web MIDI is permission/secure-context dependent and not broadly uniform; hardware access is separate from SMF import/export. https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API
- decodeAudioData requires complete file data and produces decoded/resampled AudioBuffers; budget decoded memory. https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData
- GitHub connector fetch of obsidianmd/obsidian-sample-plugin main.ts returned 404; public official-source browsing fallback required.

## Obsidian research direction
- Vault.process supplies a synchronous safe read/modify/write boundary for a text file; asynchronous work requires checking the current contents in that callback. This does not supply multi-file transactions. https://docs.obsidian.md/Plugins/Vault
- Component lifecycle helpers register Obsidian/DOM events and intervals; nonregistered resources need explicit disposal. https://docs.obsidian.md/plugins/guides/lifecycle-management
- Official sample repository is on master with src/main.ts (not root main.ts). It uses TypeScript, esbuild, ESLint, and a 0BSD license. https://github.com/obsidianmd/obsidian-sample-plugin
- Some legacy plus-separated documentation URLs resolve to Not Found; use current or percent-encoded space URLs and authoritative API definitions.

## Ecosystem and rendering
- Official community registry checked via static HTTPS read: ABC Music Notation, MIDI Logger, Audio Notes, Audio Player, Chronos Timeline, Songwriter Player, Aurora Tracker are listed. Registry listing is not a quality/security endorsement. https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json
- MIDI Visualizer author README describes canvas piano roll, @tonejs/midi and audio-linked playback; editing cannot be inferred. https://github.com/danielrdehaan/MIDI-Visualizer/blob/Main/README.md
- Aurora Tracker is a particularly relevant potential overlap: registry describes note-text songs, synth tracks and WAV/MIDI export; inspect author README before differentiation claims.
- React/Preact declarative UI and Svelte compiler are options for shell UI; no framework itself resolves dense-grid rendering or hit testing. Use measured Canvas 2D culling with accessible DOM controls as a provisional approach. Official framework docs consulted.

## Confirmed primary-source checks
- Official docs source repository confirmed ItemView/registerView factories, onOpen/onClose, deferred-view checks, no persistent view singleton, and no detachLeavesOfType on unload. Sources: https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/User%20interface/Views.md and https://docs.obsidian.md/plugins/guides/defer-views
- processFrontMatter is synchronous atomic frontmatter mutation and can throw YAMLParseError; getFirstLinkpathDest returns TFile|null; Vault.getResourcePath provides browser URI. Official API source documents read.
- Current official submission guide uses the Community directory workflow, linked GitHub/Obsidian accounts, manifest at default-branch HEAD and matching GitHub release assets. Official sample README still describes an older PR route; prefer current guide. https://docs.obsidian.md/plugins/releasing/submit-plugin
- midi-file package manifest has no runtime dependencies and includes types; MIT. @tonejs/midi manifest lists midi-file and array-flatten; MIT. Default-branch manifests are not proof of latest published versions. No packages installed.
- Aurora Tracker author README confirms patterns, instrument preset editing, synth playback and MIDI/WAV export, plain-text song blocks; AGPL-3.0-or-later per README. Functional comparison only, no source copied.
- Bases Audio Player README describes audio previews for linked vault audio in Bases; implementation claims DOM monitoring, so consider an ecosystem reference, not an internal API dependency.
- MIDI.org SMF overview read; linked full specification not downloaded. Format acceptance must be verified by future fixtures against full spec.
- Research orchestration errors: invalid process ID poll returned error; one result-store call attempted to store undefined and failed. Re-read targeted sources successfully; no project/legacy mutation resulted.

## Provisional architecture choices
- One authoritative Markdown note per entity; YAML identity and owned JSON motif/composition block. Standard MIDI is explicit export. This reduces multi-file save risk but requires an approved format tradeoff.
- Fixed 960 PPQ, fixed tempo/meter MVP; note-only import with explicit unsupported-event warnings; reject unsupported timing, original bytes preserved.
- Vanilla DOM shell plus Canvas 2D grids, accessible note/clip lists; no assumed dependency on legacy UI or state.
- midi-file preferred provisionally; @tonejs/midi and MidiWriterJS alternatives. Third-party library tests and manifests are not evidence of passing MNEMOBARD requirements.
- All reuse unknown; provisional independent baseline must not be represented as a completed legacy-informed decision.

## User path correction
User explicitly corrected TROUBADOUR location to ~/troubadour, authorizing /home/jason/troubadour. The initial /home/troubadour failure remains recorded; new source inspection now uses the authorized path.

## TROUBADOUR read-only audit evidence
- Authorized root /home/jason/troubadour, clean Git tree, HEAD bc2749e2877738bd443a1d3ace66f919d23fe837; 18 commits 2026-10-28 to 2026-10-30. Private 0.4.3 Obsidian plugin, manifest minAppVersion 1.12.0, isDesktopOnly false.
- 7,303 lines across inspected src TS files, including 1,050-line DOM piano roll and 638-line workspace. 29 test files; static 126 direct it/test declarations (parameterized tests affect expanded count). Historical documentation reports 134 tests; not rerun.
- No LICENSE/NOTICE among 121 tracked files; package private true and no license field. Ownership and any third-party adaptation unresolved. Aggregate tracked-file baseline in .legacy-audit-baseline.json.
- Runtime source imports are relative modules plus obsidian only. Dev manifest/lockfile has TypeScript, esbuild, Vitest/jsdom, ESLint, js-yaml shim, and Moment override; 230 lockfile entries. No runtime network/Node imports found in src scan; not a full security certification.
- Implemented: MIDI Type0/1 parsing (bounded file/tracks/events), fixed tempo/meter/source PPQ; Type0 motif export; note editing; transpose/stretch/invert/reverse/shift/fragment/seeded variations; Web Audio voices + A/B WAV comparison; section/role arrangement playback; Markdown/YAML + managed JSON storage, conditional saves and snapshots.
- Absent from inspected architecture: structured patch library, arbitrary multilane clip timeline, arrangement MIDI exporter, general waveform renderer, tempo maps, MIDI hardware input, VST/AU hosting. No separate quantize-existing-notes operation located; editing uses snap deltas.
- Reuse candidates: music/note-edit/development algorithms, voices/levels, document token/prose preservation, VaultStore conflict/ambiguity patterns, Draft revision handling, fixtures. Coupling/limits require adaptation and rights approval. No direct reuse currently recommended.
- Key static risks: VaultStore.refresh reads all Markdown files concurrently on every debounced vault event; transport loop schedules past-due events after main-thread stalls; model enforces song ownership/512 notes/8 bars; motif-only Type0 encoder cannot supply new Type1 arrangement export; async dirty-close recovery is not crash durability.
- Legacy tests/results are historical evidence, not fresh pass claims. REAPER import documented one direction with manually set tempo. Wider phone/audio/sync/accessibility/performance remain incomplete. No builds/tests/dependency installs run.

## Final synthesis
- Final documents supersede initial missing-source placeholders: legacy audit is complete at the corrected user-authorized root. Architecture no longer normalizes imported motif PPQ; retain exact source PPQ, convert explicitly at composition boundary.
- Hybrid A+C recommended; no unconditional direct reuse. Candidate groups L1–L4 require named authorization plus ownership/provenance review, L5 advanced transforms deferred.
- No code/dependencies/vaults changed. Final validation checks documentation and static source references only; no runtime correctness/security/performance certification.

## Milestone 1A dependency/platform review
- Prompt 002 authorizes independent foundation implementation, local dependencies/Git and new project-local disposable vault. No code/fixture reuse or 1B authorization.
- Registry metadata reviewed for versions/licenses/engines. Node 26.13.0 and pnpm 10.29.3 installed. Use TS6 rather than newly major TS7 pending ecosystem compatibility; exact dependencies pinned.
- yaml2 AST/source ranges selected for strict duplicate-key parsing and surgical YAML updates; native Obsidian stringify cannot provide byte ranges. ISC, zero runtime dependencies per registry/upstream. No MIDI/audio/UI framework.
- Obsidian installed via electron43; no DISPLAY set but existing X sockets available. Any launch must use a new isolated profile and the new dev vault only.

1A implementation: full-source string is the optimistic revision (no probabilistic hash). Public Vault.process callback compares exact source. Pre-save recovery JSON contains original and draft/candidate; failures after an uncertain commit are reported with recovery path, never retried automatically. Index startup bounded to four reads, file events supersede obsolete work; no all-vault refresh on each edit.

1A native findings: Obsidian1.15.0 supports actual foundation workflow; settings use a separate document/window. Runtime API package1.14.4 supplies typing, but conservative manifest floor raised to the observed host1.15.0. Host itself checked for updates during isolated launch; MNEMOBARD source makes no runtime network request. YAML runtime notice retained; project distribution remains unlicensed/private pending separate decision.
# Milestone 1B findings (2026-11-05)

- Signed restoration point70f45df preserves all60 original files. Source/foundation contracts remain unchanged.
- Exact rational transient time retains PPQ1000 offsets (tick1 ->24/25 at960) without rounding. Explicit integer projection reports errors; tempo-map integration/inversion and SMPTE rejection tested.
- One pure compiler supplies rational ticks/seconds to playback and a candidate MIDI writer test. Ambiguous same-channel same-pitch overlaps rejected; repeats do not accumulate conversion rounding.
- Native scheduling uses a25ms wall timer,100ms lookahead and explicit stall/late-event stop. Audio-clock deltas can be coarser than wall intervals. Real-time acoustic latency is unmeasured.
- Native bounded rendering21cases supports a culled Canvas/DOM hybrid. All-DOM20k failed; sparse20k and dense20k Canvas differ materially. See tracked docs/benchmarks/milestone-1b-native.json rather than extrapolating a universal guarantee.
- midi-file1.2.4 candidate is dev-only,10,700 minified/3,155gzip browser bytes. Header-only declared tracks are accepted; production requires outer validation. No legacy extraction or new runtime dependency.
- Legacy121 tracked hashes/HEAD/clean status unchanged; current reference path remains user-corrected ~/troubadour. No legacy execution/copy or personal-vault change.
- Final report: docs/MILESTONE_1B_REPORT.md. Production recommendations B01–B04 remain unapproved; next milestone requires a separate prompt.

##4B confirmed implementation findings

- Schema1 explicit channels are unique; preserving that contract avoids migration. Auto reuse is transient and state/context-verified. Same-track adjacency is safe; shared-channel cross-track same-pitch touching boundaries are rejected because external SMF merge order cannot be guaranteed.
- Shared exact MusicalEvent stream supports arrangement provenance, MIDI output and one audio owner. Compiler/serializer work belongs in the existing owned MIDI worker after measured synchronous24k-note≈126ms cost.
-100 distinct saved sources/1000clips expanded12200notes: worker compile≈81ms and serialization≈55ms, full prepare median443ms. Main-thread transfer/verification remain measurable; no universal real-time promise.
- Exact saved source text rechecks catch missed notifications, renames, duplicate/future/malformed/missing sources. Final binary submission still has a race window: retain and report stale/unacknowledged derivatives.
- Native tests confirmed revision invalidation, pause/resume/seek, context suspension, natural completion, recovery, external conflicts and disposal. Isolated REAPER7.84 resource path was verified, but import modal interaction failed; external DAW validation remains unavailable.
