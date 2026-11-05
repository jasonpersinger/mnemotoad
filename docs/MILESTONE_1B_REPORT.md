# Milestone 1B — MIDI, playback and rendering feasibility

Date: 2026-11-05. Scope: user Prompt 003 only. **Feasibility objectives met with the failed workload and unverified behavior below explicitly retained. No production musical editor, arrangement editor or synthesizer library was implemented.** Recommendations require review before production adoption.

## A. Executive summary

Implemented isolated exact-time/tempo-map math, a shared deterministic musical-event compiler, an injected-clock lookahead transport, a quiet Web Audio test tone, shared grid geometry/culling, and native rendering/arrangement probes. Production `src/`, persisted schema 1, settings, commands and module shells are unchanged. The experiment plugin is separately built, disabled by default, and restricted to the marked project-local disposable vault.

The initial **signed local commit `70f45df`** preserves the verified Milestone 1A foundation. Its signature verifies as good. Initial signing failed because terminal pinentry was unavailable; the user unlocked the key and the signed retry succeeded. No signing configuration was altered or unsigned commit substituted. All 60 original candidate files were reviewed/staged after ignore/credential checks. One historical trailing space in TECHNICAL_RESEARCH was preserved rather than revising the baseline.

Verification: **123 automated tests across 13 files pass**, including all original 74 tests; strict typecheck, lint and production build pass. Native Linux Obsidian 1.15.0 validates the foundation again and the isolated experiments: real AudioContext scheduling, pause/resume, 50 start/stop cycles, 20 play/view-close cycles, unload/cancellation, an offline onset probe and 21 bounded rendering cases. No renderer exceptions were observed in the successful workload.

Recommended direction: source PPQ preservation with exact transient timing and explicit export quantization; one shared pure compiler; native Web Audio scheduling; culled Canvas 2D plus native DOM controls and an accessible list. Small independently written modules are preferable to legacy extraction here. `midi-file` remains a dev-only candidate requiring an outer structural validator. No existing code-reuse authorization is assumed.

## B. TROUBADOUR findings

The prompt's `/home/troubadour` remains absent. The earlier explicit user correction to `~/troubadour` authorizes `/home/jason/troubadour`; current AGENTS/audit document it. Read-only inspection used that corrected path at HEAD `bc2749e2877738bd443a1d3ace66f919d23fe837`. No dependencies, scripts, tests or builds were executed there. See the [complete audit](TROUBADOUR_AUDIT.md) for original project context.

Paths below are relative to that legacy root. Classification is technical advice, never import permission.

| Component / symbols | Verified source | Findings / compatibility | Recommendation |
| --- | --- | --- | --- |
| Note/motif contracts, PPQ/GRID | `src/core/model.ts` | Integer notes with explicit optional source PPQ, default 96/grid 24; song-owned motifs and bars differ from MNEMOBARD's standalone records. | **REFERENCE ONLY**; retain new schema 1 contracts. |
| `barsToTicks`, `sectionSeconds`, `maxPolyphony`, `transpose`, `stretchDouble`, `motifPpq` | `src/core/music.ts` | Readable small helpers; half-open polyphony orders ends before starts. Timing is fixed-tempo and some helpers inherit default 96/old length rules. | **REFERENCE ONLY**; new exact timing/compiler already demonstrate the needed boundary. Copy/adaptation adds little value. |
| `gridTicks`, `moveNote`, `resizeNote`, `insertNote`, `musicalPosition`, `positionTicks` | `src/core/note-edit.ts` | Delta snapping preserves off-grid phase; left resize preserves end. Per-note clamping, motif bars and rounding are coupled to old editing limits. | **REFERENCE ONLY** for production gesture semantics. Independently implement group bounds/undo and source-PPQ commands later. |
| `scheduleVoice` | `src/audio/voices.ts` | Browser oscillator/gain/envelope scheduling and ended-node disposal are relevant; multiple voice presets exceed the test-tone need. | **REFACTOR AND REUSE** is technically possible after rights/authorization and adapter tests; currently reference only. The independent sine harness is sufficient. |
| `previewGain` | `src/audio/levels.ts` | Conservative partial/velocity/release-tail headroom including looping; tied to legacy playback plans. | **REFACTOR AND REUSE** candidate if richer voices are later approved. Independent conservative fixed test-tone gain is adequate now. |
| `Transport.playPlan`, `stop`, `dispose`, generation/abort and hidden-page handlers | `src/audio/transport.ts` | Lazy shared audio, 25ms poll/150ms lookahead and cleanup patterns help. Fixed-tempo plan; overdue events can catch up in a burst; mobile audio-session and comparison behavior are unnecessary. | **REFERENCE ONLY**; rebuild a narrow transport with explicit late/stall policy. Do not port the class wholesale. |
| Old piano roll/section arrangement and MIDI codec | audit source inventory | Coupled UI/entity semantics and old scale limits; no evidence of the new multilane editor or exact variable-tempo arrangement pipeline. | **REBUILD** for the new contract; use audit lessons only. |

No component qualifies for direct reuse under current rights/contract evidence. Legacy code has no confirmed redistribution license; ownership/provenance remains unresolved. No new legacy extraction approval is needed to proceed with the independently implemented direction. Optional future L3 evaluation should name `voices.ts`/`levels.ts`, clear rights, preserve origin and add lifecycle/headroom tests first. Approximate adaptation cost: small music/edit helper extraction 0.5–2 engineer-days plus contract tests; voice/headroom boundary 1–3 days; whole transport/editor port not recommended. These are planning estimates, not measured savings.

## C. MIDI timing

`experiments/timing.ts` implements reduced BigInt fractions in quarter-note units, explicit supported PPQ 1–32767, integer source ticks, `ticksAt`, `quantizeTicks`, meter math and `TempoMap`. Integer ticks remain the source record representation; fractions are transient and never persisted to JSON. A 960 editing resolution remains provisional and does not normalize original imports.

| Source PPQ | Source tick 1 at destination960 |
| --- | --- |
| 96 | 10 ticks, exact |
| 480 | 2 ticks, exact |
| 960 | 1 tick, exact |
| 1000 | 24/25 tick, retained exactly |
| 32767 | 960/32767 tick, retained exactly |

Default integer projection rejects non-integral values. Explicit nearest rounding ties toward the later tick and returns the signed rational error; floor is separately explicit. Example: 24/25 becomes 1 with +1/25 tick error. No note duration is silently repaired. Production endpoint rounding/minimum-one-tick warnings and post-quantization overlap/bounds validation remain to be implemented under the [existing proposed data policy](DATA_MODEL.md#milestone-1b-timing-boundary). Repetition is evaluated in exact source units before any final projection, avoiding accumulated repeat rounding.

Tempo changes must begin at tick 0, be unique/strictly ordered and use integer microseconds/quarter 1..0xFFFFFF; more than 10,000 changes are rejected. Segments retain exact integrated microseconds with binary lookup. At PPQ 960, tempo 500,000 until tick 960 and 1,000,000 thereafter gives tick 480=.25s,960=.5s,1440=1s,1920=1.5s. Exact inverse mapping recovers the source position. Floating seconds-to-ticks preserves the input Number's decimal representation and returns fractional ticks; it cannot recover precision already lost in a floating caller. Web Audio receives floating seconds only at its adapter boundary.

Meter labels do not alter quarter duration: 6/8 is three quarters/bar, 4/4 four. Meter-map editing and storage are not implemented. Schema1 remains fixed tempo/meter despite the richer isolated mathematical experiment. Invalid PPQ, unsafe/negative/fractional source ticks, malformed tempo maps and unsupported divisions produce named actionable errors.

SMPTE detection reads bit 15 of the raw 16-bit MIDI division. Valid negative frame codes -24/-25/-29/-30 plus nonzero ticks/frame are recognized and **rejected before PPQ conversion**, with an instruction to supply PPQ MIDI. -29 is drop-frame timing, not an approximation to 29 fps. Unknown codes or zero ticks/frame are malformed errors. No SMPTE data is retimed. [Microsoft timing reference](https://learn.microsoft.com/en-us/windows/win32/multimedia/timing-information), [official SMF specification entry](https://midi.org/standard-midi-files).

Tests cover PPQ 96/480/960/1000/32767, explicit rounding/error, tempo crossings/inverse, meter units, all four SMPTE codes and malformed timing. Candidate MIDI tests retain exact source PPQ/event deltas and trailing rests in a known 35-byte Type 0 fixture and typed Type 1 tempo/meter fixtures. This is targeted timing feasibility, not certification of arbitrary MIDI round trips.

## D. Shared event compiler

`experiments/compiler.ts` defines readonly `SourceNote`, `SourcePattern`, `Clip`, `Track`, `Sequence`, `TimedEvent` and `CompiledSequence`. Patterns own source PPQ/length/notes; clips own offset/repeat count; tracks own stable IDs/channel/optional patch reference; the sequence owns its tempo map/length. No Obsidian, DOM, Web Audio or persistence imports are present.

Compilation produces immutable on/off events carrying exact rational destination ticks, floating seconds from one map, track/channel/patch reference, pitch/velocity and deterministic voice ID. Off events precede on events at the same tick, followed by channel, track, pitch and voice-ID order using locale-independent comparisons. Reversing chord input order produces the same result. Empty tracks preserve sequence duration/rests; clipped or overlong sources are rejected rather than trimmed.

Overlapping different pitches and the same pitch on different track channels are supported. Same-channel same-pitch overlap is rejected with source voice/clip identity because ordinary MIDI note-off pairing is ambiguous. The prototype requires distinct track channels, validates note bounds/IDs/velocity, limits 16 tracks/1,000 clips per track/100,000 expanded notes, and guards repeat counts and pattern lengths. These are experiment limits; existing persisted motif limit 10,000 and composition limits are unchanged. Rendering20,000 synthetic notes does not authorize raising stored-record limits.

Both preview and export can consume this representation. A test feeds compiled positions through the explicit integral projection into `midi-file`, then checks parsed absolute ticks and the same playback seconds. No second tick-to-seconds formula is hidden in the transport. Fractional export policy, controller/metadata compilation, snapshot capture and production preflight remain separate future work. Cancellation belongs to the transport generation/voice ownership, not to mutable compiler output.

Tests cover single notes, chords, deterministic ordering, offsets/repeats with non-divisible PPQ, overlap rules, off/on boundaries, tempo changes, empty sequences, invalid notes/bounds/channels/duplicate IDs and candidate writer consumption. The model can support both editors without separate timing systems, while schema adapters and production export policies still need review.

## E. Playback scheduling

`experiments/transport.ts` uses injected `PlaybackSink` and `TimerPort`; `web-audio.ts` creates one lazy context per experimental view and quiet sine voices. It is not patch playback or a production instrument library. Timer25ms, lookahead100ms and initial lead50ms are experiment settings, not guarantees. Events use AudioContext timestamps; UI position is a separate derived value. Repeated cycles get distinct playback voice IDs so prior release tails cannot collide with the next cycle.

Stop synchronously cancels its timer, pending starts and all active/future voices; generation guards prevent a pending resume from resurrecting playback. Dispose closes the context. Pause cancels voices and stores position; resume retriggers notes still held in the half-open interval for their remaining duration, without replaying earlier notes. A >100ms audio-clock or monotonic-wall polling gap, suspended context or overdue event stops with diagnostics instead of catching up. Future production ownership should be one shared transport/focus service rather than this view-local adapter.

Native measurements and cleanup:

| Measurement | Native result |
| --- | --- |
| Wall poll interval | n=128; median 25.00ms; p95 25.10ms; range 24.70–25.30ms. |
| Scheduling lead | n=15; median 84.67ms; p95 98.67ms; range 50.00–98.67ms. |
| Audio-clock delta between polls | n=129; median 42.67ms; p95 42.67ms; range 0.00–85.33ms. |
| Native input dispatch to handler/layout | n=41; median 1.10ms; p95 8.70ms; range 0.20–8.70ms. |
| 50 start/stop cycles | Cumulative 59 voices created / 59 released; zero remaining voices/timers. |
| 20 play/view-close cycles | Each context closed, zero voices/timers; unload also removed the command. |
| Controlled 250ms stall | Playback stopped: scheduler stalled for 256.0 ms; no catch-up burst. |

Reported base latency42.67ms and output latency128ms are host API values, **not measured acoustic latency**. Audio currentTime deltas are coarse on this sink and differ from wall timer intervals. The offline pulse probe observed exact requested frames 6000/24000/72000 at 48 kHz; it validates offline scheduling arguments only. No sample-accurate real-time or audible-onset claim follows. [Web Audio scheduling guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques), [output timestamps](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp).

The lab stops on window blur/pagehide/hidden-document, closes resources on view closure and plugin unload, and cancels pending benchmark animation frames. Native blur behavior was exercised with a synthetic blur event; actual background throttling, OS sleep, audio-device change, 10-minute drift and physical loopback were not tested. Deterministic tests also cover failed resume/schedule, frozen audio clock, suspended state, end-boundary resume and disposal during asynchronous start.

## F. Piano-roll and arrangement rendering

Environment: AMD Ryzen 7 5700G, 16 logical CPUs, 29,300,412,416 bytes RAM, Linux kernel 7.3.1-1-cachyos; Obsidian 1.15.0 / Electron 43.8.6 / Chromium 150.0.7871.250. Native viewport 1053×827, reported DPR 1.046875; fixed benchmark surface 960×360 CSS pixels. The isolated launcher uses **--disable-gpu**. There is no hardware-accelerated, browser-only or three-OS extrapolation.

Method: deterministic synthetic notes at 100/1k/5k/20k. Same CSS-pixel rectangle/hit model across all-node DOM, all-node SVG, incremental culled DOM and indexed culled Canvas. Initial time includes index construction/first forced layout. Five warmups precede 30 redraws,20 scrolling frames,20 anchored zoom frames and30 hit/move/resize-preview-plus-render samples. Scrolling includes both time and row offsets. Canvas uses viewport-sized backing at explicit DPR; CSS theme variables color the surface. Grid lines are a static CSS background. No labels, production selection model, persistence or undo workload is included.

DOM/SVG all-node redraw updates every rectangle; culled DOM retains only viewport nodes; Canvas redraws indexed visible rectangles. This compares these implementations, not every possible group-transform/virtualized SVG design. Script/forced-layout submission time excludes physical presentation. Frame intervals are reported separately in retained evidence. Interaction work samples exclude OS input; additionally 41 native CDP pointer/keyboard events measured timestamp-to-handler/layout feedback. Values 0.00ms are below timer resolution, not free work.

All times below are milliseconds. Redraw is median/p95; pan, zoom and hit/preview/render are p95. Visibility is the initial/restored viewport, not necessarily each pan frame.

| Dataset | Notes/regions | Mode | Initial | Redraw median/p95 | Pan p95 | Zoom p95 | Interaction work p95 | Visible | Nodes |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| piano | 100 | dom-all | 2.30 | 0.10/0.30 | 1.60 | 1.80 | 0.30 | 3 | 101 |
| piano | 100 | svg-all | 1.80 | 0.60/0.80 | 1.60 | 1.60 | 1.30 | 3 | 102 |
| piano | 100 | dom-culled | 0.40 | 0.00/0.10 | 0.50 | 0.40 | 0.10 | 3 | 4 |
| piano | 100 | canvas-culled | 1.00 | 0.00/0.10 | 0.20 | 0.20 | 0.10 | 3 | 2 |
| piano | 1000 | dom-all | 19.60 | 1.70/1.90 | 17.20 | 19.20 | 1.50 | 26 | 1001 |
| piano | 1000 | svg-all | 17.30 | 10.20/10.60 | 19.50 | 23.00 | 15.70 | 26 | 1002 |
| piano | 1000 | dom-culled | 1.10 | 0.00/0.10 | 1.50 | 1.10 | 0.10 | 26 | 27 |
| piano | 1000 | canvas-culled | 1.20 | 0.00/0.10 | 0.20 | 0.20 | 0.10 | 26 | 2 |
| piano | 5000 | dom-all | 176.00 | 5.90/6.50 | 174.30 | 185.00 | 6.10 | 129 | 5001 |
| piano | 5000 | svg-all | 158.40 | 136.00/143.00 | 172.40 | 174.00 | 164.80 | 129 | 5002 |
| piano | 5000 | dom-culled | 2.90 | 0.20/0.30 | 2.80 | 2.80 | 0.20 | 129 | 130 |
| piano | 5000 | canvas-culled | 1.70 | 0.00/0.10 | 0.20 | 0.20 | 0.10 | 129 | 2 |
| piano | 20000 | dom-culled | 10.80 | 0.60/0.80 | 11.90 | 14.00 | 0.80 | 501 | 502 |
| piano | 20000 | canvas-culled | 3.40 | 0.10/0.50 | 0.40 | 0.30 | 0.20 | 501 | 2 |
| piano-dense | 1000 | dom-culled | 17.60 | 1.10/1.20 | 19.40 | 19.90 | 1.30 | 1000 | 1001 |
| piano-dense | 20000 | canvas-culled | 8.60 | 13.60/14.60 | 4.40 | 4.50 | 17.40 | 20000 | 2 |
| piano-dpr2 | 20000 | canvas-culled | 4.00 | 0.10/0.20 | 0.40 | 0.40 | 0.20 | 501 | 2 |
| arrangement-16 | 1000 | dom-culled | 1.20 | 0.10/0.10 | 1.50 | 1.20 | 0.10 | 48 | 49 |
| arrangement-16 | 1000 | canvas-culled | 1.00 | 0.00/0.10 | 0.20 | 0.10 | 0.10 | 48 | 2 |
| arrangement-64 | 5000 | dom-culled | 1.80 | 0.10/0.10 | 1.30 | 1.10 | 0.20 | 48 | 49 |
| arrangement-64 | 5000 | canvas-culled | 1.50 | 0.00/0.10 | 0.20 | 0.10 | 0.10 | 48 | 2 |

**Failed/unverified datasets:** the initial 20k all-DOM workload left the native renderer unresponsive and exceeded a 20s Runtime.evaluate watchdog. It has no trustworthy completed-case metrics. Only the verified isolated app was restarted. Subsequent bounded runs preserve results per case and omit that workload. SVG-all 20k and dense DOM 20k were not run; dense DOM is measured at 1k, dense Canvas at 20k visible. Sparse 20k culled results are not evidence that every 20k-visible renderer is fast. The complete successful bounded suite ran again after final runtime changes.

Memory: a Canvas surface has two DOM nodes and 1,515,540 backing bytes at the host DPR; explicit DPR 2 uses 5,529,600 bytes. Sparse 20k culled DOM has 502 nodes; all-node 5k DOM 5,001 and SVG 5,002. The row/time index retains all source regions plus bucket references; these costs are not included in backing bytes. Browser-wide heap deltas include allocation/GC from Obsidian and can be negative, so they are retained as coarse indicators, not per-renderer memory sizes. Post-GC whole-renderer heap grew 316,305 bytes across 20 reopen cycles; two samples cannot prove absence of leaks.

**Recommendation:** culled Canvas 2D for note/clip geometry, DOM controls/rulers/inspectors and a keyboard/screen-reader-accessible virtualized list using the same commands. Keep CSS-pixel geometry separate from backing DPI, cache static layers and repaint active previews incrementally. Both culled DOM and Canvas are viable for sparse regions; Canvas offers bounded node count and much more headroom in measured pan/zoom work. The dense case approaches a frame budget and needs density policies/bounded hit work before a production claim. Native dark theme and basic pointer/keyboard previews were exercised; no screen-reader certification, full equivalent numeric editor, theme matrix or final visual identity was delivered. [Canvas optimization guidance](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas).

Arrangement probes use the same row/time index/viewport rectangles at 16 lanes/1,000 regions and 64 lanes/5,000 regions (12 rows/48 regions visible initially). Synthetic clips include narrow markers and audio-reference categories; these are rectangular proxies, not audio waveforms or a complete lane editor. Culling/zoom/hit math can be shared; note-pitch labels and lane/clip semantics must remain separate controllers. Live motif changes, labels, section notes and accessible timeline manipulation need later work. Model implications: keep clip placement in musical units, lane IDs/channels explicit, geometry transient and compilation authoritative. Do not save pixel positions or infer audio synchronization.

## G. Dependency evaluation

Primary repository/manifests and npm registry metadata were reviewed on 2026-11-05. Published versions/dates below come from registry version metadata, not search snippets or unreleased development branches. Package unpacked bytes include source/maps/examples and are **not runtime bundle sizes**. No unmeasured competitor bundle size is claimed.

| Candidate | Evidence / cost | Assessment |
| --- | --- | --- |
| [midi-file 1.2.4](https://github.com/carter-thaxton/midi-file) | MIT; declarations; arrays/typed arrays, read/write; no runtime deps; published 2023-03-15; 47,239 unpacked bytes. Measured browser export bundle 10,700 minified / 3,155 gzip bytes. | Best low-level candidate; dev-only pinned experiment. Header-only declared tracks are accepted, so outer chunk/track-count/VLQ/event/byte-size validation is mandatory. Throws may be non-Error values. Production adoption remains proposed. |
| [@tonejs/midi 2.0.28](https://github.com/Tonejs/Midi) | MIT; typed higher-level notes/header/tempo utilities; depends on midi-file and array-flatten; 2022-02-04; 287,668 unpacked bytes. | Reasonable convenience alternative; duplicates domain/timing ownership and offers less direct event control. Not installed. Its Header uses PPQ from the parser; reject SMPTE before a PPQ-only high-level path. [Header source](https://raw.githubusercontent.com/Tonejs/Midi/master/src/Header.ts). |
| [midi-writer-js 3.2.1](https://github.com/grimmdude/MidiWriterJS) | MIT; typed generation API; @tonaljs/midi dependency; 2026-03-01; 334,300 unpacked bytes; declares postinstall script. | Serialization-only solution would still require a parser and translation layer. Not needed for experiment; not installed/executed. |
| [Tone 15.1.22](https://github.com/Tonejs/Tone.js) | MIT; typed transport/synth framework; standardized-audio-context/tslib dependencies; published 2025-04-27; 5,401,640 unpacked bytes. | Powerful but broader than test-tone scheduling and introduces transport/context ownership overlap. Native API sufficient for this evidence. Not installed; no claim of measured Tone bundle/performance. |
| [webaudio-pianoroll 0.6.0](https://github.com/g200kg/webaudio-pianoroll) | Apache2; JS custom element, gesture/play callbacks; 2019-01-23; 180,078 unpacked bytes; inspected manifest has no declarations and placeholder test script. | Useful feature reference, weak fit for source-PPQ/shared compiler/accessibility ownership. Prefer measured independent grid. Not installed. |
| [vis-timeline 8.5.6](https://github.com/visjs/vis-timeline) | Apache2 OR MIT; declarations; 2026-10-26; 77,735,048 unpacked bytes across distributions. Generic time/items/groups UI. | Calendar/time semantics need adaptation to musical ticks; different gesture/accessibility model. Not selected; no benchmark of its bundle/runtime. |
| [Konva 10.9.1](https://github.com/konvajs/konva) | MIT; declarations, no runtime deps; 2026-10-31; 1,910,939 unpacked bytes; retained scenegraph/hit layers. | Viable if complex interactive shapes later justify it; current rectangles do not demonstrate the need. Extra scenegraph/layer maintenance deferred. [Maintainer performance guidance](https://konvajs.org/docs/performance/All_Performance_Tips.html). |
| Native Canvas/SVG/DOM/Web Audio | No additional package; browser APIs, explicit cleanup and independently tested geometry/timing. | Selected for experiments; proposed hybrid/native production direction. Accessibility and rendering controllers remain MNEMOBARD responsibilities. |

Older publication dates are maintenance risk indicators, not proof of abandonment. No runtime dependency was added; only midi-file 1.2.4 was installed locally with --ignore-scripts as a devDependency after purpose/native alternative/license/source review. MIT notice retained in [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md); no license conclusion for legacy code. Full pnpm audit reports zero advisories, not a security certification.

## H. Architecture and deviations

The implemented 1A service boundaries, identity, persistence, recovery and module flags are unchanged. Experiment code imports no production repository; synthetic records never enter PATCHBOOK/MOTIF/CANVAS. Only the separate experiment build embeds its authorized development-vault path. Root typecheck/lint now include experiments/tests; main.js still includes none of this code or the MIDI candidate.

Current file changes:

| Created/updated files | Purpose |
| --- | --- |
| `experiments/timing.ts`, `compiler.ts` | Pure exact timing and musical-event contracts/compilation. |
| `experiments/transport.ts`, `web-audio.ts`, `offline-audio.ts` | Injected transport, limited test tone, offline onset check. |
| `experiments/geometry.ts`, `rendering.ts`, `plugin.ts` | Synthetic viewport/index/hit probes, benchmark implementations, isolated temporary view. |
| `scripts/experiments-build.mjs`, `experiments-midi.mjs`, `experiments-native.mjs` | Guarded disabled deployment, candidate bundle/fixture measurement, native runner/evidence. |
| `tests/experiments-{timing,compiler,transport,geometry,midi,deploy}.test.ts`, `tests/support/musical-fixtures.ts` | Independent deterministic/safety contracts and newly authored fixtures. |
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `eslint.config.mjs` | Experiment commands, dev-only candidate and checks. |
| `docs/benchmarks/milestone-1b-native.json`, this report, `docs/superpowers/plans/2026-11-05-milestone-1b.md` | Reviewable measured evidence, findings and execution plan. |
| README, AGENTS, THIRD_PARTY_NOTICES; architecture/data model/roadmap/risks/decisions/development docs; task_plan/findings/progress | Current authority, status, recommendations, limits and reproducible workflow. |

`.gitignore` required no change: dependencies, generated bundles, output, .runtime profiles/caches and dev-vault were already excluded. Source/tests/configuration remain visible to Git. Original docs were extended/reviewed, not replaced by implementation claims.

Scope refinements: exact rational intermediate time is an experiment-informed proposal, not a persisted format change; tempo-map math does not approve tempo-map editing/storage; candidate Type 0/1 fixtures and one compiler-to-writer test replace a full codec implementation; selection/keyboard probes replace a complete accessible editor/list. Existing schema limits remain binding. Production adoption, safe integer-export preflight, sessions/undo, rich controls and final styling are deferred. [Architecture](ARCHITECTURE.md), [decision register](DECISIONS.md), [development workflow](DEVELOPMENT.md).

## I. Tests and verification

| Command / check actually executed | Result |
| --- | --- |
| Baseline `pnpm check` before experimental work | Original 74 tests, typecheck, lint and production build pass. |
| Signed `git commit -m "chore: establish verified Milestone 1A foundation"` | Commit 70f45df, signature G. No remote configured or push. |
| `pnpm add -D -E midi-file@1.2.4 --ignore-scripts` | Local pinned experimental dependency only. |
| Targeted timing/compiler/transport/geometry/MIDI/deploy tests | Pass. A typecheck caught an unchecked fixture byte access; corrected using DataView without weakening strictness. |
| Final `pnpm check` | **123 tests / 13 files pass**, strict typecheck, lint and production build pass. |
| `pnpm experiments:midi` | 35-byte exact Type 0 round trip; browser candidate 10,700 bytes / gzip 3,155. |
| `pnpm dev:vault`, `pnpm experiments:build` | Guarded local deployment; separate 25,439-byte experimental bundle; not enabled by deployment. |
| `pnpm test:obsidian` before/after experiments | Foundation native command/view/settings/data/conflict/recovery/rename/lifecycle checks pass in Linux 1.15.0. |
| `pnpm experiments:native` | Final bounded run passes 15 recorded checks, 21 render cases; trusted native playback start; 50 stop cycles; 20 close cycles; pending-frame cancellation; unload. |
| Native screenshot inspection | Lab is legible in active dark theme; horizontal overflow of fixed benchmark viewport is intentional. Synthetic selection preview present. No final styling approval implied. |
| `pnpm audit --json` | No reported vulnerabilities. |
| Script syntax checks, diff/credential/ignore/path review | Passed; no secrets/private fixtures included. |
| Production source/build preservation | No diff in src/manifest/styles/versions/esbuild config; main.js SHA256 `56d03e28cdb43790f24193c1313db1ddab7428c749f4684606a864432fb724ee`, unchanged after experiments. |
| Legacy tracked hash/Git review | 121 files unchanged, aggregate `4e217cc4f22b1a049470feb31d5955ece52542619497e97c0924e592f6928ff2`, same HEAD and clean tree. |

The failed first all-DOM 20k run is not counted as a pass. Its 20s CDP timeout prompted the documented bounded methodology; later successful native runs retain partial results after every case. Raw native logs/screenshot/JSON are ignored in output/experiments; the sanitized [tracked summary](benchmarks/milestone-1b-native.json) retains measurements and failed/unverified workload labels.

Not verified: physical audibility/loopback/device latency, ten-minute drift, sleep/background throttling, Windows/macOS/mobile/pop-outs, hardware acceleration, complete keyboard/screen-reader equivalence, theme/width matrix, DAW interoperability, strict arbitrary-file MIDI parsing, production live-reference/export snapshot behavior or editor undo. These remain explicit risks; mock/offline tests do not certify them. No foundation data-integrity guarantee was strengthened.

## J. Next milestone readiness, review and preservation

The project is ready for review and separately authorized implementation using these feasibility findings. No fundamental browser/Obsidian feasibility blocker was found for bounded native grids and audition. The failed all-node renderer and permissive MIDI parser are concrete constraints requiring the recommended boundaries.

Production candidates: exact timing primitives and tests; deterministic compiler contract; cancellation/state-transition policies; viewport/index/hit math and measured hybrid direction. **Refactor/harden before adoption:** rendering/controller/accessibility layer, shared transport ownership/diagnostics, schema adapters, captured export snapshots, post-quantization preflight and bounded codec wrapper. **Rebuild rather than promote:** benchmark UI/test-tone app as production editors/synth, all-node grids and legacy section/transport architecture. Do not move experiments wholesale into src.

Review B01–B04 in DECISIONS: source PPQ plus explicit rounding/warnings; fixed-tempo schema 1 vs a future tempo-map design; hybrid rendering/support envelope; native transport pause/focus policies; guarded midi-file production evaluation. Legacy extraction remains unapproved and unnecessary; optional voices/headroom work can be considered only after named rights/reuse approval. License/final branding/migrations remain separately gated.

After approval, recommended order: preserve/harden document-session/undo ownership before musical edits; separately implement PATCHBOOK; establish strict MIDI adapter and production shared timing/compiler/transport; build accessible MOTIF; then CANVAS consumes the same event/geometry services. Require DAW fixtures, combined playback/drag load, OS/device/long-run tests and accessibility evidence before expanding support claims.

Final Git state: one new signed baseline commit70f45df on main; 1B experiments/tests/docs remain intentionally uncommitted and reviewable. No remote configured, push, publication or next-milestone commit. TROUBADOUR was read-only and no source/tests/assets/config were copied. No personal vault or system configuration was changed. Only the task's isolated Obsidian instance and marked disposable fixtures were used; the designated test application was stopped after validation.

**Stop after Milestone 1B. Further implementation requires human review and a separate prompt.**
