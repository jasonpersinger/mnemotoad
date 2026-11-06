# MNEMOBARD

*Remember what you’ve yet to compose.*

MNEMOBARD is a proposed offline-first musical workspace inside Obsidian for capturing sounds, developing MIDI fragments, and planning compositions. Initial support targets desktop Linux, Windows, and macOS.

The plugin brings together three modules:

| Module | Purpose | Planned capability |
| --- | --- | --- |
| PATCHBOOK | Remember sounds and their context | Instrument and preset records, parameters, effects chains, tags, screenshots, audio references, and links to musical ideas. |
| MOTIF | Develop musical fragments | Piano-roll editing, basic synthesis for audition, tempo and meter, MIDI import/export, and musical transformations. |
| CANVAS | Plan a composition | Motif lanes, repetition, patch associations, sections, recording references, development notes, and arrangement MIDI export. |

MNEMOBARD supports the work around a DAW. It does not host VST/AU instruments or provide a full audio production engine. CANVAS is the module’s product name; it does not imply use of Obsidian’s `.canvas` format or private Canvas APIs.

## Product philosophy

Keep musical knowledge in the vault, accessible without the plugin. Prefer Markdown, YAML, documented JSON, and standard MIDI. Preserve original audio, presets, and imported projects. Respect Obsidian’s navigation, themes, commands, and file behavior. Require no account, telemetry, or remote service.

## Current status

**Milestone 2A: PATCHBOOK is a usable instrument, patch and effects-chain library. Musical editors remain planned.**

PATCHBOOK provides three registers, create/edit forms, descriptions/tags/parameters, ordered reusable effects chains, search/filter/sort, related navigation and ordinary Markdown access. Records use stable IDs and shared source-preserving persistence with recoverable conflicts. Confirmed archive/restore removes entries from the active library while retaining their notes. File/audio/screenshot/preset references are metadata only; previews and attachment management are deferred to2B.

Open **MNEMOBARD: Open PATCHBOOK**, create an instrument, then a patch associated with it. Create a chain in **Effects chains** and select it on a patch. **Save record** or Ctrl/Cmd+S in a form saves to the vault. Disabling the interface preserves files. See the [2A report](docs/MILESTONE_2A_REPORT.md) for validation/limits. Signed commit `f0d90d1` preserves completed1B work before2A. Further implementation requires separate review/authorization.

MOTIF/CANVAS remain theme-compatible shells. Production MIDI/audio/arrangement functionality is not implemented. Separate experiments remain isolated from production records; their success does not approve adoption.

`pnpm check` runs typecheck, lint, tests and a production build. See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup and the guarded disposable-vault workflow, and [MILESTONE_1A_REPORT.md](docs/MILESTONE_1A_REPORT.md) for exact validation and limitations. Linux Obsidian 1.15.0 native smoke validation was performed; Windows/macOS and musical capabilities are unverified.

The kickoff’s `/home/troubadour` path was corrected by the user to `~/troubadour` (`/home/jason/troubadour`). The [Milestone 0 audit](docs/TROUBADOUR_AUDIT.md) remains the read-only reference. No legacy source/tests/assets were copied, and no legacy reuse has been authorized. All foundation code was implemented independently.

The existing root contained only documentation at the start of 1A. A local Git repository and a marked project-local `dev-vault` were created. Signed commit `70f45df` preserves the completed 1A baseline. See the [Milestone 1B report](docs/MILESTONE_1B_REPORT.md) for native measurements, limitations and proposed production choices. No remote, publication, system install or personal-vault changes occurred. Further implementation requires a separate prompt and review.

## Read the proposal

- [Product specification and MVP acceptance criteria](docs/PRODUCT_SPEC.md)
- [Architecture and service boundaries](docs/ARCHITECTURE.md)
- [Data model and file examples](docs/DATA_MODEL.md)
- [Roadmap, dependencies, and approval gates](docs/ROADMAP.md)
- [Interface and design direction](docs/DESIGN_DIRECTION.md)
- [Technical research and official references](docs/TECHNICAL_RESEARCH.md)
- [TROUBADOUR audit status and investigation plan](docs/TROUBADOUR_AUDIT.md)
- [Engineering risks and feasibility experiments](docs/RISKS.md)
- [Decision register](docs/DECISIONS.md)
- [Milestone 0 report](docs/MILESTONE_0_REPORT.md)

Future agents must read [AGENTS.md](AGENTS.md). Internal research records are [task_plan.md](task_plan.md), [findings.md](findings.md), and [progress.md](progress.md).

## Licensing

MNEMOBARD’s distribution license has not been selected. Dependency licenses and TROUBADOUR ownership require review before adopting code or publishing. The presence of these files does not establish redistribution rights for any legacy or third-party material.
