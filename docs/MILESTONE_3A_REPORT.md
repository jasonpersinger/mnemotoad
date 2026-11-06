# Milestone 3A — Production MOTIF foundation

Date: 2026-11-06. Authority: user Prompt006; implementation stops at3A.

## A. Executive Summary

MOTIF now provides a working piano roll inside Obsidian: create a phrase, draw melody/chords, select and edit notes, undo/redo, audition, explicitly save, reopen and continue editing. Its browser and musical recovery entry point replace the placeholder. PATCHBOOK remains functional; CANVAS remains a placeholder.

**Milestone3A passed in the tested Linux Obsidian1.15.0 environment.** Verification comprises278 tests in26 files, strict typecheck, lint, production build,24 grouped native MOTIF checks,12 PATCHBOOK regression checks,11 foundation checks and12 actual MOTIF screenshots. Cold restart, protected conflict rejection and explicit draft recovery were exercised. [Retained validation summary](validation/milestone-3a-native.json) contains measurements and check descriptions. This establishes a usable basic editor, not MIDI interchange, universal platform support or release readiness.

Principal limits: same-pitch overlaps remain rejected by the existing schema; timing-map editing is unsupported; audition uses a quiet sine voice; history is bounded and not persisted; very recent unconfirmed drafts can be lost on abrupt shutdown. Windows/macOS, screen readers, physical audio latency and long-session memory behavior remain unverified.

## B. Musical Data Model

One schema1 Markdown note retains its UUID/title/tags in YAML and one `mnemobard-motif` JSON block. The block contains schemaVersion, source ppq, integer tempoMicrosecondsPerQuarter, meter, explicit lengthTicks and notes. Notes retain local stable IDs, integer MIDI pitch/start/duration/velocity and supported unknown properties. New note IDs are UUIDs; old valid local IDs are preserved. Optional description and user notes now map to `mnemobard_description` and `mnemobard_notes`; no migration or second authority was introduced. See [DATA_MODEL](DATA_MODEL.md#milestone3a-production-motifs).

New motifs default to120BPM,4/4,960PPQ and15360 ticks (four4/4 bars). Existing PPQ1–32767 is retained. Tempo accepts20–300 quarter-note BPM and converts once to integer microseconds using rounding; the stored value determines playback. Changing tempo changes elapsed seconds without moving notes. Changing meter changes ruler/bar interpretation without moving notes or silently changing length. PPQ can be changed only while the motif is empty. Length changes reject notes beyond the proposed end.

Persisted ticks remain exact source integers. Transient timing/compiler math uses BigInt fractions; only audio-clock seconds use floating point. Quarter/eighth/sixteenth/eighth-triplet grids require integral steps in the current source PPQ. An unavailable subdivision produces an actionable error; grid/zoom changes never retime existing notes. Snap off still addresses source ticks, not arbitrary fractions. Numeric editing bypasses snapping.

Validation rejects malformed pitch/velocity, negative starts, nonpositive durations, invalid tempo/meter/PPQ, duplicate IDs and out-of-bounds or excessive data. Chords and overlapping different pitches work. **Overlapping same-pitch notes remain unsupported**, preserving the approved foundation's ambiguity rule; adjacent same-pitch notes are valid with note-off first. No silent clamping or note dropping occurs. The production editor supports at most10000 notes and4096 quarter notes. Larger/unsupported originals remain available as Markdown. Recognized tempo/meter-map extensions block editing/audition; they are preserved rather than flattened. Future entity/block versions remain read-only.

## C. Piano-Roll Editor

`src/modules/motif/geometry.ts` owns musical/pixel transforms, anchored zoom, rectangles, hit testing and a pitch-row interval index with prefix maximum ends. Long notes crossing the viewport are included. `renderer.ts` draws only visible notes/grid/pitch labels into one viewport-sized Canvas. `piano-roll.ts` owns scrolling, DPR scaling, pointer capture/preview, observers and requested frames. Musical commands never depend on pixels or host APIs.

Draw mode adds notes to empty grid positions; Select mode and modifier selection support groups. Drag moves time/pitch, the right edge resizes, and Delete/Duplicate act on selection. Group bounds reject the whole operation. Escape, cancellation, scrolling, zoom or closure cancels an uncommitted gesture. A duplicate is placed after the selected region and receives new IDs. Explicit numeric Apply edits pitch, start, duration and velocity without grid rounding. Length must be extended explicitly before placing a note past its end.

Controls include rhythmic grid/off, default duration, horizontal and vertical zoom, native two-axis scrolling, beat/bar ruler and pitch labels. Selection survives navigation. High-DPI backing is separate from CSS hit coordinates. The accessible note register is paginated50 notes at a time instead of creating thousands of DOM nodes. Previous/Next note, Add, Delete, numeric fields, Save and transport are keyboard operable; selection has a border/marker and text count as well as color. Pending numeric/musical settings are labeled and must be applied or discarded before Save. Screen-reader certification and a full assistive-technology audit were not performed.

## D. Undo and Redo

`MotifSession` owns history per motif UUID. Validated before/after snapshots cover creation, movement, resize, deletion, duplication, numeric/velocity and supported musical-property changes. Pointer previews create no entries; pointer-up commits one logical operation. Typing in the same metadata field coalesces for750ms. A new edit clears redo.

History is limited to100 entries and an approximate16MiB serialized UTF-16 snapshot budget, retaining at least one operation even if that entry exceeds the estimate. This is not an actual JS heap bound. Save retains history and ends a typing group; undo back to the saved semantic value reports Saved. A clean reload with changed source clears history. Conflicts retain draft/history; explicit discard or plugin unload disposes them. Switching/closing views retains the shared in-memory session; one motif's history cannot edit another. History/selection are not restored after application restart; explicit checkpoints restore the draft as a new session.

Focus-bound public Obsidian keyboard scopes handle Ctrl/Cmd+S, undo/redo and musical selection/deletion only in MOTIF. Native text-field editing retains its usual keys. Native Delete/Ctrl+Z/Ctrl+Shift+Z/Ctrl+S and keyboard numeric Apply were verified, including one-entry group drag and Escape cancellation.

## E. Playback

`src/music/compiler.ts` is a new pure deterministic note-to-event compiler with track/channel/optional patch identity, source-resolution fractions, tempo-map interpretation, stable ordering and explicit bounds. Equal-time note-offs precede note-ons; the compiler then orders by channel/track/pitch/voice. It serves the future shared event boundary without implementing arrangement clips or export. MOTIF compiles one part on its retained importSourceChannel when present (otherwise channel0); stored per-note channels are not introduced in schema1.

`MusicalTransport` uses the audio clock with25ms polling,100ms lookahead and50ms initial lead. Canvas redraws never choose musical timestamps. `SineSink` creates a lazy AudioContext and quiet oscillator/gain voices on user Play. Each note-on schedules its known release/end immediately, protecting against a stalled UI sustaining a voice indefinitely. Explicit note-off events remain part of the shared plan. Release ends approximately15ms after the musical endpoint. Maximum audition polyphony is64 and pending voice resources256; exceeding bounds stops with an error rather than dropping notes.

Stop cancels pending scheduling, silences/disconnects voices and closes the context. Generation guards prevent pending starts from reviving after stop/disposal. Switching motifs, changing musical drafts, closing the owner, disabling MOTIF, plugin unload, blur/pagehide/hidden document and playback errors stop audition. PATCHBOOK recordings and MOTIF audition exchange exclusive focus. Repeated playback creates no accumulating tracked timer/voice/context resources in the tested cycles. There is no pause, loop, seek, external MIDI, sample instrument or patch hosting in3A.

Native evidence recorded three simultaneous voices, a running context and live playhead at2.467 seconds. Sampled scheduling leads were58–99.3ms, with approximately42.7ms audio-clock polling gaps in this run. These are requested scheduling timestamps, **not measured audible onset latency or sample-accurate output**. Ten native start/stop cycles, context suspension error cleanup and audio-focus exchange passed. Fifty deterministic fake-clock cycles and error/race cases are unit-tested. A >100ms wall/audio gap, suspended context or late event stops with a diagnostic instead of catch-up playback. Sleep/resume, long playback drift, physical loopback and device changes need broader testing.

## F. Persistence and Recovery

`DocumentSession<T>` extracts the existing PATCHBOOK draft/save/checkpoint behavior for both modules. Thin PATCHBOOK wrappers preserve its contracts. `EntityRepository`, source-range Markdown codec and ID index remain the sole persistence foundation. Supported unknown JSON/YAML fields and unrelated prose survive updates; note identity does not depend on a filename. New musical optional fields extend schema1 compatibly.

Explicit Save validates a candidate, checks source revision, creates a recovery copy, then checks exact expected bytes again inside public `Vault.process`. External edits, including prose-only edits, reject stale saves and retain draft/history. Backup failure aborts replacement. A failed acknowledgement can mean bytes already reached disk: inspect the source/recovery and reread before retrying. This is a per-file host operation, not a distributed, multi-file or crash-durable transaction. No automatic merge, rewrite of future schemas or destructive migration exists.

The visible states distinguish Saved, Unsaved changes, Saving, Not saved/conflict and Unsaved changes with a confirmed recovery copy. Checkpoint debounce is500ms; navigation/module disable awaits checkpoints. Shared sessions preserve ordinary close/reopen transitions. Very recent changes before checkpoint confirmation and unapplied numeric controls are not crash-durable; plugin unload releases resources without pretending an asynchronous final save completed.

`CheckpointRecovery<T>` and the shared inspector read existing repository and editor-draft formats. MOTIF's validator rejects nonmusical checkpoints; PATCHBOOK does not acquire authority to edit musical data. Recovery discovery shows source status/timestamp, original/current/draft inspection and an explicit Load draft without saving action. Changed sources require comparison acknowledgment and a fresh conditional base check; subsequent Save still rejects new external changes. Recovery never automatically overwrites, merges, restores or deletes data. Malformed/future entries remain inspectable where safely bounded. Storage growth is append-only; the existing20MiB inspection,100-entry page and32MiB discovery budget apply. No retention/pruning policy is added.

Native cold restart retained saved musical bytes, IDs, PPQ/tempo/meter and reopened notes. The pending draft was discovered and loaded without changing authoritative text, then explicitly saved through normal protection. A subsequent external edit produced a conflict while preserving both versions and a checkpoint. PATCHBOOK's independent cold-recovery regression also passed.

## G. Interface and Design

The browser supports New, name search, UUID-based opening, Markdown navigation and diagnostic access for unavailable/ambiguous/unsupported records. The editor contains title/status/Save, transport, collapsible musical settings, editing controls, piano roll and note register. Description/tags/user notes are editable. Unavailable records produce an actionable message and access to their source rather than an empty successful editor.

The provisional visual system uses host theme variables, clear bar/beat hierarchy, strong note rectangles, selection edges and a restrained playhead. No font/artwork/icon system or final brand was adopted. PATCHBOOK was not redesigned. Light/dark and a425px pane were tested; measured pane client/scroll widths were both425px. DPR2 emulation produced2374 backing pixels for1187 CSS pixels. This verifies backing math, not physical display hardware.

Actual screenshots are in [output/motif/milestone-3a](../output/motif/milestone-3a/), ignored by Git and retained locally:

| View | File |
| --- | --- |
| Browser | [01-motif-browser.png](../output/motif/milestone-3a/01-motif-browser.png) |
| Empty roll | [02-empty-roll.png](../output/motif/milestone-3a/02-empty-roll.png) |
| Four-note melody | [03-melody.png](../output/motif/milestone-3a/03-melody.png) |
| Three-note chord with melody | [04-chords.png](../output/motif/milestone-3a/04-chords.png) |
| Selected-note editing | [05-selected-note.png](../output/motif/milestone-3a/05-selected-note.png) |
| Playback | [06-transport-playback.png](../output/motif/milestone-3a/06-transport-playback.png) |
| Dark theme | [07-dark-theme.png](../output/motif/milestone-3a/07-dark-theme.png) |
| Light theme | [08-light-theme.png](../output/motif/milestone-3a/08-light-theme.png) |
| Narrow pane | [09-narrow-pane.png](../output/motif/milestone-3a/09-narrow-pane.png) |
| Recovery inspection | [10-recovery.png](../output/motif/milestone-3a/10-recovery.png) |
| External conflict | [11-conflict.png](../output/motif/milestone-3a/11-conflict.png) |
| High-DPI emulation | [12-high-dpi.png](../output/motif/milestone-3a/12-high-dpi.png) |

Keyboard navigation/field editing was exercised; no screen-reader certification, musical popout editor, community-theme or full OS matrix is claimed. Shared design recommendations are recorded in [DESIGN_DIRECTION](DESIGN_DIRECTION.md#milestone3a-motif-review).

## H. Performance

Environment: AMD Ryzen7 5700G,16 logical processors, approximately27.3GiB RAM, Linux7.3.1-1-cachyos; Obsidian1.15.0, Electron43.8.6, Chrome150.0.7871.250. The isolated launcher uses `--disable-gpu`. These results describe this software-rendered host, not universal guarantees.

`benchmarks/motif.ts` runs actual production validation/index/Canvas/hit/command functions in the native renderer. Synthetic generation is excluded; viewport960×360 CSS pixels/DPR1,5 warmups and30 samples. Initial includes validation/index/first draw/forced layout. Redraw/scroll/zoom/selection/drag-preview timings measure JS work/submission, not physical display latency, full editor DOM or disk. Reported p95 values below are rounded to0.1ms; apparent sub-resolution work is not zero cost.

| Notes | Visible | Initial ms | Redraw p95 | Scroll p95 | Zoom p95 | Hit/select p95 | Drag preview p95 | Pure move commit p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 50 | 2.5 | 0.2 | 0.1 | 0.2 | 0.2 | 0.2 | 0.2 |
| 1000 | 475 | 2.1 | 0.3 | 0.3 | 0.3 | 0.3 | 0.3 | 1.1 |
| 5000 | 782 | 7.6 | 0.4 | 0.4 | 0.5 | 0.5 | 0.4 | 5.9 |
| 10000 | 782 | 13.2 | 0.6 | 0.4 | 0.5 | 0.4 | 0.4 | 9.6 |

A separate real CDP pointer benchmark drives the production roll and `MotifSession` through12 drags per dataset. Pointer-up event timestamp to next-frame median/p95:100 notes9.4/10.2ms;1000 notes10.7/11.0ms;5000 notes35.4/36.9ms. This includes validation/history cloning but excludes the complete inspector/vault workflow. The5000-note session retained10 of12 history entries under the byte budget. It demonstrates history/commit cost exceeding culled redraw cost, not a complete5k-note UX guarantee. Large-session full-view/heap profiling should precede optimization. Serialized fixture sizes were approximately16k/160k/818k/1642k UTF-16 bytes; they are not measured heap consumption. No arbitrary CI time threshold was imposed.

## I. Testing

Commands executed:

```sh
pnpm check                 # baseline209 tests/21 files, then final278/26
pnpm audit --json          # zero reported vulnerabilities
pnpm dev:vault            # guarded deployment to marked disposable vault
pnpm dev:obsidian          # isolated project-local profile, localhost9227
pnpm test:motif-native
# Deliberate cold stop/relaunch of ONLY the guarded disposable instance:
node scripts/motif-native.mjs --verify-restart
MNEMOBARD_FOUNDATION_REVIEW_DIR=output/motif/milestone-3a/foundation-regression pnpm test:obsidian
MNEMOBARD_ASSET_REVIEW_DIR=output/motif/milestone-3a/patchbook-regression pnpm test:assets-native
# Separate guarded cold restart, then:
MNEMOBARD_ASSET_REVIEW_DIR=output/motif/milestone-3a/patchbook-regression node scripts/patchbook-assets-native.mjs --verify-restart
```

Strict typecheck, ESLint and production build passed. Five new test files add69 cases for domain/edit/history, rational compilation/transport, geometry/rendering, real view controls and the injected audio adapter. All209 baseline cases remain, including the MIDI experiments. The former MOTIF-placeholder assertion now checks the real library; CANVAS-placeholder checks remain. No lint/type rule was disabled and no runtime dependency was added.

Native MOTIF:19 scripted groups plus5 guarded CDP probes (ten start/stop cycles, exclusive recorded/synth audio focus, actual context suspension, synthetic owner-window blur, metadata Undo/Redo refresh) passed. The main workflow used trusted pointer and keyboard input for melody/chord drawing, movement/resize, numeric velocity, group movement, delete/duplicate/undo/redo and Save, then a genuine application restart. Screenshot/theme/recovery/module/view/plugin checks and measured benchmarks followed. PATCHBOOK regression12 groups included actual WAV/MP3/OGG/FLAC decoder success, invalid-file failure, import/source preservation, repair and cold recovery. Foundation regression11 groups included native rename identity, stale writes and repeated registration cleanup. No observed renderer exceptions in the successful evidence runs.

Development harness corrections: Chromium Shift is modifier8 (Ctrl+Shift10); Enter requires its carriage-return text payload for native controls; selectors must target current containers. The PATCHBOOK asset harness now uses its owning document and focuses the disposable window before opening a modal. Failed exploratory attempts were corrected and rerun; they are not counted as passes. Production focus-bound shortcut handling, unapplied-field Save guards, semantic dirty comparison and pre-scheduled voice ends were independently tested fixes. Native scripts can route new evidence into3A directories, preserving the original human-reviewed2B screenshots.

Not performed: physical sound/loopback latency, macOS/Windows, assistive-technology certification, long-duration drift/OS sleep, real high-DPI hardware and musical popouts. jsdom/fake audio tests do not certify these. No personal files or vaults were used. See [DEVELOPMENT](DEVELOPMENT.md#motif-development-and-validation-3a) for reproduction/manual controls.

## J. Architecture

| Component | Decision and implementation |
| --- | --- |
| Exact timing/B01 | Reviewed/adapted selected own1B fraction/tempo math into `src/music/timing.ts`; excluded division parsing/export projection. Source PPQ remains authoritative. |
| Shared event compiler | New `src/music/compiler.ts`; pure ordered note/track events and clock seconds. No arrangement or MIDI codec implementation. |
| Audio/B03 | New narrow owner-scoped transport and sine sink using reviewed scheduling policies; no wholesale lab promotion, pause or sample engine. |
| Rendering/B02 | New production geometry/index/renderer/controller plus bounded accessible DOM list. The lab remains separate. |
| Sessions/recovery | Existing behavior extracted into typed `DocumentSession`, `CheckpointRecovery` and shared recovery inspector; thin PATCHBOOK wrappers retained. Two real consumers justify the extraction. |
| Browser/services | New `MotifLibrary`, `MotifSession`, view/commands/inspector; shared index/repository/settings/controller. Main owns services and audio-focus coordination. |
| Experimental codec/B04 | Deferred; `midi-file` stays dev-only. No dependency or lockfile change. |
| TROUBADOUR | Reference only; no source/tests/assets copied, adopted or executed. No reuse authorization request is needed for3A. |

Production imports never reach `experiments/`. Styling is MOTIF-scoped; PATCHBOOK uses extracted helpers without a layout redesign. Existing compatible schema1 fields, public plugin lifecycle and module toggles remain intact. Plugin unload disposes musical state before shared storage and does not detach workspace leaves or rely on asynchronous saving. These are implementation refinements within Prompt006, recorded in [DECISIONS](DECISIONS.md#prompt006--milestone3a); no fundamental architecture change, global event bus or framework was introduced.

Current official API declarations were checked for public Scope/Keymap and synchronous-callback Vault.process contracts; the public sample repository was reviewed. Deep developer-doc URLs returned Not Found, so the [official API declarations](https://raw.githubusercontent.com/obsidianmd/obsidian-api/master/obsidian.d.ts) and [sample repository](https://github.com/obsidianmd/obsidian-sample-plugin) were used as primary references. Native execution, rather than declarations alone, supports the recorded host behavior.

## K. Milestone 3B Readiness

The basic MOTIF editor is ready for human musical/usability review. Production adoption recommended: its validated source-tick editing, bounded session/history, culled Canvas, accessible numeric pathway, deterministic compiler and owner-scoped audition. The lab remains evidence, not production code. No legacy code adoption is proposed.

Before beta, address broader OS/device/accessibility testing, full-view large-session profiling and aggregate clean-session cache retention (per-session history is bounded, but the library does not yet evict every clean session). Checkpoint/history storage grows; no automatic pruning exists. Map metadata stays protected but uneditable. Same-pitch ambiguity remains a deliberate restriction requiring a separately reviewed event/codec policy if expanded.

Subject to a **separate3B prompt**, next priorities are bounded MIDI import/export and independent interoperability fixtures, explicit unsupported-event/timing warnings, then selected transformations with undo and PATCHBOOK UUID association controls. Preserve source PPQ and original files. Compiler track/channel/patch references provide the boundary; schema1 motifs remain a single part. B04 codec production adoption, final identity/release license and any destructive migration remain unapproved. No3B, CANVAS, import/export, advanced quantization or recording was begun.

## L. Repository State

Reviewed2B's pending changes and ignores before implementation, ran its209-test suite, then created signed local restoration commit **`c63125b` — `feat: preserve verified Milestone 2B PATCHBOOK assets and recovery`**. Git reports signature statusG (good). The user unlocked the existing signing setup; no signing configuration was changed. No subsequent3A commit was created;3A changes remain unstaged for review. No remote was configured or pushed.

Final Git status:57 changed/new paths (31 modified,26 untracked), none staged, no unresolved conflicts. Changed/created files are concentrated in `src/modules/motif/`, `src/music/`, shared document/recovery/UI helpers, main/services, compatible domain/codec additions, scoped styles, five test files, native tooling/benchmark and current documentation. `pnpm-lock.yaml`, experiments, historical reports/audit and earlier review evidence remain unchanged. `git diff --check`, native-script syntax checks, generated-path ignore checks, pending-file credential-pattern scan and signed baseline verification passed. The249162-byte production bundle matches the native-tested disposable deployment; generated bundles remain ignored. The isolated Obsidian instance was stopped after releasing tracked musical/media resources and flushing test state; the personal instance was not targeted. The retained summary lists preservation evidence.

TROUBADOUR remains at`bc2749e2877738bd443a1d3ace66f919d23fe837`,121 tracked files, clean, with aggregate SHA256`4e217cc4f22b1a049470feb31d5955ece52542619497e97c0924e592f6928ff2`, matching the preexisting baseline. No legacy source, personal vault/music file, unrelated project, system configuration, global installation, remote or publication was modified. Test assets/records/profiles are inside designated project-local disposable paths. Generated bundles, dependencies, runtime profiles, vault and screenshots remain ignored. Stop at3A for human review.
