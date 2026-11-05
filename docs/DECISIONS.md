# Decision register

Date: 2026-11-05. **Proposed is not approved.** Prompt 002 subsequently authorized independent Milestone 1A implementation and the documented data-foundation direction. The approval log below supersedes historical kickoff restrictions for that scope only. No legacy source adoption or musical-editor/1B authorization has occurred.

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
| D04 | New motifs default 960 PPQ; imports retain explicit source PPQ; compositions 960 with warned endpoint conversion; fixed tempo/meter MVP. | Initial pre-audit draft normalized all imports to 960; legacy exact-tick evidence favors preserving source resolution. Full rational-time domain and tempo-map editing add complexity. | Per-record PPQ contracts implemented; import/export/timing experiments not implemented. |
| D05 | `midi-file` adapter provisionally preferred; reference TROUBADOUR parser rules/tests. | `@tonejs/midi` higher-level alternative; MidiWriterJS generation only; custom legacy parser has maintenance/model cost. Benchmark and fixtures decide. | Deferred; no MIDI library installed. |
| D06 | Shared lazy Web Audio transport + basic oscillator synth; media-element recording previews. | Tone.js for advanced scheduling/synthesis is deferred; remote soundfonts/native hosts excluded. Authorized legacy voice/gain/transport pieces may fit. | Deferred; no audio implementation. |
| D07 | Vanilla/native DOM shell; Canvas 2D culled grids plus accessible lists. | React/Preact/Svelte all viable for growing shell; SVG/DOM all-note grids not demonstrated at target scale. Legacy DOM editor is a gesture reference. | Native DOM shells adopted for 1A; dense rendering/framework decision deferred. |
| D08 | Standalone patches/motifs; composition forward ID links; live motif instances. | Legacy same-song ownership rejected. Snapshot/pinned motifs provide stability but add version management; defer pending user feedback. Length edits show downstream effects. | Standalone IDs/references implemented; live musical effects remain unimplemented. |
| D09 | Conflict-aware conditional saves, exact-text recovery copies, incremental identity index; explicit migration preview/approval. | Legacy managed-token merge may preserve prose edits; whole-text conservative conflicts are simpler. Decide tested merge policy in foundation. No database authority or distributed transaction claim. | Conditional writes, backups and incremental index implemented; whole-source conflicts chosen. Migration/session/retention UI deferred. |
| D10 | Desktop-only supported manifest initially, browser-based runtime, main-window editors until pop-outs tested. | Full mobile support from legacy manifest is not adopted. Set actual minAppVersion from tested host/API matrix. | Desktop-only manifest, conservative minimum 1.15.0 from native Linux smoke; other platforms unverified. |
| D11 | Type1 conductor + per-lane tracks; full-length repeated clips, unique lane channels; no audio mixing. | Legacy section clipping/Type0 motif export does not meet timeline contract. Complex trim/stretch/maps deferred. | Proposed. |
| D12 | Hybrid A+C legacy strategy: selective refactor/extraction and reference-informed rebuild. | B broad port too coupled; D independent development remains fallback if clearance/validation fails. No unconditional direct reuse. | Reference-only during 1A; all source extraction still prohibited by Prompt 002. |
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
3. Milestone 1A and project-local dev-vault were authorized by Prompt 002. Milestone 1B requires a separate prompt. Legacy dynamic validation/extraction remains unapproved.
4. Choose an initial reference hardware/Obsidian installer matrix and review measured targets after spikes. Decide pop-out/mobile expansion only after support evidence.
5. Approve interface hierarchy and later visual direction; decide whether recovery copies remain manual-retention or get a reviewed pruning policy after MVP. No automatic deletion proposed.

## Approval log

- 2026-11-05, user Prompt 002: explicitly authorized independent Milestone 1A only, local project dependencies/Git, a new disposable project-local vault, typed documented data contracts, safe persistence, settings and three workspace shells. This satisfies the earlier foundation approval gate and adopts the applicable D01/D02/D03/D09/D10 direction. It does not approve every future musical/visual recommendation.
- Binding exclusions retained: no legacy code/test/asset copying or modification, personal-vault changes, system installs, musical editors/sequencing/synthesis/timeline, cloud/telemetry, push/publication, or Milestone 1B work.
- 1A implementation choices: yaml2 source-range parser (ISC) for surgical edits and duplicate-key checks; exact full-source revisions with conservative prose-edit conflicts; pre-save recovery JSON; explicit writes only; desktop manifest floor1.15.0 after native validation. No fundamental format/module change.
- Distribution license, final styling, legacy reuse groups L1–L5, migrations and 1B remain unapproved. Package remains private/UNLICENSED. Future approval entries must name evidence, exact scope and conditions.
