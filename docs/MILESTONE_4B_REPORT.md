# Milestone4B — Arrangement compilation, MIDI export and playback

Date:2026-11-06. Authority:Prompt009 only. **CONDITIONAL PASS for the verified Linux desktop scope.** The arrangement workflow and mandatory independent programmatic interoperability checks pass. External DAW import, other platforms, physical audio latency and assistive-technology certification remain unverified. No4C work or publication is authorized by this report.

## A. Executive summary

CANVAS now captures acknowledged saved motifs, compiles exact deterministic events, allocates verified MIDI routing, diagnoses collisions, creates Type1 multitrack MIDI, and auditions through the existing single musical transport. Play/Pause/Resume/Seek/Stop/Return-to-start, visible musical position/playhead, explicit routing with history, cancellation and source invalidation are implemented. Existing arrangement Markdown, identities, MOTIF/PATCHBOOK features and recovery remain intact.

All386 baseline tests remain passing; final suite **449 tests across37 files**, strict TypeScript, ESLint and production build pass. Independent Python verification passes10 valid fixtures,4 expected rejection fixtures, and the native23-note/five-track export. Actual Linux Obsidian1.15.0 cold restart, recovery/conflicts, source errors, transport ownership/cleanup and existing module regressions pass. Twenty-three Obsidian screenshots are indexed below. No new dependencies, schema bump, legacy copying or remote changes.

Limitations: note-only fixed-tempo/meter model; conservative channel sharing; bounded expansion/audition; fresh source checks cannot create a multi-file transaction; submitted host binary I/O cannot be rolled back. Playback uses simple quiet sine tones, including percussion, with a50ms restart lead and rearticulation when seeking into notes. No patch sound reproduction or sample-accurate audible claim.

## B. Repository baseline

All60 pending4A paths matched the retained4A manifest. Relevant diffs, ignored data and credential patterns were reviewed; no conflicts/unrelated changes were found. The full baseline check passed386 tests/33files before implementation. Signed local commit **3f5c67f**, `feat: establish verified Milestone 4A CANVAS arrangement foundation`, verified with a good existing GPG signature and clean working tree. Signing configuration was unchanged. Prior50583e1/90eed00 restoration points remain ancestors.

No material report/source discrepancy blocked4B. One repository constraint affected the recommended routing policy: schema1 already rejects duplicate explicit channels. That reviewed contract was retained; Auto sharing is derived instead. Historical reports remain unchanged. The earlier AGENTS authority paragraph was stale and was safely extended to the current explicit Prompt009 scope.

## C. Arrangement compiler

Pure components: `src/arrangement/{compiled,compiler,routing,collisions,audition,export}.ts`. Inputs are validated compositions and immutable saved motif captures with exact text revisions. Output extends the existing `MusicalPlan`/`MusicalEvent` contract, adding exact absolute integer ticks and lane/clip/motif/note/repetition/revision/lifetime provenance. No Obsidian, rendering, DOM, persistence or audio dependency enters compilation.

The input fingerprint is SHA256 over canonical composition data, sorted source UUID/revision pairs and a policy version. The compiler carries this verified identity. Equal inputs produce equal events/bytes. Event order is exact tick, off-before-on, channel, lexical lane UUID, pitch, lexical voice identity. Lane tracks retain authored order independently of Auto routing's stable UUID order.

Every source note start/end and full motif period must convert exactly by `sourceTick ×960 / sourcePPQ`. BigInt divisibility checks reject inexact endpoints; clip offsets and repetitions remain integer composition ticks. Original source PPQ/notes are never rewritten. Tempo/meter differences are visible information, not stretching or map insertion.4/4,3/4,6/8,480/960/1000PPQ, rests, polyphony, adjacent boundaries, positive-length empty sources, overflow and invalid positions are tested. Every clip's full repeated period must fit the explicit composition endpoint. MIDI/transport retain all remaining arrangement silence.

Bounds, enforced before unsafe expansion:

| Resource | Limit / behavior |
| --- | --- |
| Planner | Existing32lanes/1000clips/1000repetitions; not an expansion guarantee. |
| Saved sources |128distinct;8MiB UTF8 each/16MiB total capture. |
| Expanded output |24000notes/48000note events; near-limit valid fixture and rejection tests. |
| Working estimate |64MiB heuristic:1536bytes/note +2×source text +4×composition JSON characters; not an actual heap cap. |
| Time | Existing4096-quarter editor length; subordinate pure1e9tick ceiling; exact integer endpoints. |
| Worker/output |10s cancellable worker deadline; complete binary≤2MiB under existing MIDI limits. |
| Polyphony | Export≤128; preview≤64 plus≤128note starts per150ms window. |

The existing embedded MIDI worker now handles bounded arrangement compile/serialization. A synchronous24k-note probe cost≈126ms, motivating reuse of that worker. Abort/error/deadline terminates it and revokes its URL. No partial musical stream or MIDI is returned on rejection.

## D. Source consistency

`SourceCapture` uses the existing source catalog, index, repository and public Vault adapter. Capture validates kind/schema/UUID, archival state, bounded source text and musical data; records exact text/SHA256; deep-freezes input. Its bounded128source/16MiB cache reuses validated musical objects only while freshly read source text/revision still match. File paths are current navigation hints; UUID resolution survives supported renames.

`ArrangementPreparation` verifies current draft/base and captured sources before and after worker execution, before export, immediately before binary submission after destination folder work, and after acknowledged creation. Composition heads now carry revisions too, allowing external changes to invalidate readiness. Export cannot race another export. Cancellation invalidates the operation generation and ignores late completion.

Every clip must acknowledge the exact captured source revision. Changed/unreviewed sources block final preparation/export until explicit review; changes during capture/compilation/export reject/retry. Missing, ambiguous, malformed, future-schema, archived and inexact sources produce structured diagnostics and preserve clips. Tests cover missed notifications and cache freshness. Same-instance unsaved MOTIF edits invalidate a prepared snapshot and remain visible warnings; fresh compilation still reads only the reviewed saved notes, never drafts.

**Remaining race:** these are sequential file reads/checks, not a vault-wide transaction. A source can change after the last check or while submitted binary I/O completes. Pre-submission changes block the write; post-submission failures/cancellation report a retained derivative as unverified/stale. Nothing is silently deleted, overwritten, rolled back or retried. Other plugin instances cannot expose their unsaved drafts through this instance's session catalog.

## E. MIDI routing

Persisted `lane.midiChannel` remains optional0–15; the UI shows1–16 and Auto. Explicit channels take precedence and are never remapped. Schema1's existing explicit uniqueness remains enforced; a duplicate explicit edit rejects atomically with the other lane's name. Absence means derived Auto, not a new stored field. Explicit→Auto removal is now an owned optional-property deletion through the existing document writer; save/reopen and Undo/Redo are tested.

Channel10 is reserved for explicit percussion (`midiChannel:9, percussion:true`). Auto melodic lanes use the other15channels in stable lane-UUID order, preferring unused channels, then safe reuse. Empty Auto lanes remain unallocated; explicit silent preferences still reserve their channels. Reordering lanes changes track order while retaining automatic channel identity.

Sharing requires matching organizational PATCHBOOK context (lane patch, otherwise source patch, otherwise unassigned), supported note-only state, and compatible note lifetimes. Mixed-context lanes receive exclusive keys. Unknown source note/data/meter semantics and recognized channel-wide arrangement/lane/clip state block compilation; no program/controller/bend/sustain assumptions are invented. PATCHBOOK association does not reproduce or export its sound. Source import-channel hints remain in source records; arrangement lane routing controls this derivative.

Tests include explicit/percussion/invalid/duplicate settings,32sparse lanes, more than15melodic lanes, safe sharing, conflicting context/state, exhaustion and allocation after reorder. The allocator is deterministic and conservative, not an optimal graph-coloring/port-routing engine.

## F. Collision detection

Half-open same-channel/same-pitch lifetimes cannot overlap, whether from one clip, repetitions, overlapping clips or different lanes. Ordinary different-pitch polyphony and same-pitch notes on different channels are supported. Same-lane adjacency is valid with off-before-on.

Across separate SMF lane tracks, same-pitch notes cannot share a channel at a touching boundary: an external merger could process the new note-on before the old note-off. Auto allocation chooses another safe channel or rejects; it never changes explicit assignments or source notes. This conservative restriction is documented and tested.

Diagnostics identify lane names/UUIDs, clip/motif/note IDs, repetition, channel/pitch/start/end and the conflicting provenance. UI shows musical positions and navigates to affected clips; the normal inspector opens source MOTIF. No shortening, merging, deletion, clamping, quantization or velocity/pitch changes resolve conflicts automatically.

## G. MIDI export

`midi/serialize.ts` is a narrow shared note-only writer used by MOTIF and CANVAS. CANVAS exports Type1,960PPQ, one conductor with tempo/meter, then one note track per nonempty lane in authored order. Track names include stable lane UUID and bounded UTF8 human name. Empty lanes are omitted; no invented notes. Every track's end-of-track is the explicit composition endpoint, preserving rests and trailing silence beyond all note-offs. No random IDs/timestamp metadata enter bytes.

Complete validated bytes are prepared before opening the export modal. The user explicitly confirms a visible vault-relative `.mid` destination. Existing paths/unsafe/hidden/traversal destinations reject; public `Vault.createBinary` creates a new derivative. No source composition, motif, patch or unrelated Markdown is written. A failed or uncertain write instructs inspection of the destination; a complete/partial file may exist and is never automatically deleted. Cancellation before submission creates no MIDI; after submission follows the retained/unverified policy above. Destination failures require recompile before another export.

The UI explicitly exports the compiled displayed working arrangement using acknowledged saved motifs; it does **not** imply that exporting saves the composition. Transport/export do not dirty or clear its editing history.

## H. Independent verification

`scripts/arrangement-fixtures.mjs` runs the pure compiler/writer, then the independent Python standard-library SMF reader `scripts/verify-midi.py`. It compares raw track events/order/channels/endpoints against compiled events **and** separately constructed expected tuples from source notes, clip offsets and repetition periods. Golden fixture bytes are retained under `tests/fixtures/arrangement-single.mid`; the generator refuses changed existing fixture bytes.

Ten valid fixtures: single lane, four lanes, repeated motif, mixed480/960/1000PPQ, four-note chord, adjacent repeated pitch, simultaneous lanes, percussion, sparse6/8, ending in silence. Four expected rejections: channel exhaustion, source revision conflict, inexact timing, event budget. All pass; repeated output is byte-identical.

Native export independently matches **23notes/46events,5tracks,960PPQ,500000µs/quarter,6/8,endpoint245760ticks**. Notes end well before that endpoint; all tracks retain silence. Comparison covers pitches, starts/durations, velocities, channels, lane names/order, tempo/meter and boundary event order. Repeated native exports are byte-identical. Raw evidence: `independent-midi.json`, `native-midi-verification.json`, `fixtures/` in the screenshot/review directory.

An isolated REAPER7.84 instance was attempted with an explicit project-local `-cfgfile`; ReaScript verified its resource path and empty project. The MIDI import dialog appeared, but the installed xdotool lacked `libxdo.so.4`, and direct XTest did not activate the modal. No import completed; observed track count remained0. The exact isolated process was stopped. **No DAW compatibility result is claimed.** No global install, personal REAPER configuration/project or personal music was used. `reaper-attempt.json` retains this limitation.

## I. Playback and transport

The existing MusicalTransport now supports offset start, pause, resume and seek for the same MusicalPlan. One coordinator exchanges ownership between actual MOTIF and CANVAS Play; recorded audio preview already exchanges focus with it. No second audio engine or dependency.

The audio clock drives a25ms lookahead timer/100ms horizon,50ms initial lead. Event ticks remain authoritative; seconds derive from fixed composition tempo. Note-on cursors use binary search; a prefix-end index finds sustained notes crossing a seek. Those notes are retriggered at the new origin for their remaining duration. Pausing closes voices/context/timer while preserving owner/position; resuming creates a new context. Seeking cancels old scheduled work. Stop resets position; natural completion reaches the silent endpoint and releases ownership. Visual frames only read position/draw the playhead.

Applied composition edits, relevant saved-source or current-instance draft revisions, protected base/conflict changes invalidate/stop prepared playback. Switching composition/leaf, closing view, module/plugin disable, blur/hidden document, suspension, scheduler stall or errors stop owned audio. A late/over100ms-stalled scheduler stops with a diagnostic rather than sounding a catch-up burst. Disabling unrelated MOTIF does not steal CANVAS ownership. Pause/seek/stop/unload/failure and20 repeated cycles have controlled-clock cleanup tests; actual suspension, natural completion and owner exchange were also exercised in Obsidian.

Native benchmark initialization medians≈1.2/1.8/4.3ms, seek≈0.3/0.8/0.8ms and Stop+settled≈0/0.1/0.1ms. These are API operations in this host, **not audible latency**. Internal oscillator envelopes and device output remain unmeasured. Seeking rearticulates sustained notes; restart is not seamless. No loop/map/mixing/external instrument engine.

## J. UI and visual review

CANVAS retains its arrangement-first timeline. A compact transport sits above it; seek/export, routing and structured diagnostics are secondary disclosures below it. Compile/ready/error/invalidated/exporting and owned playing/paused states are visible. Errors open diagnostics; routing forms reject unapplied/invalid preferences without mutation. Playhead geometry uses the existing viewport/DPI transforms.

Native labeled controls and keyboard submission support exact bar:beat:tick seek, human-readable routing, transport and export. Existing lane/clip DOM alternatives/history shortcuts remain. Dark/light and650px/2xDPI checks passed; final routing checkbox layout and collision messages were refined after actual screenshot inspection. No broad PATCHBOOK/MOTIF redesign or final brand change. Screen-reader certification/contrast instrumentation are not claimed.

Screenshots: [`output/canvas/milestone-4b/`](../output/canvas/milestone-4b/). Actual Obsidian captures; earlier milestone evidence preserved.

| File | Evidence |
| --- | --- |
|01-canvas-transport.png | Transport with complete arrangement. |
|02-four-lane-ready.png | Four source lanes/repetitions before routing. |
|03-auto-routing.png | Compiled automatic assignments. |
|04-explicit-routing.png | Explicit melodic/percussion preferences. |
|05-channel-conflict.png | Rejected duplicate explicit assignment. |
|06-note-collision.png | Initial full-provenance collision panel. |
|07-source-revision.png | Unreviewed source change blocks compilation. |
|08-export-ready.png | Ready counts/fingerprint/endpoint. |
|09-midi-export.png | Explicit new-file export modal. |
|10-playing.png | Advancing transport/playhead. |
|11-paused.png | Paused state. |
|12-after-seek.png | Playhead at requested musical position. |
|13-dark-arrangement.png | Dark theme. |
|14-light-arrangement.png | Light theme. |
|15-narrow-pane.png |650px layout. |
|16-saved-reopened.png | Cold restart, preserved routing/data. |
|17-recovery.png | Checkpoint inspection. |
|18-save-conflict.png | External modification/stale Save. |
|19-failed-write.png | Failed destination. |
|20-high-dpi.png |2xDPI layout. |
|22-final-routing.png | Final improved checkbox/secondary routing layout. |
|23-final-ready.png | Final deployed build arrangement. |
|24-final-collision.png | Final collision wording and musical positions. |

`21-reaper-import.png` is an **empty REAPER attempt**, excluded from successful Obsidian/interoperability evidence. Initial captures precede the small diagnostic/checkbox refinements;22–24 show the final build.

## K. Performance

Environment: AMD Ryzen75700G,16logical CPUs,29300412416bytes RAM; CachyOS kernel7.3.1-1-cachyos; Obsidian1.15.0/Electron43.8.6/Chromium150.0.7871.250. Guarded main-window host launched with `--disable-gpu`; results are not hardware-independent guarantees.

Synthetic saved sources vary PPQ480/960/1000,4/8/16notes,2/4/6/8-quarter full lengths and velocities. Clips use successive3840tick slots across lanes; every third repeats twice. Each workload uses three full preparations (cold then warm capture). Worker CPU times are separate from host/capture/transfer verification. The reported p95 over three samples is effectively a maximum, not a population estimate. Independent Python times include process startup.5ms heartbeat measures renderer responsiveness, not audio timing. Raw JSON retains all samples/outliers.

| Metric, ms unless stated |4lanes/20clips/4sources |16/200/25 |32/1000/100 |
| --- | ---: | ---: | ---: |
| Expanded notes/events |216/432 |2444/4888 |12200/24400 |
| Full prepare median |74.2 |139.9 |438.3 |
| Full prepare range |70.0–81.6 |138.6–159.3 |435.7–498.9 |
| Worker compile median |4.8 |20.8 |84.9 |
| Worker serialization median |2.0 |7.8 |52.8 |
| Prepared revision recheck median |5.4 |18.3 |71.5 |
| Routing-only median |0.1 |0.1 |6.3 |
| Collision-only median |0.1 |0.2 |1.3 |
| Independent parse/process |25.9 |37.7 |86.6 |
| Audio init median |1.2 |1.8 |4.3 |
| Seek median |0.3 |0.8 |0.8 |
| Stop+settled median |0.0 |0.1 |0.1 |
| Worst heartbeat gap |7.0 |14.4 |54.9 |
| MIDI bytes |2081 |21121 |102042 |

Cold/warm source capture is measured separately in `source-performance.json` after a fresh plugin; each capture itself includes a fresh consistency recheck, and a second verification is timed separately. It uses the same actual public Vault adapter/catalog. Parsing is avoided on cache hits without skipping text reads. Read timing differs from end-to-end preparation, which also verifies the composition and canonical input. The first small cold capture cost132.1ms including initial index startup; later warm small captures were1.4ms. This startup outlier is retained, not hidden.

Renderer-wide heap deltas include GC/background activity: the large workload samples ranged from approximately−114MiB to+61MiB. Worker heap/true peak memory were unavailable; the64MiB estimate is not a proven heap cap. MIDI output is small, but source captures, transferred event/provenance objects and verification have measurable cost. No event-array clone or compile occurs per playhead frame. Largest workload can miss a visual frame; retain bounds and profile transfer/main-thread validation before raising them. Initial uniform-length benchmark results are retained separately; the table uses the final varied-length run.

## L. Automated testing

Commands executed: baseline/final `pnpm check` (strict `typecheck`, ESLint, Vitest, production build), `pnpm dev:vault`, `node scripts/arrangement-fixtures.mjs`, native scripts below, `pnpm audit --json`, script syntax checks, Git diff/secret/ignored-data/preservation checks. **449 tests/37files pass; no tests weakened.** New coverage adds63 tests to the386 baseline, including near-limit expansion, source race/write/cancel recovery, routing/history/UI, worker disposal/golden output, seek/owner/audio failures. Existing MIDI experiments remain passing/unchanged.

Dependency audit: zero vulnerabilities across229 reported dependencies. `package.json`/lockfile unchanged; no install, new license burden or system-wide dependency. The existing pinned midi-file1.2.4 MIT serializer is reused behind strict validation. Audit results are time-specific, not a security guarantee.

## M. Native Obsidian verification

Actual host scripts and results:

- `canvas-4b-native.mjs`: old4A compatibility, four saved PPQ sources, explicit/Auto/percussion routing/history, conflict/collision rejection, source review, export/byte determinism/cancellation/failure, playback controls, theme/narrow/DPI and keyboard seek. Cold restart continuation verifies exact source/routing, recovery inspection/loading/explicit Save, external conflict and module/plugin cleanup during playback.
- `canvas-4b-edges.mjs`: missing/malformed/future sources, supported rename, cancellation, saved-only capture despite unsaved draft, natural silent completion, actual context suspension, edit invalidation and owning-view closure. Temporary synthetic source edits were restored in `finally`.
- `canvas-4b-final-native.mjs`: final deployed build, diagnostic-probe Undo preservation, real MOTIF→CANVAS ownership exchange, settled final Stop and updated screenshots.
- Fresh existing MOTIF, MIDI, PATCHBOOK-assets and foundation native scripts ran under new4B output folders, including their cold-restart/recovery/conflict/cleanup phases. No renderer exceptions were recorded in completed runs.
- `canvas-4b-benchmark.mjs` and `canvas-4b-source-profile.mjs` provide the actual-host measurements above; `canvas-4b-verify.mjs` independently compares native MIDI.

Harness defects encountered and corrected: escaped newlines in CDP script text, a stale selected-panel reference during asynchronous plugin restoration, checking `stopped` instead of the correct terminal `disposed` state on plugin unload, and the MOTIF button label. The first recovery phase had already saved successfully before a harness continuation, so it was resumed explicitly rather than relabeled as another cold restart. A unit assertion initially expected explicit removeEventListener calls; it was corrected to verify no handler invocation after AbortSignal disposal. No production guarantee or historical test was weakened.

Actual screenshots exposed an over-stretched routing checkbox and generic collision wording; both were fixed and the final build recaptured. A50ms seek-lead position clamp prevents the displayed playhead briefly moving backward; owner-specific errors remain visible after resources release. Regression suites and final-host checks passed after production fixes.

Unverified: Windows/macOS/other Obsidian installers, physical MIDI/devices, audible output/device latency, sample accuracy, screen readers, successful external DAW import. Independent MIDI parsing is verified; REAPER attempt is explicitly unsuccessful. No unsupported result is marked passed.

## N. Architecture decisions

See [R01–R10](DECISIONS.md#prompt009--milestone4b). Principal choices: extend shared events/transport/worker/serializer; preserve schema1 explicit-channel uniqueness; derive conservative Auto sharing; bound expansion; exact revision capture with honest races; preserve all excluded metadata; no new dependencies/framework/persistence/history bus.

New production files are the arrangement compiler/capture/preparation/routing/collision/audition/export/job contracts, shared MIDI serializer and two CANVAS UI components. Narrow shared changes add provenance/consumer bounds, transport offsets, revision hashes for composition heads, owned optional channel removal, source-draft revision exposure, source-safe export hook and owner-specific module cleanup. Tests/scripts/original synthetic golden data and current docs are added/extended. Earlier reports/experiments remain untouched. No legacy component was adopted; no legacy reuse authorization is requested.

## O. Milestone4C readiness

Ready for human review of the basic arrangement compilation/export/audition workflow within current bounds. Stable saved motif/composition identities, exact source PPQ, shared event provenance, conservative channels and MIDI writer are available for future scoped work. Sections, markers, recording-reference UI, snapshots, maps, channel-wide programs/controllers and advanced mixing are not implemented. Their existing stored data remains preserved and explicitly excluded from this derivative.

Potential future work, **not approved here**: improve source-review/diagnostic density; test more DAWs/platforms; measure real audible latency/seek continuity; profile event transfer and verification near limits; decide pinned revisions/snapshot product behavior; then separately scope sections/markers/recording references and shared visual refinement. Broader routing, same-channel cross-track boundaries, maps/schema changes and release licensing need review. No4C code or final brand work was started.

## P. Repository state

One new local signed commit:4A baseline **3f5c67f**.4B implementation/tests/docs remain uncommitted for review; final exact path manifest/count is retained in `docs/validation/milestone-4b-native.json`. No staged changes or unresolved conflicts. No remote configured/pushed, no publication. Signing configuration unchanged.

All work used the marked `dev-vault` and project-local runtime/output paths. Dependencies/generated bundles/vault/profile/screenshots remain ignored; source/tests/required configs/golden fixture remain visible to Git. Final deployed bundle/manifest/styles match their build inputs. No personal vault/music files were accessed or modified. REAPER used only its explicit project-local configuration and original synthetic fixture.

TROUBADOUR remained read-only, unexecuted and uncopied. Final121tracked-file aggregate SHA256 matches baseline `4e217cc4f22b1a049470feb31d5955ece52542619497e97c0924e592f6928ff2`; HEAD remains `bc2749e2877738bd443a1d3ace66f919d23fe837`. Its Git state was not changed. Previous milestone reports/evidence and experiments were preserved. Final isolated host/audio resources were stopped after validation. **Stop after4B for human review.**
