# Milestone 3B — MIDI interoperability and musical editing

Date: 2026-11-06. Authority: Prompt007. Stop at3B; CANVAS remains a placeholder.

## A. Executive Summary

MOTIF now imports explicitly selected SMF parts through a bounded preview, exports deterministic Type1 MIDI, transposes/quantizes/sets velocity through existing history, associates PATCHBOOK patches by UUID, and edits exact bar/beat/tick positions. Musical records still use the original Markdown/repository/session architecture. No destructive migration or legacy adoption occurred.

**Milestone3B passed in the tested Linux Obsidian1.15.0 environment.** All349 tests across30 files, typecheck, lint and production build pass. Native validation passed16 MIDI workflow groups,19 existing MOTIF regression groups,12 PATCHBOOK asset/recovery groups and11 foundation groups. Fourteen actual3B screenshots were captured; original review evidence remains intact. An independently authored Python reader verified actual exported files, while separate byte fixtures/structural decoding verify automated round trips. [Retained evidence](validation/milestone-3b-native.json).

Supported-part timing and notes are exact; arbitrary MIDI round trips are not lossless. Controllers, bends, aftertouch, SysEx, timing changes and unknown stateful metadata block import. Named annotation/instrument omissions require acknowledgment. No external DAW/device test, Windows/macOS certification or physical audio-latency measurement is claimed. Full-view5k-note interactions remain noticeably slower than small phrases; see sectionI.

## B. MIDI Import

Supported: bounded SMF Types0/1 with PPQ1–32767, explicit track/channel selection, note-on/off including velocity-zero ends, running status, chords/different-pitch overlaps, track names and representable constant tempo/meter. Type2 and SMPTE division are rejected explicitly. Imported note positions/durations retain source PPQ without snapping or normalization; a track's end-of-track preserves its trailing silence. File extent and selected-part extent are shown separately. Channels display1–16 and store0–15.

`src/midi/structure.ts` independently validates raw chunks before `midi-file` sees them: header/format/division/count, declared track lengths, bounded four-byte VLQs, channel payload values, running status, known meta lengths, tick arithmetic, mandatory final end-of-track and absence of undeclared trailing data. Meta/SysEx cancels running status. Unsupported system statuses and malformed payloads fail with an offset and actionable message. Extended unknown headers are not silently interpreted. The candidate decoder's track/event counts are checked against the scanner.

`src/midi/import.ts` pairs source-order notes deterministically per track/channel. Extra ends, missing ends, zero-duration notes, same-pitch overlap and unsupported bounds block the affected part. No note is dropped, shortened or given an invented end. Other tracks/channels are not merged. Stateful channel events are inspected across **all tracks using the selected channel**, so choosing a different note track cannot hide sustain/bend automation.

| Resource | Enforced bound |
| --- | --- |
| Source file | 2MiB; checked before file read and again before parsing |
| Tracks/events | 128 tracks;50000 events per file |
| One meta/SysEx payload | 64KiB |
| Absolute source tick | 1000000000 |
| Selected editable part | 10000 notes;4096 quarter notes |
| Decoder execution | One owned worker/job,10-second deadline; cancel terminates it |
| Vault selection UI | Searchable, at most200 matching file options |

This intentionally tightens the original proposed10MiB/100000-event envelope; measured5k-note files fit easily. A worker bounds untrusted decoding time and keeps parsing off the editor thread. Confirmation/validation/rendering still perform bounded main-thread work. The host's public `readBinary` is a whole-file read; source changes between size inspection and read are not a streaming/atomic guarantee. The returned size is rechecked and never passed unchecked to the decoder.

The preview shows filename, format, PPQ, tracks/names/channels, completed note counts, timing, extent, selected duration and classified issues. A source part must be chosen explicitly. Confirmation creates **an unsaved new motif**, with fresh motif/note UUIDs; ordinary explicit Save creates its authoritative note. Parsing/preview/cancellation alone creates no musical record. Failed/malformed imports cannot masquerade as successful partial records.

| Issue | Policy |
| --- | --- |
| Missing tempo/meter | Display MIDI defaults120 quarter-note BPM/4/4. |
| Repeated identical tempo/meter | Supported; not treated as a map. |
| Tempo/meter changes, conflicting declarations, unrepresentable ranges | Block; no flattening or reinterpretation. |
| Nonstandard notated32nds-per-quarter | Block because the stored meter cannot express the changed beat interpretation. |
| Sustain/other controllers, pitch bend, aftertouch | Block selected channel, including declarations in another track. |
| SysEx/escape, device/port routing, SMPTE offset, sequencer-specific or unknown metadata | Block; unknown semantics are not labeled harmless. Never execute/transmit data. |
| Program changes | Explicitly acknowledge omitted instrument selection; note-only import/sine audition does not preserve the sound. |
| Text, lyrics, markers, key/other known annotations; nonzero release velocity; custom metronome clicks | Name the omission and require acknowledgment; sounding note endpoints/attack velocities remain exact. |
| Additional/overlong/non-UTF-8 track names | Explain initial-name selection,240-character title limit or encoding fallback; require acknowledgment. |

The source file remains byte-identical. External files are read only after explicit file selection; no fetch, automatic external copy, associated-file execution or absolute source path is added to a musical record. Bounded filename/track/channel/format and acknowledged issue codes are portable provenance in the optional `data.midiImport` extension. Supported unknown existing musical metadata remains protected by the original codec.

## C. MIDI Export

`src/midi/export.ts` produces Type1 SMF with two tracks: conductor (name, tempo, meter, ending) and one note track (UTF-8 name, ordered notes, ending). Both end at the explicit motif length. Pitch/start/duration/attack velocity, source PPQ, fixed tempo/meter and retained source channel are exported. Note-off precedes note-on at shared ticks; further ordering is deterministic by channel/track/pitch/voice. Running status is disabled in output for straightforward inspection. Repeated exports of the same valid motif are byte-identical in tests.

Export uses the shared pure compiler with an explicit128-note consumer limit. Basic audition keeps its existing64-note default limit; a valid128-pitch chord can be exported without being mislabeled an audio error. Fractional source-tick output is rejected rather than rounded. The result is independently framed by the strict scanner before writing.

The dialog explicitly selects a fresh saved vault record or the current unsaved draft snapshot. Unapplied numeric/settings fields must be applied/discarded first. The visible export contract names excluded sound/audio, PATCHBOOK links, prose/tags and custom extensions. Track names above256 Unicode characters are explicitly shortened without splitting code points; the authoritative title stays unchanged. Unsupported recognized timing maps/future schemas remain blocked by the normal motif validator.

The supported destination is a **new `.mid` inside a visible vault folder**, defaulting to the configured creation root's Exports directory. Users can choose another portable relative destination. Traversal, absolute/reserved/hidden configuration paths, wrong extensions and collisions are rejected. Public Vault binary creation is used; no existing file is overwritten or deleted. A failed acknowledgement reports that a complete/partial file may exist and asks for inspection; no automatic retry/rollback occurs. Export does not modify a motif, its Markdown or its associated patch.

## D. Round-Trip Testing

Independent raw-byte fixture builders in `tests/support/midi-fixtures.ts` do not use the candidate writer. The codec suite covers melody, four-note chord, repeated/adjacent same-pitch notes, different-pitch overlaps, velocities, running status, velocity-zero ends, Type0/1, multiple tracks/channels, names, tempo/meter and unsupported/malformed cases. Source PPQs96/480/960/1000/32767 are exercised through MIDI→motif→MIDI.

Tests compare exact pitch, start, duration, velocity, PPQ, tempo, meter, channel, boundary order and track ending. Fresh import IDs and file track layout are intentionally not source identities. The independent scanner examines raw emitted event status/data/ticks; assertions use separately constructed expected events. Reimport through the candidate decoder is an additional check, not the sole evidence. Same-pitch ambiguity and timing maps are rejection fixtures, not silently repaired round trips.

Native Obsidian exported the actual drawn melody/chord, then `scripts/verify-midi.py` read the disk file using an independently authored Python standard-library SMF implementation. Header/tracks, paired note events, tempo/meter, PPQ and end silence were compared to the selected musical state. Obsidian then imported that file as a separate motif. Independent Type0 and multitrack Type1 fixtures at PPQ1000 also passed; originals were SHA256-identical afterward. Collision handling and an acknowledged program-change note-only draft were verified.

This establishes the documented **supported subset**, not arbitrary MIDI byte/event preservation, proprietary instrument reproduction or DAW certification. REAPER is installed but was not launched or configured; no personal projects/configuration were touched. External DAW testing remains optional future validation. The mandatory independent programmatic check was performed.

## E. Musical Transformations

Pure commands in `src/modules/motif/commands.ts` implement selected-note integer-semitone transposition, octave up/down, start-only quantization and explicit selected velocity. Quantization offers selected notes or the whole motif and quarter/eighth/sixteenth/eighth-triplet grids. Triplets require integral source steps. Nearest-grid ties go later; changing the visible grid never runs a quantization command.

Each command constructs and validates the complete candidate, preserving identities/durations/unknown properties except the requested field. Out-of-range pitch/velocity, invalid timing, shortened boundaries or same-pitch collisions reject the entire operation before history/data mutation. No clamping, dropping or automatic motif extension occurs. Successful transformations are one existing `MotifSession` edit with Undo/Redo, dirty state and recovery. A zero-change command creates no spurious history entry. No second undo system or advanced transformation engine was introduced.

## F. PATCHBOOK Integration

`PatchAssociation` provides searchable active unique patches, explicit association/removal, status and navigation. Choices are bounded to100 with a refinement hint. The stored `patchId` is authoritative; `patchLink` is an ordinary navigational wikilink. Save refreshes a uniquely resolved active target's companion path. Missing/archived/ambiguous/wrong-kind states are diagnosed; existing UUIDs remain stored and ordinary musical edits remain possible. Newly chosen associations require a unique active patch. Explicit reassociation/removal uses musical history and never changes the PATCHBOOK record.

Navigation opens the PATCHBOOK view, awaits public `loadIfDeferred()`, then selects its stable UUID; a disabled PATCHBOOK interface falls back to its Markdown note. A native deferred-view race was found and corrected rather than silently ignoring the navigation request. Save/reopen, native navigation, rename/ambiguity/archive/missing cases and unknown metadata preservation are covered across native/unit tests.

An association is organizational context. Neither sine audition nor MIDI export hosts or reproduces a synthesizer, preset file or recorded patch sound. No PATCHBOOK redesign was performed.

## G. Interface and Usability

Import is discoverable in the MOTIF header; Export sits beside Save. Native dialogs expose selection/fidelity and snapshot/destination decisions. Transform notes and Selection actions group secondary commands; the note list is a collapsible keyboard alternative while precise selected-note controls remain available. C-octave labels are stronger. Host fonts/themes/focus behavior remain authoritative; no final branding or artwork was introduced.

`positions.ts` defines **one-based bar:beat:source-tick-offset**, while storage stays zero-based ticks. The written denominator defines a beat:6/8 at PPQ960 has480 ticks per beat and2880 per bar; `2:1:0` means tick2880. Exact fractional offsets such as `1:2:1/2` can describe PPQ3/6-8 source tick2. A requested position whose total is not an integer source tick is rejected with guidance. Raw-tick editing remains available. Numeric Apply participates in existing history and full note validation; no rounding or grid change is hidden in this pathway.

Standard labeled controls, visible host focus, scoped shortcuts and the note register support keyboard operation. Native keyboard musical-position entry was verified. Light/dark and narrow desktop layouts were inspected without horizontal pane overflow. Screen-reader, community-theme and full popout certification are not claimed. Apply/discard numeric values before other note actions; unapplied controls are not a checkpointed musical draft. Very recent edits retain the existing durability limitations.

Actual screenshots are in [output/motif/milestone-3b](../output/motif/milestone-3b/):

| View | Screenshot |
| --- | --- |
| Selection | [01-midi-selection.png](../output/motif/milestone-3b/01-midi-selection.png) |
| Preview | [02-midi-preview.png](../output/motif/milestone-3b/02-midi-preview.png) |
| Track/channel | [03-track-channel-selection.png](../output/motif/milestone-3b/03-track-channel-selection.png) |
| Unsupported event | [04-unsupported-event.png](../output/motif/milestone-3b/04-unsupported-event.png) |
| Imported roll | [05-imported-piano-roll.png](../output/motif/milestone-3b/05-imported-piano-roll.png) |
| Export | [06-midi-export.png](../output/motif/milestone-3b/06-midi-export.png) |
| Transformations | [07-transformations.png](../output/motif/milestone-3b/07-transformations.png) |
| Patch context | [08-patch-association.png](../output/motif/milestone-3b/08-patch-association.png) |
| Musical position | [09-musical-position.png](../output/motif/milestone-3b/09-musical-position.png) |
| Dark/light | [10-dark-theme.png](../output/motif/milestone-3b/10-dark-theme.png), [11-light-theme.png](../output/motif/milestone-3b/11-light-theme.png) |
| Narrow pane | [12-narrow-pane.png](../output/motif/milestone-3b/12-narrow-pane.png) |
| Recovery/conflict | [13-recovery.png](../output/motif/milestone-3b/13-recovery.png), [14-conflict.png](../output/motif/milestone-3b/14-conflict.png) |

## H. Data Integrity

Existing `DocumentSession`, `MotifSession`, entity codec/index and `EntityRepository` remain authoritative. Import confirmation creates a new independent draft; Save validates and uses the same source revision checks, pre-write recovery and conditional public `Vault.process` operation. Source PPQ, stable IDs, unknown supported fields and unrelated Markdown remain intact. No schema-version bump or destructive migration is required for optional provenance/relationships.

Failed imports create no authoritative motif; failed exports cannot change musical source. Interrupted binary creation may leave a derivative file, disclosed without deletion/retry. External edits reject Save, retaining both source and working draft/history with a checkpoint. Recovery is explicit, does not auto-merge/restore/prune and still requires normal Save. Confirmed checkpoints differ from Saved; unacknowledged recent changes/unapplied fields are not promised crash-durable. No distributed/multi-file transaction is claimed.

View/module/plugin closure cancels import workers and revokes their URLs, closes dialogs and preserves existing musical/audio cleanup. Confirmation/export completions are guarded after closure. Submitted Vault I/O cannot be forcibly rolled back. Native restart, conflict/recovery and module/plugin cleanup passed; prior PATCHBOOK/MOTIF workflows remain functional.

## I. Performance

Measured in actual Linux Obsidian1.15.0 / Electron43.8.6 / Chrome150.0.7871.250 on Ryzen7 5700G,16 logical CPUs, approximately27.3GiB RAM, with the existing `--disable-gpu` isolated launcher. `benchmarks/midi.ts` and the guarded profile script use synthetic100/1000/5000-note motifs through the real worker, import preview, full editor/session/list/Canvas subscribers and trusted pointer events. Generation is excluded. No authoritative source was changed by profiling.

Command timings: two warmups/seven samples, reported p95 milliseconds. Worker/initial figures are single observations; confirmation-to-observed-frame includes CDP/poll overhead. Pointer-up-to-next-frame has six trusted gesture samples, includes the full editor/history and follows twelve retained history operations. These are renderer/automation timestamps, not physical screen/audio latency or universal guarantees.

| Notes | Worker+preview ms | Confirm→frame ms | Pure parse p95 | Export p95 | Transpose p95 | Quantize p95 | Undo p95 | Redo p95 | Full pointer p95 | History retained/12 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 54.0 | 19.1 | 0.5 | 0.9 | 4.7 | 2.9 | 2.4 | 2.4 | 10.2 | 12 |
| 1000 | 60.2 | 27.4 | 2.8 | 5.9 | 15.2 | 21.5 | 7.7 | 7.6 | 16.0 | 12 |
| 5000 | 72.9 | 77.7 | 9.2 | 28.6 | 61.1 | 73.4 | 29.5 | 28.1 | 60.8 | 7 |

An earlier full-view run measured5k-note pointer p95≈165.2ms, transpose125.5ms and undo105.6ms. The view repeatedly cloned the same draft for each field and rebuilt the library on every note edit. A narrow change reuses one immutable snapshot per refresh and refreshes pending drafts instead; the actual library remains index-driven and updates on Save/index changes. Validation/history guarantees were not weakened. Before/after raw measurements are retained; history-load differences and small sample counts prevent a formal universal speedup claim.

The final5k pointer60.8ms and bulk quantize73.4ms exceed the old proposed50ms interaction hypothesis. Full-view results are **not directly comparable to3A's36.9ms roll/history-only benchmark**. Small/1k phrases are more responsive;5k bulk edits remain a known cost. Future command/delta history or view batching needs separate profiling, not a speculative rewrite. The16MiB estimated snapshot/100-entry policy remains; UUID-rich5k fixtures retained7 entries under it. No exact heap/leak certification was performed.

Clean-session retention is now bounded: attached views pin sessions; only clean, idle, unowned sessions are evicted in creation order until at most8 remain. Busy/dirty/owned sessions and recovery files are never removed by this policy. Reopening an evicted saved motif starts a new in-memory history; authoritative data remains. Tests exercised eviction with pinned and dirty sessions/checkpoints. Aggregate active/draft heap and long sessions remain unmeasured.

## J. Testing

Commands executed:

```sh
pnpm check                  # baseline278/26; final349/30
pnpm audit --json           # zero reported vulnerabilities
pnpm dev:vault
pnpm dev:obsidian            # isolated profile/vault, localhost9227
pnpm test:motif-midi-native
pnpm benchmark:motif-midi
# After intentional guarded cold stop/relaunch:
node scripts/motif-midi-native.mjs --verify-restart
```

Native regressions were routed under3B to preserve prior evidence:

```sh
MNEMOBARD_MOTIF_REVIEW_DIR=output/motif/milestone-3b/motif-regression pnpm test:motif-native
MNEMOBARD_ASSET_REVIEW_DIR=output/motif/milestone-3b/patchbook-regression pnpm test:assets-native
MNEMOBARD_FOUNDATION_REVIEW_DIR=output/motif/milestone-3b/foundation-regression pnpm test:obsidian
# Following a guarded cold restart:
MNEMOBARD_MOTIF_REVIEW_DIR=output/motif/milestone-3b/motif-regression node scripts/motif-native.mjs --verify-restart
MNEMOBARD_ASSET_REVIEW_DIR=output/motif/milestone-3b/patchbook-regression node scripts/patchbook-assets-native.mjs --verify-restart
```

All278 baseline cases remain passing;71 new cases cover strict framing/limits, pairing, round trips, fidelity/acknowledgment, worker success/cancellation/deadline/failure cleanup, destination collisions/partial writes, transformations/history, exact positions, patch relationships, cache ownership and actual DOM controls. Four new test files plus additions to the existing view suite are included. No test/type/lint rule was weakened.

Native16 MIDI groups include actual drawing/export/independent parsing/import, Type0/1 selection, unsupported-event rejection, acknowledged note-only draft, transformations/keyboard position, patch Save/reopen/navigation, cold restart, conflict/recovery and lifecycle. Native3A19 groups rechecked movement/resize/multiselect/undo/playback/DPI/rendering; PATCHBOOK12 groups rechecked assets/import/repair/codecs/cold recovery and media cleanup; foundation11 groups rechecked identity/rename/conflicts/settings/registrations. Final successful evidence runs have no observed renderer exceptions.

Harness failures were corrected and rerun, not counted as successful evidence: an evaluated selector/string escaping issue, insufficient frame settling before synthetic pointer coordinates, a proposed test position that correctly collided with a same-pitch note, and newline escaping in the external-edit simulation. The actual deferred PATCHBOOK navigation race was fixed in production and unit-tested. Earlier generated fixtures/checkpoints were preserved, not reset to force a pass.

Unavailable/unperformed: external DAW/device verification, Windows/macOS, screen-reader certification, long drift/OS sleep/device changes, full popout/theme matrix and crash/sync fault certification. Independent programmatic interoperability is established only for the documented subset.

## K. Architecture

| Area | Implementation |
| --- | --- |
| Raw MIDI boundary | `src/midi/structure.ts`: independent strict bounded scanner; `import.ts`: decoder adapter, pairing/preview/selection/fidelity policy. |
| Worker | `worker.ts` + `job.ts`: embedded local bundle, one transferable buffer, deadline/cancellation/resource ownership. esbuild ships it inside main.js; no remote worker asset. |
| Export | `export.ts`: shared compiler → pinned writer → strict framing; `files.ts`: new-file public Vault derivative output. |
| Editing/integration | Existing command/session/history; new `positions.ts`, `transform-panel.ts`, `midi-dialog.ts`, `patch-association.ts`; MotifLibrary owns import drafts, associations and clean-cache pins. |
| Unchanged boundaries | Repository/Markdown authority, source PPQ/schema1, shared document/recovery, recorded preview and CANVAS placeholder; no global event framework or second persistence/undo system. |

B04 production decision: adopt pinned **midi-file1.2.4 (MIT)** under Prompt007's explicit parser-evaluation/adoption authority, with the strict wrapper and worker. Existing1B evidence exposed permissive truncation; the package alone is insufficient. Byte-array API/browser compatibility, types, zero runtime dependencies and small bundle justify it over a higher-level model or complete bespoke codec. Registry metadata lists the inspected release as2023-03-15; low release churn is not proof of active maintenance. Upstream source/licensing/provenance were reviewed; [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md) retains MIT text and upstream parser-reference credits. No legacy source was used.

The existing pinned package moved from dev to runtime dependencies with install scripts disabled; no additional codec/framework/cloud dependency was added. Production main.js is312322 bytes versus249162 at3A, including worker code (approximately61.7KiB increase). The official [midi-file repository](https://github.com/carter-thaxton/midi-file), [license](https://raw.githubusercontent.com/carter-thaxton/midi-file/master/LICENSE.md), [public Obsidian API declarations](https://raw.githubusercontent.com/obsidianmd/obsidian-api/master/obsidian.d.ts) and [MIDI Association SMF overview](https://midi.org/standard-midi-files) were consulted. Full MIDI specification download is membership-gated; no claim is made to implement every SMF extension.

Differences from earlier proposals: tighter resource bounds, cancellable worker, explicit conservative blocking of unknown/stateful events, unsaved import confirmation followed by normal Save, bounded pinned clean-session cache and small measured refresh optimization. These preserve Prompt007's schema/architecture and are recorded in [DECISIONS](DECISIONS.md). No destructive migration or fundamental architecture deviation occurred.

## L. Milestone 4 Readiness

MOTIF provides the required foundation for a separately authorized CANVAS design: stable motif IDs, exact source PPQ, single-part notes/length, shared deterministic event compilation, PATCHBOOK UUID relationships and a proven Type1 serialization boundary. Human review should verify the actual musical workflow/screenshots and accept the conservative import policies/support envelope before further implementation.

CANVAS still needs its own reviewed lane/clip/repetition compiler and snapshot preflight, channel allocation, source-resolution endpoint conversion/warnings, live-reference changes, arrangement history/persistence and multitrack export tests. The current motif exporter is not an arrangement exporter. Same-channel/same-pitch overlap remains prohibited; channel conflicts across repeated clips must be detected, never repaired by dropping/shortening notes. Tempo/meter maps and multitrack motif editing remain unsupported schema capabilities.

Remaining risks:5k full-view latency/snapshot cost, active/draft memory and long sessions, conservative rejection of annotated files, worker/CSP/OS portability, independent DAW testing and host sync/crash limitations. Approvals still required: a new Milestone4 prompt/scope, any schema/map/overlap-policy changes, final identity/release license/publication, and all legacy copying. No CANVAS, hardware MIDI, recording, generative tools or later feature work was begun.

## M. Repository State

Before3B, reviewed all57 pending3A paths/ignores, scanned credential patterns and unrelated/generated data, ran278 baseline tests/typecheck/lint/build, then created signed local restoration commit **`90eed00` — `feat: preserve verified Milestone 3A MOTIF editor foundation`**. Its signature verified good and the tree was clean. Signing configuration was not changed or bypassed. No3B commit is made automatically; implementation remains uncommitted for review. No remote exists, push/publication occurred, or personal vault was accessed.

Changes cover MIDI adapters/worker/dialogs, focused MOTIF commands/positions/patch/cache/refresh controls, compiler consumer bounds, esbuild/dependency notice/lockfile, tests/fixtures/independent reader/profile tooling and current documentation. Historical reports/audit and experiments remain unchanged; native tooling routes new captures under3B. Generated bundles/dependencies/profiles/vault/output remain ignored. Final Git state:49 changed/new paths (27 modified,22 untracked), none staged and no unresolved conflicts. The signed3A baseline remains HEAD. Diff whitespace, script syntax, credential-pattern scan, generated-path ignores, historical/experiment preservation and matching native-deployed bundle checks passed. The guarded disposable Obsidian instance was stopped after releasing tracked playback resources and flushing test state; no personal instance was targeted.

TROUBADOUR remains clean at`bc2749e2877738bd443a1d3ace66f919d23fe837`,121 tracked files, aggregate SHA256`4e217cc4f22b1a049470feb31d5955ece52542619497e97c0924e592f6928ff2`, matching baseline. No legacy source/tests/assets were copied/executed/modified. Personal vault/music files, REAPER configurations/projects, unrelated projects and system configuration remain untouched. All native assets, exports, checkpoints and profiles are project-local synthetic disposable data. Stop after3B for human review.
