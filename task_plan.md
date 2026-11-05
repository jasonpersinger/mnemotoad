# MNEMOBARD Milestone 0 plan

Scope: research, source audit, provisional specifications and architecture only. No implementation, dependency installation, Git initialization, or legacy import.

## Phases
1. Workspace inspection — complete. Existing root empty; no Git repository.
2. TROUBADOUR audit — complete (static): user-authorized ~/troubadour (/home/jason/troubadour), HEAD bc2749e, clean tree; original /home/troubadour absent. No execution/copy.
3. Official technical research — complete (primary-source review; runtime claims untested).
4. Documentation and reviewable recommendations — complete; all remain unapproved.
5. Cross-document validation and report — complete; final source-reference check recorded in progress.

## Next Step
Stop after Milestone 0. Await user review and explicit Milestone 1 authorization; no implementation or legacy import.

## Errors and limitations
- Initial rg inventory returned no files (exit 1); confirmed empty with ls -la.
- git rev-parse/status failed because the root is not a Git repository. No repository created.
- ls -ld /home/troubadour returned no such file or directory. At that initial path no source evidence was available; resolved by the user-authorized corrected path, then audited read-only.
- Skill read output exceeded output budget; relevant planning sections were read separately.

- Official sample-plugin GitHub connector fetch returned 404; using public official-source browsing fallback.

- Verbose research output was truncated; targeted excerpts re-read. Invalid process poll and undefined-result store were corrected with focused source reads; no filesystem mutation outside authorized documentation.

- Documentation source-path checker initially read prose “tests/fixtures” as a path; changed the label to “tests and fixtures” and revalidated. Earlier placeholder report links were resolved when the report was created.

# Milestone 1A (Prompt 002 authorization)

6. Preparation/current docs/dependency review — complete. No project Git at start; 16 baseline documentation/metadata files.
7. Build + domain/codec + meaningful tests — complete.
8. Shared safe persistence/index/references/settings — complete.
9. Views/lifecycle/dev vault + native runtime smoke/cold restart — complete.
10. Documentation/report/preservation checks — complete.

## Current Next Step
Stop after Milestone 1A. Await a separate prompt/review before Milestone 1B; no legacy extraction.

## 1A preparation limitations
- No initial Git repository; exact document changes since 0 cannot be proven without a previous document hash manifest. Current inventory matches the 16-file 0 deliverable; contents reviewed.
- Some verbose reads truncated; required documents were previously read in this session and relevant data/approval sections re-read.
- Lifecycle permalink now returns Not Found; official docs source read instead.

1A checks: domain/codec/repository/index/references/settings/module/host-shell contract tests now 62 passing. Typecheck/lint/build pass for initial source; later host mocks undergoing typecheck. Lint initially flagged a control-character path regex; replaced it with explicit character validation rather than weakening the rule. Production dependency audit reports no known advisories. No DISPLAY configured; probing only isolated launch feasibility.

- Final runtime lexical check initially matched the English word “any” in an error message; refined to explicit type annotations/assertions and passed. No type rule was bypassed.
- Native harness settings-window assertion failures were diagnosed and corrected; final workload and cold restart passed.

# Milestone 1B (Prompt 003 authorization)

11. Preparation and signed baseline — complete: 74 foundation tests/typecheck/lint/build passed; signing key unlocked by user; baseline 70f45df has good signature.
12. Pure timing/event compiler experiments — complete; source resolution/rational endpoints, inverse tempo maps, SMPTE rejection and deterministic bounds/order tested.
13. Transport/audio cancellation experiment — complete; fake-clock tests and native Web Audio/offline onset checks; 50 start/stop and 20 close cycles.
14. Native renderer/arrangement benchmarks — complete with documented failed all-DOM20k and unverified SVG20k. Successful bounded suite21 cases; reviewed evidence retained.
15. Dependency review, regression verification and report — complete;123 tests/13 files, typecheck/lint/build and native foundation regression pass. See docs/MILESTONE_1B_REPORT.md.

Execution plan: docs/superpowers/plans/2026-11-05-milestone-1b.md. Prompt 003 supersedes the historical 1B stop for experiments only; production adoption and legacy copying remain gated. No additional permission is required for routine authorized experiments.

1B errors/limits: initial GPG signing unavailable until user unlocked key; signed baseline succeeded. Initial native all-DOM20k caused CDP timeout; only the verified isolated instance restarted, workload retained as failed. Bounded suite now saves results incrementally. Strict typecheck found an unchecked fixture byte access, corrected using DataView. No type/lint/test rule weakened. Stop here pending human review and a separate implementation prompt.
