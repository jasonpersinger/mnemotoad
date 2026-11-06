# CANVAS Arrangement Foundation Implementation Plan

Sequential native execution under Prompt008; no delegation or approval handoff.

**Goal:** Dependable lane/clip planner with exact live saved-source references, undo, safe Markdown Save/recovery and native validation.
**Architecture:** Shared generic history extracted from MotifSession; index content revisions and metadata heads feed an immutable saved-motif summary catalog. Pure exact timing/preflight resolves clips without expanding notes. Culled Canvas timeline plus contextual native controls consume cached plans, never source arrays on pointer movement.
**Stack:** Existing TypeScript/Obsidian/Canvas2D/Vitest; native WebCrypto SHA256; no new dependency.
**Spec:** User Prompt008 and existing project docs.

## Constraints / review focus
-4A only; no arrangement playback/export/channel allocation, legacy copying, personal vaults, publication or destructive migration.
- Compatible schema1 extension: optional channels (legacy assigned fields retained/validated),32 lanes, optional clip review/lane/path/label hints. Array order remains display order. No existing source rewrite.
- All required source note endpoints AND complete-length repetition periods must convert exactly; no rounding. Empty saved motifs retain positive rest length.
- Missing/changed/unsupported sources retain clips; saving an existing arrangement never rewrites its sources or depends on all references being ready.
- Review acknowledges the displayed saved revision explicitly; unsaved MOTIF drafts are only diagnostics. Source-change races invalidate cached plans/gestures.
- One drag/history entry; cancellation/bounds rejection cannot partially mutate. Dirty/busy/owned sessions and recovery files never evicted/deleted.

## Tasks
- [x] Review49 pending3B paths/ignores/secrets,349-test full check; signed baseline50583e1 verifies good and clean.
- [x] Compatible domain/codec extensions; extract shared history/grid/position utilities and preserve MOTIF tests.
- [x] SHA256 index revisions/metadata heads, saved source summary cache, exact conversion and structured preflight; unit tests for boundaries, references and source changes.
- [x] CanvasLibrary/session/commands/recovery on existing repository; ownership, explicit source review and complete transaction tests.
- [x] Timeline geometry/culling/gestures and theme-native dark-first view/browser/selector/lane/clip inspector/scoped keys; lifecycle/UI tests.
- [x] Native end-to-end arrangement, source-change/missing/incompatible/conflict/recovery/cold restart,16 actual screenshots,4/20-16/200-32/1000 benchmarks and existing module regressions.
- [x] Final full verification/preservation/current docs/report A–M; stop before4B.

## Outcome

386 tests/33 files, strict typecheck/lint/build and audits pass. Native CANVAS21 groups plus58 regression groups passed, including cold restart and protected recovery.17 actual screenshots and three host workload sizes are retained. The final1,000-clip drag p95 is45.4ms and Save maximum411.7ms; preceding slower repeat values are preserved. Historical files/dependencies/legacy unchanged; signed3B baseline50583e1 remains HEAD,4A is uncommitted for review. Stop before4B.
