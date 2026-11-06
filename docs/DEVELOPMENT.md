# Development guide

Current implementation: shared safe persistence, the PATCHBOOK library, asset management, recorded-audio preview and explicit recovery. Musical editors remain shells. Historical reports are preserved; [Milestone2B](MILESTONE_2B_REPORT.md) records current behavior and validation.

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
2. Run each “MNEMOBARD: Open PATCHBOOK/MOTIF/CANVAS” command twice. Expect one corresponding tab per module with an Under development message.
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

`midi-file` 1.2.4 (MIT) is installed as a pinned devDependency for candidate contract/size experiments only. It is not bundled into production or the test-tone lab. No waveform/rendering/UI framework was added. Installation used `--ignore-scripts`; no system packages, global tools, remote repository, publication, or legacy dependency directory was introduced. MNEMOBARD remains private/UNLICENSED pending the distribution decision.

## Remaining boundaries

PATCHBOOK now has shared draft sessions, explicit Save and recovery checkpoints. Generic musical sessions/undo/autosave, automatic asset relinking, migrations, recovery-history/retention UI and production musical compilation remain deferred. Cross-platform media, guaranteed performance targets, crash durability and multi-device conflicts remain unverified. Stop after2A; this guide does not authorize2B or musical production work.

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

Recovery files retain original text, raw draft and a valid candidate when available. Invalid values produce a raw draft/validation error, never an invalid authoritative note. A conflict retains disk content and draft; compare through Open Markdown/Open recovery, then explicitly discard/re-enter reviewed changes against a fresh base. Never blindly retry, silently restore over a newer note or prune copies without a separate policy. Full restart does not automatically rehydrate pending drafts; inspection is manual.

Archive/restore is a confirmed conditional metadata save. It retains notes/IDs/relationships and supports Active/Archived/All visibility; permanent deletion is a separate Obsidian action. New associations require unique active targets. Missing/ambiguous/archived references are diagnostics. Custom properties are edited in the native note and preserved by forms. File references are plain vault wikilinks in2A, without preview/import/execution. See [schema details](DATA_MODEL.md#milestone-2a-library-records).

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

On close/disable the test transport cancels timers/voices, guards pending resumes, disconnects nodes and closes its context. Blur/pagehide/hidden-document policy stops playback. A >100ms audio/wall polling gap or a late event stops instead of catching up. Pause cancels sound; resume retriggers still-held notes for the remaining duration. The normal production plugin has no transport yet. A future shared transport will need explicit focus ownership, sessions, export preflight and platform/latency validation before adoption.


## Asset and recovery development (2B)

`pnpm test:asset-fixtures` creates/preserves only synthetic fixtures in `.runtime/synthetic/milestone-2b` (8s quiet tone, image and inert preset). Existing fixtures are never overwritten. WAV generation uses Node; the optional MP3/OGG/FLAC fixture generation requires an already installed ffmpeg, with no installation performed. `pnpm test:assets-native` uses native form controls/File input and the guarded CDP endpoint9227, then stores `output/patchbook/milestone-2b/native.json` and screenshots. This modifies only synthetic records in the marked disposable vault.

For cold validation, checkpoint/save the test state, flush layout preferences, terminate **only** the isolated app whose parent command includes the exact `.runtime/config/obsidian` profile and port9227, then relaunch with `pnpm dev:obsidian`. Never use an unqualified kill/pkill or CLI command against a last-active personal vault. Run `node scripts/patchbook-assets-native.mjs --verify-restart`. It verifies unchanged source, explicit recovery loading/save, module/view/plugin audio cleanup and theme/narrow screenshots. Screenshots are actual app captures, ignored by Git. A new normal run creates a new synthetic identity set; retain previous fixtures/checkpoints.

`pnpm benchmark:patchbook` runs the same production-code synthetic in-memory benchmark under Node. The native workflow runs it in the Electron renderer. Dataset generation is excluded;25 samples after3 warmups. These are parser/index/query/repository/resolver measurements, not disk or full DOM navigation certification. Results remain under the ignored review directory; the report/validation summary records measured numbers.

Manual review: create instrument/patch → Manage assets → Select vault asset (category and search) → Save. Play, pause, seek, resume, stop. Import local file → inspect name/type/size → confirm visible vault destination → Save association. Remove it and confirm the file remains. Simulate a synthetic missing file, explicitly repair, then Save. Edit and wait for a confirmed checkpoint; restart; Recovery register → inspect original/current/draft → Load draft without saving → explicitly Save. Changed sources require the comparison acknowledgment; a later external change must still reject Save. Future/malformed notes/checkpoints stay read-only. No automatic cleanup exists.

Known host issue: a long-lived stressed development session stalled FileManager link updates while its metadata resolver remained busy. The same full2A native suite passed after a clean isolated restart; do not weaken or bypass source conflicts or force host queues. Broader long-session/OS validation remains required. Raw failure evidence is retained in output; final successful runs have no observed renderer exceptions.
