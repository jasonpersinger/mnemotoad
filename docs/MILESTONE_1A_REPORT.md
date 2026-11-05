# Milestone 1A report

Date: 2026-11-05. Scope authority: user Prompt 002, Milestone 1A only.

## A. Executive summary

**Milestone 1A is complete within its foundation scope.** The plugin builds, typechecks, passes 74 automated tests, and was actually loaded and smoke-tested in Linux Obsidian 1.15.0 using a new marked project-local vault and a separate application profile. A subsequent full application restart verified stored records/settings and nonduplicated commands/views. Windows/macOS behavior remains unverified.

Implemented: plugin manifest/build/tooling, three native under-development workspace views, module toggles, typed patch/motif/composition/asset contracts, schema validation, source-preserving Markdown/YAML/JSON serialization, shared identity/reference services, conditional vault persistence with recovery copies, cancellation/disposal, and a guarded development environment.

No piano-roll editing, sequencing, synthesis, MIDI codec, waveform rendering, arrangement timeline, telemetry, cloud service, legacy code import, remote repository or publication was introduced. Milestone 1B has not begun.

## B. Repository changes

At the start, the root contained the 16 Milestone 0 documentation/metadata files and no Git repository, source or build configuration. No additional implementation since Milestone 0 was found. Without a prior Git/document hash baseline, exact intervening document-byte history cannot be reconstructed; all current requirements were reviewed before edits and a 16-file baseline was captured for this milestone.

New files and purposes:

| Files | Purpose |
| --- | --- |
| `.gitignore`, `package.json`, `pnpm-lock.yaml` | Private local project, pinned tools/runtime YAML, ignored generated/disposable data. |
| `manifest.json`, `versions.json` | Plugin ID mnemobard, version 0.1.0, desktop-only, minimum 1.15.0. |
| `tsconfig.json`, `esbuild.config.mjs`, `eslint.config.mjs`, `vitest.config.ts` | Strict typing, browser CommonJS build, lint and independent test host alias. |
| `src/domain/entities.ts` | Stable entity/asset/reference and versioned payload types; new entity defaults. |
| `src/domain/validation.ts` | Known-field, UUID, local timing/bounds, portable extension and schema validation. |
| `src/domain/paths.ts`, `src/domain/errors.ts` | Portable contained paths/native asset links, actionable typed errors and cancellation checks. |
| `src/storage/document.ts` | Strict YAML/JSON parse, source ranges, exact revision, preserved prose/extensions and owned-block updates. |
| `src/storage/vault-port.ts`, `src/platform/obsidian-vault.ts` | Explicit narrow storage contract and public Obsidian API adapter. |
| `src/storage/index.ts` | Bounded startup scan, targeted/coalesced events, identity ambiguity and stale-read guards. |
| `src/storage/repository.ts` | Shared create/read/save queues, collision protection, pre-save/original/draft recovery and disposal. |
| `src/storage/references.ts` | Entity kind/ID, asset existence and companion-link diagnostics; no automatic repair. |
| `src/application/settings.ts`, `src/application/modules.ts`, `src/application/services.ts` | Validated serialized settings, module lifecycle/open guards, shared service bundle. |
| `src/main.ts`, `src/settings.ts`, `src/ui/module-view.ts`, `styles.css` | Plugin lifecycle, three commands/views, toggles, scoped host-theme styling and diagnostic shells. |
| `tests/domain.test.ts`, `tests/document.test.ts` | Contract/schema/portable data and exact-source serialization/preservation cases. |
| `tests/repository.test.ts`, `tests/index-references.test.ts` | Persistence/conflict/failure/recovery/index/cancellation/reference cases. |
| `tests/settings-modules.test.ts`, `tests/plugin.test.ts` | Preferences and module/host registration/cleanup contracts. |
| `tests/dev-vault.test.ts` | Disposable deployment preserves data and rejects unmarked/symlink targets. |
| `tests/support/memory-vault.ts`, `tests/support/obsidian.ts` | Independently written disposable port and minimal host mock, never a runtime certification substitute. |
| `scripts/dev-vault.mjs`, `scripts/dev-obsidian.mjs` | Guarded artifact deployment and isolated native desktop launch. |
| `scripts/obsidian-cdp.mjs`, `scripts/obsidian-smoke.mjs` | Loopback-only, vault-path-checked native integration test tooling; not bundled. |
| `THIRD_PARTY_NOTICES.md` | Runtime YAML ISC notice; project distribution license still unselected. |
| `docs/DEVELOPMENT.md`, this report | Exact workflows, API behavior, results, limitations and handoff. |
| `docs/superpowers/plans/2026-11-05-milestone-1a.md`, `.milestone-1a-baseline.json` | Reviewable implementation checklist and original-document hashes. |

Reviewed updates to existing files: README/AGENTS now identify the implemented 1A scope and the 1B stop; PRODUCT_SPEC/ARCHITECTURE/DATA_MODEL/ROADMAP distinguish foundation status from future product targets; DECISIONS records Prompt 002 authority and choices; task_plan/findings/progress append evidence. Original audit, technical research, design direction, risk report, Milestone 0 report and legacy hash baseline were preserved. Milestone 0 results remain historical, not retroactive implementation claims.

Generated and ignored: node_modules, root main.js, `dev-vault`, `.runtime` application/test profiles, and native screenshots/results in `output/playwright`. Production main.js measured **128,455 bytes** after the verified final source build; source maps are development-only.

## C. Implemented architecture

Domain types/validation import no Obsidian, DOM/audio implementation, or filesystem/network runtime. Document serialization uses one runtime dependency, yaml2, for strict parsing/source ranges. Repository/index/references consume a narrow VaultPort; only its Obsidian adapter performs public Vault calls. There is one shared repository and ID index for all modules.

The application layer supplies settings, module-open lifecycle and an explicit services object. Settings updates are serialized, preserve unrecognized supported fields, and retain the prior confirmed values on failure. Malformed/future settings are retained read-only; repository writes are blocked until repaired. Module flags gate commands and views, not data access. Disable detaches the relevant interface; plugin unload releases services/subscriptions without detaching existing host-owned leaves. Pending view opens and layout callbacks use guards, and command/factory registrations belong to Plugin cleanup.

PATCHBOOK/MOTIF/CANVAS are ItemView shells with status/diagnostics only. Future editors will consume repository snapshots and reference diagnostics through the shared services; they will not reach into another module’s view or own separate persistence. No global event bus/state framework, editor session/undo system, or speculative audio/MIDI service exists.

## D. Data integrity

Each entity remains a normal Markdown file with UUID/kind/schema identity and YAML metadata. Patch properties are YAML; motifs/compositions own one typed versioned JSON block. New motifs default to 960 PPQ; explicitly supplied source PPQ is retained as data. This milestone does not parse MIDI or compile musical arrangements.

Save freezes caller input, validates it and produces a candidate before writes. It resolves unique identity, rereads current source, compares the exact original string, creates a new recovery JSON, then compares current source again inside synchronous public `Vault.process`. Only an unchanged source is replaced. Per-ID queues prevent this plugin’s concurrent saves from passing stale bases. ID lookup survives file/folder renames; duplicates are explicit ambiguity, never an arbitrary selected file.

Unrelated Markdown/YAML source is preserved through surgical property edits; owned JSON is replaced only when changed. Supported unknown fields are retained. Duplicate keys, ambiguous/unclosed/wrong-kind blocks, unsupported versions and invalid/nonportable values are rejected without rewriting. Asset paths are portable references, not stored app URIs or machine paths. Missing/wrong-kind references and broken assets remain diagnostics; source records are retained.

Recovery JSON records exact original source, proposed draft, candidate source, original path and reason. If backup creation fails, the authoritative update does not begin. If a write fails before or after possible commit, the error retains its recovery path and instructs inspection/reread. `saveDraftCopy` preserves an unresolved draft without replacing the original. There is no destructive automatic retry, restore, pruning or rollback. Collision/creation failures report the affected path; an unacknowledged create may have left a valid file and must be inspected before retrying.

**Guarantee limits:** `Vault.process` provides a local per-file boundary, not an OS-crash-durable, multi-file or distributed transaction. External processes/sync may act outside it. Already-submitted I/O cannot be aborted; disposal prevents additional work at checked boundaries, including queued saves and folder steps. Prose-only competing edits deliberately conflict. Recovery copies are separately created files; they can remain orphaned after a later failure. Restoration is manual into a new comparison note before any explicit replacement. No schema migration occurs automatically.

## E. Testing and verification

| Command/check | Result |
| --- | --- |
| `pnpm install --ignore-scripts` and later `pnpm install --frozen-lockfile --ignore-scripts` | Pass; pinned local installation; frozen lockfile reproducible. No system/global install. |
| `pnpm typecheck` | Pass with strict/noUncheckedIndexedAccess/noUnused checks. |
| `pnpm lint` | Pass; no explicit-any or non-null-assertion bypass. |
| `pnpm test` | **74 tests across 7 files pass.** |
| `pnpm check` | Pass: typecheck, lint, complete tests and production build. |
| `pnpm build:dev` / `pnpm dev` | Development/watch compilation exercised successfully; watcher stopped afterward. |
| `pnpm build` | Pass; minified browser CJS artifact with Obsidian external. |
| `pnpm dev:vault` | Pass; repeated deployment retained settings/data. Guards also exercised in automated disposable fixtures. |
| `node --check scripts/*.mjs` (each script individually) | Pass for deployment, launcher, CDP and smoke scripts. |
| `pnpm audit --prod --json`, final `pnpm audit --json` | No reported vulnerabilities after the documented dev-only minimatch patch override. This is not a full security certification. |
| `pnpm test:obsidian` | Pass in **actual Linux Obsidian 1.15.0**, final production bundle. |
| Cold application restart through `pnpm dev:obsidian` | Pass: prior patch/motif/composition IDs, stored source/settings, three commands and one view per module restored; zero observed renderer exceptions in the checked workload. |

Automated cases include all three entities; stable IDs, schema errors, malformed YAML/JSON/duplicate keys, portable/unknown data, prose/CRLF/fence retention, collisions, duplicates, renamed IDs, missing/type/link/asset references, competing/external saves, before/after-commit errors, failed backups, explicit draft recovery, frozen inputs, cancellation/disposal, bounded/coalesced indexing, stale reads, settings failures/future schemas, command/view lifecycle and deployment symlink guards.

Native smoke checked all command-opened shells; native settings rendering and save/reload; public Vault creation/update/prose retention; rename identity; stale-save rejection; original/draft recovery; all entity kinds/reference resolution; module-disable view cleanup/data preservation; unload rejection of old repository work; command cleanup; re-enable/cold-reopen without duplicate commands/views. Screenshot/results were captured and inspected at `output/playwright/milestone-1a-native.png` and `.json` (ignored local evidence).

During development, codec tests initially failed before the module existed. Review tests then exposed duplicate-JSON acceptance, nonportable extension acceptance and quoted-ID/future-schema diagnostic loss; these were corrected and tests retained. Initial native harness assertions assumed settings lived in the main document; Obsidian 1.15 uses a separate settings window, so the harness now inspects its tab container. A renderer `require('obsidian')` probe was invalid because native API injection occurs in plugins; the plugin itself loaded correctly. Lint findings in path validation/test mocks were fixed, not disabled. Scoped minimatch overrides initially missed other transitive dev paths; one pinned override now covers them all and passes checks/audit.

Not run: Windows/macOS host tests, physical mobile, OS power-loss tests, multi-device sync/concurrent external-process stress, long-duration resource/memory profiling, MIDI/DAW/audio/renderer timing benchmarks, accessibility certification or full MVP acceptance. Those are not implied by mock tests/native foundation smoke. The isolated host’s own updater made its ordinary update request; MNEMOBARD runtime contains no networking.

## F. Deviations and decisions

- Prompt 002 supersedes the earlier “Milestone 0 only” restriction for **1A only**. It explicitly prohibits legacy copying; implementation/tests were independently written. Reuse groups remain unapproved.
- yaml2 is the one justified runtime dependency: public host YAML conversion cannot supply surgical source ranges/strict duplicate-key preservation. Native APIs remain the actual vault writer. ISC notice retained; no MIDI/rendering dependencies installed.
- Whole-source comparisons were selected over managed-field merging. This is conservative and may reject harmless competing prose edits; it avoids silent merge behavior before editors exist.
- Document sessions, autosave/undo, migration machinery, reverse-link summaries/automatic asset relinking and retention UI were deferred. They are unnecessary for shell/API-only explicit writes and remain documented future work; no user editor silently lacks a promised save policy.
- Minimum host was set conservatively to the actually tested 1.15.0; typings are 1.14.4. Package remains private/UNLICENSED pending the distribution choice; no release LICENSE was invented.
- Dependency installation scripts were disabled. A patched minimatch 11.0.1 override is limited in effect to the dev tool tree and must be revisited with upstream updates.
- Generic TypeScript/ESLint rules are configured; the optional Obsidian-specific lint package was not added. Public API/lifecycle conventions were reviewed and exercised natively; submission-specific automation can be evaluated before a release.

## G. Remaining risks

The repository prevents locally visible stale writes but cannot provide crash/distributed durability. Recovery storage grows without automatic pruning; users must not treat snapshots as a full vault backup strategy. Input limits and conservative YAML/asset syntax need future user-facing repair guidance. Index lookups/diagnostic rendering remain linear in indexed entities, despite bounded targeted file reads. Musical cross-reference bounds/channel/expanded-note semantics, source-resolution conversion, future schema migrations, editor draft ownership, accessibility/performance, pop-outs and cross-platform behavior need later work. [RISKS.md](RISKS.md) retains the broader experiment plan; no results are claimed for those experiments here.

## H. Milestone 1B readiness

The tested domain/storage/host boundaries and disposable environment are ready to support separately authorized feasibility experiments. **Milestone 1B is not authorized or started.** Begin with source-PPQ/time conversion, a shared tick compiler, late-scheduler policy and culled rendering experiments only after the next prompt/review.

For controlled read-only comparison, TROUBADOUR’s `core/music.ts`/`note-edit.ts`, `audio/voices.ts`/`levels.ts` and selected transport cancellation ideas remain candidates, as do preservation/race regression scenarios. No source/tests/fixtures were copied. Any later extraction still needs named authorization and rights/provenance review; the old DOM piano roll, section model and MIDI codec remain reference/rebuild candidates rather than default integrations.

## I. Git and preservation

A local repository was initialized on `main`. **No commits, staging, remotes, push or publication.** All project source/docs are currently untracked on the unborn branch; this includes the preserved Milestone 0 files because they had no Git history. Generated bundles, dependency directories, `.runtime`, output and the disposable vault are ignored. This report does not present an invented clean committed state.

All 16 initial files remain present. The original audit/research/design/risk/Milestone 0 report and legacy baseline remain byte-identical; the reviewed status/decision/development records listed above were extended or updated. TROUBADOUR’s 121 tracked files retain aggregate SHA-256 `4e217cc4f22b1a049470feb31d5955ece52542619497e97c0924e592f6928ff2`, HEAD `bc2749e2877738bd443a1d3ace66f919d23fe837`, and a clean working tree. No legacy code/tests/assets/configuration were copied or executed. No personal vault, system configuration or remote repository was modified. Only the task’s own isolated development application/watch processes were used and stopped; no existing Obsidian process was targeted.

Stop here. The next implementation phase requires a separate prompt and review.
