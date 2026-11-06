# MNEMOBARD

*Remember what you’ve yet to compose.*

MNEMOBARD is an offline-first musical workspace under development inside Obsidian for capturing sounds, developing MIDI fragments, and planning compositions. Initial support targets desktop Linux, Windows, and macOS.

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

**Milestone3A: MOTIF now has a production piano roll, bounded undo/redo, basic audition, explicit Save and musical draft recovery.** PATCHBOOK retains its library/assets/recorded preview workflows; CANVAS remains planned.

The instrument/patch/effects-chain registers retain search/filter/sort, stable relationships, Markdown access, explicit Save, conflict protection and reversible archiving. **Manage assets** selects existing vault files, imports a confirmed local copy, repairs a missing reference or removes an association while keeping the file. **Play preview** auditions one recording at a time; no instrument is hosted or synthesized. **Recovery register** discovers checkpoints and loads a reviewed draft without saving it automatically.

Open **MNEMOBARD: Open PATCHBOOK**, create an instrument and patch, select assets, then **Save record** (or Ctrl/Cmd+S). Preview recording support depends on the host; synthetic WAV/MP3/OGG/FLAC passed Linux Obsidian1.15.0. Import limit100MiB; preview limit250MiB. Unknown/preset files open in inert inspection rather than an external executable. See the [2B report](docs/MILESTONE_2B_REPORT.md) for exact tests, screenshots and limitations.

Open **MNEMOBARD: Open MOTIF** → New motif. Draw notes/chords, drag or resize, use the note register for precise pitch/start/duration/velocity, then Play and Save motif. Defaults are120BPM,4/4,960PPQ. Existing source ticks remain exact. Different-pitch polyphony works; same-pitch overlaps are explicitly rejected. Recovery checkpoints are separate from saved notes. See the [3A report](docs/MILESTONE_3A_REPORT.md) and [actual screenshots](output/motif/milestone-3a/) for controls, validation and limits. MIDI import/export and advanced transformations remain deferred.

Signed commit `c63125b` preserves the reviewed2B foundation. The independent MIDI/rendering experiments are unchanged. Stop after3A: further implementation, legacy copying and publication require separate authorization. Final branding is unapproved.

`pnpm check` passes278 tests across26 files, typecheck, lint and production build. See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup and the guarded disposable-vault workflow. The basic musical workflow, cold restart, conflicts and recovery were validated in Linux Obsidian1.15.0; Windows/macOS, physical audio latency and screen-reader behavior remain unverified.

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
