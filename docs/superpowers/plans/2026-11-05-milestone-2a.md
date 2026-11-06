# PATCHBOOK Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver a usable production instrument/patch/effects-chain library inside Obsidian.

**Architecture:** Extend the existing entity codec/repository/index with additive library records and stable forward references. One application library service owns queries and draft sessions; a native DOM workspace consumes it. No competing persistence, MIDI promotion, automatic migration or legacy copying.

**Tech Stack:** Existing strict TypeScript/Obsidian/Vitest/esbuild/yaml; no additional dependencies.

**Spec:** User Prompt 004; ../../PRODUCT_SPEC.md, ../../DATA_MODEL.md and ../../ARCHITECTURE.md.

## Global Constraints

- Milestone 2A only; no 2B, MIDI/audio/arrangement implementation, remote or personal vault.
- Preserve existing schema1 patches, prose, unknown metadata and source-content conflict checks.
- Instrument/effects-chain records are an explicit Prompt004 extension to the earlier text-only proposal; no bulk conversion.
- Library removal is confirmed reversible archiving, with notes retained. No native file deletion race or cascade.
- Provisional archival layout uses host fonts/themes, no final brand assets or UI framework.
- Native single-agent execution follows user autonomy and AGENTS; no delegation or skill handoff pause.

## Review Focus

- Existing patch text/parameters/effects and arbitrary metadata must survive edits.
- Rename, missing/duplicate/archived targets must never redirect relationships silently.
- Dirty and invalid drafts need recovery; close/disable must not silently discard confirmed work.
- Changes arriving during save must remain dirty rather than being acknowledged as saved.
- Malformed/future-schema records must remain inspectable, with blocked writes and actionable errors.

### Task 1: Baseline and additive records

Files: src/domain/entities.ts, validation.ts; src/storage/document.ts, repository.ts, references.ts; library domain/codec tests.

- [x] Inspect all37 changes, ignores and credential patterns; run123-test suite; signed baseline f0d90d1 verifies good.
- [x] Add instrument/effects-chain schema1 records, namespaced library metadata, stable patch references and readable ordered effect YAML.
- [x] Test creation, malformed/future records, surgical preservation, stable rename identity and missing/duplicate relationships.

### Task 2: Library service and safe draft ownership

Files: src/modules/patchbook/library.ts, session.ts; repository draft recovery extension; application/services.ts.

- [x] Implement query/search/filter/sort with stable ties; ID resolution and related records from the shared index.
- [x] Implement explicit save, dirty states, debounced recovery checkpoints, retained drafts and explicit discard; archive/restore through conditional save.
- [x] Test stale saves, in-flight edits, invalid draft preservation, failed writes/checkpoints, archive confirmation, references and teardown.

### Task 3: Production workspace

Files: src/modules/patchbook/view.ts and form helpers; src/main.ts; styles.css; UI/lifecycle tests.

- [x] Implement archival two-pane browser/detail workspace, three record types, labeled forms, structured ordered effects, filters and related navigation.
- [x] Preserve focus on index updates; guard async selections; show save/recovery/conflict errors; support keyboard save and Markdown opening.
- [x] Verify module disable/restore and explicit resource release while retaining stored records.

### Task 4: Native workflow and documentation

Files: scripts/patchbook-smoke.mjs; docs/MILESTONE_2A_REPORT.md and current architecture/data/decisions/roadmap/development/README/planning records.

- [x] Run complete existing/new verification; native create/edit/search/filter/related/note workflow, rename/conflict, archive/restore and module/plugin restart.
- [x] Inspect light/dark/native screenshots and cold-restart identities in the disposable environment.
- [x] Verify legacy preservation, isolated app cleanup and final Git state; report exact limitations and stop at2A.

## Completion evidence

165 tests/17 files; strict typecheck/lint/build; native2A17 workflow checks; foundation and1B regression; cold restart5 exact records plus workspace state. Legacy hashes and experimental source preserved. Manual recovery/archiving/platform limits and resolved native tooling issues are recorded in ../../MILESTONE_2A_REPORT.md. Stop at2A; no next-phase authorization.
