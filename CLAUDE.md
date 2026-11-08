# CLAUDE.md — MNEMOBARD

Offline-first Obsidian community plugin (`mnemobard`) for remembering and assembling musical ideas: **PATCHBOOK** (instruments/patches/effects/assets), **MOTIF** (piano roll, MIDI import/export, audition), **CANVAS** (multitrack arrangement of saved motifs, compilation, Type 1 MIDI export, playback). Not a DAW.

**[AGENTS.md](AGENTS.md) is the governing rule file** (authority scope, data safety, legacy boundaries, engineering discipline). This file only adds operational orientation; if they ever disagree, AGENTS.md and the current user prompt win.

## Commands

```sh
pnpm check          # typecheck + eslint + vitest + production build (run before/after every milestone)
pnpm test           # vitest only (jsdom)
pnpm dev:vault      # deploy build into the marked disposable dev-vault/
pnpm dev:obsidian   # isolated Obsidian (project-local profile, CDP on localhost:9227)
node scripts/arrangement-fixtures.mjs   # golden arrangement MIDI + independent Python verification
```

Native validation scripts live in `scripts/*-native.mjs` and drive only the isolated instance via `scripts/obsidian-cdp.mjs`. Details: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Layout

| Path | Role |
| --- | --- |
| `src/domain/` | Entity types (`entities.ts`), schema-1 validation (`validation.ts`), vault-path rules (`paths.ts`). Pure. |
| `src/storage/` | Markdown/YAML/JSON codec with extension preservation (`document.ts`; 4G duplicate-key scan `json-keys.ts`), repository, index (incl. 4F parse-time reverse links: `referencing`/`outgoing`; 4G `locate()` = `resolve()` without an entity copy), reference diagnostics and `reference-status.ts` (shared classification), recovery (`recovery.ts`; 4I `recovery-catalog.ts`: in-memory register catalog + pure `queryCatalog`). |
| `src/application/` | `DocumentSession` (protected save, checkpoints, `relocate`; 4H frozen draft, `snapshot`, protected `adopt`) and `HistorySession` (bounded undo: 100 entries / 16 MiB of identity-aware estimated retained memory, 4I; frozen shared snapshots); `freeze.ts`, `json-equal.ts` (4H; `sameJson` 4I), `history-memory.ts` (4I retained-size estimate); `navigation.ts` (4E readiness coordinator). |
| `src/music/` | Exact timing (`timing.ts`), bar:beat:tick (`positions.ts`), musical durations (`durations.ts`), transport, audio. |
| `src/arrangement/` | Pure arrangement preflight/compiler/routing/collisions/capture/preparation (4B); `source-review.ts` (4G batch review planning + token); `export-summary.ts` (4H, reads the compiled result + MThd header only). |
| `src/midi/` | Shared note-only serializer, import/export, worker. |
| `src/modules/{patchbook,motif,canvas}/` | Module views. CANVAS: `view.ts` (controller), `timeline.ts` (lane canvas + fixed structure ruler), `geometry.ts` (viewport math), `commands.ts` / `structure.ts` (pure edits), `structure-panel.ts` (sections/markers/recordings UI, renders the selected editor into the contextual inspector), `rename-merge.ts` (provable link-only rename), `freshness.ts` (4E external-change watcher). |
| `tests/` | Vitest suites; `tests/fixtures/` golden MIDI (must stay byte-identical). |

## Invariants that are easy to break

- **Every persisted edit** is a pure `Composition → Composition` command passed to `session.edit(label, fn)`; it validates atomically and creates exactly one history entry. Navigation/selection never edits.
- **Optional known fields** must be listed in `retainExtensions` (`src/storage/document.ts`) for their array context, or a deleted field is resurrected from the file on save. Unknown fields must survive round trips.
- Schema 1 is authoritative; no schema bump, no migration on open, unknown future schema is read-only. Composition PPQ is fixed at 960; ticks are exact integers.
- Vault-relative paths only (`vaultPath()`); never absolute paths or traversal. Never modify/move/delete user audio, presets or imported MIDI.
- Sections/markers/audio references must never affect compilation, routing or MIDI bytes. Section overlap is an edit-time rule, never a load failure.
- `session.draft` deep-clones on every read; `session.snapshot` (4H) is the frozen draft itself (no copy, read-only — writes throw). Read the snapshot for rendering/derived state, take `draft` only when an editable copy is needed; key caches by `session.changeVersion` (bumps on edit/undo/redo/reload), never by serialising the draft.
- Session drafts, history entries and `sealedMotif` results are deeply frozen and shared (4H). Never write to them; never install a value with `adopt` that someone else can still mutate. In-app MOTIF commands pass `sealedMotif` as `finish`; the default `finish` (`editableMotif`) keeps the mutable-copy contract. Validation may be memoised for sealed values, never skipped.
- 4I: MOTIF transforms receive the frozen draft (`shareTransformInput`): build new values, never write to the input (it throws). `sealedMotif` takes ownership of its argument and shares its unchanged nested values. Undo budget = `RetainedSize` over past+future entries (each object once); keep retain/release symmetric with every change to `past`/`future`.
- Recovery register: browsing/inspecting must never write; load only through `CheckpointRecovery.prepare()` + the library's `recover()`. No checkpoint deletion, pruning, repair or migration of any kind. For status/path checks use `index.locate()`, for draft lists `session.draftTitle`. `index.all()` clones every entity in the vault: use `heads()` / `ofKind()` in anything that runs on index publish.
- Clean CANVAS sessions are refreshed by `CanvasFreshness`; never auto-modify a dirty draft, never treat a musical fingerprint as save safety.
- Source acknowledgement writes only the clip review fields. Batch acknowledgement (`CanvasLibrary.reviewAll`) must revalidate against the motif note on disk and the reviewed placement set immediately before its single `session.edit`; never acknowledge partially or automatically.
- Cross-module navigation goes through `services.navigation.navigate()` (use `ui/navigate.ts#navigateTo`); a target must implement `reveal()` behind its `ReadyGate`; sources checkpoint drafts before leaving. Show references with `ui/reference-row.ts` (names first, IDs in advanced detail).
- Dispose timers, frames, observers, listeners, audio and workers; guard async completions after view/module/plugin disposal.

## Process

- Work only in `~/MNEMOBARD` and the marked `dev-vault/`. Never personal vaults. TROUBADOUR is read-only and never copied.
- Commits are local and GPG-signed with the existing config (`git commit -S`). Never change signing config, never push, never publish.
- Milestone evidence: `docs/MILESTONE_*_REPORT.md` (historical, do not rewrite), `docs/validation/*.json`, screenshots in ignored `output/<module>/milestone-*/`. Decisions: [docs/DECISIONS.md](docs/DECISIONS.md); risks: [docs/RISKS.md](docs/RISKS.md).
- Source is the authority over reports; record discrepancies in the milestone report.

## Known limitations (as of 4I)

Note-only fixed tempo/meter model; sine-tone audition; DAW import verified only for REAPER 7.84 on Linux (tick "Expand MIDI tracks" + "Import MIDI tempo map"; REAPER trims items to the last note — explained in the export dialog, file unchanged); no screen-reader certification; Linux desktop only verified. Only musical edits invalidate compilation/playback (`musicalInput` denylist; keep new organizational fields out of the compiler or add them to the denylist deliberately). A freshness refresh resets the clean session's undo history. A host `setState` after a completed navigation is honoured. Reverse references list saved records only. Undo keeps 100 small MOTIF edits at 10,000 notes, but full-document edits (renames/settings) copy every note and evict older entries sooner. Opening a multi-MB checkpoint in the recovery inspector takes ~0.5 s; unread checkpoints of documents absent from the vault have no name until their details are read. Batch review is blocked during an external composition conflict or with an unsaved MOTIF draft of the motif. A stale host `activeDocument` needs an application switch to clear. Recording references are audio-only, vault-relative, never played; `# [ ] |` filenames unsupported. Open modals only via `openModal()` (src/ui/modal-host.ts). Native runs: launch with `env -u WAYLAND_DISPLAY DISPLAY=:1 XAUTHORITY=…` (launcher pins X11); assert `activeDocument === document`; never let Escape bubble out of CANVAS; the composition's notes play ~2.6 s, so press *Return to start* before playback checks.
