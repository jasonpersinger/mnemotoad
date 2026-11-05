# Milestone 0 report

Date: 2026-11-05. Research, static audit and planning deliverables are complete. All architecture, data, design, dependency and reuse recommendations remain subject to review. **No plugin implementation, dependency installation, legacy source copy, vault modification, commit, push, publication or remote repository creation occurred. Work stops at Milestone 0.**

## A. TROUBADOUR findings

The kickoff’s `/home/troubadour` was missing. The user explicitly corrected the path to `~/troubadour`, authorizing `/home/jason/troubadour`. The [audit](TROUBADOUR_AUDIT.md) examines its clean repository at `bc2749e2877738bd443a1d3ace66f919d23fe837`, version 0.4.3.

TROUBADOUR contains a substantial private Obsidian songwriting prototype: song notebooks, editable piano roll, Type0/1 MIDI import and Type0 motif export, exact source PPQ, musical transformations/harmony, four synthesized voices, short WAV A/B comparisons, section/role arrangement playback, cross-song library, and conditional Markdown saves/recovery snapshots. Source and historical test/host reports support these findings; current runtime behavior was not retested.

Its strongest potential reusable work is tick/note-edit math, oscillator/release-tail gain logic, Markdown preservation and stale-save safeguards, and targeted regression fixtures. Its large DOM piano-roll controller, song-owned schema, section arrangement model, custom MIDI codec and eager whole-vault index should not become MNEMOBARD’s application architecture. There is no structured patch library, arbitrary lane clip planner, or arrangement MIDI exporter in the inspected implementation.

Recommend hybrid **A+C**: selective authorized refactoring plus reference-informed rebuilding. No unconditional direct reuse. No tracked LICENSE/NOTICE or package license declaration was found; ownership/provenance/distribution rights must be confirmed before extraction. Adaptation is low-to-medium for focused math/voice functions, medium for codec/session/storage boundaries, and high for UI/timeline rebuilding. First proposed adoption tranche: roughly 5–10 engineer-days, not guaranteed savings; component ranges and rationale are in the audit.

## B. MNEMOBARD architecture

Recommend strict TypeScript/public Obsidian APIs, pnpm, esbuild plus separate typechecking, Vitest, Web Audio and standard MIDI. Prefer a reviewed `midi-file` adapter provisionally; alternatives and current official sources are in [TECHNICAL_RESEARCH.md](TECHNICAL_RESEARCH.md).

PATCHBOOK, MOTIF and CANVAS use shared domain, repository/identity/link services, document sessions, MIDI compiler/codec, transport/preview and recovery. Module UIs can be disabled independently while shared data remains readable. Use native DOM controls with a culled Canvas 2D piano roll/timeline and keyboard/numeric note/clip lists. No private native Canvas API or external runtime.

Each entity is an ordinary Markdown note with YAML identity; motifs/compositions have a documented versioned JSON block. Native links support navigation; UUIDs own entity relationships. New motifs default to 960 PPQ, imports preserve source PPQ, and compositions convert explicitly to 960 with warnings. MIDI is an explicit export. Save conflicts, unknown schemas and missing/duplicate targets retain user data and produce actionable diagnostics. See [ARCHITECTURE.md](ARCHITECTURE.md) and [DATA_MODEL.md](DATA_MODEL.md).

Approved reusable components: **none**. Candidate integration boundaries and proposed authorization groups L1–L5 are recorded in [DECISIONS.md](DECISIONS.md).

## C. MVP definition

The essential workflow creates a structured patch, draws/edits and auditions a motif, links the patch, places/repeats motifs on multiple composition lanes, saves vault notes, reopens Obsidian, and exports a usable Type1 arrangement. Include basic quantization/transposition, supported note-only MIDI import with loss warnings, sections/markers/recording references, undo and safe persistence.

Exclude VST/AU hosting, DAW replacement, recording/multitrack audio mixing, destructive asset editing, synchronized audio arrangement, hardware MIDI, tempo maps, advanced transforms/harmony and mobile editing. Fixed tempo/meter and full-length clip repeats keep the first integrated system achievable.

[Acceptance criteria AC-01–10](PRODUCT_SPEC.md#integrated-mvp-acceptance-criteria) cover the complete workflow, restart fidelity, independent reader/DAW export, conflicts, links, offline operation, accessibility, performance, unsupported imports and teardown. Proposed limits are test targets, not verified capacities.

## D. Development roadmap

0: research/audit/specifications; 1A: safe host/data foundation; 1B: timing/rendering/MIDI/compiler feasibility; 2: PATCHBOOK; 3: MOTIF; 4: CANVAS; 5: integration and desktop beta. Foundation storage/IDs precede module editing; MOTIF records and shared compiler precede timeline/export. Tests progress from pure contracts to browser, disposable-host, independent MIDI/DAW and three-OS checks. See [ROADMAP.md](ROADMAP.md).

Low-confidence single-engineer estimate is 11–18 engineer-weeks after approval, to be revised after spikes. Legacy adaptation is optional and must earn its place. Explicit approval is required before Milestone 1, source extraction, migrations, final branding and external distribution; proposed gates do not require repeated permission for routine authorized work.

## E. Five engineering risks

| Risk | Proposed mitigation and experiment |
| --- | --- |
| Vault integrity/relationships | Conditional one-file saves, backups and explicit conflicts; inject failures, competing edits, duplicates and renames in a disposable vault. |
| Musical timing/export | Source PPQ, shared deterministic tick compiler and audio-clock scheduling; compare Type1 with independent reader/DAW and loopback under an induced scheduler stall. |
| Dense editor/accessibility | Culled grids and shared keyboard/numeric commands; benchmark 10,000 notes, DPI/theme changes and pointer/keyboard equivalence. |
| Timeline complexity | Full-length repeated clips, bounded lanes, explicit channel/overlap policies; compare compiler/preview/export under live motif changes. |
| Resource/platform/adoption maintenance | Scoped cleanup/cancellation, minimal reviewed dependencies and provenance gates; repeated enable/disable/play/reopen cycles on Linux/Windows/macOS. |

[RISKS.md](RISKS.md) records likelihood, impact, mitigation, pass targets, milestone gate and relevant TROUBADOUR work for each. None of the proposed experiments ran in Milestone 0.

## F. Files, research and validation

All files were created in the initially empty existing MNEMOBARD directory. No preexisting file was replaced. Requested files:

- [README.md](../README.md) and [AGENTS.md](../AGENTS.md).
- [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), [ROADMAP.md](ROADMAP.md).
- [DESIGN_DIRECTION.md](DESIGN_DIRECTION.md), [TECHNICAL_RESEARCH.md](TECHNICAL_RESEARCH.md), [TROUBADOUR_AUDIT.md](TROUBADOUR_AUDIT.md), [DECISIONS.md](DECISIONS.md).

Additional focused deliverables: [RISKS.md](RISKS.md), this report, and internal [task plan](../task_plan.md), [findings](../findings.md), [progress](../progress.md) and [legacy hash baseline](../.legacy-audit-baseline.json).

Research covered current official Obsidian guides/API source and sample plugin/build/settings/license; MIDI libraries/standards overview; Web Audio/Web MIDI/media behavior; waveform/rendering options; frameworks; testing and pnpm; official community registry and selected author READMEs. The current submission guide differs from the sample README’s older route; the research identifies the current guide as authoritative for rechecking before release.

Static validation covered required document presence, local links/section anchors, fenced-block structure, YAML/JSON example parsing and musical example arithmetic; legacy inventory/import/dependency/license/test-declaration scans; and tracked-file hashes/Git state. Final check outcomes are recorded in [progress.md](../progress.md). Source filenames/symbols and historical/current evidence boundaries are documented throughout the audit.

The legacy preservation check found the same 121 tracked files and aggregate SHA-256 `4e217cc4f22b1a049470feb31d5955ece52542619497e97c0924e592f6928ff2`, the same HEAD and a clean working tree. Read-only operations cannot attest every private ignored file’s bytes; no command was issued to modify them. MNEMOBARD still has no Git repository; Git setup belongs to the next authorized milestone.

Limitations: no fresh legacy typecheck/test/build or runtime/security benchmark; no user-vault/app execution; historical 134 tests are not a current pass result; published dependency versions/advisories/file-level licenses need adoption review; the full SMF specification was not downloaded; ecosystem survey is bounded; performance/support targets need empirical validation. No system dependency or configuration changes were made.

## G. Approval requirements

Review the architecture/data/MVP and live-reference/PPQ/export semantics, then authorize Milestone 1 explicitly. Confirm TROUBADOUR rights/provenance and authorize selected math/edit (L1), preservation/storage/session (L2), synth/gain/transport (L3), and regression fixture (L4) work individually, or choose independent implementation. Defer L5 advanced transforms. No authorization implies an entire legacy copy.

Select a distribution license and approve a disposable test-vault location/platform matrix. Final visual styling remains unapproved. Dynamic legacy validation, if desired, uses only the isolated procedure in the audit after authorization. No next-milestone work begins from this report alone.
