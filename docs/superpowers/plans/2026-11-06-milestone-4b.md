# Arrangement Compilation, MIDI Export and Playback Implementation Plan

Execution: native sequential implementation under Prompt009. Its autonomous authority overrides the skill's approval handoff; project rules prohibit delegation. No4C work, legacy adoption, personal vaults, publication, remote pushes or destructive migration.

**Goal:** Compile acknowledged saved-source arrangements into deterministic, independently verified Type1 MIDI and one owned audition transport.
**Architecture:** Keep CANVAS sessions/repository/catalog authoritative. A bounded read-only capture cache verifies fresh source text and immutable notes. Pure expansion/routing/collision logic feeds the existing MusicalEvent/Plan compiler. Shared MIDI serialization consumes that plan. Extend the existing transport/sine sink for offset start, pause/resume/seek; Canvas owns its snapshot and invalidation. Use the existing isolated MIDI worker boundary only after profiling demonstrates synchronous cost.
**Stack:** Current TypeScript/Obsidian/esbuild/Vitest/midi-file/Web Audio; no new dependency.
**Spec:** Current user Prompt009; docs/MILESTONE_4A_REPORT.md and current architecture/data decisions.

## Verified baseline

- [x] All60 pending paths match retained4A manifest; no secrets/conflicts/unrelated/generated work. Full386/33 check passed. Signed commit3f5c67f verifies good, clean tree;50583e1 and90eed00 preserved. Signing unchanged, no remote.

## Contract decisions before implementation

- Keep existing schema1 uniqueness of explicit stored channels. Duplicate explicit routing is rejected atomically. Automatic allocation is derived/transient and may reuse explicit/automatic channels after verification; routing edits use existing midiChannel/percussion fields/history. Add midiChannel to known optional-field removal so Auto survives Save.
- Auto assigns non-percussion channels deterministically by stable lane ID, preferring unused channels then safe sharing. Explicit assignments reserve their channels first. Channel10 requires explicit percussion. Empty auto lanes need no channel. Sharing requires identical organizational patch context and no overlapping same-channel/pitch lifetimes; unknown musical/channel-wide state blocks compilation. No program/controller sound reproduction.
- Initial bounds:24,000 expanded notes/48,000 note events,128 sources,16MiB total captured UTF-8 text,8MiB/source,64MiB estimated working budget,1e9 maximum tick (existing editor remains4,096quarters). Export polyphony128; audition64 plus a bounded short-window voice/scheduler workload. Profile and tighten if evidence requires; never truncate.
- New sources must match every clip's explicitly reviewed SHA256. Capture and recheck fresh saved source text, identities, schema and catalog status; never drafts or an older revision. Fresh text equality permits reuse of previously validated immutable notes without reparsing. Recheck immediately before binary submission and after acknowledgement; disclose any stale/uncertain created derivative, never delete/retry automatically. No multi-file transaction.
- Compilation fingerprint is SHA256 over canonical composition input plus sorted source IDs/revisions and a policy version, computed outside the pure event compiler. The pure result carries that verified input identity and full event provenance. Off precedes on at equal tick, then channel/laneID/pitch/voiceID lexically, independent of locale.
- Existing MusicalPlan remains the shared representation. Bound overrides extend the existing compiler only for reviewed arrangement consumers. Provenance is an optional shared event field; no second audio event model.
- Conductor plus nonempty lane tracks in composition order; UTF-8 bounded names include lane identity; every track ends at composition length, preserving all trailing silence. Bytes contain no timestamps. Existing MidiFiles public-Vault new-file writes remain authoritative for derivatives.
- One MusicalTransport coordinates MOTIF/CANVAS and recorded preview focus. Pause closes/silences audio but retains position/plan/owner; resume/seek retrigger notes spanning the requested position for their remaining duration. Stop resets to beginning, return-to-start seeks0. All nodes/timers cancel on stop/seek/close/error/unload/natural end.
- Any applied composition edit, authoritative base change/conflict or relevant saved-source change invalidates the prepared snapshot and stops its owner. Same-instance source draft edits are observed without consuming notes; checkpoint/status-only notices must not repeatedly invalidate playback. Leaf navigation stops the outgoing owner's audio; no rAF timing authority. Compile/export/playback never dirty history.

## Review focus

1. Revision races before/during writes: reject before submission; retain/report a file if submitted host I/O already completed.
2. Same-pitch adjacency/repeats: half-open lifetimes and off-before-on; no shortening/dropping.
3. Explicit routing versus Auto across Save/Undo/reorder: IDs and explicit settings preserved, transient reuse verified.
4. Seek into long notes, async context resume, ownership exchange: no revived stale voices or leaked frames/timers.
5. Diverse sources/near-limit expansion: real measurements, bounded cancellation, preserved unknown/excluded metadata and no partial output.

## Task1 — Pure compilation, routing, collisions and shared serialization

Files: create src/arrangement/{compiled,compiler,routing,collisions}.ts; modify src/music/compiler.ts, src/midi/export.ts; create shared src/midi/serialize.ts and tests/arrangement-compiler.test.ts.
Interfaces: CapturedSource{id,revision,motif,textBytes}; compileArrangement(composition,sources,inputRevision): CompilationResult; result uses MusicalPlan.events with optional provenance and routing manifest. serializeArrangement(result): Uint8Array uses shared Type1 writer.
- [x] Write deterministic fixtures/assertions for480/960/1000 exact/inexact, chords/repeats/rests/meters, sources/revisions/maps/state, adjacent/conflicting lifetimes,32-lane sharing/exhaustion, limits and byte determinism; see independent task below.
- [x] Extend existing compiler consumer bounds and provenance injection without changing default MOTIF semantics; validate before any expansion and preserve full composition end.
- [x] Implement pure routing/collision diagnostics with lane/clip/motif/note/repetition provenance. Keep duplicate explicit schema rule and document how Auto provides reuse.
- [x] Extract common Type1 metadata/delta/end serializer and retain existing MOTIF exports/tests.
- [x] Measure small/medium/large and near-limit synchronous cost; record evidence before choosing worker/asynchronous execution.

## Task2 — Verified source capture, operation ownership and export safety

Files: create src/arrangement/{capture,preparation}.ts; integrate CanvasLibrary, MidiFiles; tests/arrangement-capture.test.ts and arrangement-job tests if worker needed.
Interfaces: SourceCapture.capture(composition,signal): immutable source set + base manifest; verify(snapshot,signal): fresh text/UUID/schema checks. Preparation owns one cancellable compile/export at a time and only caches its bounded verified input. No persistence authority.
- [x] Test missing/duplicate/malformed/future/changed/unreviewed sources, cache freshness, changed-during-capture/compile/write, cancellation and partial-write outcomes.
- [x] Implement bounded capture/recheck/cache against existing catalog/repository/Vault; stable canonical SHA256 input identity.
- [x] Use measured asynchronous strategy; if worker needed extend existing embedded MIDI worker/messages with bounded abort/deadline/URL cleanup, no dependency.
- [x] Reuse MidiFiles new-file writes with an immediate before-submit verifier; complete bytes before destination, post-write stale-source reporting, explicit conflict/errors.

## Task3 — Shared transport offset/pause/seek

Files: modify src/music/transport.ts and audio.ts only as necessary; tests/arrangement-transport.test.ts plus existing motif-music/audio tests.
Interfaces: start(owner,plan,offsetSeconds=0), pause(owner), resume(owner), seek(owner,seconds); same musical event representation/sink and one owner.
- [x] Controlled-clock tests for pause/resume/seek/end/overlap/boundary/race/failure/ownership and repeated lifecycle cleanup; no real sleeps.
- [x] Cursor/binary-search offset preparation, retrigger spanning notes with remaining duration, bounded audio-clock lookahead, preflight audition workload. No Canvas frame authority.
- [x] Preserve old MOTIF start/stop and exclusive recorded preview behavior; stop on source/composition invalidation and module/view/plugin lifecycle.

## Task4 — CANVAS integration

Files: create src/modules/canvas/{performance-panel,export-dialog,routing}.ts or focused equivalent; modify view/timeline/commands/main and scoped CSS; tests/canvas-performance-view.test.ts.
- [x] Native transport + seek/position, Compile/Export, secondary routing/diagnostic interface with clip/source navigation and musical positions. Preserve timeline, pending controls, existing UI tests and history.
- [x] Route changes use existing session.edit with full candidate validation, one Undo entry, known optional channel removal and preservation tests.
- [x] Prepared/playing/paused/exporting/error/invalidated states, cancelable jobs, correct source/session/base invalidation and no snapshot clones per playhead frame.
- [x] View/module/plugin disable, leaf navigation and async-completion ownership; high-DPI playhead coordinates and native keyboard alternatives.

## Task5 — Independent/native/performance verification

Files: synthetic tests/support fixtures, independent Python reader extension only where needed, scripts/canvas-4b-native.mjs, scripts/canvas-4b-benchmark.mjs; output/canvas/milestone-4b/ (ignored).
- [x] Independently parse Type1 fixtures against compiler events: melody/fourlanes/repeats/PPQs/chords/adjacency/simultaneous/percussion/rests/silence and all rejection cases. Keep small deterministic golden fixture if useful.
- [x] Full real Obsidian end-to-end workflow, prior4A record compatibility, source review/routing/collisions/export/pause/seek/restart/conflict/recovery/cold restart;17+ real screenshots and index. Preserve all prior evidence.
- [x] Small4/20/4, medium16/200/25, large32/1000/100 sources with varied notes/lengths; capture/recheck/compile/routing/collision/serialization/independent parse/memory/play init/seek/stop/UI responsiveness. Report failures/outliers.
- [x] If REAPER can run with a project-local disposable configuration, inspect one synthetic import without personal configs/projects; otherwise document why unavailable.
- [x] Full MOTIF/MIDI/PATCHBOOK/foundation native regressions in separate4B review directories.

## Task6 — Final documentation and review gate

- [x] Full386+ regression/unit suite, strict typecheck/lint/build, audits, script/links/secret/diff/ignored data checks and final deployed bundle matching.
- [x] Update architecture/data/decisions/roadmap/risks/current guides and write docs/MILESTONE_4B_REPORT.md A–P with measured evidence and PASS/CONDITIONAL PASS/NOT READY.
- [x] Verify legacy tracked hashes/HEAD/clean status, historical reports/experiments and personal-vault boundaries; stop isolated resources and report final Git state. No4C, extra commit, remote or publication inferred.

## Completion evidence

See docs/MILESTONE_4B_REPORT.md and docs/validation/milestone-4b-native.json. All implementation/verification tasks completed within the authorized Linux scope. REAPER was safely attempted with verified local resources but its import modal could not be automated; no DAW result claimed. Final varied-length4/20/4,16/200/25,32/1000/100 workloads and initial uniform-length repeats are retained. Explicit channel sharing remains conservative; cross-track touching same-pitch boundaries require a gap. No4C or new legacy approval.
