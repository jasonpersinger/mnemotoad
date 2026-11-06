# Milestone 2B — PATCHBOOK assets, auditioning and recovery

Date: 2026-11-05 local (final evidence 2026-11-06 UTC). Authority: user Prompt 005 after report-level 2A review. Scope: PATCHBOOK only.

## A. Executive summary

**Milestone 2B is complete for the tested Linux Obsidian environment.** PATCHBOOK now selects existing vault files, imports confirmed local copies, auditions recorded audio, diagnoses/repairs missing references and discovers/inspects/loads recoverable unsaved drafts. Existing instruments, patches, reusable chains, search/filter/sort, identities, Markdown preservation, conflict protection and reversible archiving remain supported.

Signed baseline **300eba2** preserves all 38 reviewed 2A changed/new files. Its signature verifies good. The baseline 165 tests, typecheck, lint and production build passed before committing. No signing configuration was changed; no remote or unrelated change was included.

Final automated verification: **209 tests across 21 files pass** (44 additional cases), strict typecheck, lint including the benchmark, and production build pass. Actual Linux Obsidian **1.15.0** passed the 2B workflow/cold restart and additional keyboard/image/hash probes (14 grouped checks), the original 11-check foundation native smoke, and the full 17-check 2A regression. Nine actual application screenshots are retained for review. Successful runs observed no renderer exceptions. MIDI experiments and dependency lockfile are unchanged.

This is not a release or cross-platform certification. Windows/macOS, pop-outs, screen readers, community themes, long-duration resource/codec matrices and large-vault disk/DOM performance remain unverified. No legacy copying/modification, personal-vault access, remote publication, system install or musical-editor implementation occurred.

## B. Asset management

**Selection and inspection.** Manage assets in a record form opens an inline searchable/paginated selector over public Vault.getFiles metadata. Audio, image and preset roles remain user choices; arbitrary portable file extensions can be associated. Name/type/size/status and actions are displayed. Existing path safety rules exclude non-portable paths. Removing a reference changes only the unsaved association; it never deletes the file. Explicit Save persists through the existing repository. Instruments and patches share the workflow; common assets are also available on chains.

Recognized image/audio extensions open in supported Obsidian workspace viewers. Presets and arbitrary extensions open in an inert native inspection modal, with optional explicit text reading up to 256 KiB. No OS application is launched and no preset content is executed. Large/binary files remain metadata references. Native preset text inspection and native image opening were verified.

**Import.** The native browser file chooser selects one local File. PATCHBOOK shows its name, supplied MIME type and size; the user chooses category and confirms a visible vault-relative destination. Default `assetDirectory` is `MNEMOBARD/Assets` (existing settings without this property derive `<creationRoot>/Assets`). It is configurable in settings; records never contain external absolute paths. No URL fetching.

Nonempty files up to **100 MiB** are copied using public Vault.createBinary. Existing destinations get a UUID filename suffix; folders/paths are validated against traversal, absolute paths, hidden destination directories, reserved names and the existing portable-link contract. The source is read only. The native copied bytes and external original have matching SHA-256, and the original hash remained unchanged.

Copy completes before a draft reference is associated. Association then requires normal Save. A failed/cancelled/uncertain copy may leave a complete or partial unassociated file; its path is reported, retained and never retried/deleted automatically. Cancellation cannot undo a submitted host write. Navigating away or opening another picker cancels pending association. Copy and entity-save are separate operations, not a transaction. Public APIs do not establish a distributed or OS-crash exclusive-create guarantee.

**Repair.** Valid paths use contextual metadata resolution and current file metadata. Missing paths retain their text and offer an explicit replacement selector in edit mode. Repair preserves role, changes only the chosen draft reference and uses normal conditional Save. Removing associations retains imported copies indefinitely. Native FileManager link updates follow Obsidian settings; moves without maintained links require explicit repair. Malformed/future entity notes remain read-only and may need source Markdown repair first. Entity identities remain UUID based; asset identity remains a portable path/link.

## C. Audio preview

Production auditioning uses one **lazy HTMLAudioElement** owned by an AudioPreview service. It uses transient Vault.getResourcePath URLs only after Play. No Web Audio context, experimental transport, synthesis, waveform, sample library, remote service or production dependency was added. Library indexing never decodes recordings.

Play, Pause, Resume, Stop, textual position/duration and a keyboard-operable seek range are available. Starting another preview releases the old one. Record navigation, form/detail replacement, owning-view close, module disable and plugin unload stop/release playback. Switching an Obsidian tab while the same owning record/view remains open can continue playback; background auditioning is not a composition transport. No autoplay on record open.

Stop/error/end releases src/listeners and resets the media load. Pending play/resume promises are generation guarded, including pause during initial loading. Initial playback times out after 30 seconds; the preview guard rejects files larger than **250 MiB** with an actionable message. These conservative limits are resource safeguards, not measured capacity guarantees. Media decoding memory is runtime dependent. No created object URLs need revocation.

Native fixtures: 8-second mono 44.1 kHz PCM16 WAV, MP3, OGG/Vorbis and FLAC reached Playing with correct duration/position. A corrupt WAV produced an unsupported-decoding error and released resources. This verifies these fixtures on this installer, not every encoding/container or OS. Audible output/device latency was not independently measured. Automated tests cover repeated 25-cycle cleanup, errors/timeouts, switching, stale promises and ownership. Native checks cover pause/resume/seek, record navigation, close/disable/unload and keyboard activation.

## D. Recovery

The **Recovery register** discovers both existing schema1 envelopes: `mnemobard-editor-draft` and `mnemobard-recovery`. It searches documented visible `/Recovery/` JSON subfolders, including historical creation roots, without modifying checkpoints. Lists show timestamp, record identity/title and errors. Source resolution uses UUID, including renamed notes; duplicates/missing/unreadable sources block loading.

Inspection displays raw JSON, original source, current authoritative source and recoverable draft as inert text. Future/malformed/duplicate-key/unsupported entries remain inspection-only. Common temporarily blank name/instrument/stage fields can load for correction; other invalid structures remain available as text rather than unsafe editable objects. Musical-module recovery is not edited here.

**Load draft without saving** requires an explicit action and creates a dirty shared LibrarySession. Nothing automatically reopens or overwrites after restart. An existing dirty session must be saved/discarded first. If the authoritative source changed, the user must compare versions and explicitly acknowledge using the displayed current text as the save base. The service rechecks both checkpoint and current bytes before loading. Recovered structured values may replace current values on the later explicit Save; no silent merge is performed. Unrelated Markdown is preserved by the codec, and normal Save backs up the current source. A subsequent external edit still rejects the save. Original source/checkpoint and competing draft remain recoverable.

Discovery is paginated at 100 checkpoints, with a 32 MiB read budget per page. Individual inspection is bounded to 20 MiB; each text display is limited to 64 Ki characters with an Open original action. No automatic pruning/deletion. History can grow without bound; users need ordinary vault backups and manual storage management. A confirmed checkpoint differs from Saved and does not guarantee durability of newer unacknowledged edits.

The native cold workflow confirmed that source/assets survived restart; inspection/loading wrote nothing; explicit Save restored the draft; the checkpoint remained byte-identical. Tests additionally cover changed-source acknowledgment/revalidation, later conflicting saves, renamed/missing/duplicate originals, malformed/future data and preservation.

## E. Interface

The archival registers retain existing navigation and native theme controls. New asset rows, inline picker/import destination, compact audition controls and recovery comparison sections use host typography/tokens and visible focus. Metadata remains unsaved until Save; import/recovery errors are textual and actionable. No final font, iconography or artwork decision.

Native Enter starts/stops audio, Space pauses, Arrow seeks and focus remains visible. Labeled controls, keyboard-native elements and text status were checked. This is not screen-reader or WCAG certification. Default light/dark and a narrow pane were inspected: measured root client/scroll width **385/385 px**, one-column layout, no horizontal overflow. Community themes/high DPI/pop-outs remain open.

Actual captures under `output/patchbook/milestone-2b/` (ignored by Git; local review deliverables):

- [05a-asset-selection.png](../output/patchbook/milestone-2b/05a-asset-selection.png)
- [05b-asset-import.png](../output/patchbook/milestone-2b/05b-asset-import.png)
- [04-audio-preview.png](../output/patchbook/milestone-2b/04-audio-preview.png)
- [06-recovery.png](../output/patchbook/milestone-2b/06-recovery.png)
- [03-patch-assets.png](../output/patchbook/milestone-2b/03-patch-assets.png)
- [01-main-browser.png](../output/patchbook/milestone-2b/01-main-browser.png)
- [02-instrument-detail.png](../output/patchbook/milestone-2b/02-instrument-detail.png)
- [07-narrow-pane.png](../output/patchbook/milestone-2b/07-narrow-pane.png)
- [08-dark-theme.png](../output/patchbook/milestone-2b/08-dark-theme.png)

## F. Performance

Hardware: AMD Ryzen 7 5700G, 16 logical CPUs, approximately 27.3 GiB RAM; Linux x86_64, Node26.13.0/pnpm10.29.3. Native host: Obsidian1.15.0, Electron43.8.6, Chromium150.0.7871.250. Theme screenshots use1280×900 and440×900 emulated desktop viewports at DPR1.

`benchmarks/patchbook.ts` runs real production codec/index/query/repository/asset-resolution code against an in-memory synthetic VaultPort: one instrument plus patches, three references per patch, deterministic tags/categories. Fixture generation is excluded; query measurements use3 warmups and25 samples. Initial indexing is a single run per size. Navigation measures repository read/ID resolution/parse, not the full view. This isolates application costs; it does **not** measure filesystem IO, metadata-worker throughput, full DOM navigation/redraw, heap retention or audio decoding. Sub-0.1ms results are below native timer resolution, not zero work.

Native renderer timings in milliseconds; repeated columns show median / p95:

| Records | Initial index | Search | Filter | Sort all results | Record read | Three asset resolutions |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | 14.5 | 0.2 / 0.3 | 0.1 / 0.2 | 0.4 / 0.6 | 0.2 / 0.3 | <0.1 |
| 1,000 | 90.7 | 1.3 / 1.5 | 1.0 / 1.1 | 4.4 / 4.8 | 0.1 / 0.3 | <0.1 |
| 5,000 | 416.2 | 7.2 / 9.3 | 5.4 / 5.8 | 25.0 / 25.8 | 0.3 / 0.4 | <0.1 |

Before optimization, Node median 5k search was25.57ms, filtering23.79ms and sorting25.85ms. A revision-keyed derived catalog snapshot avoids cloning every entry before each query; results remain caller-isolated and cache invalidates on updates/rename/duplicates. The matched Node after-run and exact native results are in the validation summary. No database or search service was introduced. Full-result sorting/cloning and initial parsing remain linear; recommend measuring disk/DOM behavior before another targeted pagination/index optimization. No universal performance target was established.

## G. Testing

| Command / validation | Actual result |
| --- | --- |
| Baseline `pnpm check` |165 tests /17 files; typecheck/lint/build passed before signed300eba2. |
| Final `pnpm check` |**209 tests /21 files pass**; strict typecheck, ESLint including benchmark, production build pass. No rule disabled or existing case removed. |
| `pnpm test:asset-fixtures` | Synthetic task-local files created/preserved; no originals overwritten or tools installed. |
| `pnpm test:assets-native` | Native create/select/import/persist, preset inspection, four codec probes/error, repair/navigation and confirmed draft checkpoint passed. |
| Guarded isolated stop/relaunch, then `node scripts/patchbook-assets-native.mjs --verify-restart` | Cold recovery, no writes on inspect/load, explicit Save, retained checkpoint, audio lifecycle, screenshots and native benchmark passed. |
| Additional guarded CDP Enter/Space/Arrow/image/hash probes | Keyboard controls/focus, native image viewer and byte-identical vault copy passed; summary records results. |
| `pnpm test:obsidian` |Original11 foundation native checks pass. |
| `pnpm test:patchbook-native` |Full17 2A native workflow checks pass after a clean isolated restart, including Ctrl+S, FileManager rename, conflicts, archive/restore and lifecycle. |
| `pnpm benchmark:patchbook` |100/1,000/5,000 Node datasets measured; same production-code benchmark ran in native Electron. |
| `pnpm audit --json` |No reported vulnerabilities; no new package/lockfile change. Not a security certification. |
| `node --check` for all four changed/new development scripts; `git diff --check`; ignore/credential/link checks | Passed. Generated bundles, profiles, fixtures and screenshots remain ignored. |

Meaningful new coverage: existing selection, reference creation/remove/repair, missing/unsafe assets, context rename resolution, import byte preservation/collision/path/size/read-only/cancellation/uncertain writes, late-picker cancellation, media transitions/errors/timeouts/late promises/cleanup, inert text inspection, recovery discovery/loading/conflicts/renames/duplicates/invalid envelopes, source/checkpoint preservation, UI workflows and cache invalidation/caller isolation. All original domain/storage/library/MIDI experiment tests remain passing.

Native testing exposed a late ItemView key-scope attachment: moved initialization into the constructor, retained per-open registration/disposal, and added a regression test. The older native diagnostic assertion was adapted to case-insensitive text because the new asset-specific message precedes the summary; its missing-state check remains intact. Early harness failures included missing key character payloads, a navigation hint assumption and a cleanup-expression syntax error; corrected results alone are counted as passes.

One long-lived stressed host session left its metadata link resolver busy and stalled FileManager rename. The same complete suite passed after a clean isolated restart. This is retained as a host/long-session compatibility risk, not hidden by changing signing, forcing internal queues or weakening conflict tests. No private host API is used in production; guarded native debugging inspected the test host queue only. Source experiments were not modified or promoted. Windows/macOS, real screen readers, community themes, high-DPI/pop-out matrices and extended memory/device stress were not performed.

Evidence: [sanitized native/benchmark/preservation summary](validation/milestone-2b-native.json). Raw sources, checkpoint JSON, failures and screenshots stay in the ignored output directory. Final bundle is **196,688 bytes**, with the same SHA-256 in the tested disposable install and root build: `9393b8a9ddcfb45826dbb50167ebe5f60d14ce19e4cf4af65ae3266b080c8442`.

## H. Architecture

| Created/updated files | Responsibility |
| --- | --- |
| `src/storage/asset-port.ts`, `src/platform/obsidian-vault.ts` | Narrow typed metadata/resource/binary-create port using the existing public vault adapter. |
| `src/modules/patchbook/assets.ts`, `asset-panel.ts` | Safe association/copy service and record-scoped selection/import/repair/list controls. |
| `src/modules/patchbook/preview.ts` | Single owned on-demand media preview; injected media interface for deterministic lifecycle tests. |
| `src/modules/patchbook/recovery.ts`, `recovery-panel.ts` | Bounded read-only history/inspection, explicit verified draft preparation and UI. |
| `src/ui/asset-inspector.ts` | Inert arbitrary-file/preset inspection without an external opener. |
| `src/modules/patchbook/library.ts`, `src/storage/index.ts` | Explicit recovered-session creation; revision-keyed derived query snapshot. |
| `src/modules/patchbook/form.ts`, `view.ts`, `styles.css` | Integrate asset/recovery controls, early key scope, native status and scoped provisional layout. |
| `src/application/services.ts`, `src/application/settings.ts`, `src/settings.ts`, `src/main.ts` | Compose/clean up shared services and the optional asset-directory setting. |
| Four new asset/preview/recovery/inspector test files; existing library/view/host support tests |Unit/contract/UI coverage without a personal vault. |
| `benchmarks/patchbook.ts`; three new `scripts/patchbook-{assets-native,benchmark,test-assets}.mjs`; existing `patchbook-smoke.mjs`; package scripts/tsconfig |Reproducible synthetic/native validation and typed benchmark; no production dependency. |
| README/AGENTS; product/architecture/data/roadmap/decisions/design/development/risks; plan/progress/findings; this report and validation summary |Current implementation, authority, evidence and limitations. Historical milestone reports remain unchanged. |

No entity schema, authoritative format, repository conflict contract, musical service, dependency or license changed. Settings schema1 adds a defaulted property while preserving unknown preferences. New files are original implementations. Prompt005's explicit unsaved-session recovery supersedes the earlier provisional new-comparison-note plan; no duplicate authoritative record is created for inspection. Conservative resource limits, inert unknown-file opening, the measured cache and early key-scope correction are documented implementation choices within scope. See [architecture](ARCHITECTURE.md), [data contracts](DATA_MODEL.md) and [decision log](DECISIONS.md).

## I. Known limitations

- Codec support is host/encoding dependent. Existing asset association accepts arbitrary portable extensions; preview is runtime-decoded and bounded. Text inspection of arbitrary presets is inert and limited, not proprietary preset parsing or an external loader.
- External copy may remain unassociated after cancellation/failure or a later rejected Save. Inspect the reported path and select the retained file; nothing is automatically deleted. Cross-process sync/crash durability remains outside public per-file guarantees.
- Assets moved without link maintenance require explicit repair. Malformed/future entity notes may need manual Markdown correction before UI repair. UUID records, unlike assets, resolve by identity after rename.
- Recovery is explicit and append-only; unsupported/malformed structures are text-only, missing/duplicate sources block loading, growth is unbounded and very recent uncheckpointed edits can be lost. No automatic backup/migration/pruning.
- Main-window Linux native verification only. No physical audible-output/latency, screen-reader, pop-out, Windows/macOS, community-theme or prolonged suspend/device-loss certification. Host metadata-queue stress needs broader testing.
- Catalog/index/query materialization remains linear. Current benchmark excludes disk and full UI/heap behavior. No full-library scalability guarantee.
- Final visual identity, distribution license and all musical production-adoption proposals remain unapproved.

## J. Next milestone readiness

PATCHBOOK's initial beta **library feature set is present**: records/chains, search, assets/import, recorded auditioning, repair, archive and explicit recovery. It is ready for human workflow/visual review; beta distribution still needs cross-platform/codec/accessibility/long-session validation, a license/release decision and remaining performance evidence. No release is authorized here.

Before MOTIF, separately approve its scope and B01–B04 timing/codec/rendering/transport choices, then establish production musical session/undo and interoperability contracts. Recorded previews do not approve synthesizer/experimental transport adoption. No TROUBADOUR reuse request is needed for2B; source extraction/rights remain gated. Do not begin MOTIF or CANVAS without a new prompt.

## K. Repository state and preservation

Local main now has signed baseline **300eba2** (`feat: preserve verified Milestone 2A PATCHBOOK foundation`) after70f45df/f0d90d1. Signature verification is good; signing configuration unchanged. This is the only new commit. The2B source/tests/docs remain uncommitted and reviewable: **30 modified and 18 new files**, none staged. No remote configured, push, repository publication or plugin distribution.

Generated bundle/dependencies/dev-vault/profile/fixtures/screenshots remain ignored. pnpm-lock.yaml, MIDI experiment sources, historical milestone reports, audit and historical native summaries are unchanged. No TROUBADOUR source/test/asset/configuration was copied or executed. The prompt's `/home/troubadour` was absent; the previously user-corrected authorized root `/home/jason/troubadour` remained read-only.

Legacy preservation:121 tracked files, clean Git state, HEAD `bc2749e2877738bd443a1d3ace66f919d23fe837`, aggregate SHA-256 `4e217cc4f22b1a049470feb31d5955ece52542619497e97c0924e592f6928ff2`, exactly matching the original audit baseline. No personal vault was accessed or modified by this work. Only the marked project-local vault/profile, synthetic external fixtures and guarded task-owned Obsidian process were used; no system configuration/install or original external asset modification. The isolated app is stopped after review evidence capture.

**Stop after Milestone 2B.** The next phase requires human review and separate authorization.
