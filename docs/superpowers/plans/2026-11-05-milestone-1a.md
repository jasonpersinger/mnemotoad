# Milestone 1A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** A loadable Obsidian foundation with strict entity contracts, safe shared vault persistence, module shells, settings and meaningful tests.

**Architecture:** Pure domain/validation; source-preserving Markdown codec; a narrow public-Vault port with identity index/repository/recovery; settings and module lifecycle services; three native ItemView shells. No editors, musical processing or legacy imports.

**Tech Stack:** TypeScript, pnpm, esbuild, Vitest, YAML source-range parser, Obsidian API. jsdom for host-shell contract tests only.

**Spec:** Prompt 002 plus PRODUCT_SPEC, DATA_MODEL, ARCHITECTURE and ROADMAP Milestone 1A. Prompt 002 explicitly authorizes autonomous execution; its instruction supersedes the skill's optional implementation handoff. Work proceeds in this session without delegation or importing an unavailable execution skill.

## Global Constraints

- Milestone 1A only; no piano roll, sequencing, synthesis or timeline.
- No legacy source/test/fixture copying or TROUBADOUR writes/execution.
- A new project-local disposable vault/profile only; no personal-vault or remote changes.
- Stable UUIDs; schema 1; Markdown/YAML plus owned JSON; future versions read-only.
- No silent overwrite, migration, data deletion, runtime network or telemetry.

## Review Focus

- External edits arriving between backup and conditional mutation must retain disk and draft.
- A write may fail after persisting bytes; return a failure with recovery path, never blindly retry.
- Folder rename/delete, duplicate IDs and late reads must not revive stale index entries.
- Unchanged YAML/prose/fences and unknown structured fields must survive targeted edits.
- Disable/unload during settings, startup indexing or saves must not create late registrations/writes.

## Task 1 — Build and domain contracts

Files: package/manifest/build/typecheck/test/lint configuration; `src/domain/{entities,validation,errors,paths}.ts`; `tests/domain.test.ts`.

Interfaces: `validateEntity(value: unknown): Entity`; `createEntity(kind,title): Entity`; UUID/kind/schema and typed patch/motif/composition payloads, asset/link validation, `FoundationError` codes.

- [x] Configure pinned local tools, host externals and browser CJS artifact; run empty compilation.
- [x] Write failing tests for all three kinds, valid/invalid UUIDs, note bounds, duplicate local IDs, malformed fields, unsafe assets, schema versions and unknown-field preservation.
- [x] Implement contracts/validation without musical editors/processing; run domain tests/typecheck.

## Task 2 — Source-preserving codec

Files: `src/storage/document.ts`, `tests/document.test.ts`.

Interfaces: `parseEntityDocument(source): ParsedDocument | null` (null for unrelated note); `createEntityDocument(entity): string`; `updateEntityDocument(source,expectedSource,next): string`.

- [x] Tests first: CRLF/prose/unknown YAML and JSON; duplicate/missing/wrong-kind blocks; nested ordinary fences; schema mismatch; stale full-source token; no-op byte preservation.
- [x] Parse strict YAML with source ranges and exactly one owned block for motif/composition; patch properties by range; replace owned JSON only. Reject unsafe edits before returning any candidate.
- [x] Run codec/domain tests and inspect fixture outputs.

## Task 3 — Repository, index, references and recovery

Files: `src/storage/{vault-port,index,repository,references}.ts`; `src/platform/obsidian-vault.ts`; `tests/{repository,index,references}.test.ts`; disposable memory port fixture.

Interfaces: `VaultPort` text/read/create/process/list/events; `EntityIndex.start/settled/resolve/dispose`; `EntityRepository.create/read/save/saveDraftCopy/dispose`; typed diagnostics for missing/ambiguous/invalid entities/assets.

- [x] Tests first for create/collision/concurrent creation, rename/folder rename, duplicate IDs, invalid/future records, missing/wrong-kind references, recovery retention, failed backup/write and unknown outcome, competing saves and cancellation.
- [x] Implement bounded startup reads and targeted/coalesced event reindexing, synchronous compare/replace through public `Vault.process`, per-ID save queues and collision-safe new recovery files. No writes after cancellation checks; an already-submitted host write cannot be aborted.
- [x] Run adversarial storage tests; verify originals/drafts remain available and no deletion API exists in repository.

## Task 4 — Settings and workspace lifecycle

Files: `src/{main,settings}.ts`, `src/application/modules.ts`, `src/ui/module-view.ts`, scoped CSS, host mock and lifecycle/settings tests.

Interfaces: validated versioned `SettingsService.load/update/dispose` preserving unknown settings; `ModuleController.open/setEnabled/dispose` through a small workspace port; factories for all module view types.

- [x] Tests first for settings persistence/failure/serialization/future schema, module command guards, open deduplication, disabled-restored views and disposal during awaits.
- [x] Implement settings toggles and command-opened shells with under-development text, shared diagnostics count, no entity editors; cleanup registrations/subscriptions without detaching leaves on plugin unload.
- [x] Run host-contract tests and build; tests use own minimal host mock, not legacy shim.

## Task 5 — Disposable host validation

Files: `scripts/dev-vault.mjs`, ignored `dev-vault/` and `.runtime/`, `docs/DEVELOPMENT.md`.

- [x] Script only creates/updates an explicitly marked new disposable project vault and copies build artifacts there. Refuse unmarked/preexisting vaults and symlinks. Do not delete data or launch a personal profile.
- [x] Run typecheck/lint/tests/production build, prepare vault, verify dev watch rebuild and stop it.
- [x] If isolated app launch is available, smoke commands/views/settings/native repository save/conflict/reload/unload and capture exact host version/evidence; otherwise record limitations and exact manual steps.

## Task 6 — Review and handoff

- [x] Review implementation against 1A requirements and fix defects without expanding scope.
- [x] Update current-status sections and approval log while preserving Milestone 0 research/history. Record YAML dependency and conservative full-source conflict policy; deferred sessions/autosave/migrations remain explicit.
- [x] Write MILESTONE_1A_REPORT A–I, final commands/results/runtime limits/Git state, compare legacy and initial-document baseline. Stop before 1B.

Local commits are not necessary for this deliverable; no remote is created or used. Checkboxes are completed in the final implementation review.
