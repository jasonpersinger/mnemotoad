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
