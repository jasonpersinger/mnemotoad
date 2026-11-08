# Development guide

Current implementation: shared safe persistence; PATCHBOOK library/assets/recorded preview; MOTIF piano roll/history/audition/MIDI interchange; CANVAS arrangement planning plus bounded compilation, routing, MIDI export and shared transport. [Milestone4B](MILESTONE_4B_REPORT.md) distinguishes verified Linux behavior from platform, DAW and timing limitations. Historical reports remain unchanged.

## Setup and commands

Use Node 26+ and pnpm 10.29.3. Both were already installed in this environment; no system installation/configuration was performed. Exact dependencies and override are in package.json/pnpm-lock.yaml. No dependency install scripts are needed by the verified setup.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm lint
pnpm test
pnpm build:dev
pnpm dev
pnpm build
pnpm check
pnpm audit
```

`dev` watches/rebuilds main.js with an inline source map; stop with Ctrl+C. `build` checks types and produces a minified browser-targeted CommonJS main.js, externalizing Obsidian. esbuild alone does not typecheck. Root generated main.js, dependencies, coverage, output, `.runtime` and dev-vault are ignored by Git. Source, tests, scripts, lockfile and build/test configs are not ignored. No release packaging/publication command is provided.

## Disposable vault and isolated application

```sh
pnpm build
pnpm dev:vault
pnpm dev:obsidian
```

Run from a desktop terminal with its normal display authentication. The launcher uses the installed `obsidian` executable, project-local XDG config/cache/data/runtime directories and `--user-data-dir`. It refuses a profile registry containing another vault. It opens only the project’s marked `dev-vault`. It does not change the everyday Obsidian configuration or use its CLI socket. Do not use an unqualified CLI command against the most recently focused vault.

On first launch, trust the author **only for this synthetic disposable vault** to enable this locally built plugin. The launcher enables a localhost development-debugging port 9227; it is for the isolated test instance only, not normal plugin operation. Obsidian itself may contact its updater; MNEMOBARD contains no runtime networking or telemetry.

`dev:vault` refuses an existing unmarked vault or symlink targets, copies only main.js/manifest.json/styles.css, enables this plugin in the marked vault’s list, and retains entity notes, recovery copies and data.json on repeated deployments. It never deletes files. The test suite checks these guards in newly created `.runtime/script-fixtures` directories, which remain disposable and ignored. No cleanup operation traverses outside designated paths.

After rebuilding, run `pnpm dev:vault` and reload MNEMOBARD in **that test instance**. Its manifest is desktop-only and currently requires Obsidian 1.15.0, the verified Linux host. The typings package is 1.14.4; a lower host version is not being claimed tested. Windows/macOS require later verification.

### Native smoke test

With the isolated app open and MNEMOBARD enabled:

```sh
pnpm test:obsidian
```

This test-only CDP script first verifies the active vault path equals the project dev-vault before every evaluation. It checks commands, all views, settings, native repository create/update/rename/conflict/recovery, module disable/data retention, unload/re-enable, persistence and duplicate registrations. It creates three new synthetic notes plus recovery copies per run. It never writes to another vault or deletes fixtures. Raw screenshot/results live in `output/playwright/milestone-1a-native.{png,json}` and are ignored; the report retains their outcome. Settings can open in a separate native window in Obsidian 1.15, so the script inspects the tab’s own container.

Manual verification if automated desktop control is unavailable:

1. Launch only the isolated profile/vault above. Confirm its vault name/path and enable MNEMOBARD.
2. Run each “MNEMOBARD: Open PATCHBOOK/MOTIF/CANVAS” command twice. Expect one corresponding tab per module: PATCHBOOK and MOTIF libraries, CANVAS Under development.
3. Open MNEMOBARD settings; toggle each interface off/on. Its tab closes on disable, its command becomes unavailable, and stored notes remain unchanged.
4. Disable/re-enable the plugin. Open tabs should retain host positions where supported; commands/views should not multiply. Close and reopen Obsidian and verify the module preferences and saved entity notes.
5. Inspect the console for plugin errors. Keep the test-vault-only evidence and record installer/OS versions. Automated mocks are not substitutes for these checks.

## Implemented structure

| Location | Responsibility |
| --- | --- |
| `src/domain/` | Entity/asset types, UUID/schema/local bounds validation, portable paths, typed errors. No host imports. |
| `src/storage/document.ts` | YAML source-range edits, one owned JSON block, exact-source revisions, unknown-data retention. |
| `src/storage/index.ts` | Bounded startup reads, per-file event updates, stale-read guards, duplicate/invalid/missing states. |
| `src/storage/repository.ts` | Shared create/read/save queues, conditional mutation, recovery copies, cancellation/disposal. |
| `src/storage/references.ts` | Expected-kind/ID/asset/link diagnostics without automatic repair or deletion. |
| `src/platform/obsidian-vault.ts` | Public Vault API adapter and event cleanup; no raw filesystem writer. |
| `src/application/` | Explicit service bundle, validated settings, module enable/open lifecycle. |
| `src/ui/module-view.ts`, `src/settings.ts` | Native ItemView shells/diagnostics and module toggles. |
| `src/main.ts` | Plugin lifecycle, command/view factories, lazy layout-ready indexing, shared service ownership. |
| `tests/` | Independent disposable memory port, minimal host contract mock, domain/codec/storage/settings/lifecycle/deployment tests. |
| `scripts/` | Guarded vault deployment, isolated desktop launch, scoped native smoke tooling. Not shipped in main.js. |

## Module consumption

The plugin’s `services` bundle supplies one repository/index/reference resolver/settings/controller instance shared by all modules. Future editors read a fresh `EntityRecord`, clone its entity for a draft, and call `repository.save(baseRecord, nextEntity, signal)`. They must keep unsaved drafts on rejection. IDs are stable across file moves; resolve fresh paths through the index rather than caching filenames as identities. PATCHBOOK/MOTIF/CANVAS have no separate storage or global event bus.

`createEntity(kind,title)` creates a new schema-1 UUID record. `repository.create` does not copy an existing ID silently. `repository.read` refuses ambiguous/malformed/newer records. Missing references are diagnostics that retain the source record; they are not automatically deleted or repaired. Cross-entity musical duration/expanded-note/export validation belongs to later work, not this foundation.

## Persistence and recovery contract

An `EntityRecord.source` string is the exact optimistic revision. Save freezes caller inputs, validates/serializes a candidate in memory, resolves unique identity, rereads current source, and compares it to the base. It then creates a new Recovery JSON containing exact original text, draft, candidate text, reason and original path. Failure to create this recovery copy aborts replacement.

Finally the synchronous `Vault.process` callback checks current text again and returns the candidate only if unchanged. This uses the public per-file API boundary; it is not a vault-wide, OS-crash-durable or distributed transaction. Another process/sync writer can change bytes outside that local guarantee. Prose-only external edits also conflict intentionally; foundation does not merge them silently.

Known-field YAML edits use parsed ranges, retaining unrelated source bytes/comments. Owned JSON is formatted only when its contents change; supported unknown fields are retained on surviving objects. Ambiguous/multiple/unclosed blocks, duplicate YAML/JSON keys, future versions, YAML aliases/custom tags, cyclic/non-portable extensions and overlarge/deep records are rejected, leaving the original available for inspection. Current text limit: 8 Mi characters; extensions at most 100 levels. Asset paths use a conservative portable vault-relative subset; aliases/subpaths in asset wikilinks are not supported by the schema-1 foundation.

Save success means the host operation completed and the returned record is the confirmed written source. If write/refresh acknowledgement fails, including failure after bytes reached disk, the error names the recovery file. Inspect current disk text and reread before retrying. The repository never blindly retries or restores over a possibly newer note. A recovery JSON’s `originalSource`/`candidateSource` can be copied into a **new** note for comparison; replacing the original is a separate explicit choice. `saveDraftCopy` preserves a rejected draft in a new JSON file without changing the source. No automatic restore, migration, pruning, or multi-file rollback exists.

Cancellation/disposal is checked around awaits, in queued operations, inside the conditional callback and between folder-creation steps. Already-submitted host I/O cannot be cancelled or rolled back; an in-flight create may leave a valid file even if its response is lost. Inspect the reported path before retrying. This is deliberate uncertainty reporting, not an atomic-write guarantee.

The index does one bounded startup scan, then supersedes obsolete per-file work and handles folder renames/deletes. It reads at most four files concurrently; it does not rescan every note after an unrelated file edit. Identity lookups and diagnostic rendering are still linear in the number of indexed entities; large-vault measurement remains open.

## Dependencies and licensing

Runtime: `yaml` 2.9.1, ISC, no runtime dependencies. Source ranges, strict duplicate keys and parser safety justify it over native stringify or a handwritten YAML parser. The production bundle’s browser input selection is enforced by esbuild; the YAML notice is in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Development: Obsidian typings/esbuild/Vitest/jsdom/ESLint/typescript-eslint/@types/node are MIT; TypeScript is Apache-2.0. Node 26 satisfies the selected tool engines. TypeScript 6 was preferred to a new major compiler while the linter ecosystem stabilizes. The known minimatch advisory was confined to dev lint tooling; pnpm pins all minimatch paths to patched 11.0.1 (BlueOak-1.0.0). Lint/tests and audit validate this override; revisit when upstream ranges update. [Maintainer advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).

`midi-file`1.2.4 (MIT) was evaluated in1B and promoted to a pinned production dependency under Prompt007.3B wraps its byte-array parser/writer with strict validation, an isolated import worker and independent exported-event checks; the legacy test-tone lab is still separate. No waveform/rendering/UI framework was added. Installation used `--ignore-scripts`; no system packages, global tools, remote repository, publication, or legacy dependency directory was introduced. MNEMOBARD remains private/UNLICENSED pending the distribution decision.

## Remaining boundaries

PATCHBOOK and MOTIF share typed draft sessions, explicit Save and recovery checkpoints. MOTIF adds bounded undo and musical compilation/audition. Automatic asset relinking, migrations and recovery retention remain deferred. Cross-platform media, universal performance targets, crash durability and multi-device conflicts remain unverified. Stop after3B; this guide does not authorize CANVAS or later work.

## PATCHBOOK development and validation

No additional package is required. `pnpm check` includes every existing experiment test plus domain/codec/library/session/UI contracts. The production entry imports the library feature, never experimental MIDI/audio/rendering.

```sh
pnpm check
pnpm dev:vault
pnpm dev:obsidian
# Second terminal, only the marked isolated app at localhost:9227:
pnpm test:patchbook-native
pnpm test:obsidian
```

The PATCHBOOK native runner uses real form controls, tests all three kinds and relations, search/filter/sort/Markdown navigation, competing edits, confirmed archive/restore, module/plugin reload, native Ctrl+S, and light/dark/narrow layouts. It may resolve the host's one-time link-update prompt for a synthetic rename. Guarded host-control APIs used by development scripts are not plugin runtime dependencies. Theme/window changes affect only the disposable environment.

After its workflow, close/relaunch only the isolated application, then run `node scripts/patchbook-smoke.mjs --verify-restart`. This compares five saved synthetic notes byte-for-byte, checks identities/settings/commands and selected-record/search restoration. The runner flushes the host's debounced `requestSaveLayout.run()` before intentional cold-stop tests; entity durability does not depend on that preferences file. Raw evidence/screenshots are ignored under `output/patchbook`; the report retains a reviewed summary.

Source boundaries: `modules/patchbook/query.ts` (pure search/filter/sort), `library.ts` (operations/relations), `session.ts` (shared cloned draft state), `form.ts` (native fields/ordered stages) and `view.ts` (navigation/lifecycle). Shared EntityRepository/codec/index/ReferenceResolver remain the only persistence foundation. New notes use the configured root's Instruments/Patches/Effects Chains; UUIDs resolve moved notes anywhere in the vault.

Authoritative notes change only on **Save record** or scoped Ctrl/Cmd+S. **Saved** acknowledges the completed write. **Unsaved changes · recovery copy stored** acknowledges a recovery JSON, not a saved entity. Checkpoints debounce500ms and are awaited before navigation/module disable. View closure releases UI handlers immediately and checkpoints while services remain alive. Plugin unload cancels resources without asynchronous final saving. Very recent unacknowledged edits are not guaranteed durable; save before unloading/restarting.

Recovery files retain original text, raw draft and a valid candidate when available. Invalid values produce a raw draft/validation error, never an invalid authoritative note. A conflict retains disk content and draft; compare through Open Markdown/Open recovery, then explicitly discard/re-enter reviewed changes against a fresh base. Never blindly retry, silently restore over a newer note or prune copies without a separate policy. Full restart does not automatically rehydrate pending drafts; the explicit Recovery register now discovers and inspects them (2B).

Archive/restore is a confirmed conditional metadata save. It retains notes/IDs/relationships and supports Active/Archived/All visibility; permanent deletion is a separate Obsidian action. New associations require unique active targets. Missing/ambiguous/archived references are diagnostics. Custom properties are edited in the native note and preserved by forms. File references are portable vault wikilinks; native preview/import/repair were added in2B, without executing presets. See [schema details](DATA_MODEL.md#milestone-2a-library-records).

## Isolated Milestone 1B experiments

The following workflow remains a regression/feasibility harness, not a production feature.

`experiments/timing.ts` and `compiler.ts` are pure transient contracts. `transport.ts` depends only on an injected sink/clock/timer; `web-audio.ts` implements a test tone. `geometry.ts` and `rendering.ts` share musical-coordinate rectangles, row/time indexing, culling and preview probes. `offline-audio.ts` checks requested onset frames without a device. `plugin.ts` is a separate development entry; `src/main.ts` never imports it. Normal `pnpm check` includes experiment tests/typecheck/lint, but the normal production build excludes all experiments.

```sh
pnpm check
pnpm dev:vault
pnpm experiments:build
pnpm dev:obsidian
# In a second terminal, with ONLY the isolated app at localhost:9227:
pnpm test:obsidian
pnpm experiments:midi
pnpm experiments:native
```

The experimental build writes only its own main.js/manifest into `dev-vault/.obsidian/plugins/mnemobard-experiments`, rejects symlink destinations and requires the exact disposable-vault marker. It does not enable itself. Its runtime also checks the designated vault path/marker before registering its view/command. Only the separate experimental bundle embeds the build-time development path; production contains no user-specific absolute path.

For manual inspection, enable **MNEMOBARD Experiments (disposable only)** in this vault's Community Plugins, then run its **Open disposable feasibility lab** command. Play/Pause/Resume/Stop use synthetic notes; selection ID and arrow/Shift-arrow/pointer gestures are ephemeral preview probes, not saved editor commands. Do not enable this plugin in another vault. Disable it again before running the automated default-disabled assertion. The runner enables it temporarily through guarded test-only host controls and disables it in finally; it does not save enablement. MIDI tests never read or write vault MIDI files.

Raw results/screenshot are ignored at `output/experiments/native.json`, `native-partial.json`, `native.png` and `midi.json`. A reviewed measurement summary is retained in `docs/benchmarks/`. The runner records completed cases incrementally and cancels pending frames/work when its view closes. Cancellation cannot interrupt the middle of synchronous browser layout; the failed 20k all-DOM workload is deliberately not repeated. All-node DOM/SVG comparisons stop at 5k; culled approaches reach 20k, dense Canvas reaches 20k visible and dense DOM is limited to 1k. Run an explicitly isolated new experiment to expand that envelope.

Each render case uses the same 960×360 CSS-pixel viewport, five warmups, 30 redraw samples, 20 pan frames, 20 zoom frames and 30 hit/preview/redraw samples. Initial time includes building the static index. Forced layout and frame-interval data are distinct metrics; neither measures physical display latency. Node counts/backing bytes are deterministic approximate resource indicators, while heap deltas are global/noisy. The full report explains hardware and software rendering. No arbitrary CI timing threshold is enforced.

On close/disable the test transport cancels timers/voices, guards pending resumes, disconnects nodes and closes its context. Blur/pagehide/hidden-document policy stops playback. A >100ms audio/wall polling gap or a late event stops instead of catching up. Pause cancels sound; resume retriggers still-held notes for the remaining duration. The3A production transport is a separate reviewed implementation with start/stop, explicit focus ownership and musical sessions; it has no lab pause/loop UI. Export preflight and broader platform/latency validation remain future work.


## Asset and recovery development (2B)

`pnpm test:asset-fixtures` creates/preserves only synthetic fixtures in `.runtime/synthetic/milestone-2b` (8s quiet tone, image and inert preset). Existing fixtures are never overwritten. WAV generation uses Node; the optional MP3/OGG/FLAC fixture generation requires an already installed ffmpeg, with no installation performed. `pnpm test:assets-native` uses native form controls/File input and the guarded CDP endpoint9227, then stores `output/patchbook/milestone-2b/native.json` and screenshots. This modifies only synthetic records in the marked disposable vault.

For cold validation, checkpoint/save the test state, flush layout preferences, terminate **only** the isolated app whose parent command includes the exact `.runtime/config/obsidian` profile and port9227, then relaunch with `pnpm dev:obsidian`. Never use an unqualified kill/pkill or CLI command against a last-active personal vault. Run `node scripts/patchbook-assets-native.mjs --verify-restart`. It verifies unchanged source, explicit recovery loading/save, module/view/plugin audio cleanup and theme/narrow screenshots. Screenshots are actual app captures, ignored by Git. A new normal run creates a new synthetic identity set; retain previous fixtures/checkpoints.

`pnpm benchmark:patchbook` runs the same production-code synthetic in-memory benchmark under Node. The native workflow runs it in the Electron renderer. Dataset generation is excluded;25 samples after3 warmups. These are parser/index/query/repository/resolver measurements, not disk or full DOM navigation certification. Results remain under the ignored review directory; the report/validation summary records measured numbers.

Manual review: create instrument/patch → Manage assets → Select vault asset (category and search) → Save. Play, pause, seek, resume, stop. Import local file → inspect name/type/size → confirm visible vault destination → Save association. Remove it and confirm the file remains. Simulate a synthetic missing file, explicitly repair, then Save. Edit and wait for a confirmed checkpoint; restart; Recovery register → inspect original/current/draft → Load draft without saving → explicitly Save. Changed sources require the comparison acknowledgment; a later external change must still reject Save. Future/malformed notes/checkpoints stay read-only. No automatic cleanup exists.

Known host issue: a long-lived stressed development session stalled FileManager link updates while its metadata resolver remained busy. The same full2A native suite passed after a clean isolated restart; do not weaken or bypass source conflicts or force host queues. Broader long-session/OS validation remains required. Raw failure evidence is retained in output; final successful runs have no observed renderer exceptions.


## MOTIF development and validation (3A)

No dependency installation is needed beyond the existing lockfile. `src/modules/motif/` separates pure edit commands/session, interval geometry, Canvas renderer/controller and DOM view/inspector. `src/music/` contains production timing/compiler/transport/sine adapter with no runtime experiment imports. `src/application/document-session.ts`, `src/storage/recovery.ts` and `src/ui/recovery-inspector.ts` are shared with thin PATCHBOOK wrappers. The repository remains the only authoritative writer.

```sh
pnpm check
pnpm dev:vault
pnpm dev:obsidian
# Second terminal, only the guarded disposable instance:
pnpm test:motif-native
# Intentional isolated cold stop/relaunch, then:
node scripts/motif-native.mjs --verify-restart
```

The runner creates only synthetic motifs/checkpoints, captures12 actual screenshots under `output/motif/milestone-3a/`, tests native pointer/keyboard editing and cold recovery, and builds an in-memory benchmark entry separately from production. It never installs the benchmark as a module or writes its synthetic benchmark notes. Rerunning creates a fresh identity set; preserve existing data/evidence if required. The24-group reviewed summary also includes five guarded CDP probes recorded in the report; the core two-phase runner produces19 groups.

Manual workflow: Open MOTIF → New motif → name/settings → Apply musical settings → draw melody/chords. Drag notes; Shift-click a group; resize the right edge. Select a note in the register, Tab through pitch/start/duration/velocity and Apply selected-note properties. Try Duplicate/Delete/Undo/Redo, grid/off/triplets, zoom and two-axis scrolling. Focus the roll for scoped keyboard operations; Ctrl/Cmd+S saves. Play creates basic sine audition; Stop releases resources. Save → close/reopen → restart the isolated app → reopen and compare. Exercise a synthetic external prose edit against a pending draft and confirm Save rejects it. Motif recovery must inspect/load without writing, then Save explicitly. Disable/re-enable MOTIF with playback active. Inspect light/dark and a narrow pane.

A group gesture validates as a whole and is one history entry. Bounds violations do not clamp notes. Same-pitch overlaps remain unsupported. PPQ changes are allowed only on empty motifs; meter/tempo edits do not move source ticks. Grid changes never quantize existing notes. Numeric/musical controls awaiting Apply are labeled, block Save and are not crash-protected; apply them to the draft first. The session checkpoints after500ms and shows confirmation; checkpoint != Saved. Explicit Save uses the same stale-source checks/backups as PATCHBOOK. View transitions retain draft/history in memory, module disable awaits checkpoints, and plugin unload disposes without promising asynchronous saving. Recovery never auto-restores or prunes.

The production transport uses25ms polling/100ms lookahead/50ms initial lead with pre-scheduled voice ends. Late/stalled/suspended playback stops; UI frames only display position. Record changes, owner closure, background window policy, module disable and plugin unload release musical resources. PATCHBOOK recorded previews and MOTIF audition are mutually exclusive. Pause/loop/seek/sample playback are absent.

Regression evidence can be routed without replacing earlier reviewed screenshots:

```sh
MNEMOBARD_FOUNDATION_REVIEW_DIR=output/motif/milestone-3a/foundation-regression pnpm test:obsidian
MNEMOBARD_ASSET_REVIEW_DIR=output/motif/milestone-3a/patchbook-regression pnpm test:assets-native
# After a separate deliberate isolated cold restart:
MNEMOBARD_ASSET_REVIEW_DIR=output/motif/milestone-3a/patchbook-regression node scripts/patchbook-assets-native.mjs --verify-restart
```

See the [3A report](MILESTONE_3A_REPORT.md) for benchmark methodology, measured hardware/latencies, tests and unresolved OS/accessibility/memory risks. All native control is development-only and path-guarded; public APIs alone are used in plugin persistence/workspace code. This does not authorize3B, MIDI interchange, CANVAS or publication.

## MIDI interchange development and validation (3B)

`src/midi/` contains the strict scanner, selected-part adapter/fidelity model, deterministic writer, derivative file store and isolated worker job. `midi-file`1.2.4 is the only promoted dependency; installation used `--ignore-scripts`, with no new transitive runtime package. The worker is compiled into main.js as local text and instantiated through a temporary Blob URL. No remote or extra installed worker artifact exists. **Restart `pnpm dev` after editing the worker/parser dependency graph**: the current watcher embeds its worker once at startup; `pnpm build`/`build:dev` always rebuild it freshly.

```sh
pnpm check
pnpm dev:vault
pnpm dev:obsidian
# Separate terminal; only the marked isolated app at9227:
pnpm test:motif-midi-native
pnpm benchmark:motif-midi
# After a deliberate guarded cold stop/relaunch of ONLY this profile:
node scripts/motif-midi-native.mjs --verify-restart
```

The native runner creates synthetic local fixtures under `.runtime/synthetic/milestone-3b`, uses actual file input/preview/selection controls, writes only new synthetic notes/exports/checkpoints in dev-vault and invokes `python scripts/verify-midi.py <synthetic-export>` for independent verification. Python3 standard library is a development-verification requirement, never a plugin runtime dependency. REAPER is not launched or configured. Repeated runs create fresh IDs/files; no automatic cleanup deletes earlier test data. Raw results/14 screenshots and before/after full-view profiles are under ignored `output/motif/milestone-3b/`; a reviewed summary is in docs/validation.

Manual workflow: draw/save a motif → Export MIDI → choose saved vault read or current draft → review exclusions → confirm a new visible vault `.mid` path. Repeating the destination must reject a collision. Import MIDI → choose local or search an existing vault file → inspect format/PPQ/tracks/channels/timing/issues → explicitly select one part → acknowledge only named permitted omissions → Create selected part as unsaved motif → review/edit → Save normally. Controllers/bends/SysEx/maps/unknown state cannot be bypassed by acknowledgment. Original files remain unchanged.

Transform notes groups selected semitone/octave and velocity commands plus selected/whole-motif start quantization. Visible grid changes do not quantize. The inspector supports exact bar:beat:tick and raw source ticks; beats use the meter denominator. Apply pending numeric fields first. Bounds/collisions reject the entire command with one-history-entry semantics on success. PATCHBOOK context requires an explicit unique active choice; missing references stay stored. Navigation loads a deferred host view before selecting the UUID. No patch sound is hosted or exported.

The cache retains up to8 clean idle unowned sessions; attached views pin their sessions. Eviction clears only in-memory clean history, never saved data, dirty/owned sessions or checkpoint files. For large phrases inspect actual full-view measurements rather than the3A roll-only result;5k interactions remain slower and no universal guarantee is made.

Native regressions can use `MNEMOBARD_MOTIF_REVIEW_DIR`, `MNEMOBARD_ASSET_REVIEW_DIR` and `MNEMOBARD_FOUNDATION_REVIEW_DIR` under a designated output subfolder; defaults preserve original milestone paths. The [3B report](MILESTONE_3B_REPORT.md#j-testing) lists exact commands and native results. Stop at3B; CANVAS, maps, hardware MIDI, advanced transforms and publication require separate authorization.

## CANVAS development and validation (4A)

New code lives in `src/arrangement/` (pure saved-source summaries/exact timing/preflight), `src/modules/canvas/` (commands/session/library/native view/timeline/inspector/picker), and shared history/music/UI helpers. EntityIndex adds saved-motif source revisions and metadata-only heads. No new dependency or legacy code is included.

```bash
pnpm check
pnpm dev:vault
# Separate terminal; only the marked project-local vault/profile:
env DISPLAY=:1 XAUTHORITY=/run/user/1000/xauth_rQvTCh pnpm dev:obsidian
# Second terminal, guarded localhost:9227:
node scripts/canvas-native.mjs
node scripts/stop-dev-obsidian.mjs
# Relaunch the same isolated host, then:
node scripts/canvas-native.mjs --verify-restart
node scripts/canvas-benchmark.mjs
node scripts/canvas-edge-native.mjs
node scripts/canvas-review.mjs
```

The DISPLAY/XAUTHORITY values above describe this validation host; adapt them to the current local display, never a personal vault. The stop script first checkpoints applied drafts, then verifies the exact project-local profile and CDP port in the parent process command before terminating that process only. No broad process-name kill or automatic file deletion occurs. Application workspace-layout flushing in these development scripts is test harness code, not production persistence.

Native scripts create synthetic records and append recovery; repeated runs retain their data. Screenshots/raw benchmarks stay ignored under `output/canvas/milestone-4a/`; the tracked sanitized evidence is `docs/validation/milestone-4a-native.json`. Earlier screenshot evidence is preserved. Existing regression scripts accept separate review directories:

```bash
MNEMOBARD_MOTIF_REVIEW_DIR=output/canvas/milestone-4a/motif-regression node scripts/motif-native.mjs
MNEMOBARD_ASSET_REVIEW_DIR=output/canvas/milestone-4a/patchbook-regression node scripts/patchbook-assets-native.mjs
MNEMOBARD_MIDI_REVIEW_DIR=output/canvas/milestone-4a/midi-regression node scripts/motif-midi-native.mjs
# After a guarded cold restart, repeat each with --verify-restart.
MNEMOBARD_FOUNDATION_REVIEW_DIR=output/canvas/milestone-4a/foundation-regression node scripts/obsidian-smoke.mjs
```

Save explicitly. Applied edits enter the shared draft/history and delayed checkpoints; unsubmitted clip/lane/settings forms are guarded and require Apply or Discard. Closing a pane warns that unapplied controls were not checkpointed. Dirty sessions survive ordinary view transitions while the plugin is enabled; restart recovery requires explicit discovery/review/loading, then Save. Clean unowned sessions can be evicted; unsaved sessions and recovery files are never automatically pruned. A file rename preserves identity; incompatible source timing blocks new placement while retaining existing clips.

Known boundaries: 32 lanes/1,000 clips/1,000 repeats and4,096-quarter editor length are validation limits, not universal performance promises. Preflight is planning-only. No arrangement audio, export, MIDI-channel policy or tempo/meter maps are implemented. Do not promote the unused source-summary GCD into a playback event stream:4B still needs validated source notes, captured revisions and collision policy.

## Milestone4B validation workflow

```sh
pnpm check
node scripts/arrangement-fixtures.mjs
node scripts/canvas-4b-native.mjs
# Stop only the guarded project host; then relaunch with pnpm dev:obsidian.
node scripts/stop-dev-obsidian.mjs
pnpm dev:obsidian
# In another project terminal after that isolated host has loaded:
node scripts/canvas-4b-native.mjs --verify-restart
node scripts/canvas-4b-verify.mjs
node scripts/canvas-4b-edges.mjs
node scripts/canvas-4b-benchmark.mjs
node scripts/canvas-4b-source-profile.mjs
pnpm audit --json
```

Run native commands sequentially: they share the same guarded renderer and must not race plugin restoration. The native first phase stores synthetic fixture/recovery IDs; restart verification consumes them. `--continue-restart` is a narrowly scoped harness continuation after its recovery phase, not a substitute for a real cold restart. The benchmark creates retained synthetic saved motifs/compositions in the disposable vault. No automatic cleanup deletes them or recovery data. Output under `output/canvas/milestone-4b/` is ignored local review evidence, not release content. Small retained summaries are in `docs/validation/`; the original synthetic golden SMF is in `tests/fixtures/`.

MOTIF/PATCHBOOK/foundation regressions use the existing scripts with `MNEMOBARD_MOTIF_REVIEW_DIR`, `MNEMOBARD_MIDI_REVIEW_DIR`, `MNEMOBARD_ASSET_REVIEW_DIR`, `MNEMOBARD_FOUNDATION_REVIEW_DIR` pointing to new4B subfolders. Never overwrite earlier milestone evidence or run an unqualified Obsidian CLI against a personal instance.

In CANVAS: Save arrangement, review changed source clips, then **Compile arrangement**. Inspect **MIDI routing** and **Compilation / export diagnostics** below the timeline. Explicit routing edits are undoable and require Save; Auto assignments are derived and are shown after compilation. Use **Seek / export** for bar:beat:tick and a new `.mid` vault path. Compilation can use the explicitly displayed working arrangement; only saved acknowledged MOTIF sources are captured. Playing/exporting does not save or dirty it. A failed destination or stale snapshot requires another compile. Stop/close/disabling cancels owned audio and worker work; submitted binary I/O may still finish and must be inspected, never blindly retried at the same path.

## Milestone 4G validation, budgets and DAW checks

```sh
node scripts/mnemobard-4g-native.mjs                     # 40-step workflow (part 1), then stop/relaunch Obsidian and:
node scripts/mnemobard-4g-native.mjs --verify-restart    # cold-restart recovery + personal REAPER config digest check
node scripts/mnemobard-4g-benchmark.mjs <label>          # output/mnemobard/milestone-4g/performance-<label>.json
node scripts/mnemobard-perf-compare.mjs <baseline.json> <candidate.json> [--ratio 1.25] [--floor 5] [--markdown out.md]
node scripts/mnemobard-4g-profile.mjs <label> [notes]    # deploy a non-minified build first (node esbuild.config.mjs)
node scripts/reaper-isolated-check.mjs MNEMOBARD/Exports/<file>.mid --expand --label <name>
```

- Benchmarks compare only runs from the same machine and method (build the older commit in a scratch `git worktree`, copy its `main.js`/`styles.css` into the dev vault, disable/enable the plugin, run; then the current build). Never part of `pnpm check`.
- The REAPER check launches REAPER only with `-newinst -cfgfile <repo>/output/…/isolated-config/reaper.ini`, refuses when any REAPER process runs, and compares a metadata-only digest of `~/.config/REAPER` before/after. `--expand` ticks REAPER's "Expand MIDI tracks" and "Import MIDI tempo map" import options (defaults merge tracks). Window capture/keys use `scripts/x11-window-tool.py` (ctypes, system libX11/libXtst) on the isolated `:1` display.
- Regression suites accept output overrides: `MNEMOBARD_4E_DIR` (seed `partial.json` from `output/canvas/milestone-4e`), `MNEMOBARD_MOTIF_REVIEW_DIR`, `MNEMOBARD_MIDI_REVIEW_DIR`, `MNEMOBARD_ASSET_REVIEW_DIR`, `MNEMOBARD_FOUNDATION_REVIEW_DIR`.

## Milestone 4H validation and edit profiling

```sh
node scripts/mnemobard-4h-edit-profile.mjs <label> [16,500,5000,10000]   # per-phase commit attribution → output/mnemobard/milestone-4h/edit-profile-<label>.json
MNEMOBARD_BENCH_DIR=output/mnemobard/milestone-4h node scripts/mnemobard-4g-benchmark.mjs <label>
node scripts/mnemobard-4h-native.mjs --baseline-build <dir with an older main.js/styles.css>   # steps 1–36, 39–40 (+ same-process export A/B)
node scripts/mnemobard-4h-native.mjs --verify-restart                                          # after a cold restart: steps 37–38, 40
```

- The edit profile runs every operation twice: uninstrumented (the cost) and instrumented (wrappers on the session instance and on `structuredClone`/`JSON.stringify` attribute time and counts to phases). Phases overlap; the overhead is reported, never subtracted. Use even sample counts so alternating edits return to the starting state.
- `freezeDeep` makes drafts immutable: in harness code read `session.snapshot` (no copy) or `session.draft` (editable copy), never write to a snapshot. Restore instrumented instance fields by assignment (`validate` is an own field), never by `delete`.
- Both benchmark builds must be measured in the same Obsidian process (build the older commit in a scratch `git worktree`, copy its `main.js`/`styles.css`, disable/enable the plugin).

## Milestone 4I validation

```sh
node scripts/mnemobard-4i-undo-depth.mjs <label> [16:110,500:30,5000:30,10000:30]   # retained depth / estimate per edit, exact undo-redo
node scripts/mnemobard-4i-recovery-benchmark.mjs <label>                          # real collection + synthetic sizes (no files written)
node scripts/mnemobard-4i-native.mjs                                              # §19 part 1, then cold restart and:
node scripts/mnemobard-4i-native.mjs --verify-restart
MNEMOBARD_PROFILE_DIR=output/mnemobard/milestone-4i node scripts/mnemobard-4h-edit-profile.mjs <label>
```

- Never write synthetic checkpoints into a Recovery folder to benchmark: recovery files are never deleted. The register benchmark builds tier-1 entries in the renderer through the catalog's real code instead.
- The native workflow snapshots path/size/mtime of every `dev-vault/MNEMOBARD` file around browsing and inspection; a MOTIF edit's autosave (500 ms) or a save's pre-save backup legitimately adds checkpoints outside that window.

