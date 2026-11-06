# Milestone 4A — CANVAS arrangement foundation

Date: 2026-11-06. Authority: Prompt008, following report-level engineering and human visual review of3B. This report describes implemented behavior; future recommendations remain unapproved.

## A. Executive Summary

**Milestone 4A passes within the documented desktop/support limits.** CANVAS is a functional multitrack arrangement editor. Users can create compositions, organize lanes, select saved motifs, position/repeat/move/duplicate clips, review source changes, navigate to MOTIF, undo/redo, and safely save/reopen arrangements. The native Linux workflow passed across an Obsidian restart, external conflicts, recovery and module/plugin lifecycle changes.

The full suite passes **386 tests across33 files**, strict typechecking, lint and production build. Native verification includes21 CANVAS groups (14 workflow/restart,5 keyboard/DPI/label/missing-save/close,2 final review/discovery) and58 existing-module/foundation regression groups. Seventeen actual-host screenshots are available at [output/canvas/milestone-4a/](../output/canvas/milestone-4a/). Retained evidence: [validation/milestone-4a-native.json](validation/milestone-4a-native.json).

No arrangement playback, multitrack export, channel allocation, tempo/meter maps, sections/markers editor, recording-reference editor, legacy copying or publication was implemented. Large committed edits and protected saves have measurable cost; Windows/macOS and assistive-technology certification remain unverified. A composition holds live saved references, not immutable snapshots.

## B. Composition Architecture

Authoritative storage remains one Markdown note: stable UUID/YAML envelope plus a versioned `mnemobard-composition` JSON block. Description, tags and notes use the existing metadata contract. New compositions default to120BPM,4/4,960PPQ and64 bars. File metadata remains the existing creation/update timestamp source; no mandatory clock fields were invented.

Ordered lane arrays define display order. New lanes/clips receive UUIDs; preexisting unique local IDs remain valid without migration. Each clip contains its source motif UUID, containing lane UUID, integer start and repetition count. No motif notes are copied. Optional labels and source revision/path/title/last-reviewed-period hints support review and unresolved display.

The schema1 change is compatible for the new reader: `midiChannel` is now optional and lanes are bounded to32, allowing a planner without premature channel allocation. Existing explicit channel/percussion/patch fields remain preserved and validated. No record is migrated merely by opening it; older plugin versions can reject expanded records rather than silently accept them. Unknown portable JSON/YAML fields, existing sections/markers/audio references and unrelated Markdown retain the shared preservation policy. Unsupported versions/maps are protected. See [DATA_MODEL.md](DATA_MODEL.md#milestone-4a-composition-contract).

## C. Motif References

`SourceCatalog` resolves UUIDs from the saved `EntityIndex`. Its immutable summaries contain PPQ, complete length, meter/tempo, note count, path, source-text SHA256 and endpoint GCD. They retain no note arrays. A source revision fingerprints the exact text returned by Vault, encoded asUTF-8; it is not a raw-byte filesystem hash or a musical-only digest. Prose/metadata changes therefore also trigger review.

CANVAS distinguishes ready, missing, moved/renamed, ambiguous UUID, malformed, unsupported and manually archived sources, plus changed/unreviewed revisions and same-instance unsaved MOTIF drafts. Current MOTIF has no archive command; recognized existing `mnemobard_archived: true` / `data.archived: true` flags are handled conservatively. A broken source retains its clip and reviewed display hints. Paths are hints; supported renames keep UUID identity. An unresolved clip's last-reviewed width is explicitly labeled, not represented as a valid current duration.

Source changes are live: saved length changes affect repetition periods and extents; tempo/meter differences are explained. `Acknowledge displayed source revision` checks the displayed hash against the latest catalog and records acknowledgment as one undoable edit. It never freezes notes or writes the source. Navigation opens the source in MOTIF, or its Markdown if that module is disabled. Unsaved MOTIF content is never consumed; other processes/devices' unsaved drafts cannot be detected. Composition JSON path hints do not themselves generate Obsidian backlinks; users can retain/add ordinary wikilinks in prose.

## D. Timing

The pure arrangement layer uses integer composition ticks and BigInt conversion. For source PPQ `P` and arrangement PPQ `A`, every note start/end and the full motif length must convert exactly. A GCD over all endpoints/full length proves divisibility without retaining or expanding notes. Full source length, including trailing silence, determines repetition period; an empty positive-length motif is a rest.

`period = sourceLength*A/P`; `duration = repeats*period`; `end = start+duration`. PPQ480 maps exactly to960; PPQ1000 ticks at multiples of25 map exactly, while a note at tick1 blocks placement. No rounding/resampling occurs. Repetition boundaries are exposed parametrically, avoiding a potentially huge expanded boundary list.

The timeline ruler uses the composition meter, including denominator beats in6/8. Shared exact bar:beat:tick utilities use one-based bars/beats and zero-based stored ticks. Changing grid/zoom/meter does not move existing clips. Composition tempo interprets future arrangement timing; source tempo is not a time-stretch instruction.

Limits:32 lanes,1,000 clips total,1–1,000 repeats/clip, fixed960 arrangement PPQ and4,096-quarter editor length. Pure extent arithmetic is bounded to1e9 ticks. Placement/movement/duplication/repetition reject incompatible endpoints, invalid bounds or unresolved sources atomically. Existing clips that become incompatible/beyond bounds after a source edit are preserved and diagnosed; saving the composition is still possible. Tests cover matching/different PPQ, exact/inexact endpoints and repetition periods,4/4/6/8/3/4, rests, trailing silence, negative/zero/large values and overflow.

## E. Arrangement Editor

The native workspace provides a composition browser/search/create command, title/save/status, collapsed musical settings, grid/zoom/navigation toolbar, fixed lane gutter and viewport Canvas2D timeline. Lane management supports add/rename/reorder/select and explicit occupied-lane deletion confirmation. Reordering preserves IDs; deletion is undoable and never deletes source files.

The saved-motif selector searches valid sources and shows full length, PPQ and note count. Placement accepts bar:beat:tick and repeats before validating the candidate. Clips support pointer selection/drag across lanes/time, numeric/keyboard placement, duplication, deletion, repetition and labels. Same-lane overlaps remain structural data and receive warnings; selected clips render above others. Repetition markers are visually bounded.

Coordinates/hit testing, viewport state, timing, commands and drawing are separate. One Canvas uses native horizontal/vertical scrolling, anchored zoom, DPI backing and viewport culling. Pointer previews update geometry only; release validates and commits one history edit. Escape, lost capture, scrolling/zoom/source refresh and disposal cancel gestures. Source/index changes invalidate cached plans; unchanged source summaries are reused.

Native lane/clip controls, Previous/Next clip and a paged50-item clip list provide keyboard alternatives. Arrow keys nudge the active Canvas selection by the chosen grid; precise controls also retain raw ticks. Save/Undo/Redo/Duplicate/Delete shortcuts are scoped to the active editor, while text-input undo stays native. Focus is restored after contextual controls rebuild. Selection/status/error cues include text/outlines; no screen-reader certification is claimed.

## F. Undo/Redo

`HistorySession<T>` extracts the reviewed MOTIF implementation; CANVAS does not introduce a second history framework. Candidate changes validate completely before commit. One drag, lane operation, placement, repeat change, numeric edit, duplicate/delete or source acknowledgment is one logical entry. Invalid operations preserve the prior arrangement and history.

History is scoped per UUID/session, capped at100 entries and approximately16MiB of serialized before/after snapshot accounting (one oversized entry is retained). Typing groups within750ms; new edits clear redo. Save preserves history and breaks typing groups; clean reload of changed source clears history. External Save conflict retains the draft/history. Transient selection is not musical history; Undo restoring a deleted clip does not promise to restore its prior selection. Dirty sessions survive normal view transitions; clean unowned idle sessions can be evicted after eight, and opening more than20 pending drafts is guarded. Recovery files are never pruned.

## G. Persistence

All reads/writes/checkpoints use the existing `DocumentSession` and `EntityRepository`. Save is explicit. The repository validates proposed Markdown, captures recovery, and uses a conditional source comparison inside the supported public Vault per-file process operation. Stale external text causes a conflict rather than a silent overwrite. It does not provide distributed locking, cross-file transactions or a coherent source snapshot.

Saving a composition writes its own note and recovery artifacts, never referenced motifs. Missing/incompatible references are diagnostics, not a reason to discard the arrangement. Native tests saved with a missing source, restored it by UUID, reopened exact positions/repeats after restart, and preserved externally appended prose on a rejected stale Save. Duplicate IDs/future schemas remain protected by shared validation/indexing.

Applied edits create delayed checkpoints; closing/switching/explicit module-disable attempts a checkpoint. Pending clip/lane/settings forms require Apply or Discard before competing operations; unsubmitted values are not a checkpoint and closing warns about that limit. Unload is not a durable Save guarantee, and very recent edits before successful checkpoint completion remain vulnerable to a crash.

Composition recovery uses the existing bounded checkpoint inspector: discovery, timestamps, original/current/draft inspection, explicit unsaved loading, then normal protected Save. Changed sources require comparison/consent before loading against the displayed current base; a later change still rejects Save. Other module checkpoints may be listed but cannot be edited as compositions. Checkpoints remain append-only. The existing20MiB inspection/32MiB page-read budgets remain intact; large histories require paging/original JSON inspection.

A final regression test found and corrected known optional clip-field removal: clearing a label now removes the owned property on Save instead of restoring it as an unknown extension. Unknown clip metadata remains preserved, and Undo can restore the label.

## H. Visual Design

CANVAS applies Prompt008's provisional dark-first direction: archival heading, prominent timeline, tonal lane separation, violet host accent, rhythmic hierarchy and compact secondary controls. All styling is scoped and based on Obsidian variables. No global dark theme, final typography/artwork/icons, PATCHBOOK redesign or MOTIF redesign was introduced. Default light/dark and620px desktop layouts were inspected; no pane-wide horizontal overflow was measured. Narrow panes show less musical time and require scroll/zoom.

Actual screenshots are indexed in [output/canvas/milestone-4a/README.md](../output/canvas/milestone-4a/README.md):

| Capture | Evidence |
| --- | --- |
|01–03| Empty workspace, new composition, four lanes. |
|04–07| Multiple motifs, repeats, selection and numeric placement. |
|08–11| Lane management, source selector, changed and missing source warnings. |
|12–15| Dark/light/narrow layouts and saved/reopened arrangement. |
|16–17| Changed-source recovery consent and stale external Save conflict. |

These are running Obsidian captures with synthetic data, not mockups. Long names may abbreviate inside clips; the inspector/list retain readable text. Broader cross-module visual unification and final identity remain future human-review items.

## I. Performance

Environment: Linux Obsidian1.15.0, Electron43.8.6 / Chromium150.0.7871.250, Ryzen7 5700G,16 logical CPUs,29,300,412,416 bytes system memory (~27.3GiB), kernel7.3.1-1-cachyos. Guarded isolated host uses `--disable-gpu`; the viewport was1360×1100 at approximatelyDPR1. DPR2 was separately checked. These are hardware/host-dependent measurements.

`scripts/canvas-benchmark.mjs` constructs valid synthetic arrangements, attaches the actual production editor, and measures full view work. Each workload reuses one saved four-note motif, one repeat per clip and regular nonoverlapping placements; this is not a many-distinct-source stress test. Sources/summaries are warm. Initial attach-to-next-frame is one observation; this is not a cold-vault indexing benchmark. Sync draw/reference/selection use15 samples; scrolling/zoom and trusted committed pointer-to-next-frame use12; reorder and Undo/Redo use10; protected saves include recovery/index work across3 samples. Pointer positions are independently checked after each drag. Latency to the next animation callback is not a physical display/input-latency measurement.

| Measurement (ms) |4 lanes /20 clips|16 /200|32 /1,000|
| --- | ---: | ---: | ---: |
| Initial attach → frame (one sample) |8.2|13.8|27.3|
| Synchronous drawing p95 |0.2|0.4|0.4|
| Reference/preflight p95 |0.3|1.1|5.6|
| Selection including contextual DOM p95 |0.9|2.4|7.7|
| Horizontal scroll → frame p95 |10.7|12.8|14.4|
| Zoom → frame p95 |10.9|22.9|10.9|
| Lane reorder including history p95 |3.1|8.0|27.0|
| Undo+Redo pair p95 |5.9|12.6|42.7|
| Committed drag → frame p95 |8.1|14.8|45.4|
| Protected Save median / maximum |45.5 /45.9|119.4 /142.2|409.1 /411.7|

Visible rectangles were12/27/27, and clip-list DOM buttons20/50/50. Serialized entity sizes were8,776 /83,209 /412,050 bytes. Approximate renderer-wide heap deltas were10.8 /-93.7 /14.1MB and are GC/session dependent; the negative middle reading reflects collection of renderer memory, not a negative footprint. These do not establish isolated retained memory. At1,000 clips the existing history budget retained roughly10 entries, demonstrating the byte cap rather than a guarantee of100 large edits.

Culling bounds drawn rectangles and DOM controls; the bounded clip scan remains linear. Drawing is cheap in this workload; snapshot validation/cloning, contextual UI, recovery and indexing cost more. Pointer previews avoid full arrangement/source-note cloning. The final1,000-clip committed drag p95 was45.4ms and protected-save maximum411.7ms. A preceding repeat recorded a66.7ms zoom outlier and431.3ms Save maximum; that slower run remains in the retained evidence. Repeat-to-repeat host/GC/IO variability is real. No validation/history guarantee was weakened. Keep the current bounds, profile representative long sessions/many distinct sources and consider narrowly scoped history/DOM work only with evidence before expanding them. No database or speculative rendering dependency was introduced.

## J. Testing

Baseline: reviewed49 pending3B paths and ignored/generated/private-data concerns, then ran the complete349-test/30-file suite, typecheck/lint/build before the signed restoration commit. Final `pnpm check`: **386 tests /33 files pass**, typecheck pass, ESLint pass, production build pass. New coverage includes composition/commands/history/schema/codec, exact timing, saved catalog/revisions/duplicates/unsupported/malformed/archive states, recovery/conflicts/failed writes, geometry/culling/hits/DPI and native-control lifecycle. Existing tests remain meaningful; two MOTIF asynchronous Save assertions now wait for the Saved state rather than assuming two event-loop turns, because index SHA256 completion is asynchronous.

Commands executed include:

```bash
pnpm check
pnpm audit --prod
pnpm audit
pnpm dev:vault
pnpm dev:obsidian
node scripts/canvas-native.mjs
node scripts/stop-dev-obsidian.mjs
# Relaunch only the guarded isolated application:
node scripts/canvas-native.mjs --verify-restart
node scripts/canvas-benchmark.mjs
node scripts/canvas-edge-native.mjs
node scripts/canvas-review.mjs
```

Existing native scripts were run with separate4A review directories, including their `--verify-restart` phases: MOTIF19 groups, PATCHBOOK assets12, MIDI16 and foundation11. MIDI regression independently parsed exported MOTIF MIDI with the Python standard-library reader and compared supported events/PPQ/tempo/meter/trailing silence. This is regression of3B functionality, not arrangement export or DAW/device certification. `pnpm audit` and production audit reported no known vulnerabilities; no dependency/lockfile changed.

The4A native workflow covers100BPM6/8, four renamed/reordered lanes, saved motif selection, four repeats/trailing silence, exact PPQ480 placement, mouse movement and Escape cancellation, precise tick/bar editing, duplication/delete/Undo/Redo, scoped keyboard nudge/Undo, Save/close/reopen/cold restart, source navigation/edit/review, rename/missing/inexact PPQ rejection, recovery/conflict consent, protected Save, module toggles and plugin reload. Supplementary checks exercise trusted keyboard numeric submission/focus, DPR2, Save with missing sources and owning-view cleanup. Final successful workloads observed no renderer exceptions.

Native testing exposed two issues that compilation/unit mocks missed: a private `open` helper shadowed Obsidian's internal view opener, and Escape propagated beyond gesture cancellation. The helper is now `openComposition`, the test host exercises its open wrapper, and Canvas Escape is consumed locally. Module commands explicitly activate the revealed leaf through the public API. Native pointer harnesses also needed the held mouse button set correctly, and recovery assertions needed to await asynchronous draft loading; final checks verify actual state and visible active views.

Script syntax, diff whitespace, local documentation links/fences/JSON, generated-path ignores, credential-pattern scan, signed commit verification, historical/legacy preservation and deployed bundle matching were checked. Final production bundle is369,017 bytes; generated files remain ignored. Unverified: Windows/macOS, mobile/pop-outs, screen-reader certification, physical output latency, external DAW arrangement interoperability,4B audio/export and multi-process snapshot consistency.

## K. Architecture Decisions

| Components | Responsibility |
| --- | --- |
| `src/arrangement/{sources,catalog,timing,preflight}.ts` | Saved-source summaries/cache, exact arithmetic, structured planning diagnostics; no Obsidian/DOM/audio dependency. |
| `src/modules/canvas/{commands,session,library}.ts` | Validated transactions, shared history, source review, repository/recovery ownership and bounded clean sessions. |
| `src/modules/canvas/{geometry,timeline}.ts` | Pure coordinate/culling/hit logic and owned viewport drawing/gestures. |
| `src/modules/canvas/{view,inspector,motif-picker}.ts` | Native browser/workspace/keyboard/lane/clip/selector and recovery entry point. |
| `src/application/history-session.ts`, shared `music/{grid,positions}.ts`, `ui/canvas-metrics.ts` | Existing MOTIF behavior extracted with compatibility exports; one history/position implementation. |
| Existing index/document/domain/main/services | Scalar index heads + saved SHA256 revisions, compatible schema/known optional-field ownership, service wiring and lifecycle/command activation. |
| Tests, `scripts/canvas-*.mjs`, scoped CSS and current docs | Deterministic contracts, actual host flows/measurements/review evidence. |

No new dependency, framework, event bus, musical database or competing persistence system was introduced. The composition contract was relaxed/extended compatibly for Prompt008 instead of preserving the obsolete sixteen-allocated-lane proposal. Exact-only timing supersedes the old rounded-export suggestion. `HistorySession` is an extraction of current MNEMOBARD code, not TROUBADOUR or wholesale experiment adoption. MIDI/audio/compiler production behavior remains unchanged. Historical reports,1B experiments, dependency manifest/lockfile and legacy audit are preserved. [DECISIONS.md](DECISIONS.md#prompt008--milestone-4a) records scoped authority and remaining gates.

## L. Milestone 4B Readiness

CANVAS now provides stable composition/lane/clip/source UUIDs, exact placement/repeats, saved-source revision review, shared history, safe persistence/recovery and a useful native arrangement workspace. It is ready for human review and a separately scoped4B prompt; it is not automatically ready to emit/play every valid arrangement.

|4B concern|Required next decision/work|
| --- | --- |
| Arrangement event compilation | Reuse pure timing/preflight and the existing deterministic musical compiler after capturing validated source notes/revisions. Summaries alone cannot supply sounding events. Bound expansion and retain full-length silence. |
| Final MIDI channels | Define allocation/reuse/failure policy across at most16 channels, including percussion and existing legacy assignments. Thirty-two planner lanes do not imply32 channels. |
| Same-channel/pitch conflicts | Detect cross-clip/repetition collisions with source/clip/note IDs. Preserve data and reject unsupported output; never shorten/drop/merge silently. |
| Multitrack MIDI export | Establish conductor/lane tracks, exact endpoints, source snapshot/recheck, destination collisions and independent output fixtures before enabling serialization. The MOTIF exporter is not an arrangement exporter. |
| Playback/transport | Define one owner, audio-clock scheduling/UI playhead separation, cancellation, source changes during playback, focus/close/disable/unload, underrun and expansion limits. No engine was added in4A. |
| Tempo/meter | Keep one composition tempo/meter unless a new map/schema scope is explicitly approved. Source differences remain musical metadata, not stretching. |
| Source revision policy | Live references are approved for4A; multi-file coherent capture, changed sources during capture, and any pinned historical snapshots need explicit policy. No transaction claim. |
| Sections/markers/recordings | Existing data is preserved, but their editor/interpretation is unimplemented. Scope separately; no audio mixing/waveform/automation assumptions. |
| Performance/compatibility | Review measured1,000-clip costs/history depth and test larger distinct-source/long-session workloads and additional desktop platforms before broader limits. |

Required human approval:4A usability/visual/support review and the next4B implementation scope/policies. Final branding, release license/publication, destructive migrations, broad cross-module redesign and all legacy copying remain separate. No TROUBADOUR component adoption is requested.

## M. Repository State

Signed local baseline **`50583e1` — `feat: preserve verified Milestone 3B MIDI interoperability foundation`** verifies good. The49 pending3B paths were reviewed before committing; the tree was clean at that restoration point. Existing3A restoration `90eed00` remains in history. Signing configuration was neither changed nor bypassed. No additional4A commit is created automatically; work remains uncommitted for review.

Pending changes cover the production components/tests/tools/current documentation listed above; full paths are retained in the validation JSON. Final tree:60 changed/new paths (31 modified,29 untracked), none staged and no unresolved conflicts. Generated `main.js`, dependencies, disposable vault/profile, caches and `output/` remain ignored. No stage/conflict/remote configuration or push/publication action occurred. Historical reports/audit/experiments/package manifest/lockfile are unchanged from the signed baseline. The deployed plugin artifacts match the final production build; screenshot evidence for earlier milestones was preserved by routing regressions into4A subdirectories.

TROUBADOUR remains clean at `bc2749e2877738bd443a1d3ace66f919d23fe837`:121 tracked files, aggregateSHA256 `4e217cc4f22b1a049470feb31d5955ece52542619497e97c0924e592f6928ff2`, matching the audit baseline. No legacy source/assets/tests were copied, executed or modified. No personal vault/music project, unrelated project or system configuration was changed. Native tests used synthetic files only in the marked project-local vault and isolated profile. Only that verified isolated process is stopped after flushing test checkpoints/resources.

**Stop after Milestone4A for human review. Milestone4B has not begun.**
