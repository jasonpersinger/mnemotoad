# Decision register

Date: 2026-11-05. **Proposed is not approved.** Prompt004 authorizes production PATCHBOOK in2A after report-level1B review. This supersedes older stops for that scope. It does not approve musical production adoption,2B, final branding or legacy copying.

## Confirmed requirements and authority

| ID | Decision/constraint | Authority/status |
| --- | --- | --- |
| U1 | Use existing `/home/jason/MNEMOBARD`; preserve prior work; milestone is research/docs only. | User kickoff; required. Initial root empty, no Git. |
| U2 | Treat TROUBADOUR read-only; no code copy, install, legacy execution, commit or push. | User kickoff; required. |
| U3 | Corrected legacy root is `~/troubadour` → `/home/jason/troubadour`. | User follow-up explicitly authorizes this location. Original `/home/troubadour` absent. |
| U4 | One integrated Obsidian plugin; PATCHBOOK, MOTIF and CANVAS; initial Linux/Windows/macOS desktop. | User product brief; required. |
| U5 | Local-first, interoperable, non-destructive, modular, native, maintainable, extensible, private; no telemetry/account dependency. | User principles; required. |
| U6 | Do not implement/finalize visual styling/import legacy code; stop at Milestone 0. Milestone 1 needs explicit approval. | User milestone boundary; required. |

## Architectural recommendations

| ID | Recommendation | Alternatives considered and rationale | Approval status |
| --- | --- | --- | --- |
| D01 | TypeScript + public Obsidian API; pnpm + esbuild; separate typecheck/lint; Vitest. | Official sample matches host delivery; npm remains viable, Vite adds little for plugin bundle but browser tests can use its ecosystem. No exact versions copied from legacy. | Adopted for 1A under Prompt 002; exact dependencies in package.json. |
| D02 | Pure domain/application/host adapters; independent module UIs sharing services and IDs. | Whole TROUBADOUR fork/broad refactor would retain song ownership and UI coupling. | Foundation boundaries adopted for 1A; no editors or shared editor session framework yet. |
| D03 | One authoritative Markdown entity with YAML and an owned versioned JSON block; explicit standard MIDI exports. | `.mid` authority + sidecar improves immediate interoperability but introduces binary/metadata consistency and overwrite concerns. Separate JSON/Markdown pair and opaque database rejected initially. Legacy preservation experience supports single-file ownership. | Foundation format adopted under Prompt 002; MIDI export deferred. |
| D04 | New motifs default 960 PPQ; imports retain explicit source PPQ; compositions 960 with warned endpoint conversion; fixed tempo/meter MVP. | Initial pre-audit draft normalized all imports to 960; legacy exact-tick evidence favors preserving source resolution. Full rational-time domain and tempo-map editing add complexity. | Per-record contracts implemented; exact transient timing tested in 1B. Production policy refinement B01 awaits review; no map storage approved. |
| D05 | `midi-file` adapter provisionally preferred; reference TROUBADOUR parser rules/tests. | `@tonejs/midi` higher-level alternative; MidiWriterJS generation only; custom legacy parser has maintenance/model cost. Benchmark and fixtures decide. | Dev-only 1.2.4 candidate installed/tested in 1B. Production adapter/adoption B04 deferred. |
| D06 | Shared lazy Web Audio transport + basic oscillator synth; media-element recording previews. | Tone.js for advanced scheduling/synthesis is deferred; remote soundfonts/native hosts excluded. Authorized legacy voice/gain/transport pieces may fit. | Isolated test-tone/transport verified in 1B. Production audio and shared ownership B03 deferred. |
| D07 | Vanilla/native DOM shell; Canvas 2D culled grids plus accessible lists. | React/Preact/Svelte all viable for growing shell; SVG/DOM all-note grids not demonstrated at target scale. Legacy DOM editor is a gesture reference. | Native shells adopted in 1A; 1B measurements support hybrid recommendation B02. Production renderer/list/framework adoption awaits review. |
| D08 | Standalone patches/motifs; composition forward ID links; live motif instances. | Legacy same-song ownership rejected. Snapshot/pinned motifs provide stability but add version management; defer pending user feedback. Length edits show downstream effects. | Standalone IDs/references implemented; live musical effects remain unimplemented. |
| D09 | Conflict-aware conditional saves, exact-text recovery copies, incremental identity index; explicit migration preview/approval. | Legacy managed-token merge may preserve prose edits; whole-text conservative conflicts are simpler. Decide tested merge policy in foundation. No database authority or distributed transaction claim. | Conditional writes, backups and incremental index implemented; whole-source conflicts chosen. Migration/session/retention UI deferred. |
| D10 | Desktop-only supported manifest initially, browser-based runtime, main-window editors until pop-outs tested. | Full mobile support from legacy manifest is not adopted. Set actual minAppVersion from tested host/API matrix. | Desktop-only manifest, conservative minimum 1.15.0 from native Linux smoke; other platforms unverified. |
| D11 | Type1 conductor + per-lane tracks; full-length repeated clips, unique lane channels; no audio mixing. | Legacy section clipping/Type0 motif export does not meet timeline contract. Complex trim/stretch/maps deferred. | Proposed. |
| D12 | Hybrid A+C legacy strategy: selective refactor/extraction and reference-informed rebuild. | B broad port too coupled; D independent development remains fallback if clearance/validation fails. No unconditional direct reuse. | Reference-only during 1A/1B; Prompt 003 retains copying prohibition. B05 recommends independent implementations for this scope. |
| D13 | Mysterious/antiquated brand expressed with restrained accents while honoring host theme/accessibility. | Legacy palette/polish approval is for a different product and is not transferable approval. | Exploratory; final styling not approved. |

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

1. Approve/amend architecture, custom note format, PPQ import/export rounding contract, fixed-tempo MVP, supported limits and live motif effects.
2. Confirm TROUBADOUR ownership/provenance and intended distribution permissions; authorize L1–L4 individually or approve independent implementation. Select MNEMOBARD’s distribution license; none chosen in this milestone.
3. Milestones 1A and isolated 1B experiments were separately authorized by Prompts 002/003. Further implementation requires another prompt after 1B review. Legacy dynamic validation/extraction remains unapproved.
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
