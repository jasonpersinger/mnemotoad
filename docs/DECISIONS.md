# Decision register

Updated:2026-11-06. **Proposed is not approved.** Prompt010 authorizes Milestone4C after4B review (S01–S11 below); Prompt009 authorized Milestone4B (R01–R10).4C, maps, final branding/release and all legacy copying remain unapproved. Older log entries describe their original milestone authority.

## Confirmed requirements and authority

| ID | Decision/constraint | Authority/status |
| --- | --- | --- |
| U1 | Use existing `/home/jason/MNEMOBARD`; preserve prior work; milestone is research/docs only. | Original Milestone0 scope; later prompts authorize implementation. Root/preservation requirements remain binding. |
| U2 | Treat TROUBADOUR read-only; no code copy, install, legacy execution, commit or push. | User kickoff; required. |
| U3 | Corrected legacy root is `~/troubadour` → `/home/jason/troubadour`. | User follow-up explicitly authorizes this location. Original `/home/troubadour` absent. |
| U4 | One integrated Obsidian plugin; PATCHBOOK, MOTIF and CANVAS; initial Linux/Windows/macOS desktop. | User product brief; required. |
| U5 | Local-first, interoperable, non-destructive, modular, native, maintainable, extensible, private; no telemetry/account dependency. | User principles; required. |
| U6 | Do not implement/finalize visual styling/import legacy code; stop at Milestone 0. Milestone 1 needs explicit approval. | Historical Milestone0 boundary, superseded only within later explicitly authorized scopes. |

## Architectural recommendations

| ID | Recommendation | Alternatives considered and rationale | Approval status |
| --- | --- | --- | --- |
| D01 | TypeScript + public Obsidian API; pnpm + esbuild; separate typecheck/lint; Vitest. | Official sample matches host delivery; npm remains viable, Vite adds little for plugin bundle but browser tests can use its ecosystem. No exact versions copied from legacy. | Adopted for 1A under Prompt 002; exact dependencies in package.json. |
| D02 | Pure domain/application/host adapters; independent module UIs sharing services and IDs. | Whole TROUBADOUR fork/broad refactor would retain song ownership and UI coupling. | Foundation adopted in1A; shared typed draft/recovery extracted for PATCHBOOK and production MOTIF in3A. |
| D03 | One authoritative Markdown entity with YAML and an owned versioned JSON block; explicit standard MIDI exports. | `.mid` authority + sidecar improves immediate interoperability but introduces binary/metadata consistency and overwrite concerns. Separate JSON/Markdown pair and opaque database rejected initially. Legacy preservation experience supports single-file ownership. | Foundation format adopted under Prompt002; MOTIF MIDI export implemented under Prompt007. Arrangement export remains4B. |
| D04 | New motifs default960PPQ; source PPQ retained; exact transient timing; fixed-tempo/meter editing. | Normalizing imports discards source timing; map storage and export conversion need later contracts. | B01 approved in Prompt006; source-preserving MOTIF interchange adopted in3B, exact-only arrangement placement in4A. Maps remain unapproved. |
| D05 | `midi-file` adapter provisionally preferred; reference TROUBADOUR parser rules/tests. | `@tonejs/midi` higher-level alternative; MidiWriterJS generation only; custom legacy parser has maintenance/model cost. Benchmark and fixtures decide. | Pinned1.2.4 adopted under Prompt007/B04 in3B with independent strict validation, cancellable worker, explicit fidelity policy and independent exported-event verification. No broad event-lossless claim. |
| D06 | Shared lazy Web Audio transport + basic oscillator audition; media-element recording previews. | Tone.js/sample/native hosting unnecessary; quiet local sine is sufficient. | B03 direction approved in Prompt006; reviewed production start/stop and exclusive audio focus verified in3A. Pause/loop remain deferred. |
| D07 | Vanilla/native DOM shell; Canvas2D culled grids plus accessible lists. | React/Preact/Svelte remain possible; no demonstrated need. All-note DOM incurs unnecessary work. | B02 approved for MOTIF in3A and CANVAS in4A; native viewport/list evidence recorded. Final visual identity remains unapproved. |
| D08 | Standalone patches/motifs; composition forward ID links; live motif instances. | Legacy same-song ownership rejected. Snapshot/pinned motifs provide stability but add version management; defer pending user feedback. Length edits show downstream effects. | Standalone references implemented; Prompt008 approves saved live motif instances with source revision review in4A. Snapshots remain deferred. |
| D09 | Conflict-aware conditional saves, exact-text recovery copies, incremental identity index; explicit migration preview/approval. | Legacy managed-token merge may preserve prose edits; whole-text conservative conflicts are simpler. Decide tested merge policy in foundation. No database authority or distributed transaction claim. | Per-file protected writes, recovery inspection and typed sessions/history/clean-cache bounds implemented. Destructive migrations and automatic recovery pruning remain unapproved. |
| D10 | Desktop-only supported manifest initially, browser-based runtime, main-window editors until pop-outs tested. | Full mobile support from legacy manifest is not adopted. Set actual minAppVersion from tested host/API matrix. | Desktop-only manifest, conservative minimum 1.15.0 from native Linux smoke; other platforms unverified. |
| D11 | Type1 conductor + per-lane tracks; full-length repeated clips, unique lane channels; no audio mixing. | Legacy section clipping/Type0 motif export does not meet timeline contract. Complex trim/stretch/maps deferred. | Historical export proposal only.4A uses optional unallocated channels and32 planner lanes; final allocation/export awaits4B policy. |
| D12 | Hybrid A+C legacy strategy: selective refactor/extraction and reference-informed rebuild. | B broad port too coupled; D independent development remains fallback if clearance/validation fails. No unconditional direct reuse. | Reference-only during 1A/1B; Prompt 003 retains copying prohibition. B05 recommends independent implementations for this scope. |
| D13 | Mysterious/antiquated brand expressed with restrained accents while honoring host theme/accessibility. | Legacy palette/polish approval is for a different product and is not transferable approval. | Prompt008 approves provisional dark-first CANVAS with host light/dark compatibility; final branding remains unapproved. |

Rationale and detail are in [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), [research](TECHNICAL_RESEARCH.md), and [audit](TROUBADOUR_AUDIT.md). Five risks and experiments are in [RISKS.md](RISKS.md).

## Proposed legacy authorization groups

These groups identify a concrete future review scope. All are **not authorized**. Reuse classification means a recommendation, not permission. Confirm code ownership, third-party provenance, distribution compatibility and attribution before any source/fixture import. Preserve exact origin commit/path and record modified boundaries in the eventual notice/adoption record.

| Group | Candidate source and proposed destination responsibility | Constraints and approval needed |
| --- | --- | --- |
| L1 | `core/music.ts` selected tick/polyphony/transpose helpers and `core/note-edit.ts`; new pure musical math/edit commands | Adapt schema/length/PPQ; retain tests for off-grid phase; no old entity graph or 8-bar/512-note limits. Confirm rights and specifically authorize selected source extraction. |
| L2 | `core/document.ts` preservation/token/fence logic, selected `storage/vault-store.ts` collision/conditional-save patterns, `ui/draft.ts` revision handling | New codec/repository/sessions; no full-scan index or song graph. Test backups, external writes and failure semantics. Confirm rights and authorize selected refactoring, not entire storage import. |
| L3 | `audio/voices.ts`, `levels.ts`, selected `Transport` cancellation/node lifecycle logic | New transport contract and late-event policy; exclude A/B and mobile shared-audio-session behavior initially. Verify levels/disposal/timing in isolated host. Rights/authorization required. |
| L4 | Selected musical, MIDI, persistence, audio and navigation regression scenarios/fixtures from `tests/` and synthetic fixture definitions | Check provenance; adapt expected contracts; no packaged vaults/recordings/icons/config credentials. Tests are source too and require authorization before copying. |
| L5 | `core/development.ts` optional inversion/reversal/rhythmic algorithms | Post-MVP only; injected ID source and new note/length contracts. Separate feature/reuse approval later. |

Do not propose wholesale reuse of the piano-roll UI, arrangement UI/compiler, legacy model, MIDI encoder/parser, bootstrap/build files, generated artifacts, test vaults, or private device/sync setup. Reference-only examination is authorized; copying is not.

## Outstanding decisions

1. Review4A usability/support evidence and separately authorize4B channel/collision/source-capture/export/transport policy. Current architecture, saved live references and exact-only arrangement placement are scoped approvals, not pending foundation decisions.
2. Confirm TROUBADOUR ownership/provenance and intended distribution permissions; authorize L1–L4 individually or approve independent implementation. Select MNEMOBARD’s distribution license; none chosen in this milestone.
3. Explicit prompts have authorized implementation through4A only.4B needs a new prompt/review. Legacy dynamic validation/extraction remains unapproved.
4. Choose an initial reference hardware/Obsidian installer matrix and review measured targets after spikes. Decide pop-out/mobile expansion only after support evidence.
5. Approve interface hierarchy and later visual direction; decide whether recovery copies remain manual-retention or get a reviewed pruning policy after MVP. No automatic deletion proposed.

## Approval log

- 2026-11-05, user Prompt 002: explicitly authorized independent Milestone 1A only, local project dependencies/Git, a new disposable project-local vault, typed documented data contracts, safe persistence, settings and three workspace shells. This satisfies the earlier foundation approval gate and adopts the applicable D01/D02/D03/D09/D10 direction. It does not approve every future musical/visual recommendation.
- Binding exclusions retained: no legacy code/test/asset copying or modification, personal-vault changes, system installs, musical editors/sequencing/synthesis/timeline, cloud/telemetry, push/publication, or Milestone 1B work.
- 1A implementation choices: yaml2 source-range parser (ISC) for surgical edits and duplicate-key checks; exact full-source revisions with conservative prose-edit conflicts; pre-save recovery JSON; explicit writes only; desktop manifest floor1.15.0 after native validation. No fundamental format/module change.
- Distribution license, final styling, legacy reuse groups L1–L5, migrations and 1B remain unapproved. Package remains private/UNLICENSED. Future approval entries must name evidence, exact scope and conditions.

### Prompt 003 / Milestone 1B

- User explicitly approved experiments A–E, local baseline commit, experimental tests/dependencies and the marked disposable Obsidian environment only. User unlocked the GPG key after the terminal signing failure; signed baseline **70f45df** has a good signature. No signing configuration was changed. This supersedes historical statements that 1B had not been authorized; they remain historical records of 1A.
- Adopted **for experiments only**: rational BigInt quarter positions, tempo-map math, deterministic compiler, injected-clock bounded transport, quiet sine tone, shared row/time index and DOM/SVG/Canvas probes. No persisted schema change, extraction or production module linkage.
- `midi-file` **1.2.4** is pinned as a devDependency only after manifest/license/source review, no install scripts, 10,700 minified/3,155 gzip browser bytes measured. Production adoption remains proposed and requires strict outer validation; missing tracks are accepted by its parser.
- The temporary separate plugin is disabled by default, independently built and guarded to the marked dev-vault. It is not part of main.js or a normal production install.

| ID | 1B recommendation and rationale | Status / gate |
| --- | --- | --- |
| B01 | Retain source PPQ; 960 editing default; exact transient compiler positions, explicit endpoint quantization and warnings at integer export. Tempo maps mathematically feasible. | Proposed production refinement of D04. Keep fixed-tempo schema1; map storage/migrations need a separate design/approval. |
| B02 | Culled Canvas grid plus DOM controls/accessible list, shared between MOTIF/CANVAS. Native sparse/dense and lane measurements favor bounded visible work. | Proposed refinement of D07; review density limits/accessibility/host matrix before adoption. No framework selected. |
| B03 | Native Web Audio clock, generation cancellation, explicit late/stall stop, one production transport owner. Pause retriggers held notes for remaining duration. | Proposed refinement of D06; short native validation does not establish audible timing or final pause UX. |
| B04 | Low-level midi-file behind bounded structural validation; retain byte fixtures and independently verify exports later. | Proposed refinement of D05. Experimental installation is not approval of a production dependency. |
| B05 | Independently implement small timing/compiler/render/transport services. Keep legacy math, headroom and cancellation lessons as reference. | Recommended D12 strategy C for this scope. No L1/L3 source import is necessary; no reuse authorization requested as a blocker. |

Review required: B01–B04 production adoption, final fixed-tempo/import/export warning policy, supported rendering envelope and later accessibility/OS validation. Existing legacy rights, release license, final styling and destructive migration gates remain unresolved. Do not mark these approved merely because experiments pass.

### Prompt004 / Milestone2A

- User authorized production instruments, patches and reusable ordered chains, superseding the provisional text-only instrument/effects proposal. Additive schema1 kinds and namespaced patch metadata require no existing-note migration. Ordinary Markdown remains authoritative. Report-level1B review is not musical production-adoption approval.
- Signed baseline **f0d90d1** preserves all37 reviewed1B changes; good signature;123 existing tests/typecheck/lint/build passed before implementation. No signing bypass/configuration change or remote action.
- Adopted for2A: native DOM ItemView; existing codec/repository/index; shared per-ID drafts; explicit Save with500ms append-only recovery; source conflicts reject rather than merge; derived reverse UUID relationships; ordinary navigation wikilinks. No new dependency, database or bus.
- Library removal is confirmed reversible archiving. Conditional saves retain notes/IDs/references and permit restore. Permanent deletion stays in Obsidian; no cascade or compare-and-trash guarantee.
- Description/general notes are namespaced YAML; arbitrary Markdown/custom metadata remain user-owned. Changed owned structured fields may format their own YAML; exact pre-save recovery retains original bytes. Unknown/future schemas remain read-only. Creation validates the serialized document before writing.
- Invalid drafts may be checkpointed as raw recovery JSON without becoming invalid records. Checkpoint acknowledgment differs from Saved; unload cannot guarantee the last unacknowledged edits. Manual recovery only; automatic restore/pruning/migrations remain deferred.
- Provisional archival layout uses host fonts/themes/controls, scoped Mod+S, inline confirmations and responsive panes. No final typography/iconography/artwork selected.
- Guarded native CDP tooling needed removal of an unnecessary async-wrapper promise that Chromium could collect. This is a test-harness correction, not a MIDI experiment or production API change. Startup now displays index readiness before creation.

Stop after2A. Review the actual workflow/limits before separately authorizing2B. B01–B04, legacyL1–L5, distribution license, final design and destructive migrations remain unresolved.


### Prompt005 / Milestone2B

- User explicitly authorizes production PATCHBOOK assets/import, recorded auditioning, reference repair, recoverable unsaved sessions and focused scalability/native review. The old2A-only AGENTS boundary is superseded for this scope. Legacy location remains the user's previously corrected `/home/jason/troubadour`; `/home/troubadour` was absent. No copying or execution there.
- Signed local baseline **300eba2** includes all38 reviewed2A changed/new files;165 tests and full check passed before committing; signature verifies good. No signing configuration, remote or unrelated work changed.
- Adopted within005: public Vault getFiles/stat/getResourcePath/createBinary plus browser File selection; no filesystem runtime dependency. Arbitrary portable extensions can be associated. Imports require destination confirmation; uncertain copies are retained and reported, never silently retried/deleted.
- Adopted: one owner-scoped on-demand HTMLAudioElement;100MiB buffered import/250MiB preview limits and30s initial playback timeout. These conservative bounds are implementation safeguards, not measured maximum capacities. Experimental tone transport stays isolated.
- Adopted: native explicit recovery inspector and dirty-session loading. Prompt005 supersedes the earlier proposed new-file-first comparison with in-memory comparison/loading, keeping sources/checkpoints unchanged. Changed bases require explicit reviewed consent and revalidation, followed by normal conditional Save. No automatic merge/restore/pruning/migration.
- Adopted: revision-keyed derived library snapshot after measured5k search-copy overhead; cloned query results remain isolated and publication invalidates cache. No database or framework/dependency addition.
- Arbitrary presets are inspected inertly in a native Modal; only known media/image extensions go to host workspace viewers. No external application execution. ItemView scope initialization moved to construction after native navigation regression exposed late attachment.
- Report-level review authorizes neither final design nor MOTIF/CANVAS/release. B01–B04 and legacyL1–L5 remain proposed. No approved-code-reuse request is needed for2B.

### Prompt006 / Milestone3A

Authority: user explicitly authorizes the production basic MOTIF editor after2B review, and approves B01 exact timing/source resolution, B02 viewport-culled Canvas plus DOM controls and B03 basic audio-clock scheduling directions, subject to implementation verification. Historical B01–B03 proposal rows above now have this scoped approval; B04 codec remains deferred. No legacy code is authorized.

- Adopted/refactored selected own1B fraction/tempo math; rebuilt the event compiler and production transport/sine adapter within narrow tested boundaries. No wholesale experimental promotion or runtime experiment import.
- Implemented Canvas interval culling with native scrolling/zoom, selected-note numeric editing,50-row note register and focus-scoped shortcuts. Final identity is still provisional.
- Retained source-integer schema1, same-pitch overlap rejection and exact unrelated-content preservation. Defaults960PPQ/120BPM/4/4. No source retiming, map flattening or automatic migration.
- Shared typed document/recovery extraction has two concrete consumers. MOTIF and PATCHBOOK share persistence, not editing authority. Explicit musical recovery remains unsaved until normal protected Save.
- History100 entries/approximately16MiB serialized snapshots; drag is one entry, typing coalesces750ms, Save retains history, clean changed-source reload clears it. Checkpoints are not saved entities. Aggregate clean-session cache profiling/eviction remains a later hardening decision.
- One musical owner, exclusive recorded-preview focus, lazy context per audition and stop on owner/error/background/unload. No pause/loop/sample library, claim of audible sample accuracy or physical latency certification.
- Verified278 tests/26 files,24 native MOTIF groups plus foundation/PATCHBOOK regressions and actual screenshots. Evidence/limits: [3A report](MILESTONE_3A_REPORT.md), [retained summary](validation/milestone-3a-native.json). No new dependencies.

Stop after3A. Human review must authorize3B scope and B04 production codec adoption separately; final branding, distribution license, release, legacyL1–L5 and destructive migrations remain unapproved.

### Prompt007 / Milestone3B

Authority: user explicitly approves3B after3A engineering/visual review and permits adoption of the evaluated parser with justification. Signed3A baseline90eed00 verifies good;278 baseline tests passed before changes.

| Decision | Implementation/status |
| --- | --- |
| B04 scoped production codec | Adopt midi-file1.2.4 MIT with independent strict framing/limits, separate selected-part semantics and a cancellable worker. Its permissive truncation is not accepted as validation. No arbitrary-event lossless claim; final independent checks cover the documented subset. |
| Import fidelity | Preserve source PPQ/end silence, choose track/channel explicitly, then create only an unsaved fresh draft. Block timing changes, same-pitch ambiguity, controllers/bends/aftertouch/SysEx and unknown state/device semantics. Known named annotation/timbre losses require acknowledgment. |
| Export | Deterministic Type1 conductor+note track, shared compiler, source-integer endpoints, new visible vault path only. Independent Python/raw expected-event validation; no DAW/device claim. |
| Bounds |2MiB/128tracks/50000events/64KiB payload/1e9ticks,10s worker; selected10000notes/4096quarters. Tighter than the original10MiB/100k proposal to bound untrusted allocation/host work. Larger support requires further evidence. |
| Musical edits/position | Existing one-entry session history for transpose/start quantization/velocity and UUID patch associations. Denominator-beat bar:beat:tick notation with exact fractional offsets when representable; no stored timing change. |
| Session retention/performance | Pin attached sessions; retain at most8 clean idle unowned sessions in creation order. Never evict dirty/busy/owned sessions or delete recovery. Reuse one snapshot per status refresh and avoid library rebuilds on each note edit; validation/history remain intact. |

Verified349 tests/30 files, native MIDI/cold recovery/conflicts and existing MOTIF/PATCHBOOK/foundation regressions;14 real screenshots and actual full-editor profiles. See the [report](MILESTONE_3B_REPORT.md) and [retained evidence](validation/milestone-3b-native.json).5k full-view latency remains above the old50ms hypothesis.

Stop after3B. CANVAS needs a separate Prompt008 or equivalent explicit scope; maps, overlap-policy/schema changes, final visual identity/release license/publication and all legacy copying remain unapproved. No L1–L5 adoption is requested.

### Prompt008 / Milestone 4A

Authority: explicit user approval after 3B engineering/visual review supersedes the old 3A-only AGENTS/current-status text. All49 pending 3B paths were reviewed, the349-test baseline passed, and signed local commit `50583e1` verified good. No signing/remote configuration was changed; `90eed00` remains the 3A restoration point.

| Decision | Implementation and approval scope |
| --- | --- |
| C01 — Saved live references | Approved by Prompt008. UUIDs resolve saved motifs only; SHA256 of Vault-read source text detects changes since explicit review. Same-instance unsaved drafts are warnings. No snapshot promise or source duplication. |
| C02 — Exact arrangement timing | Approved by Prompt008. New timelines960PPQ; validate every note endpoint and complete repetition interval with exact BigInt arithmetic/GCD summaries. Reject inexact placement instead of adopting the old rounded-conversion proposal. |
| C03 — Compatible planner schema | Required by Prompt008's no-channel-allocation and32-lane workload. Schema1 now accepts optional channels and32 lanes; old assigned channels remain validated/preserved. Optional clip lane/revision/path/title/reviewed-period hints are backward compatible for the new reader. Older plugin versions may refuse expanded records; no automatic downgrade/migration. |
| C04 — Shared editing history | Extract reviewed MOTIF history into generic `HistorySession<T>` and retain MOTIF selection hooks. CANVAS uses the same bounds/grouping/save/reload/conflict semantics. No independent undo framework. |
| C05 — Native/Canvas rendering | Approved native DOM/Canvas direction, now applied to lane clips. Demand-driven viewport rendering, immutable source summaries and cached plans keep pointer previews separate from validation/history commits. Keyboard lane/clip/position alternatives remain native controls. |
| C06 — Resource/session ownership | Eight clean unowned idle arrangement sessions retained; dirty/busy/owned sessions never automatically deleted. Twenty pending-draft opening guard. Disable checkpoints applied edits; unload is not a save guarantee. No recovery pruning. |
| C07 — Planning preflight only | Always reports `exportReady:false`. Clip overlap remains structural data plus warning. No MIDI channels, arrangement playback, final MIDI serialization, section/marker UI or recording-reference UI authorized in4A. |
| C08 — Provisional CANVAS design | Dark-first scoped host-variable surfaces and violet host accent; readable light theme, large timeline and collapsed secondary controls. No MOTIF/PATCHBOOK redesign or final brand approval. |

Current evidence and limitations are in [MILESTONE_4A_REPORT.md](MILESTONE_4A_REPORT.md). These scoped implementation decisions do not approve 4B. Human review must define captured-source consistency, allocation across at most16 MIDI channels, same-pitch collisions between clips, supported arrangement bounds and any future pinned-source policy. Sections/markers/recording UI, final branding, distribution license, destructive migration and all legacy reuse remain separately gated. No legacy-code adoption is requested.

### Prompt009 / Milestone4B

Authority: explicit user approval after4A review. Verified signed4A baseline **3f5c67f**;386 baseline tests/33files passed. These are scoped implementation choices under Prompt009, not4C/release/legacy approval.

| ID | Decision and rationale | Status |
| --- | --- | --- |
| R01 | Extend existing MusicalEvent/Plan with optional provenance; pure bounded arrangement compiler. A second event representation would fragment timing/export/playback semantics. | Implemented/tested under009. |
| R02 | Immutable saved-source capture with fresh exact-text checks and revision-specific acknowledgment. Cache validated data only while text matches. Verify before/after compilation, before binary submission and after acknowledgment. No distributed transaction claim. | Implemented/tested; post-submission races reported, files retained. |
| R03 |24000 expanded notes/48000 events;128 sources;8/16MiB text;64MiB estimated budget; existing4096-quarter bound;10s worker. Synchronous24k probe≈126ms justified extending the existing cancellable worker. | Implemented; native diverse-source measurements in report. |
| R04 | Preserve explicit-channel uniqueness from existing schema1. Auto routing can reuse proven compatible channels without changing persisted preferences; no destructive/incompatible schema change. | Documented repository-contract exception to duplicate explicit sharing recommendation. |
| R05 | Stable lane UUID allocation order, explicit channels first, melodic channels excluding10, explicit channel10 percussion. Sharing requires matching organizational patch context and verified note-only state. | Implemented;32 sparse lanes tested. No instrument hosting/program generation. |
| R06 | Reject same-channel/pitch overlaps, preserving clips/notes. Cross-track same-pitch touching boundaries also cannot share a channel because external SMF merge order is unspecified. Same-track adjacency remains valid. | Conservative interoperability restriction, tested. |
| R07 | Shared Type1 writer; conductor + nonempty lane tracks in authored order, all ending at composition length. Stable UUID-prefixed names and no timestamp metadata; byte-identical output. New visible vault destination only. | Implemented; independent Python/golden/native comparisons. External DAW import not verified. |
| R08 | Narrowly extend existing MusicalTransport for pause/resume/seek and one owner. Seek/pause closes resources and retriggers held notes after50ms lead; bounded audio-clock lookahead. | Implemented/native verified; no seamless or sample-accurate output claim. |
| R09 | Prepared playback is a captured snapshot. Applied edits, saved-source/draft revision changes, save-base conflicts invalidate; view/blur/module/plugin closure stops. Compile again; never use unsaved source notes. | Implemented/native verified. |
| R10 | Existing fields/history/persistence; transient readiness/routing/transport separated. No new dependencies, state framework, event bus, database, map/mixing/section editor or legacy adoption. | Implemented. Final branding and4C remain unapproved. |

Review the [4B report](MILESTONE_4B_REPORT.md) before authorizing follow-on work. Optional pinned snapshots, broader routing/state/schema support, cross-platform/DAW validation, sections/markers/recording UI and final brand work remain proposals. No legacy-code reuse request is made.

### Prompt010 / Milestone4C

Authority: Prompt010 (Claude Code takeover) after4B review. Verified signed4B baseline **a64b267**;449 tests/37files passed before implementation. Product choices S03/S04/S06 were confirmed by the user during Phase0; the rest are scoped implementation decisions.

| ID | Decision and rationale | Status |
| --- | --- | --- |
| S01 | Activate the existing schema1 `sections`/`markers`/`audioRefs` arrays instead of inventing structures. Additive optional fields only: `description` (all three), `sectionId`/`markerId` (references). No schema bump; older readers keep them as unknown fields. Each optional field is registered in `retainExtensions` so clearing it actually deletes it on save. | Implemented/tested. |
| S02 | Sections are a non-overlapping partition, half-open `[start,end)`; gaps and adjacency allowed; neighbours are never moved. Enforced **at edit time only** (commands + drag preview), not in `validateEntity`, so overlapping data written by another tool still loads, is preserved and is shown as a diagnostic. | Implemented/tested. |
| S03 | Keep `audioRefs.atTick` required (user decision): it is the reference's timeline anchor. Default when unspecified: associated marker tick, else associated section start, else0. Avoids making 4C files unreadable in 4A/4B builds. | Implemented. |
| S04 | Recording references are audio-only (`wav mp3 flac ogg oga m4a aif aiff opus webm`), vault-relative via the existing `vaultPath()` rules, metadata-only (no byte reads/copies/moves/deletes). Each reference is mirrored in the existing `mnemobard_audio` frontmatter link list (user decision) for backlinks and so Obsidian rewrites it on rename. A relink is **suggested** only when exactly one stored path is missing and exactly one mirrored link resolves to an otherwise unused file; never applied automatically, no basename matching. | Implemented; native rename verified. |
| S05 | Deleting a section/marker clears dependent reference associations in the same transaction; reference records are kept. Removing a reference removes only its exact mirror link and only when no other reference uses that file; user-authored links are untouched. | Implemented/tested. |
| S06 | Colour/category deferred (user decision). Selection uses weight/outline/▸ glyph, overlap uses `!` + error stroke; unknown `color`/`category` fields from future writers are preserved. | Deferred. |
| S07 | Section/marker ruler is a second, non-scrolling canvas above the existing scroller, drawn in the same `draw()` from the same `TimelineViewport`. Rejected: enlarging the in-canvas `RULER` (would change lane geometry and an existing geometry test) and a separate scroll container (independent timing coordinates). | Implemented; pixel-sampled alignment across zoom/scroll. |
| S08 | Navigation is ephemeral: no history, no playback start. Next/previous are playhead-relative; while the selection sits at the playhead the ordered list is stepped so same-tick markers are each reachable. No wrap-around. During audition, navigation stops then places the stopped playhead (no new transport mode). | Implemented/native verified. |
| S09 | Structure is excluded from compilation/export. Because the4B input fingerprint hashes the whole composition, a structure **edit** invalidates prepared audition (recompile required); navigation does not. Changing the fingerprint policy was rejected to keep the4B compiler stable. | Retained4B policy; candidate follow-up. |
| S10 | Editor bounds: 256 sections, 1024 markers, 256 references, 200-char labels, 10000-char descriptions. Lists render 50 rows per page (clip-register convention); the panel renders from one draft snapshot per render (`session.draft` deep-clones). | Implemented; measured. |
| S11 | No new dependency, persistence layer, history manager, event bus or source registry; existing `HistorySession.edit` provides one atomic entry per operation. | Implemented. |

## Milestone 4D workspace, invalidation and stability (Prompt011)

| ID | Decision | Status |
| --- | --- | --- |
| W01 | **Musical fingerprint.** `musicalInput()` = the existing canonical `compilationInput` with a *denylist* removed: `data.sections`, `data.markers`, `data.audioRefs`, and entity `description`, `notes`, `tags`, `assets` (frontmatter audio mirror). Everything else — including `title`, lane names (MIDI track names), clip labels and any unknown field — stays musical, so a future compiler-relevant field fails safe. Capture `inputRevision` hashes it. Supersedes S09. | Implemented; 27 unit tests + native byte identity. |
| W02 | **Compilation validity ≠ save validity.** Organizational edits no longer stop playback or invalidate a ready compilation. After this editor's own Save of a musically identical draft, `ArrangementPreparation.adoptSavedBase()` re-reads the note (must equal the session base), re-verifies sources and adopts the new base; until then export verification fails closed. External note changes, source revision changes and save conflicts still invalidate exactly as in 4B. | Implemented; native verified. |
| W03 | **One contextual inspector** under the timeline (empty / clip / lane / section / marker / recording reference). Existing editors are *moved* into it (lane manager, routing form) or rendered into it (structure editors via `CanvasStructurePanel(…, editorRoot)`); no business logic duplicated. Selection is ephemeral, never enters history. Secondary tools sit collapsed below. | Implemented. |
| W04 | **Sticky timeline** only when the viewport is ≥720px tall, with a shorter scroller and `scroll-margin-top` so focus/scrollIntoView never lands content beneath it. | Implemented after native screenshot review. |
| W05 | **Keys:** `[`/`]` sections, `,`/`.` markers, Escape clears selection → timeline focus. No modifiers (no Obsidian conflicts), ignored while typing. Escape is always consumed inside CANVAS (an unconsumed Escape made Obsidian switch the active leaf — real-host regression found and fixed). | Implemented; real CDP key events. |
| W06 | **Modal host guard** (`src/ui/modal-host.ts`): all five plugin modals open through `openModal()`, which reads only the public `activeDocument`/`activeWindow`, asks the owner window to focus once, and otherwise refuses with an actionable message. No private host state, no DOM patching. | Implemented; condition not reproduced natively in 4D. |
| W07 | **Provable link-only rename adoption** (`rename-merge.ts`): offered only when every external difference is a frontmatter wikilink target change from a missing, exactly-referenced path to one existing vault audio file, body unchanged, no ambiguity. Explicit user action; relink is one undo step; base adopted via `DocumentSession.adoptBase()`; nothing written until Save. Anything else keeps the protected conflict + recovery copy. No basename guessing. | Implemented; unit + native. |
| W08 | **Mirror dedupe on relink:** drop audio mirror links that resolve (Obsidian link resolution) to exactly the relinked file. Fixes the 4C leftover shortest-form duplicate. Legacy duplicates already on disk make the link-only proof refuse (correctly). | Implemented. |
| W09 | **`# [ ] |` filenames stay unsupported** (shared `vaultPath` portability/wikilink contract; a wikilink cannot encode them). Deferred; the picker now reports how many audio files are hidden and why. | Deferred by design. |
| W10 | **MOTIF→PATCHBOOK intermittent navigation:** static analysis narrowed it to between `navigatePatch` start and PATCHBOOK `setState` (no exception, editor unchanged); suspected race with Obsidian's deferred-view state restore after restart. Not reproduced in 4D (passed first run after restart). No speculative fix. | Open risk. |

## Milestone 4E document freshness, navigation readiness and regression closure (Prompt012)

| ID | Decision | Status |
| --- | --- | --- |
| X01 | **Freshness watcher** (`canvas/freshness.ts#CanvasFreshness`, owned by `CanvasLibrary`). *Detection*: the shared index's per-note SHA-256 revision vs the (cached) revision of each open session's `base.source`; no timestamps. *Decision*: a full `repository.read` + `editableComposition` validation. Every async step is guarded by a per-session generation and the base it started from, so a stale read can never overwrite newer state. An own Save is recognised by re-checking when the session leaves `busy` (its index publish arrives while busy). A note rename publishes a removal first; the watcher waits for `index.settled()` (the index queue), never a timer. No global event bus. | Implemented; unit + native. |
| X02 | **Clean session → reload** through the existing `HistorySession.reload` (no history entry; prior undo history is reset because it described the previous note). Clip/lane selection is kept by UUID (`CanvasSession.changed` no longer clears on reload); structure selection already was; deleted objects clear safely. | Implemented. |
| X03 | **Dirty session → never modified.** Freshness becomes `conflict` (changed areas, musical flag, provable-rename flag); protected Save keeps refusing (unchanged). Banner choices: *Keep working draft* (collapses to the indicator), *Store recovery copy and open recovery*, *Review external changes* (+ open note), *Reload note version…* (confirmation; checkpoints the draft first and aborts if that fails). No silent merge. | Implemented. |
| X04 | **Invalid / future-schema / duplicate-UUID / deleted note → `unavailable`.** Valid draft kept; note never rewritten; Save keeps failing closed (no replacement note is ever created — Save of a based session only reads by UUID). The compilation is invalidated because its base can no longer be verified. | Implemented. |
| X05 | **Moved/renamed note**: followed by UUID through the index; `DocumentSession.relocate()` accepts only a record whose bytes equal the current base (no file-name inference). | Implemented. |
| X06 | **Compilation integration.** The panel no longer invalidates a *clean* session on an index revision mismatch — the watcher reloads it and the 4D musical/organizational classification decides (metadata-only → `adoptSavedBase`, compilation and playback kept; musical → stop + invalidate). Dirty sessions still invalidate on external change. Play/Export verification stays fail-closed: pressing Play in the instant between an external write and its refresh invalidates (observed natively; safe by design). | Implemented. |
| X07 | **Navigation readiness** (`application/navigation.ts`): `NavigationCoordinator.navigate(from, to, id, steps)`; targets implement `reveal(id, signal)` that waits for the view's `ReadyGate` (end of `onOpen`, including its restored selection), applies the request and verifies the displayed UUID. Per target module the latest request wins (earlier ones resolve `superseded` and cannot report); 10 s bound; failures leave the source view untouched. A resolved `setState` or an existing leaf is never proof. | Implemented; unit + native. |
| X08 | **Host restoration vs explicit navigation:** a host `setState` arriving *while* a reveal is applied is deferred (explicit request wins). One arriving *after* a completed navigation is honoured (indistinguishable from user intent) — documented limitation. | Implemented / limitation. |
| X09 | **No new PATCHBOOK→MOTIF or MOTIF→CANVAS links.** They are not product features; returning is Obsidian tab activation (verified natively). Adding them would be new scope. | Deferred by design. |
| X10 | **Legacy duplicate mirror links: explicit repair.** Detection uses Obsidian's own link resolution only; a group needs the exact `[[path]]` form, an existing referenced file, and every shortest-form name must be unique in the vault (otherwise refused — no basename guessing). Removal is one undo step on frontmatter mirror links only; references, notes, associations and audio are untouched. | Implemented; unit + native. |
| X11 | **Performance.** (a) The add-recording form (vault scan + one option per section/marker) is built only while its disclosure is open — the measured cause of the 4D section-select regression and most structure-render cost. (b) `EntityIndex.ofKind()`; MOTIF/PATCHBOOK clone only their kinds and use `heads()` for issue lists — the previous whole-vault clone on every publish (127 ms long task with large compositions) tripped the 4B scheduler-stall guard and stopped playback during external refreshes. | Implemented; profiled before/after. |
| X12 | **Isolated launcher** passes `--ozone-platform=x11`: electron43 43.8.7 (system update 2026-11-07) auto-selects Wayland, whose socket is not in the isolated `XDG_RUNTIME_DIR`. Project-local; no global configuration. | Implemented. |
| X13 | **Superseded 4D test**: "offers the same explicit adoption to a clean session (Obsidian does not reload open clean drafts)" contradicted §6.2. Replaced by "clean session refreshes, then an explicit relink keeps the exact link" with the original saved-note assertions retained and stronger refresh/history/UUID assertions added. Two 4D/4C view tests open the add-recording disclosure first (X11a); assertions unchanged. | Recorded deviation. |
