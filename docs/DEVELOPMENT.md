# Milestone 1A development guide

Current implementation: strict domain/data contracts, source-preserving documents, shared safe repository/index/references, settings and three workspace shells. No musical editing, MIDI codec, timing engine, audio, or timeline exists. [Milestone 0](MILESTONE_0_REPORT.md) remains a historical planning report; [Milestone 1A](MILESTONE_1A_REPORT.md) records actual verification.

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

No MIDI/waveform/rendering/UI framework is installed. Installation used `--ignore-scripts`; no system packages, global tools, remote repository, publication, or legacy dependency directory was introduced. MNEMOBARD remains private/UNLICENSED pending the distribution decision.

## Remaining boundaries

Document sessions, autosave/undo, link-summary generation/automatic asset relinking, migrations, backup retention UI and musical cross-reference compilation are deferred. The foundational APIs retain/reject/report data safely, but no editor promises these future behaviors. Pop-out musical editing, cross-platform media, performance targets, filesystem crash durability and actual multi-device conflicts are unverified. Milestone 1B requires a separate prompt; do not start timing/rendering/MIDI experiments from this guide.
