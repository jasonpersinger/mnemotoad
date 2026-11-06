# MOTIF MIDI Interoperability Implementation Plan

Execution is sequential in this session under Prompt007; no delegated workers or approval handoff.

**Goal:** Safe selected-part MIDI exchange, explicit transformations, patch relationships and exact musical-position editing.
**Architecture:** Strict bounded byte scanner before pinned midi-file decoding in a cancellable worker; pure selected-part preview/export adapters; existing MotifSession/history/repository for all musical writes. Public Vault binary create is separate derivative export only.
**Stack:** Existing TypeScript/Canvas/DOM/Web Audio/Vitest; evaluate/promote pinned MIT midi-file1.2.4, no other runtime library.
**Spec:** User Prompt007 and existing product/data contracts; retain schema1 PPQ/same-pitch/map restrictions.

## Global constraints
MOTIF3B only. No CANVAS/legacy copy/personal projects/network runtime/push/publication. No overwrite/migration/silent lossy import. Keep historical reports/screenshots/experiments.

## Review focus
- Track/channel selection cannot hide stateful events on other tracks sharing that channel; global SysEx and timing affect all parts.
- File selection, stale worker completions, view close and timeout must never create an authoritative note.
- Repeated-note boundaries must pair in source order, export off before on, preserve original PPQ/end silence and reject ambiguous overlaps.
- Quantization/group transforms validate the entire candidate; fractional meter beats and grids reject unrepresentable positions.
- Clean session eviction cannot dispose an attached/busy/dirty session; pin view owners and never remove checkpoints.

## Tasks
- [x] Review57 pending3A files/ignores/secrets,278-test full check; signed baseline90eed00 verifies good.
- [x] Pure MIDI contracts, strict scanner, selection/pairing/issues, deterministic Type1 writer; independent byte/fixture verification. Tests malformed/running status/maps/scope/limits/round trips.
- [x] Worker deadline/cancellation and public derivative file store; explicit preview/destination UI and no musical write until confirmed draft then normal Save. Tests cancellation/failures/collisions.
- [x] Transpose/quantize/velocity, exact bar:beat:tick math and numeric pathway; existing one-operation history and collision tests.
- [x] UUID patch selection/navigation/diagnostics; focused toolbar grouping; pin owners and bounded clean-session retention if evidence supports it.
- [x] Native synthetic MIDI roundtrip/fixture/warning/transform/patch/position workflow, cold restart/conflict/recovery/lifecycle;12 real screenshots, independent parser and full-editor100/1000/5000 profiling.
- [x] Full regression/checks, preservation, current docs and MILESTONE_3B_REPORT A–M; stop for review.
