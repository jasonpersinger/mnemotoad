# Milestone 1B Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Measure musical timing, compilation, playback and rendering feasibility without implementing production editors.

**Architecture:** Pure experimental timing/compiler/transport interfaces feed a separate disposable-vault-only experimental plugin. Production services and schema 1 remain unchanged. Benchmarks use synthetic records, never repository data.

**Tech Stack:** Existing strict TypeScript, Vitest, esbuild, native Web Audio/Canvas/DOM/SVG and the existing guarded Obsidian CDP harness.

**Spec:** User Prompt 003; existing architecture/data-model constraints in ../../ARCHITECTURE.md and ../../DATA_MODEL.md.

## Global Constraints

- Milestone 1B only; no production editors, synthesizer library, personal vault or remote changes.
- TROUBADOUR is read-only; no copying, installing or executing legacy code.
- Keep all existing 74 foundation tests and production contracts intact.
- Experimental view disabled by default and restricted to the marked project-local disposable vault.
- Recommendations and production adoption remain subject to human review.
- Execute natively in this session under the user's autonomous-work instruction. Skill handoff/subagent requests do not override that instruction or AGENTS delegation restrictions.

## Review Focus

- Non-divisible PPQ must report a rational result and explicit quantization error.
- Same-channel same-pitch overlaps must not produce ambiguous exported note pairing.
- Stop/dispose while AudioContext.resume is pending must not resurrect playback.
- Main-thread stalls must stop with diagnostics rather than schedule an overdue burst.
- Dense visible regions and high DPI must be measured, not hidden by sparse culling fixtures.

### Task 1: Establish restoration point and pure timing/compiler contracts

Files: experiments/timing.ts, compiler.ts; tests/experiments-timing.test.ts, experiments-compiler.test.ts; root check configuration.
Interfaces: rational quarter-note positions; explicit PPQ/SMPTE division validation; TempoMap seconds conversion; compile(sequence) -> deterministic timed on/off events and duration.

- [x] Review/stage foundation, scan secrets/ignore rules and run pnpm check (74 passes).
- [x] Create signed baseline commit 70f45df after user unlocked signing key.
- [x] Test non-divisible PPQ, tempo boundaries/inverse mapping, SMPTE rejection, chords/repeats/offsets, deterministic off-before-on order and invalid bounds.
- [x] Implement exact rational conversion and bounded pure compiler; run targeted tests and typecheck.

### Task 2: Playback ownership and cancellation

Files: experiments/transport.ts, web-audio.ts; tests/experiments-transport.test.ts.
Interfaces: injected audio clock/sink and timer; bounded lookahead transport; Web Audio test-tone adapter.

- [x] Test start/pause/resume/stop/dispose, cancellation during resume, repeated cycles and underruns using deterministic fake clocks.
- [x] Implement one timer, generation guard, explicit late-event stop and voice cleanup.
- [x] Measure scheduling lead times and timer intervals natively; separate these from audible latency.

### Task 3: Rendering and isolated native harness

Files: experiments/geometry.ts, rendering.ts, plugin.ts; scripts/experiments-build.mjs, experiments-native.mjs; tests/experiments-geometry.test.ts.
Interfaces: shared viewport rectangles/hit testing; synthetic note/clip fixtures; benchmark result records; guarded experimental view and lifecycle.

- [x] Test coordinate transforms, culling, hit testing and selection/resize preview math.
- [x] Compare DOM/SVG/culled Canvas at 100/1000/5000/20000 notes; include dense case, high DPI, scroll/zoom and interaction work.
- [x] Measure synthetic multi-lane clips; record hardware, native host, methodology and memory limits.
- [x] Exercise view-close/plugin-unload audio cancellation and repeat cleanup in isolated Obsidian.

### Task 4: Research, report and regressions

Files: docs/MILESTONE_1B_REPORT.md; append current authority/recommendations to AGENTS, architecture, roadmap, risks, decisions and development guide; task_plan/findings/progress.

- [x] Review current primary library/host documentation and licenses; measure candidate bundle sizes where feasible.
- [x] Run full pnpm check and foundation native smoke after experiments; check production bundle and legacy preservation.
- [x] Record measured results, limits and adoption approval requests; leave experimental changes reviewable and stop at 1B.

## Completion notes

123 tests/13 files and all required checks pass. Native bounded suite21cases,15checks; all-DOM20k failed and SVG20k/denseDOM20k remain unverified. Bounded fixture adaptations, no complete codec/list/production editor, and remaining validation are recorded in ../../MILESTONE_1B_REPORT.md. The baseline commit is the only new commit; completed1B changes remain reviewable. Stop at1B.
