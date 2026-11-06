# PATCHBOOK Assets and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver Prompt005 asset workflows, recorded-audio previews and explicit recoverable drafts.

**Architecture:** Extend the public vault adapter with a narrow asset-file port. Keep entity authority in the existing repository; imports create new files before draft association. A single media preview owner and bounded recovery reader are independently testable.

**Tech Stack:** Existing strict TypeScript, vanilla DOM/Obsidian public APIs, HTMLAudioElement and Vitest; no new dependency.

**Spec:** User Prompt005; docs/ARCHITECTURE.md and DATA_MODEL.md (existing contracts).

## Global Constraints

- Milestone2B only; no legacy copying, personal-vault changes, remote fetching or musical editors.
- Preserve unrelated Markdown, stable IDs and conditional saves. No automatic asset/recovery deletion.
- Execute natively in this session under explicit autonomous authorization; no subagents or approval handoff.

## Review Focus

- Imported bytes may exist after cancellation or uncertain writes: report their path, never delete/retry blindly.
- Late media promises must not revive stopped playback or retain resources.
- Renamed sources resolve by UUID; changed sources require explicit comparison/rebase and normal conditional save.
- Malformed/future checkpoints stay inspectable without becoming editable entities.
- Stale asset-picker completions must not change a newly selected record.

### Task1: Baseline and safe assets
- [x] Review pending2A changes/ignores/secrets; full165-test verification and signed baseline300eba2.
- [x] Extend public adapter with file metadata/resource/binary create operations; add asset service and import errors with partial-success paths.
- [x] Test collision/traversal/cancellation/uncertain writes, reference removal/repair and original-byte preservation.

### Task2: Preview ownership
- [x] Implement injected media service with owner tokens, play/pause/stop/seek, load/error handling and bounded resources.
- [x] Test switch/cancel/rejection/close/disable/unload and repeated cleanup.

### Task3: Recovery
- [x] Read both existing checkpoint envelopes with bounded discovery/inspection and UUID source resolution.
- [x] Explicitly load unsaved sessions; changed source requires explicit reviewed rebase before normal conflict-protected Save. Never change checkpoint files.
- [x] Test malformed/future/invalid drafts, duplicates, renames and competing edits.

### Task4: UI and native review
- [x] Add existing-vault selector, explicit destination-confirmed import, asset actions/player and recovery inspector.
- [x] Run UI regression tests; synthetic assets and full native disposable workflow/restart, screenshots light/dark/narrow.

### Task5: Scalability and completion
- [x] Measure100/1000/5000 synthetic records; optimize only demonstrated bottlenecks.
- [x] Full verification, preservation/Git checks and docs/MILESTONE_2B_REPORT.md; stop before next milestone.

Final evidence: docs/MILESTONE_2B_REPORT.md. All steps completed within scope;209 tests/21 files pass. Native checks/screenshots and limitations recorded. Stop after2B.
