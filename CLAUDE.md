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
| `src/storage/` | Markdown/YAML/JSON codec with extension preservation (`document.ts`), repository, index (incl. 4F parse-time reverse links: `referencing`/`outgoing`), reference diagnostics and `reference-status.ts` (shared classification), recovery. |
| `src/application/` | `DocumentSession` (protected save, checkpoints, `relocate`) and `HistorySession` (bounded undo: 100 entries / 16 MiB); `navigation.ts` (4E readiness coordinator). |
| `src/music/` | Exact timing (`timing.ts`), bar:beat:tick (`positions.ts`), transport, audio. |
| `src/arrangement/` | Pure arrangement preflight/compiler/routing/collisions/capture/preparation (4B). |
| `src/midi/` | Shared note-only serializer, import/export, worker. |
| `src/modules/{patchbook,motif,canvas}/` | Module views. CANVAS: `view.ts` (controller), `timeline.ts` (lane canvas + fixed structure ruler), `geometry.ts` (viewport math), `commands.ts` / `structure.ts` (pure edits), `structure-panel.ts` (sections/markers/recordings UI, renders the selected editor into the contextual inspector), `rename-merge.ts` (provable link-only rename), `freshness.ts` (4E external-change watcher). |
| `tests/` | Vitest suites; `tests/fixtures/` golden MIDI (must stay byte-identical). |

## Invariants that are easy to break

- **Every persisted edit** is a pure `Composition → Composition` command passed to `session.edit(label, fn)`; it validates atomically and creates exactly one history entry. Navigation/selection never edits.
- **Optional known fields** must be listed in `retainExtensions` (`src/storage/document.ts`) for their array context, or a deleted field is resurrected from the file on save. Unknown fields must survive round trips.
- Schema 1 is authoritative; no schema bump, no migration on open, unknown future schema is read-only. Composition PPQ is fixed at 960; ticks are exact integers.
- Vault-relative paths only (`vaultPath()`); never absolute paths or traversal. Never modify/move/delete user audio, presets or imported MIDI.
- Sections/markers/audio references must never affect compilation, routing or MIDI bytes. Section overlap is an edit-time rule, never a load failure.
- `session.draft` deep-clones on every read: snapshot it once per render/loop. `index.all()` clones every entity in the vault: use `heads()` / `ofKind()` in anything that runs on index publish.
- Clean CANVAS sessions are refreshed by `CanvasFreshness`; never auto-modify a dirty draft, never treat a musical fingerprint as save safety.
- Cross-module navigation goes through `services.navigation.navigate()` (use `ui/navigate.ts#navigateTo`); a target must implement `reveal()` behind its `ReadyGate`; sources checkpoint drafts before leaving. Show references with `ui/reference-row.ts` (names first, IDs in advanced detail).
- Dispose timers, frames, observers, listeners, audio and workers; guard async completions after view/module/plugin disposal.

## Process

- Work only in `~/MNEMOBARD` and the marked `dev-vault/`. Never personal vaults. TROUBADOUR is read-only and never copied.
- Commits are local and GPG-signed with the existing config (`git commit -S`). Never change signing config, never push, never publish.
- Milestone evidence: `docs/MILESTONE_*_REPORT.md` (historical, do not rewrite), `docs/validation/*.json`, screenshots in ignored `output/<module>/milestone-*/`. Decisions: [docs/DECISIONS.md](docs/DECISIONS.md); risks: [docs/RISKS.md](docs/RISKS.md).
- Source is the authority over reports; record discrepancies in the milestone report.

## Known limitations (as of 4F)

Note-only fixed tempo/meter model; sine-tone audition; no DAW import verified; no screen-reader certification; Linux desktop only verified. Only musical edits invalidate compilation/playback (`musicalInput` denylist; keep new organizational fields out of the compiler or add them to the denylist deliberately). A freshness refresh resets the clean session's undo history. A host `setState` after a completed navigation is honoured. Reverse references list saved records only. A stale host `activeDocument` needs an application switch to clear. Recording references are audio-only, vault-relative, never played; `# [ ] |` filenames unsupported. Open modals only via `openModal()` (src/ui/modal-host.ts). Native runs: launch with `env -u WAYLAND_DISPLAY DISPLAY=:1 XAUTHORITY=…` (launcher pins X11); assert `activeDocument === document`; never let Escape bubble out of CANVAS; the composition's notes play ~2.6 s, so press *Return to start* before playback checks.
