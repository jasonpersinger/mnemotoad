# Engineering risks and feasibility experiments

Status: the original five risks below are qualitative Milestone0 estimates. The Milestone4B update records current compilation/export/playback evidence and remaining risks. Historical experiments remain evidence for their tested scope, not cross-platform guarantees.

## R1 — Vault integrity and relationship consistency

**Likelihood:** high. **Impact:** critical: loss of musical data or silent reassignment. External edits, sync, interrupted saves, invalid JSON/YAML, duplicate IDs, live motif-length changes and asset renames can diverge. Public file APIs do not create a cross-file/distributed transaction.

**Mitigation:** one authoritative file per entity; serialized conditional writes; preserve prose/unknown fields; pre-save exact-text recovery copy; Saved only after success; UUID/kind validation; duplicate/missing states; read-only future schemas; live-reference preflight; explicit migrations and recovery. Bounded incremental indexing avoids all-vault scan storms.

**Experiment:** in a disposable vault plus deterministic fake repository, create a patch, two motifs and a two-lane composition. Delay one save, edit the same note’s managed block externally, modify unrelated prose, rename a target, duplicate its ID, and inject failures before backup, during write, and after successful write before notification. Restart and compare source bytes and reconstructed references. Simulate an interrupted child creation and an unsupported schema. Verify no stale overwrite, preserved draft/original, collision-safe backup and explicit ambiguity; distinguish safe prose merge from whole-text conflict policy. Record indexing reads under 100 unrelated edits in a 10,000-file fixture.

**Pass target:** no lost confirmed save, no silent destructive merge, no wrong-ID resolution; failures retain reviewable original/draft. Normal incremental update touches only affected records and necessary dependents. **Gate:** foundation before any module writes user data.

**Legacy work:** `document.ts`, `VaultStore.save/snapshot`, `Draft.save`, storage/race tests are useful. Refactor `refresh` full-vault fan-out; normal-close snapshots alone do not meet crash recovery. Proposed source approval group L2 in [decisions](DECISIONS.md).

## R2 — Musical timing, export fidelity, and late scheduling

**Likelihood:** medium-high. **Impact:** high: audible bursts, wrong durations/repeats, unusable DAW export. Audio time, UI time, meter beats, source PPQ and arrangement PPQ are different coordinate systems. Pause/sleep/stalls invalidate queued timing assumptions.

**Mitigation:** pure tick-domain compiler shared by preview/export; explicit per-motif PPQ and fixed composition PPQ; documented endpoint rounding; note pairing/order/channel preflight; audio-clock scheduling with bounded lookahead; generation cancellation; stop/rebase on underrun; no late-note catch-up bursts; no hidden tempo-map approximation.

**Experiment:** fixture set at source PPQ 96/480/960/1000, 4/4 and 6/8, notes crossing repeat boundaries, trailing rests, chord onsets and supported imports. Compare arrangement events to an independent reader and a DAW. Render periodic clicks into OfflineAudioContext for algorithmic onset checks; separately record 10 minutes of real-time loopback at 60/120/240 quarter-note BPM while dragging grids and inducing a 250 ms main-thread stall. Exercise seek/stop during resume and OS sleep/return. Record scheduled timestamps, measured onset jitter/drift and underrun notices separately.

**Pass target:** motif exports retain source ticks; composition conversion follows the documented rounding bound and warnings. No notes after Stop’s release allowance, wrong-cycle notes, accumulated musical drift, or catch-up burst. Proposed unstalled scheduling target: p95 lateness ≤5 ms and no drift beyond 10 ms over 10 minutes after fixed device-latency alignment; audible measurements may require a revised support target. A deliberate stall should produce an explicit stop/underrun, not meet that unstalled jitter target. **Gate:** audio/MIDI spike before MOTIF commitment and Type1 check before CANVAS completion.

**Legacy work:** `parseMidi`/tests preserve exact source timing; `playPlan` implements lookahead but can catch up overdue notes; `previewGain` covers release tails. No variable-tempo support or arrangement exporter. Proposed L1/L3 candidate reuse; legacy MIDI codec stays reference-only.

## R3 — Dense piano-roll rendering and accessible interaction

**Likelihood:** high. **Impact:** high: sluggish gestures, lost focus, inaccurate editing, inaccessible core workflow. Rendering thousands of DOM notes or serializing on every pointer move can block the audio scheduling thread.

**Mitigation:** viewport culling, cached grid layer, bounded hit candidates, CSS-pixel geometry separate from backing DPI, local gesture previews, one commit per gesture, accessible virtualized note list and numeric fields sharing commands. Use measured targets, not a framework’s performance reputation.

**Experiment:** synthetic 10,000-note motif with 1,000 visible notes, default and high DPI, 390/550/1200px view widths, default light/dark and one community theme. Record 30 seconds each of pan, anchored zoom, marquee, multi-note move and edge resize while auditioning. Measure frame work, input response, DOM counts, memory after 20 close/reopen cycles; test keyboard-only edit/undo and a screen reader. Match pointer positions and exported ticks before/after DPI/zoom changes.

**Pass target:** proposed p95 frame work ≤16.7 ms and input-to-feedback ≤50 ms on recorded reference hardware; no data/focus loss, no all-note DOM growth, correct hit testing, and equivalent keyboard operations. Revise supported envelope if target fails before expanding features. **Gate:** renderer spike before full MOTIF UI.

**Legacy work:** `mountPianoRoll` and note-edit tests provide gestures, cancellation, timing phase and inspector lessons. Its all-note DOM update and 512-note product cap are not evidence of 10,000-note suitability. Rebuild renderer; authorize only selected math/tests.

## R4 — Timeline scope and consistent arrangement semantics

**Likelihood:** high. **Impact:** high: timeline becomes a DAW project, or preview/export disagree. Lane placement, repetition, live motif changes, note overlap, patch context and section labels interact even without audio mixing.

**Mitigation:** full-length live motif instances only; fixed tempo/meter; bounded lane/clip counts; no clip stretch/trim/audio sync in MVP; pure compiler as shared authority; one channel per lane; explicit bounds/conflicts; visible downstream impact of motif-length changes.

**Experiment:** arrange four motifs into 16 lanes and 1,000 instances within the 100,000-note expansion cap. Include rests, 6/8 motif against 4/4 composition, different source PPQs, repeated notes sharing a boundary, prohibited same-pitch overlap, missing target, and changed motif length. Compare timeline-derived positions, preview plan and Type1 output. Remove/reorder/move/undo instances via both pointer and numeric entry. Verify every invalid case names the source clip and preserves all source notes.

**Pass target:** exact agreement in musical positions within documented PPQ conversion; stable deterministic output; no silent clipping/retiming; explicit missing/overlap/length diagnostics; export succeeds for the representative integrated workflow. **Gate:** compiler/model acceptance before CANVAS editor expansion.

**Legacy work:** `arrangementPlan` supplies once/repeat/section-clipping and missing-reference tests, but different semantics. `mountArrangement` cannot serve as the new lane timeline. Build the new compiler/view; use lessons and selected test scenarios only.

## R5 — Resource ownership, cross-platform behavior, and adoption maintenance

**Likelihood:** medium-high. **Impact:** high: sound persists after disable, memory leaks, stale callbacks write data, or a dependency/legacy constraint prevents release. Multiple leaves, optional modules, OS media codecs, pop-outs, mobile APIs and unclear source rights widen the surface.

**Mitigation:** one owned lazy transport; scoped disposables and cancellation tokens; no global view singleton; explicit module enable/disable dependency behavior; main-window editors until pop-outs validated; three-OS tests; minimal pinned reviewed dependencies; license/provenance approval before extraction; incremental reuse behind contract tests. Preserve no legacy package/update/sync machinery by default.

**Experiment:** on Linux, Windows and macOS, repeat 50 open/play/close/module-disable/plugin-disable cycles, including slow audio decode and pending saves. Re-enable, restore leaves, toggle themes, and test supported WAV/MP3 fixtures. Count active timers/listeners/audio contexts/voices/observers/workers and compare retained memory after GC stabilization. Attempt pop-out entry and verify supported behavior or clear fallback. Inspect final bundle for Node/network/runtime installs and review exact dependency notices. Run authorized adopted components in isolation against new contracts.

**Pass target:** no sustained sound after stop/disable, no stale post-dispose mutations, no growing resource count or unbounded retained memory, correct restart and fallback, and documented platform/codec results. No distribution until all adopted sources have a recorded authorization and license/provenance disposition. **Gate:** foundation cleanup tests, then beta cross-platform/license review.

**Legacy work:** shared `Transport.stop/dispose`, abort/generation guards and UI destroy/race tests are valuable. Optional iPhone audio-session mutation is unnecessary initially; existing historical Linux/phone evidence does not certify Windows/macOS or MNEMOBARD. Runtime source has minimal dependencies; ownership remains unresolved.

## Milestone 2A risk update

Production library sessions and native workflows reduce R1/R5 uncertainty, while source-content conflicts, duplicate/missing IDs, failed writes, invalid draft recovery and confirmed archive/restore remain explicitly tested. The2A report records actual checks and limitations; existing musical risk experiments below remain historical and do not authorize production adoption.

- Saved records have been tested through native reload/restart; unacknowledged edits after the last500ms checkpoint are not crash/unload-durable. Recovery is manual and append-only; disk growth/retention, automatic rehydration, and multi-device/crash behavior remain open. Never strengthen the per-file host guarantee into a distributed transaction claim.
- Library removal archives instead of using a non-conditional physical delete. Incoming references remain and show archived status; there is no cascade. Native hard deletion still produces missing-reference diagnostics.
- Scoped keyboard bindings, view/index/session subscriptions and timers are released. Linux light/dark/narrow native checks do not certify Windows/macOS, pop-outs, screen readers or very large libraries. Pagination bounds rendered list size; index/query performance still needs a measured support envelope.
- Audio/attachment preview remains2B. Require bounded asset access, format/error fixtures, focus ownership and cleanup before adding it. No preset parsing/execution or original-file modification is implied.

## Milestone 1B risk update

The five risks above remain active. [MILESTONE_1B_REPORT.md](MILESTONE_1B_REPORT.md) and its benchmark evidence distinguish measured reductions from remaining work.

| Risk | Evidence gained | Remaining mitigation / next validation |
| --- | --- | --- |
| R1 data integrity | No foundation code/schema changed; foundation regressions retained and native smoke rerun. | Production sessions/export snapshots are still absent. Test competing saved edits during captured export before musical integration. |
| R2 timing/scheduling | Exact source PPQ fractions; tested tempo integration/inversion; deterministic off-before-on/repeat compilation; native pause/cancellation/stall stop; offline onset probe. | No acoustic loopback, 10-minute drift, DAW or Windows/macOS certification. Quantized collapse/overlap warning preflight and strict malformed SMF checks remain required. The library accepts a header-only declared track. |
| R3 rendering | Native comparison at 100/1k/5k; culled 20k, dense 20k-visible Canvas and DPR2 measured. All-DOM 20k timed out. | Dense Canvas approaches a frame budget; per-gesture reindexing, group edits, accessibility/list, theme matrix, narrow widths and hardware acceleration unverified. Bound visible work and measure combined audio/UI load. |
| R4 timeline | One rational compiler expands full-length repeated clips with offsets, channels and bounds; same rectangle infrastructure handles 16/64-lane fixtures. | Rectangles do not validate full timeline UX, live motif revisions, labels/markers or MIDI arrangement interoperability. Keep current simple full-length semantics; require captured snapshot/quantization preflight before export. |
| R5 ownership/adoption | Native 50 start/stop, 20 play/view-close cycles, pending benchmark cancellation and unload cleanup pass; legacy tracked hash unchanged. | Short process-global heap samples are not a leak proof. OS sleep/device changes/pop-outs and 3-OS tests remain. No legacy rights clearance; prefer independent code and keep experimental dependencies dev-only until reviewed. |

The old p95 audible lateness/drift and 16.7ms frame targets remain proposed acceptance goals, not guarantees established by 1B. Wall-clock poll intervals, audio-clock deltas, scheduled lead time and perceived output latency are different quantities.


## Milestone2B risk update

- Asset copies and note saves are separate operations. Cancellation/uncertain writes may leave a file: report path, keep original and copy, and require inspection before retry. Public vault APIs are not a distributed or crash-proof transaction.
- Recorded-audio support is an OS/installer codec property. Linux synthetic WAV/MP3/OGG/FLAC passed; corrupt WAV failed gracefully. No universal codec, audible-latency or Windows/macOS claim. Limits100MiB import/250MiB preview bound usual work, not guaranteed allocation under an external race.
- Audio owns one lazy media element, releases src/listeners on stop/error/owner close/disable/unload and guards late promises. Main-window tests passed. Pop-outs, hardware/audible output and extended OS-suspend/device-loss stress remain unverified.
- Recovery is discoverable but not a backup application. It retains all versions, bounds inspection, never merges automatically and requires explicit reviewed consent for changed-source rebasing. No automatic pruning; checkpoints can grow substantially. Invalid structures may be text-only; missing/duplicate originals require manual resolution.
- In-memory5k search benefits from a catalog snapshot; full-result sorting/cloning and startup parsing remain linear. Native disk-scale indexing/full DOM redraw and memory-retention profiles are still unmeasured. A stressed host metadata/link queue temporarily stalled native FileManager rename; the full suite passed after a clean restart. Keep long-session compatibility testing before beta.

## Milestone3A production update

| Risk | Current evidence and mitigation | Remaining work before broader support |
| --- | --- | --- |
| R1: vault integrity | Same shared repository, exact-source conditional writes, recovery before replacement; native external-conflict/cold-recovery checks preserve both versions. Musical recovery loads unsaved. | Host sync/OS crash/acknowledgement uncertainty remains. Never auto-retry/merge or call per-file writes distributed transactions. Very recent/unapplied controls are not crash-durable; no pruning. |
| R2: musical time/audio | Source PPQ and integer notes retained; transient exact compiler, off-before-on, automatic voice end,25/100ms scheduler; deterministic tests and native chords/stop/suspension/focus cycles pass. | Same-pitch overlap remains unsupported. Long drift, OS sleep/device transitions and physical loopback/latency need testing; maps/interchange need separate approval. |
| R3: rendering/edit reliability | Real Canvas/list editor, culling/DPI/hit tests, one-step gestures and bounded undo.5k-note redraw p95≈0.4ms; roll/history pointer-up-to-frame p95≈36.9ms in one software-rendered host. | Full inspector/storage/heap profiling at scale; actual hardware DPI, assistive tech and community themes. Snapshot/history commit cost exceeds sparse drawing; measure before changing history representation. |
| R4: arrangement scope | Pure note compiler retains track/channel/patch event boundary without implementing lanes/clips. CANVAS still placeholder. | Future repeat/source-resolution/export semantics and channel/pitch conflicts need their own reviewed fixtures. No timeline work is authorized. |
| R5: lifecycle/platform | Native ten start/stop cycles and owner/view/module/plugin cleanup, focus-bound keys, isolated cold restarts; all baseline tests pass. No new dependency/legacy adoption. | Windows/macOS, musical popouts, long sessions and aggregate clean-session cache memory remain unverified. Per-session bounds are not a global heap bound. |

See [3A report](MILESTONE_3A_REPORT.md) for exact environment, bounds and measurements; these observations refine the original estimates without removing their risks.

## Milestone3B production update

- **R1 integrity:** MIDI preview/selection never writes an authoritative entity; normal protected Save and append-only recovery remain shared. New export paths reject collisions/traversal/config destinations. Failed acknowledgments may leave derivative files; inspection replaces automatic retry/delete. Native originals were hash-identical; conflict/recovery/cold workflows passed. Sync/crash guarantees remain limited.
- **R2 interoperability:** independent raw scanner before pinned codec, deterministic pairing/order, source PPQ and track ending retained. Stateful/unknown events/maps/ambiguity block; named metadata losses require acknowledgment. Python verifies actual export bytes; no external DAW/hardware test. Conservative rejection can exclude otherwise valid complex files; never solve that by silent flattening.
- **R3 interaction cost:** full-view5k pointer p95≈60.8ms after targeted refresh reduction (earlier165.2ms); transpose61.1ms/quantize73.4ms p95.1k pointer16ms. These differ from3A's roll-only test and exceed the old50ms hypothesis at5k. Profile storage/heap/long history further before a delta-history rewrite or wider support claim.
- **R4 arrangement:** proven single-part interchange/patch IDs/compiler do not implement clip repetition/channel allocation/export snapshots. Same-channel/same-pitch collisions across future clips remain a required preflight decision. CANVAS remains gated.
- **R5 resources/platform:**2MiB/50k events/10s owned worker, termination/URL cleanup, bounded selection options and8 clean unowned cache entries address concrete bounds. Dirty/owned sessions/history/recovery still consume memory; no actual aggregate heap certification. Browser CSP, Windows/macOS, musical popouts and long sessions remain open.

[3B report](MILESTONE_3B_REPORT.md) records the full bounds, methodology and tested limits. No package audit vulnerabilities were reported; that does not prove parser safety beyond validation/fault evidence.

## Milestone 4A risk update

| Risk | Current evidence / mitigation | Remaining work before or during4B |
| --- | --- | --- |
| Live source drift (high likelihood/high impact) | Saved UUID resolution, conservative source-text SHA256 review, rename hints, same-instance draft warning, preserved broken clips and explicit acknowledgment. No source file is written by composition Save. | Define a coherent source capture/recheck protocol for export/playback; a saved arrangement is not a frozen musical snapshot. Cross-process edits between reads remain possible. |
| PPQ/length fidelity (medium/high) | Exact BigInt/GCD endpoint and full-length checks; no rounding, rest/trailing-silence tests; incompatible or enlarged live sources remain diagnostic. | Inexact material must be edited at source or await an explicitly approved conversion policy. No hidden resampling. |
| Lane/channel and overlap mismatch (high/high) | Up to32 planner lanes without allocation; overlapping clips retained with warnings; `exportReady:false`. | At most16 MIDI channels require an explicit policy, same-channel/pitch checks, repetition boundary rules and independent multitrack output validation. |
| Editor/history/host latency (medium/medium-high) | Cached summaries/plans and demand-driven culling keep pointer previews light. Actual32/1,000 full-view workload is measured in the4A report. Validation/history/recovery remain enabled. | Save and committed history edits are more expensive than drawing; bound support by host measurements and profile before larger limits. Approximate heap readings are GC-dependent. |
| Vault/lifecycle compatibility (medium/critical) | Existing per-file protected saves/checkpoints, non-destructive recovery, native restart/conflict/disable/unload regressions. The native `open` helper collision and Escape propagation issue were fixed; tests now include a host open wrapper. | No multi-file/distributed transaction, crash-durable last keystroke, screen-reader certification or Windows/macOS validation is claimed. Pending form controls need Apply before checkpointing. |

The five original risk studies remain historical proposals where they discuss rounded arrangement conversion, unique lane channels or synchronized audio. Prompt008's exact-only planner policy and explicit4B boundary take precedence.

## Milestone4B residual risks

| Risk | Evidence and mitigation | Remaining work / approval |
| --- | --- | --- |
| Multi-file source races | Fresh saved-text capture, immutable compile input and pre/post-write checks; source changes/unreviewed revisions block; submitted writes may still finish. Retain/report derivative rather than delete or claim rollback. | No transaction guarantee after final check. Future snapshots are a separate product decision. |
| MIDI channel semantics | Explicit channels preserved, unknown state blocked, context-aware Auto reuse, full-provenance collision rejection and cross-track boundary gap. | Conservative rejection can exhaust15 melodic channels. Broader program/controller/port policies need separate scope. |
| Expanded resource pressure |24000notes/48000events, text/estimate/timeout/polyphony budgets and worker. Diverse100-source/1000-clip native preparation median438ms; heartbeat worst55ms. Renderer heap observations include GC and cannot prove64MiB actual cap. | Event transfer/main-thread verification still costs time; do not raise limits without allocation/UI profiling. |
| Audio reliability | One owner, audio-clock lookahead, explicit stop on stall/suspension/blur/changes, seek retriggers crossing notes and releases old context. |50ms restart lead; audible envelope/latency/device behavior not measured; Linux-only host validation. Preview can stop during heavy load rather than catch up incorrectly. |
| Interoperability/compatibility | Independent Python and separate expected musical tuples, golden bytes, native restart and module regressions. No source mutation/schema migration/dependency addition. | Isolated REAPER import modal was not successfully automated; no DAW result claimed. Windows/macOS, physical output/device latency and screen-reader certification remain unverified. |

See [MILESTONE_4B_REPORT.md](MILESTONE_4B_REPORT.md) for exact workloads/results and required human review. These limitations do not authorize4C, maps, snapshot migrations, release or legacy copying.

## Milestone4C residual risks

| Risk | Evidence and mitigation | Remaining work / approval |
| --- | --- | --- |
| Rename tracking of references | Mirror frontmatter link is rewritten by Obsidian on in-app rename (native verified); a single unambiguous candidate is suggested, never applied. Renames outside Obsidian or ambiguous cases show Missing + explicit Relink. | Rename while the composition has unsaved edits modifies its frontmatter → protected Save conflict (safe, but requires discard/reload). A file renamed to a name containing `# [ ] |` would make the rewritten link invalid for schema1 (pre-existing for all asset links). |
| Audition invalidation on structure edits | 4B fingerprint includes the whole composition; structure edits stop prepared audition. Navigation never invalidates. | Possible follow-up: fingerprint only musical inputs. Requires compiler-policy review. |
| Large structure lists | 100/500/100 workload: select24ms, move/resize~42ms, undo+redo73ms, save107ms, draw≤0.6ms, zoom/scroll≤1.4ms (native medians). Lists paged at50 rows. | Commit-time costs scale with composition JSON size (validation/clone); no per-frame cost. |
| Overlaps from other writers | Loaded and preserved, flagged in ruler and panel; edits that would keep/introduce overlap are rejected. | User must resolve manually; no automatic repair by design. |
| Host stale active window | Native runs after cold restarts observed Obsidian's `activeDocument` pointing at a detached document, making all Modals inert (MOTIF and CANVAS export). Reproduced with the4B build; refocusing the main window repairs it. The4C harness asserts this precondition. | Not a4C defect; consider defensive modal mounting or a host bug report after review. |

| Audition invalidation on structure edits (4D update) | Resolved by W01/W02: only musical input invalidates. Residual: a Save during an in-flight compile invalidates (safe). | Monitor. |
| Clean CANVAS session after external note change | An open clean session is not reloaded when its note changes on disk; next Save of a later edit conflicts. 4D offers explicit adoption for provable link-only rewrites only. | Candidate follow-up. |
| Legacy duplicate mirror links (from 4C) | Obsidian shortest-form duplicates already on disk make the link-only proof refuse; protected conflict path remains. New relinks dedupe. | User relink resolves. |
| Host stale active window (4D update) | All plugin modals now refuse instead of mounting invisibly (W06). Not reproduced via popout open/close in 4D; upstream cause unknown. | Open (host). |
| MOTIF→PATCHBOOK intermittent navigation | Passed in 4D runs including first run after cold restart; root cause unproven (W10). | Open. |
| 4D selection cost | Same-host large workload: section select 28.4 ms vs 24.7 ms on the 4C build (+15%, inspector context + clip register refresh); other operations at parity. | Accepted; candidate optimisation. |

| Clean CANVAS session after external note change (4E update) | Resolved (X01–X06): clean sessions refresh; dirty sessions get a protected conflict with recovery choices; invalid/deleted notes never replace the draft. Residual: undo history of a clean session is reset by a refresh; pressing Play/Export in the instant before a refresh invalidates (fail-closed). | Monitor. |
| Legacy duplicate mirror links (4E update) | Explicit, provable repair offered (X10); ambiguous shortest-form names are refused. Verified natively on the real 4C duplicate. | Resolved for provable cases. |
| MOTIF→PATCHBOOK intermittent navigation (4E update) | Not reproduced in 4E (all native runs incl. two cold starts, several tabs, closed target, disable/re-enable, concurrency, after failure). Now guarded: readiness gate, verified UUID, latest wins, host restoration deferred during a reveal, bounded failure. Root cause still unproven; a host `setState` arriving *after* a completed navigation would still be honoured. | Mitigated; open (unproven). |
| Host stale active window (4E update) | Guard verified at view level (refusal leaves no pending state; retry works; disposal closes dialogs). Popout open/close natively returned focus to the main document; the stale state was not reproduced, so the native refusal path remains unexercised. | Open (host). |
| Index publish fan-out with large vaults (4E) | Fixed a whole-vault clone per publish (127 ms long task with large compositions) that stopped playback via the 4B stall guard. Remaining publish cost ~29 ms in the dev vault; still O(vault) per publish (MOTIF `items` resolves each motif). | Monitor; candidate follow-up. |
| 4D selection cost (4E update) | Resolved: section select 15.3 → 5.5 ms (large, same process vs the 4D build). | Resolved. |
| Isolated harness launch (4E) | electron43 43.8.7 needed `--ozone-platform=x11` in the isolated launcher (X12). Future Electron updates may change platform selection again. | Monitor. |

| Host stale active window (4F update) | Reproduced natively (activeDocument = closed popout without defaultView). The guard refused correctly; pane click, leaf activation, tab switch did not repair it, only a window focus event did. Message now advises an application switch (inferred from the evidence; the OS-level switch itself was not driven). Trigger not isolated. | Open (host); mitigated. |
| Source-revision acknowledgement friction (4F; 4G update: resolved by batch review Z01–Z06) | After saving a motif, every placing clip must be acknowledged separately before compiling (4B rule, intentional). | Candidate: explicit "acknowledge all clips of this motif". |
| Reverse references and unsaved drafts (4F) | Reverse lists show saved records only (stated in UI). | By design. |
| fileManager.renameFile wedge (4F) | Recurred once in a long-lived dev process during the final regression run; passed in a fresh process. Host behaviour. | Monitor. |
| MOTIF 5,000-note open (4F; 4G update: resolved, 279.8 → 70 ms warm; cause was a second YAML parse and full copies, not the piano roll) | 261 ms median open (pre-existing piano-roll cost). | Candidate follow-up. |

| DAW import defaults (4G) | REAPER 7.84 merges all MIDI tracks onto one track and ignores the file's tempo map unless the user ticks "Expand MIDI tracks to new REAPER tracks" and "Import MIDI tempo map". Not a file defect (verified). | Document for users; candidate export-dialog hint. |
| DAW item length (4G) | REAPER sizes imported items to the last note: the composition's trailing silence/final boundary is not represented in REAPER although the file's end-of-track is correct. MIDI output unchanged by design. | Product decision pending. |
| Large-motif edit commits (4G; 4H update: resolved) | Drag/resize commit ~49 ms at 5,000 notes, ~93 ms at 10,000 (4G). 4H: 10,000-note drag 93.9 → 45.5 ms, resize 94.3 → 41.0 ms, undo/redo 39.5 → 7 ms (4G benchmark method, same process); native commit-only median 32.3 ms. Frozen shared snapshots + sealed command results (H01–H06). | Resolved; see 4H residual risks. |
| Duplicate-key acceptance relaxation (4G) | Valid duplicate-free JSON rejected only by YAML-specific rules is now accepted (Z09). | Accepted; documented. |
| Batch review strictness (4G) | Blocked during an external composition conflict or with an unsaved MOTIF draft of the motif (Z03, Z05). | By design; single-clip review unchanged. |
| Benchmark residue (4G) | Benchmark runs leave recovery checkpoints of synthetic drafts in the dev vault (recovery files are never deleted). | Accepted (disposable vault). |

## Milestone 4H residual risks

| Risk | Evidence and mitigation | Remaining work / approval |
| --- | --- | --- |
| Frozen drafts and snapshots (4H) | Any code that writes to `session.snapshot`, a history entry or a sealed command result now throws instead of silently corrupting shared state. Audited: no in-repo writer; tests assert the throw. A future caller needing an editable value must use `draft` or the default (unsealed) command path. | Documented in CLAUDE.md invariants. |
| Undo depth at 10,000 notes (pre-existing, 4H measured; 4I update: resolved) | 4H kept ~3 entries at 10,000 notes. 4I: shared-snapshot accounting + nested sharing on the sealed MOTIF path retain 30/30 small edits at 5,000 and 10,000 notes and reach the 100-entry cap at 10,000 notes (≈10.5 MiB estimated, budget 16 MiB) (I05–I07). | Resolved for sealed edits; see 4I residual risks. |
| Large multi-note commits (4H) | 100-note move at 10,000 notes: 45–53 ms median across runs under the conservative harness boundary (includes a harness draft copy); p95 up to ~85 ms with occasional long tasks. | Non-blocking; candidate for profiling if users edit 10,000-note motifs routinely. |
| `jsonEqual` equivalence (4H) | Exact for plain JSON data (6,000-pair property test); anything else falls back to the canonical strings. | Accepted. |
| REAPER guidance drift (4H) | Labels quoted from REAPER 7.84 on Linux; other versions may differ (the guidance says so). The menu path to insert media was not captured and is not named. | Re-verify when another DAW/version is evidenced. |
| Composition end in DAWs (4G/4H) | Explained in the export dialog with exact positions; the file is unchanged (no dummy events). | Product decision on an explicit opt-in end marker remains open. |

## Milestone 4I residual risks

| Risk | Evidence and mitigation | Remaining work / approval |
| --- | --- | --- |
| Memory estimate vs real heap (4I) | `historyBytes` is an approximate V8 layout over distinct objects, not a measurement; strings are counted per occurrence (no interning), small integers as heap numbers (conservative). Property-tested to equal a from-scratch recount. | Accepted; documented as an estimate (I05). |
| MOTIF transforms receive the frozen draft (4I) | A MOTIF transform that writes to its input now throws (atomic, nothing committed) instead of editing a private copy. All in-repo transforms build new values; tests assert the throw. | Documented in CLAUDE.md invariants. |
| Full-document MOTIF edits (4I) | Inline renames/settings at 10,000 notes copy every note (≈2.7 MB each estimated), so a few of them still evict older entries (native: 30 → 4 entries after 10 renames, 13.7 MiB). | Non-blocking; by design (untrusted inline transforms are fully copied and validated). |
| Large-checkpoint inspection (4I) | Opening a 5.5 MB checkpoint takes ~0.5 s (full JSON + YAML duplicate-key parse in `inspect()`); small ones ~3 ms. | Deferred (I10). |
| Unread checkpoint metadata (4I) | Until read, a checkpoint of a document absent from the vault has no name and is positioned by file time; type filters and name searches say how many unread checkpoints they cannot judge. | Accepted; *Read all checkpoint details* (≈0.9 s for 898 files / 490 MB here). |
| Recovery growth (4I) | No pruning or deletion exists (append-only); the dev vault holds 900+ checkpoints, one of them a disposable malformed fixture from the 4I workflow. | Retention policy is a separate product decision. |

## Milestone 4J residual risks

| Risk | Evidence and mitigation | Remaining work / approval |
| --- | --- | --- |
| Moved controls (4J) | Secondary actions now sit in disclosures; every label and handler is unchanged, all scripts and suites that click by label still pass (they reach buttons inside closed disclosures). Users need one extra click for Open Markdown/Reload/Discard/Archive. | Accepted (J02). |
| Canvas-drawn labels (4J) | Timeline lane-area labels (SECTIONS, MARKERS, LANE / SOURCE) and clip text are drawn on canvas and keep their 4D presentation. | Deferred: would touch timeline rendering. |
| Viewport-relative surfaces (4J) | Roll/timeline heights follow the window height (bounded); on very short windows the minimum height applies and the page scrolls. | Accepted. |
| Screen-reader certification (pre-existing) | Labels, live regions, focus and keyboard paths verified natively; no assistive-technology certification run. | Deferred. |
