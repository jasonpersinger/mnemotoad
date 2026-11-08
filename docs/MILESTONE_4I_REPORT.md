# Milestone 4I report — recovery register and large-document undo reliability

Prompt: MNEMOBARD Codex Prompt 017 (Milestone 4I), executed by Claude Code. Baseline: signed 4H commit `c3fbfab`. Date: 2026-11-08.

## A. Executive summary

**Implemented.**
- **Recovery register** (Workstream A), shared by MOTIF, CANVAS and PATCHBOOK:
  - search, module/type/document/date filters, three sort orders and pagination (25/50/100), with every checkpoint reachable;
  - a read-only inspector with module-specific content summaries, integrity in plain words and an explanation of what loading would mean;
  - loading only through the existing recovery path, in the owning module.

  It lists the real 898 checkpoints in 9 ms without reading a file. Browsing and inspecting changed no vault file (verified by a path/size/mtime digest).
- **Undo accounting** (Workstream B): history memory is now estimated over distinct objects, each counted once, under the unchanged 100-entry / 16 MiB policy. Because 4H edits deep-copied every note, there was no nested sharing to count. In-app MOTIF commands now share unchanged frozen notes between snapshots: same validation rules, no defensive copy.
  - Native, 30 small edits: 10,000 notes keep 3 → 30 undo steps; 5,000 notes keep 7 → 30.
  - 110 edits on 10,000 notes stop at the 100-entry cap (≈10.5 MiB estimated).
  - Large-motif edit commits roughly halved again (10,000-note drag 44.5 → 21.8 ms).

**Deferred.**
- Checkpoint retention and cleanup (a product decision; no deletion of any kind was added).
- Faster inspection of multi-megabyte checkpoints.
- Deeper undo for full-document edits (renames copy every note by design).

**Blocked:** nothing. No stop condition (§24) was reached: storage format, validation rules, immutability, the 16 MiB budget and the history engine are unchanged.

**Verdict: PASS.** Every §25 criterion is met (see K and L).

## B. Baseline

- **Git:** `main` at `c3fbfab`, good signature (G); working tree clean.
- **Checks:** `pnpm check` 631 tests / 49 files, typecheck, lint and build pass; `pnpm audit` clean.
- **Golden MIDI:** `85c8ecf3…` unchanged; Python check 10 / 4.
- **Checkpoints in the dev vault:** 898 files in 278 document folders, 470 MB in total (median 17 KB, max 5.5 MB). All 898 were readable. Types: 603 pre-save backups, 223 drafts of saved records, 52 drafts of new records, 20 recovery copies. 313 belong to documents no longer in the vault. The 4H register needed 2,056 ms to show its first 100 rows, because it read and validated every one.
- **Undo depth, 4H build** (native, `scripts/mnemobard-4i-undo-depth.mjs`, 30 small edits; 110 at 16 notes): 16 notes 100 (cap), 500 notes 30, **5,000 notes 7, 10,000 notes 3**; undo/redo exact (`undo-depth-baseline-4h.json`).
- **Discrepancy noted:** the 4H documentation said snapshots were "shared". That held only at the top level: each 4H edit deep-copied the transform input and `validateEntity` copied again, so consecutive snapshots shared no notes. An accounting-only change would have reached about 6 steps at 10,000 notes, not 20. Hence I07.

## C. Recovery browser

**Architecture** (I01): `storage/recovery-catalog.ts`.
- **Tier 1** (`list()`, no reads): the vault listing plus the entity index give the checkpoint ID, folder UUID, file time and size, and the current document's name, module, path and availability. Index lookups run once per document folder.
- **Tier 2** (`details()`): one read per checkpoint, giving format, reason, saved time, draft kind and title, source path and integrity. Cached in memory per path + size + modified time; nothing is persisted.

**Types** (I02, from stored fields only): Unsaved draft of a saved record · Unsaved draft of a new record · Pre-save backup · Recovery copy · **Unknown**.

**Search, filters and sorting** (I03):
- **Search:** case-insensitive and AND-combined over document and draft names, UUIDs, checkpoint ID, paths, and ISO and local timestamps.
- **Filters:** module (MOTIF, CANVAS, PATCHBOOK, Unknown), type, original document (resolvable documents only) and date range.
- **Sorting:** newest (default), oldest or name, with ties broken by path.
- **Pagination:** 25/50/100 per page with "Showing 26–50 of N checkpoints", Previous/Next and page *n* of *m*. Search and filter changes return to page 1, and there is no result cap.
- **Unread checkpoints are never hidden silently:** a type filter, or a name search over unread checkpoints of documents absent from the vault, states how many it could not judge. *Read all checkpoint details* (explicit, cancellable, with progress) read 898 files / 490 MB in 0.93 s.

**UI:** `ui/recovery-inspector.ts`, the same class and constructor in all three modules.
- A `role=search` row of labelled controls, then a status line (`aria-live`).
- An ordered list of row buttons: name, then module · local time · type · problems, with a full-sentence `aria-label`.
- A pagination `nav`, and the inspector, which is sticky beside the list on wide panes and stacked below it on narrow ones.

## D. Checkpoint inspector

- **Summary:** module, local checkpoint time, type, original path, original-document availability (Available, unchanged / changed after this checkpoint (conflict) / never saved / Missing · the original note is unavailable / other index states), and integrity in words. The established source-status sentence is kept verbatim. Technical details are collapsed: checkpoint ID, file, document UUID, saved-at and file-modified as ISO, size, format, reason, and the stored texts.
- **Content preview:**

| Module | Shown |
|---|---|
| MOTIF | Name, notes, musical length, tempo, time signature, PPQ, notes span (bar:beat:tick) |
| CANVAS | Name, lanes, clips, referenced motifs, length, tempo, meter, PPQ, unresolved references |
| PATCHBOOK | Name and kind, instrument or synthesizer (text or resolved title), tags, referenced assets, associated saved motifs, stages for effects chains |

- **Integrity:** each checkpoint is validated by its owning module's `CheckpointRecovery.inspect`. Valid, malformed (with the parser's reason), unsupported schema, unrecognized format, too large and unreadable checkpoints all stay listed and inspectable; nothing is repaired.
- **Safety:**
  - Inspection only reads.
  - *Load draft without saving* exists only in the owning module and runs the unchanged `prepare()` + `recover()`: consent is still needed when the source changed, and nothing is saved.
  - With an unsaved draft of the same document open, the inspector says so and offers no load. `recover()` would also still refuse.
  - A missing original is explained, the checkpoint is kept, and no replacement is created.
  - Other modules' checkpoints offer *Open in MODULE recovery* instead, which opens the owning view's register on that checkpoint after the current view's `leave()` checkpoint.
  - No deletion, pruning, migration or automatic restore.

## E. Recovery performance

Native Obsidian 1.15.0, 1366×900, `scripts/mnemobard-4i-recovery-benchmark.mjs` (`recovery-benchmark-final.json`), with `performance.now()` around each operation.

**Real collection** (898 checkpoints, 470 MB on disk):

| Operation | Median | p95 |
|---|---:|---:|
| Tier-1 listing | 9 ms | 10.7 ms |
| First page, cold (listing, query, DOM and reading the 25 visible rows) | 118 ms | 126 ms |
| Search / filter / sort / next page (render included) | ~4–5 ms | ≤ 8.5 ms |
| 100 per page | 8 ms | 15 ms |
| Inspector, 534-byte checkpoint | 3.4 ms | 7.7 ms |
| Inspector, 5.5 MB checkpoint | 482 ms | 623 ms |
| Read all details (898 files) | 0.93 s | — |

An inspector opened while visible-row reads are still running waits behind them (measured about 0.5 s).

**Synthetic sizes:** no files were written, because recovery files are never deleted. Tier-1 entries were built in the renderer through the catalog's real code and index lookups, then the same register operations were timed. Medians in ms (search p95 in brackets):

| Checkpoints | Tier-1 build | First render | Search | Module filter | Oldest | Name | Next page | Page size |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 (0.2) | 0 | 0 | 0 | 0 | 0.1 |
| 1 | 0.1 | 0.2 | 0.1 (0.1) | 0.2 | 0.1 | 0 | 0 | 0 |
| 25 | 0.6 | 3.9 | 0.6 (0.9) | 0.5 | 0.3 | 0.2 | 0.4 | 0.4 |
| 100 | 2.4 | 4.1 | 0.8 (3.8) | 1.3 | 1.2 | 1.1 | 1.1 | 1.0 |
| 816 | 18.9 | 4.0 | 1.7 (4.3) | 4.0 | 4.0 | 4.1 | 4.1 | 7.7 |
| 2,500 | 31.4 | 5.1 | 3.8 (10.7) | 5.1 | 4.9 | 4.7 | 4.5 | 8.1 |
| 10,000 | 99.2 | 8.0 | 7.7 (29.6) | 6.4 | 5.4 | 6.6 | 7.4 | 10.5 |

**Targets, for this machine:**
- listing under 150 ms at 10,000;
- any query or page change under 50 ms at 10,000;
- first page under 250 ms for the real collection;
- small-checkpoint inspector under 50 ms.

All are met. Large-checkpoint inspection is reported in K.

## F. Undo accounting

**Previous** (4H): each entry cost `2 × (JSON length of before + after)`. Every shared snapshot was counted twice, once as the *after* of entry *k* and once as the *before* of entry *k*+1, and nothing nested was shared.

**New** (I05, `application/history-memory.ts`): `RetainedSize`, reference counts over the DAG of frozen snapshots reachable from all undo and redo entries.
- An object is added once, when first reached, and its children are retained. It is subtracted when its last reference goes.
- Grouped edits, redo invalidation, eviction, reload and dispose all retain and release symmetrically.
- **Cost model:** an approximate V8 layout (object 40 + 16 per property; array 32 + 8 per element; string 24 + 2 per character, counted per occurrence; number 16; non-plain values as conservative leaves).
- **Budget meaning:** estimated bytes of distinct objects retained by undo/redo history, the current draft included because it is the latest snapshot. It is not a heap measurement and does not claim a physical ceiling.

**Policy unchanged** (I06): at most 100 entries; evict the oldest while over 100, or over 16 MiB with more than one entry; the newest entry is always kept.

**Nested sharing** (I07): `MotifSession` passes the frozen draft to transforms (any write throws, so the edit is atomic). `sealedMotif` applies the identical rules (`checkEntity` + motif rules), then freezes. Unchanged notes become shared frozen objects. Inline and untrusted transforms are still copied and fully validated, and CANVAS and PATCHBOOK sessions still receive private copies.

**No-op detection** (I08): `sameJson` gives exactly the old JSON-text equality.

**Correctness of the estimate:** a 160-step randomised sequence (edits, grouped renames, undo, redo, branch invalidation, eviction) equals a from-scratch recount after every step.

## G. Undo depth

Native; same script and workloads on the 4H and 4I builds (`undo-depth-baseline-4h.json`, `undo-depth-final.json`, `undo-depth-final-10000x110.json`).

| Motif | Edits | 4H retained | 4I retained | 4I estimate | Limit reached |
|---:|---:|---:|---:|---:|---|
| 16 notes | 110 | 100 | 100 | 0.10 MiB | 100-entry cap |
| 500 notes | 30 | 30 | 30 | 0.28 MiB | none |
| 5,000 notes | 30 | **7** | **30** | 2.54 MiB | none (4H: budget) |
| 10,000 notes | 30 | **3** | **30** | 5.06 MiB | none (4H: budget) |
| 10,000 notes | 110 | — | **100** | 10.46 MiB | 100-entry cap |

**Eviction** (native): ten unshared full-document edits (renames) on the 10,000-note motif reduced history from 30 to 4 entries at 13.74 MiB, within 16 MiB. The document stayed intact and the name was then restored.

The §16 target (at least 20 steps at 10,000 notes) is met.

## H. Editing performance

**Edit commits:** 4H vs 4I builds in one Obsidian process, `scripts/mnemobard-4h-edit-profile.mjs` (`edit-profile-baseline-4h.json` vs `edit-profile-final.json`). Move, resize and multiMove still include one harness `session.draft` copy (conservative). There are no regressions by the 25 % **and** 5 ms rule.

| Notes | Operation | 4H median | 4H p95 | 4H long tasks | 4I median | 4I p95 | 4I long tasks | Change |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 16 | move | 3.5 | 9.3 | 0 | 3.5 | 8.2 | 0 | 0% |
| 16 | resize | 3.4 | 3.7 | 0 | 3.3 | 4.1 | 0 | -3% |
| 16 | velocity | 3.2 | 3.5 | 0 | 3.3 | 3.6 | 0 | 3% |
| 16 | transpose | 3.3 | 10.9 | 0 | 3.2 | 3.4 | 0 | -3% |
| 16 | quantize | 3.2 | 3.7 | 0 | 3.2 | 3.9 | 0 | 0% |
| 16 | multiMove | 2.9 | 3.1 | 0 | 2.9 | 3.8 | 0 | 0% |
| 16 | undo | 2.8 | 2.9 | 0 | 2.8 | 3.1 | 0 | 0% |
| 16 | redo | 2.6 | 3 | 0 | 3 | 3.2 | 0 | 15% |
| 500 | move | 5.7 | 8.7 | 0 | 4.5 | 7.6 | 0 | -21% |
| 500 | resize | 5 | 6.7 | 0 | 4.1 | 4.3 | 0 | -18% |
| 500 | velocity | 4.3 | 4.9 | 0 | 3.6 | 3.8 | 0 | -16% |
| 500 | transpose | 4.4 | 4.7 | 0 | 3.4 | 4 | 0 | -23% |
| 500 | quantize | 5.1 | 11.2 | 0 | 4.2 | 4.7 | 0 | -18% |
| 500 | multiMove | 5.2 | 5.7 | 0 | 4.2 | 4.8 | 0 | -19% |
| 500 | undo | 3 | 3.1 | 0 | 3.4 | 3.8 | 0 | 13% |
| 500 | redo | 2.9 | 3.1 | 0 | 3.2 | 3.4 | 0 | 10% |
| 5,000 | move | 25.5 | 30.3 | 1 | 13.1 | 16 | 1 | -49% |
| 5,000 | resize | 23 | 28.5 | 0 | 12.1 | 12.6 | 0 | -47% |
| 5,000 | velocity | 17.3 | 17.9 | 0 | 5.4 | 6.5 | 0 | -69% |
| 5,000 | transpose | 16.8 | 38.4 | 0 | 5.1 | 5.7 | 0 | -70% |
| 5,000 | quantize | 19 | 19.6 | 0 | 6 | 6 | 0 | -68% |
| 5,000 | multiMove | 21.6 | 28 | 0 | 10.6 | 11.7 | 0 | -51% |
| 5,000 | undo | 4.4 | 5.3 | 0 | 3.4 | 3.8 | 0 | -23% |
| 5,000 | redo | 3.8 | 4.6 | 0 | 3.5 | 3.8 | 0 | -8% |
| 10,000 | move | 46.7 | 47.2 | 1 | 21 | 23.3 | 1 | -55% |
| 10,000 | resize | 43 | 45.3 | 0 | 20.8 | 21.3 | 0 | -52% |
| 10,000 | velocity | 30.7 | 32.2 | 0 | 8.3 | 12.2 | 0 | -73% |
| 10,000 | transpose | 30.9 | 37.6 | 0 | 7.6 | 7.9 | 0 | -75% |
| 10,000 | quantize | 36.8 | 77.2 | 1 | 8.4 | 8.8 | 0 | -77% |
| 10,000 | multiMove | 45.2 | 64.7 | 1 | 17.4 | 18.3 | 0 | -62% |
| 10,000 | undo | 5.2 | 6.2 | 0 | 4.3 | 4.6 | 0 | -17% |
| 10,000 | redo | 5 | 5.5 | 1 | 4.2 | 4.6 | 0 | -16% |

**The 10,000-note move inside `edit`:** 4H took 33 ms with four `structuredClone` calls (transform input, validator output, a single-note copy and the harness read). 4I takes 10.8 ms with two (the single-note copy and the harness read).

**Full benchmark** (4G method, same process, `performance-comparison.md`):
- 10,000-note drag 44.5 → 21.8 ms; resize 40.3 → 18.2 ms; undo 7.9 → 6.2 ms.
- 5,000-note drag 27.4 → 13.8 ms; resize 25.3 → 11.7 ms.
- Saves, opens, CANVAS and PATCHBOOK unchanged.

The comparison script flagged *canvas/16x200/openWarm* (23.9 → 30.3 ms, 3 samples). An alternating same-process A/B with 20 samples measured 4I 20.4 / 19.0 ms against 4H 20.4 / 18.7 ms, so it is noise, not a regression (`retries.json`).

**Native undo-depth runs:** commit median at 10,000 notes 30.3 ms (4H) → 7.9 ms (4I).

## I. Correctness

- **Validation:** the same rules on every path (`checkEntity` is `validateEntity` minus its final copy). Invalid edits throw and create no entry. A validated-then-mutated value is re-validated, and a frozen-but-unsealed value is not trusted.
- **Atomicity:** one valid edit creates one entry. A MOTIF transform that writes to its input throws and commits nothing.
- **Exactness:**
  - undo/redo restore exact JSON at every size, both in unit tests and natively (5,000 and 10,000 notes, 30 steps each way, with note identities compared);
  - undo followed by a new edit invalidates redo;
  - no-op edits create nothing.
- **Immutability:** snapshots stay deeply frozen and earlier snapshots never change (4H ownership tests still pass); unknown metadata is preserved.
- **Persistence and recovery:**
  - save/reopen is exact (native: "Ascending choir" and 10,000 notes, including after a cold restart, notes SHA-256 `db042d3e…`);
  - stale-save conflict protection is unchanged (4H unit test);
  - recovery files are untouched by browsing and inspecting (digest over 3,761 vault files);
  - checkpoints were discoverable after a restart (903 = 898 + one malformed fixture + four pre-save backups from this run's saves).
- **MIDI:** golden fixture `85c8ecf3…` unchanged; the serializer, compiler and music code are untouched.

## J. Automated tests

**Totals:** 652 tests / 51 files (631 / 49 before). 21 new:
- `tests/history-accounting.test.ts` (11):
  - `RetainedSize` behaviour: sharing, ordering, leaves;
  - MOTIF note sharing and frozen input;
  - agreement with a from-scratch recount through randomised edits, undo, redo, branch invalidation and eviction;
  - the 100-entry cap and zero for empty history;
  - at least 25 small edits retained at 10,000 notes, exact undo/redo, and the cap reached;
  - unshared full copies hitting the budget;
  - an oversized single edit keeping the newest entry, large metadata counted once, and aliased nested objects;
  - no-op and invalid edits;
  - the `sameJson` property test;
  - the default contract and copying sessions.
- `tests/recovery-register.test.ts` (10):
  - listing without reads;
  - every type and integrity class;
  - search, filters, sorting with duplicate timestamps, and pagination at 0/1/25/30;
  - the unread-exclusion notice;
  - 10,000 checkpoints;
  - UI counts, paging, resets and visible-only reads, plus the empty state;
  - read-only MOTIF, CANVAS and PATCHBOOK inspection and cross-module open;
  - malformed and missing-source checkpoints, and the unsaved-draft refusal;
  - loading only through recover, without writes.

**Changed tests, none weakened:**
- The 4H 10,000-note depth assertion now expects all edits retained within the budget.
- Two recovery view tests use the new row selector, with assertions unchanged.
- The 4H toolbar test also checks the undo-depth indicator.

**Failures and resolutions:** see `output/mnemobard/milestone-4i/retries.json`. The new tests caught one silent-omission gap in search, which is fixed.

**Final:** `pnpm check` (typecheck, ESLint, Vitest, production build) passes; audit clean.

## K. Native Obsidian validation

- **Runs:** `scripts/mnemobard-4i-native.mjs` (part 1) and `--verify-restart` after a real cold restart, in the isolated Obsidian 1.15.0 on the disposable `dev-vault`. Both phases passed with **0 renderer exceptions**.
- **Theme:** the original Obsidian theme was recorded and restored.
- **Fixture:** no malformed checkpoint existed, so one disposable malformed checkpoint was created. It remains, because recovery files are never deleted (`fixture.json`).

| Steps | Result |
|---|---|
| Recovery 1–3 | "Showing 1–25 of 899 checkpoints" = 899 JSON files on disk |
| 4–9 | Search "Night procession" → 23; CANVAS filter → 323 (CANVAS rows only); oldest ≠ newest; next page "26–50"; 50 per page → 50 rows |
| 10–13 | CANVAS inspector summary and content; technical details collapsed, then identifiers; Close returns focus to the row |
| 14 | Every MNEMOBARD vault file identical (path, size, mtime) before and after browsing and inspecting |
| 15–17 | MOTIF checkpoint from the CANVAS register (content summary; *Open in MOTIF recovery*, no load); malformed ("Cannot be safely interpreted — Unterminated string…", listed, not loadable); missing source ("Missing · the original note is unavailable", no replacement) |
| Layout | No horizontal overflow and every control reachable at 1366/980/680 px (stacked at 680); light theme; Tab focus visible; Enter on a row opens the inspector |
| 18–19 | *Open in MOTIF recovery* opened MOTIF's register on the same checkpoint (load offered there); with an unsaved MOTIF draft open, its checkpoint shows the refusal and no load action |
| 20 (restart) / 21 | Refresh and cold restart: all checkpoints discoverable (899, then 903 after this run's saves); malformed fixture still listed |
| Undo 1–4 | 3 edits ("3 undo · 0 redo"), undo/redo exact, saved, reopened identical |
| 5–15 | 5,000 and 10,000 notes: 30/30 retained ("30 undo · 0 redo"; 2.54 and 5.06 MiB), undo/redo exact with identities; eviction 30 → 4 at 13.74 MiB; saved and reopened 10,000 notes identical |
| 16–17 (restart) | Persisted motif edits and the 10,000-note save intact |

**Screenshots** (`output/mnemobard/milestone-4i/`): `01`–`14` as required.

**Regression suites** in fresh processes (`regressions/`), with counts identical to 4G and 4H: 4E CANVAS 18 + 2, MOTIF 7 + 12, MOTIF-MIDI 11 + 5, PATCHBOOK assets 6 + 6, Foundation 11.

## L. Known issues

| Issue | Class |
|---|---|
| Opening a multi-megabyte checkpoint in the inspector takes ~0.5 s (full JSON plus YAML duplicate-key parse in `inspect()`); small checkpoints take ~3 ms | Non-blocking (deferred, I10) |
| Unread checkpoints of documents absent from the vault have no name and are ordered by file time until read; filters and searches state how many they cannot judge | Non-blocking |
| Full-document MOTIF edits (renames, settings) still copy every note, so they consume the budget quickly at 10,000 notes | Non-blocking (by design) |
| `historyBytes` is an estimate, not a heap measurement | Non-blocking (documented) |
| MOTIF transforms now receive the frozen draft; a writing transform throws (all in-repo transforms build new values) | Non-blocking (documented contract) |
| No checkpoint retention policy: the register grows without limit | Deferred (product decision) |
| A disposable malformed checkpoint now lives in the dev vault | Non-blocking |
| Pre-existing typo "up to50 rows" in the MOTIF note register | Non-blocking (out of scope) |

No blockers.

## M. Next milestone readiness

**Ready for review.** All automated tests, native workflows and regression suites pass, the MIDI golden fixture is unchanged, and recovery files are intact.

Smallest sensible next steps (not started):
1. A **checkpoint retention policy decision**: what may ever be removed, by whom, with what confirmation.
2. **Faster large-checkpoint inspection**, using the 4G duplicate-key scan instead of the second YAML parse, with an equivalence test.

## N. Git status

- **Commit:** one local, GPG-signed commit on `main` on top of `c3fbfab`, using the existing signing configuration. The hash is given in the final summary and in `git log`. Nothing was pushed.
- **Changed source:**
  - `application/history-session.ts`, `application/json-equal.ts`; new `application/history-memory.ts`
  - `domain/validation.ts`
  - `storage/recovery.ts`; new `storage/recovery-catalog.ts`
  - `ui/recovery-inspector.ts` (rewritten)
  - `modules/motif/{commands,session,view}.ts`, `modules/canvas/view.ts`, `modules/patchbook/{view,recovery-panel}.ts`
  - `styles.css`
- **Tests:** new `history-accounting`, `recovery-register`; updated `motif-edit-ownership`, `motif-view`, `patchbook-view`.
- **Scripts:** new `mnemobard-4i-{undo-depth,recovery-benchmark,native}.mjs`; `mnemobard-4h-edit-profile.mjs` gained an output-directory override.
- **Docs:** ARCHITECTURE, DECISIONS (I01–I10), DESIGN_DIRECTION, RISKS, ROADMAP, DEVELOPMENT, this report, `docs/validation/milestone-4i-native.json`, CLAUDE.md, AGENTS.md, progress.md.
- **Working tree:** clean after the commit. `output/` and the vault content are ignored evidence and fixtures.
