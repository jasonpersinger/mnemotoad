# Milestone 2A — PATCHBOOK production library foundation

Date: 2026-11-05. Authority: user Prompt 004 and subsequent Proceed. Scope: PATCHBOOK only.

## A. Executive summary

**Milestone 2A passes for the tested Linux Obsidian desktop environment.** PATCHBOOK is a usable library for instruments, patches and reusable effects chains. It replaces its placeholder with browsers, detail views, real forms, search/filter/sort, related-record navigation, Markdown access, explicit Save, draft recovery and confirmed archive/restore. MOTIF/CANVAS remain shells; no production MIDI/audio/arrangement functionality was added.

Signed local commit **f0d90d1** preserves the completed 1B milestone before implementation. Its signature verifies good. All 37 pending changes matched the prior report; 81 candidate files passed credential-pattern/ignore review, and the original **123 tests**, typecheck, lint and build passed before the commit. No signing configuration was changed or bypassed; no unrelated changes/conflicts were found.

Final verification: **165 tests across 17 files pass**, including the existing 1A/1B suite; strict typecheck, lint and production build pass. Actual Linux Obsidian **1.15.0** passed 17 PATCHBOOK workflow checks, the existing foundation native smoke, and the existing 1B native experiment regression (15 checks / 21 bounded cases). A cold application restart preserved five saved library notes byte-for-byte, stable IDs, module settings, three commands, selected record and search hints. Default light/dark and a narrow desktop pane were inspected. No renderer exceptions were observed in the successful native workflows.

No new dependency, legacy import, remote, publication, system configuration or personal-vault change. The provisional visual system uses native fonts/themes/controls; final branding remains unapproved. Source experiments are unchanged. Implementation and documentation remain uncommitted for review after the signed baseline.

## B. Implemented functionality

| Area | Delivered behavior |
| --- | --- |
| Instruments | Create/edit/browse a named record; optional manufacturer/developer, free-form type, platform/format, description, tags, notes and external references; derived associated patches. No hardcoded supported makers/instruments. |
| Patches | Name and associated instrument suffice for a new UI entry. Optional description, category, tags, character, preset name, parameter notes/structured values, reusable chains, general notes and file references. Existing text-only instrument/effects entries remain supported. |
| Effects chains | Named reusable records, ordered stages, processor names, parameter notes, optional preset links, descriptions/notes. Add/remove/reorder stages with stable IDs; multiple patches share the same chain. No processing. |
| Browsing | Separate Instruments/Patches/Effects chains registers; browser/detail workspace; empty/loading/error states; name/metadata search with AND terms; instrument/category/tag and Active/Archived/All filters. |
| Sorting | Name A–Z/Z–A and manufacturer-then-name; deterministic ID/path tie breaks. List pagination bounds each page to 100 rows. No large-vault speed guarantee. |
| Navigation | Follow instrument/chain/associated-patch IDs; open the actual Markdown record in a native workspace tab; restore query/selected-record hints. Missing/duplicate/invalid targets do not resolve arbitrarily. |
| Save and removal | Explicit Save record or scoped Ctrl/Cmd+S; visible Saved/Unsaved/Recovery/Error states. Confirmed reversible archiving and restore retain notes/relationships. Permanent file deletion stays with Obsidian. |

The tested workflow creates and edits an instrument, creates/reorders/edits a chain, creates two patches sharing it, searches/filters/sorts, follows links, opens Markdown, handles an external conflict, renames the instrument file, archives/restores the chain, disables/re-enables the module with a pending draft, reloads the plugin and restarts Obsidian.

File/audio/screenshot/preset entries are **references only**. No preview, decoder, waveform, attachment copying, preset extraction, VST/AU hosting or external control was implemented. Custom metadata is edited in ordinary Markdown and is preserved by the forms.

## C. Architecture

The feature extends the approved host/domain/application/storage separation and uses the existing single repository. No competing persistence or database.

| File(s) | Responsibility |
| --- | --- |
| `src/domain/entities.ts`, `validation.ts` | Additive library kinds/fields, ordered stages, typed UUID associations and metadata validation. |
| `src/storage/document.ts`, `repository.ts`, `references.ts` | Surgical library YAML mapping; readable-result validation on creation; append-only editor draft recovery; new reference/archived diagnostics. Existing conditional writes/recovery stay authoritative. |
| `src/modules/patchbook/query.ts` | Pure search/filter/sort over derived library items. No host dependency. |
| `src/modules/patchbook/library.ts` | Index-backed catalog, association checks, derived reverse references, shared sessions, archive/restore. |
| `src/modules/patchbook/session.ts` | Cloned per-ID draft, revision tracking, explicit saves, coalesced recovery checkpoints, cancellation and subscribers. Edits arriving during a save remain dirty. |
| `src/modules/patchbook/form.ts`, `view.ts` | Native labeled controls, ordered stages, browser/detail navigation, read-only/error states, focus preservation and workspace lifecycle. |
| `src/main.ts`, `application/services.ts` | Compose the shared library service, replace only PATCHBOOK's view factory, checkpoint before module disable, dispose sessions/UI on unload. |
| `styles.css` | Restrained host-variable styling and container-responsive panes. No new framework/font/art asset. |

The existing view type `mnemobard-patchbook`, module flags and three open commands remain stable. PatchbookView retains the ModuleView lifecycle contract. Scope/index/session listeners and UI handlers are released immediately on close; draft timers are owned by shared sessions and cancelled at plugin disposal. The public Obsidian `Scope` handles Mod+S only for an active edit form; normal shortcuts fall through elsewhere.

Workspace state stores selection/query hints only. State changes call the public host layout-save request; the development cold-stop test flushes its debounce before terminating the isolated process. No authoritative musical data is stored in workspace preferences. [Architecture](ARCHITECTURE.md), [public API declarations](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).

## D. Data model and compatibility

One ordinary Markdown note remains authoritative per record. YAML retains `mnemobard_id`, `mnemobard_kind`, `mnemobard_schema: 1` and title. New kinds are `instrument` and `effects-chain`. Instruments need only a title; chains add ordered `mnemobard_effects` stages. Namespaced library description/notes/archive/external fields avoid claiming unrelated user properties.

Patches retain required legacy `instrument` text plus optional `mnemobard_instrument_id`/wikilink and parallel effects-chain UUID/wikilink lists. Category/character/parameter notes are namespaced additions. Existing `manufacturer`, `preset`, `parameters` and ordered text `effects` remain valid. No automatic conversion, migration, source file rename or new instrument is inferred from an old text label.

IDs remain authoritative across supported portable file/folder renames and title edits. UUID hexadecimal case is treated consistently by indexing, relationships and pickers. New associations require unique active records of the correct kind. Existing broken/archived associations may remain during unrelated edits and are diagnosed. Valid companions refresh on explicit patch Save; Obsidian may also update native wikilinks. No missing target/path hint is invented.

Reverse associated-patch lists are derived. Editing a shared chain does not copy it into patches or rewrite those files. Asset references use the existing safe vault-wikilink contract; external references allow only http/https without embedded credentials and are not fetched automatically. Metadata is rendered as text; invalid drafts never become unsafe detail links.

Unknown metadata and unrelated Markdown remain preserved. Retained stage IDs preserve unknown stage values through reorder/edit. A changed owned structured YAML property may be reformatted and lose comments within that property; its exact original bytes remain in the pre-save recovery. Unrelated fields/comments/prose remain untouched. Future/unknown schemas are read-only. Source-size validation now prevents creating an authoritative note that exceeds the same 8 Mi-character readable-document limit.

Full examples, property mapping, limits and compatibility are in [DATA_MODEL.md](DATA_MODEL.md#milestone-2a-library-records). Prompt 004 explicitly supersedes the earlier provisional text-only instrument/effects proposal; this is an additive library extension, not an automatic schema migration or musical-data change.

## E. Interface and interaction

The interface uses an archival register structure: quiet heading/counters, three register selectors, labeled search/filter controls, numbered rows and a browser/detail divider. Forms use standard text, select, checkbox and textarea controls. Effects stages have named move-up/down actions; parameters and optional references expand within the form. Creation/editing needs no modal. Archive/discard confirmations are inline and cancellable.

Typing stays in the shared draft, preserving field focus across index refreshes. Pending drafts are reachable from the library. Save disables duplicate submissions while allowing further edits; a saved earlier version does not acknowledge newer input. Raw invalid drafts remain editable and recoverable. Duplicate or malformed records expose diagnostics/source access instead of arbitrary editing.

Active host colors/fonts and visible focus outlines are used; no forced palette or remote font. Native screenshots were inspected at 1280×900 and a 440×900 viewport override. At the narrow size the content was 385 CSS pixels wide with equal scroll width and one-column panes; at the wide size content/scroll width both measured 1225. Light/dark foreground/background changed with Obsidian. These are desktop layout checks, not mobile or accessibility certification.

Local ignored screenshots: `output/patchbook/native-dark.png`, `native-light.png`, `native-narrow.png`. Final typography/iconography/branding remain subject to review. [Design direction](DESIGN_DIRECTION.md).

## F. Data integrity and recovery

Save still validates a cloned draft, compares the exact base source, writes a uniquely named original/draft recovery copy, then compares again inside synchronous public `Vault.process` before replacement. A competing external edit, including prose-only changes, is rejected; no silent merge/overwrite. The per-ID queue is local coordination, not a distributed lock.

New creation validates the serialized candidate before the write. A failed/ambiguous write does not trigger blind retry: inspect the current note and recovery path first. Already-submitted I/O cannot be undone by cancellation. Recovery copies may remain after a later failure. No sequence of note/checkpoint/settings writes is transactional across files or crash-durable at the OS level.

LibrarySession retains draft/base and a revision counter. Explicit Save uses a captured revision. Input arriving while it saves remains unsaved afterward. Recovery checkpoints debounce 500 ms, coalesce concurrent requests, and are awaited before register navigation/module disabling. View close releases UI resources first and checkpoints while services remain alive; service ownership retains drafts across view/module closure.

`saveEditorDraft` appends JSON through the existing repository, including temporarily invalid fields, original source when available, and a valid candidate or validation error. It never replaces a note. Save failures attempt this recovery and report both write/recovery errors if needed. A confirmed recovery copy differs from a Saved record. Existing source, disk's external version and raw draft remain available for explicit comparison.

**Limits:** plugin unload disposes sessions/timers and does not rely on asynchronous final writing. The latest unacknowledged edits before the 500 ms checkpoint are not guaranteed durable. Full restart does not automatically reopen pending recovery drafts. Recovery inspection/restore into a new comparison note is manual; no pruning/retention policy was introduced. Saved entity records were cold-restart verified.

**Removal policy:** Archive record → explicit confirmation sets the archive flag through the same stale-write-protected save. Cancel changes nothing. Notes, UUIDs and incoming references remain; queries can include archived records and restore them. No cascade or physical deletion occurs. Permanent deletion remains a separate native Obsidian action. Missing/duplicate/archived references are reported, never reassigned silently. Disabling a module never deletes data.

## G. Tests and native verification

| Command/check executed | Result |
| --- | --- |
| Pre-implementation `pnpm check` | 123 existing tests, typecheck, lint and production build pass. |
| Signed baseline commit / signature verification | f0d90d1, signature G; prior 70f45df retained; clean baseline before implementation. |
| Targeted PATCHBOOK tests | Domain/codec, library/repository, session and jsdom UI cases pass. |
| Final `pnpm check` | **165 tests / 17 files pass**, typecheck/lint/production build pass. 42 new cases; no type/lint rule disabled. |
| `pnpm dev:vault` | Guarded repeat deployment preserves existing disposable notes/settings. |
| `pnpm test:patchbook-native` | **17 workflow checks pass** in actual Linux Obsidian 1.15.0; zero observed renderer exceptions. |
| `pnpm test:obsidian` | Original native foundation workflow passes after the library changes. |
| `pnpm experiments:build` / `pnpm experiments:native` | Existing isolated 1B suite still passes: 15 checks, 21 bounded render cases, repeated audio cancellation/cleanup. No experiment source change or production promotion. |
| Full isolated application stop/relaunch, then `node scripts/patchbook-smoke.mjs --verify-restart` | Five saved notes identical, IDs/settings/commands retained, selected identity/search restored; zero observed renderer exceptions. |
| `pnpm audit --json` | No reported advisories; not a security certification. No new dependency installed. |
| Script syntax/diff/link/credential/ignore checks | Passed; generated bundles, profiles, disposable vault and raw output excluded from Git. |

New tests cover all three kinds, metadata validation, unknown fields/prose, ordered stage extensions, future schemas, safe URLs/invalid drafts, exact ID handling, search/filter/sort, relations, duplicates, renames, missing/archived targets, stale saves, failed writes/checkpoints, oversized creation, concurrent checkpoint/save edits, explicit archive/restore, shared drafts, form focus, module disable and scoped cleanup.

The existing plugin test now asserts the actual PATCHBOOK browser/empty workflow instead of expecting its obsolete placeholder. MOTIF/CANVAS placeholder assertions and command/view/lifecycle/data guarantees remain. No tests were weakened. Checks caught unused imports, native key interception, startup readiness and layout persistence timing; these were corrected. The guarded CDP runner's redundant async wrapper caused Chromium promise-collection failures and was fixed; one native rename needed its host link-update confirmation handled. Early harness failures are not counted as passes.

Reviewed evidence: [native summary](validation/milestone-2a-native.json). Raw sources/checkpoints/screenshots remain ignored under `output/patchbook`; no personal records are in the summary. The 1B regression's new raw timing data did not replace its historical report or tracked benchmark evidence.

## H. Known limitations

- Windows/macOS, physical mobile, pop-outs, screen readers and community-theme matrices are unverified. The supported manifest remains desktop-only with the previously tested 1.15.0 floor.
- Metadata editing uses explicit Save. Checkpoints are append-only/manual recovery, not automatic rehydration or crash-proof autosave. Very recent unacknowledged edits can be lost on abrupt unload/crash; recovery storage grows without automatic pruning.
- Permanent file deletion is deliberately outside PATCHBOOK; confirmed archive/restore is the library removal operation. No multi-file transaction, distributed sync lock or OS-crash durability claim.
- Custom metadata/free Markdown are edited in the underlying note. Changed owned structured fields may format their own contents; exact originals are backed up. Nested YAML is readable but the host Properties editor is not a full effect-stage editor.
- File references are manually entered portable vault links. No asset picker/import, preview, waveform, automatic relinking after off-line asset moves or preset extraction. Broken references are explicit diagnostics.
- Pagination bounds rendered rows, but catalog/index/query copies are still linear and no large-library performance envelope was measured. Search covers the structured library metadata, not arbitrary Markdown body text.
- Final brand identity and broader musical production decisions remain unapproved. No MOTIF/CANVAS functionality was implemented.

## I. Milestone 2B readiness

The shared note formats, ID relationships, library workflows and recovery/conflict boundaries provide a usable base for separately authorized attachment/preview work. Priorities: native vault asset picking and repair, collision-safe optional import with original preservation, bounded on-request audio preview/focus ownership, supported codec/error fixtures, accessible screenshot/preset navigation and cleanup under view/module/plugin transitions.

Review actual library ergonomics, archive terminology and manual recovery expectations before broadening scope. Consider recovery-history/rehydration and large-library measurement as explicit tasks; do not introduce automatic deletion or migration by implication. Keep preview data separate from proprietary instrument hosting, and do not promote the 1B test-tone transport wholesale. No TROUBADOUR code is required or authorized for adoption.

**Milestone 2B has not begun. It requires review and a separate prompt.**

## J. Repository state and preservation

Local main contains signed baselines **70f45df** (1A) and **f0d90d1** (completed 1B). The 2A implementation/tests/docs remain uncommitted and reviewable: **25 modified and 13 new files, none staged**. No remote is configured and nothing was pushed/published. Dependencies/lockfile and MIDI experiment sources are unchanged from f0d90d1. New commands are development scripts, not production network services.

Created: five `src/modules/patchbook` files; four PATCHBOOK test files; `scripts/patchbook-smoke.mjs`; the 2A plan/report and native validation summary. Updated: domain/validation, shared codec/repository/references/services, plugin composition, styles, test host/assertions, guarded CDP helper, package scripts, current documentation and planning records. Historical milestone reports/audit and 1B benchmark evidence were preserved.

TROUBADOUR's 121 tracked files retain aggregate SHA256 `4e217cc4f22b1a049470feb31d5955ece52542619497e97c0924e592f6928ff2`, HEAD `bc2749e2877738bd443a1d3ace66f919d23fe837`, and clean Git status. No source/test/assets/configuration were copied or executed there. No personal vault, system configuration, remote or external original asset was modified. Only the marked project-local vault/profile and task-owned isolated app were used; its process was verified before stopping.

**Stop after Milestone 2A.**
