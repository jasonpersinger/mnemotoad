# MOTIF Production Editor Implementation Plan

> Executed sequentially under project no-delegation rules and Prompt006 autonomy. Checkboxes record implementation/verification, not approval of future milestones.

**Goal:** Deliver Prompt006's basic musical editor in Obsidian with reliable undo, auditioning and saved/recoverable notes.

**Architecture:** Pure timing/compiler/edit commands feed a shared document session, repository and recovery reader. A viewport-sized Canvas controller owns geometry/gestures; DOM controls and paginated notes provide precise keyboard editing. An owner-scoped audio-clock transport runs independently of redraws.

**Tech Stack:** Existing strict TypeScript, Obsidian, Canvas2D, Web Audio, Vitest and vanilla controls; no new dependency.

**Spec:** User Prompt006; docs/PRODUCT_SPEC.md, ARCHITECTURE.md and DATA_MODEL.md. Existing same-pitch-overlap rejection remains explicit; different-pitch polyphony is supported. Native autonomous execution in this session; no delegated workers or approval handoff.

## Global Constraints

- MOTIF3A only. No legacy copying, personal vaults, MIDI import/export, advanced transforms, CANVAS or PATCHBOOK redesign.
- Existing UUID/schema1/Markdown authority, unknown fields and conditional saves remain intact.
- 960PPQ/120BPM/4/4 defaults; source PPQ remains exact. Reject unavailable integral grid steps, never normalize existing notes.
- Musical editing/compilation is independent of Obsidian, rendering and storage. No runtime imports from experiments.

## Review Focus

- Drag cancellation/escape/close creates no history entry or partial notes; group bounds reject as one operation.
- Save/checkpoint completion must not replace newer edits; conflicts preserve history/draft and authoritative source.
- Unknown tempo-map metadata is retained and blocks unsupported musical edits/audition rather than silently flattening it.
- Pending audio starts cannot revive after close/stop; PATCHBOOK and MOTIF coordinate audio focus.
- Shared recovery/session extraction must preserve all209 baseline cases and library behavior.

### Task1: Baseline and sessions
- [x] Reviewed48 pending2B files, ignores and credential patterns;209-test full check; signed baselinec63125b after user unlock, good signature.
- [x] Extract shared typed document session/recovery reader; retain PATCHBOOK wrappers and existing contracts/tests.
- [x] Add compatible optional motif description/notes and pure commands with bounded history and session ownership.

### Task2: Musical clock and playback
- [x] Review/adapt own1B rational/tempo math; independent deterministic note-event compiler with source PPQ and off-before-on order.
- [x] Implement bounded lookahead transport and quiet voices, owner stop/cleanup/focus coordination; test transitions/errors/races.

### Task3: Piano roll and workspace
- [x] Implement CSS-pixel geometry/index/culling, theme/DPI Canvas renderer, scrolling/anchored zoom and grouped pointer gestures.
- [x] Browser/header/transport/toolbar/inspector, bounded accessible note list, scoped keys, Save and MOTIF-specific recovery.
- [x] Test commands/history, coordinate/hit/culling/DPI, UI, persistence and lifecycle; preserve PATCHBOOK/CANVAS.

### Task4: Native validation and completion
- [x] Synthetic native melody/chords/drag/resize/numeric/undo/redo/play/save/reopen/conflict/recovery, cold restart and lifecycle.
- [x] Actual10+ screenshots light/dark/narrow;100/1000/5000/larger benchmark with methodology and limitations.
- [x] Full verification/preservation/Git checks; current docs and docs/MILESTONE_3A_REPORT.md A–L; stop before3B.
