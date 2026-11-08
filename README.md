# MNEMOTOAD

*Remember what you’ve yet to compose.*

MNEMOTOAD is a local-first Obsidian plugin for organising instrument patches, composing musical motifs and arranging those motifs into larger compositions. Everything is stored in your vault as ordinary Markdown notes, so your records stay readable without the plugin.

MNEMOTOAD works alongside a DAW; it is not one. It does not host instrument plugins and does not render audio. Version **0.2.0**, by **Jason Persinger**, MIT License.

## Features

### PATCHBOOK — sound and patch library

- Three registers: **instruments**, **patches** and **effects chains**.
- **Instruments** record the manufacturer, type, platform or format, description and tags.
- **Patches** record their instrument, category, character, parameters and tags, and link to effects chains.
- **Effects chains** are ordered stages with parameter notes.
- Search, filter by instrument, category, tag or visibility, and sort. Records can be archived without being deleted.
- Link existing vault files (audio, screenshots, preset files), or import a confirmed copy of a local file. Preview one audio file at a time. Preset files are only inspected, never executed.
- Each patch lists the motifs that use it.

### MOTIF — musical phrase composition

- A piano roll: draw, move and resize notes, select several, and build chords. Notes can also be edited exactly by number in bar:beat:tick and ticks.
- Transformations: transpose, quantize starts and set velocity. Undo and redo.
- Tempo, meter and PPQ per motif (new motifs use 120 BPM, 4/4, 960 PPQ).
- **Audition** with a simple sine tone, for checking a phrase. It is not a synthesizer.
- **MIDI import** (choose one track and channel; the source PPQ is kept, and anything that cannot be represented is reported first) and **MIDI export** to a new file.
- Associate a motif with a PATCHBOOK patch, and jump between the two.

### CANVAS — arrangement and composition planning

- Lanes of saved motifs, placed by exact bar:beat:tick, with repetitions. Clips can be moved, duplicated, deleted or moved between lanes.
- Sections, markers and references to recordings in the vault, for organisation only. They never change the MIDI.
- **Compile** to exact MIDI events, **audition** the arrangement (play, pause, resume, stop; sine tones), and **export multitrack MIDI** (Type 1).
- **Source-revision protection:** when a saved motif changes, CANVAS asks you to review and acknowledge the change before compiling again. Unsaved MOTIF drafts are never used.

## Requirements

- Obsidian **1.15.0** or later, desktop. The plugin is marked desktop-only.
- Validated on **Linux** (Obsidian 1.15.0). Windows and macOS have not been validated.

## Installation

MNEMOTOAD is not yet in the community plugin directory.

1. Get the release files `main.js`, `manifest.json` and `styles.css`, or build them with `pnpm install && pnpm build`.
2. Copy them into `<vault>/.obsidian/plugins/mnemobard/`. The folder name is the plugin ID; see [Compatibility identifiers](#compatibility-identifiers).
3. In **Settings → Community plugins**, turn off Restricted mode if prompted, then enable **MNEMOTOAD**.

**Upgrading from MNEMOBARD 0.1.0:** replace the three files in the same folder and restart Obsidian. Records, settings, recovery checkpoints, hotkeys and open views carry over; nothing is migrated or rewritten. Tabs Obsidian has not loaded yet may show the old title until opened once.

## Basic usage

1. **MNEMOTOAD: Open PATCHBOOK** → Instruments → **New record** → **Save record**. Then create a patch and choose its instrument.
2. **MNEMOTOAD: Open MOTIF** → **New motif**. Under **PATCHBOOK context**, associate the patch. Add notes, **Play motif**, then **Save motif**.
3. **MNEMOTOAD: Open CANVAS** → **New composition** → **Add lane** → **Place motif**, and set the repetitions. Then **Compile arrangement**, **Play arrangement** and **Save composition**.
4. Export with **Export MIDI** (MOTIF) or **Export arrangement MIDI** (CANVAS).

See the [user guide](docs/USER_GUIDE.md) for details.

## Data storage

Records are Markdown notes with YAML front matter. Motifs and compositions also contain a fenced JSON data block. They live under `MNEMOBARD/` in your vault: `Instruments/`, `Patches/`, `Effects Chains/`, `Motifs/`, `Compositions/`, `Assets/` (imported copies), `Exports/` and `Recovery/`. Your own writing in a note’s body and unknown front-matter fields are kept on every save. MNEMOTOAD never modifies, moves or deletes your audio, presets or imported MIDI.

## Backup and recovery

- Saving is explicit (a Save button or Ctrl/Cmd+S) and protected. If a note changed on disk since you opened it, Save is blocked and your edits are kept.
- Unsaved drafts and pre-save backups are written as checkpoints in `MNEMOBARD/Recovery/`. They are never deleted or pruned automatically.
- The **recovery register** in each module lets you search and inspect checkpoints read-only. Loading one needs explicit confirmation and only opens an unsaved draft.
- Your vault remains your backup unit: back it up as you would any other notes.

## MIDI interoperability

- Note data only, with one tempo and one meter per motif or composition, at exact integer ticks (compositions use 960 PPQ).
- Imports are limited to 2 MiB, 128 tracks and 50,000 events.
- Exports are always new files. Arrangement exports are Type 1: a conductor track, then note tracks for the lanes that contain notes, keeping the composition’s full length.
- Verified in **REAPER 7.84 on Linux**: tick *Expand MIDI tracks* and *Import MIDI tempo map* when importing. REAPER trims each item to its last note; the file keeps the full length. Other DAWs have not been tested.

## Known limitations

- MNEMOTOAD is not a DAW. Audition uses sine tones and is not equivalent to an external synthesizer. MIDI export contains no rendered audio.
- Instrument and patch records are organisational references; sounds are not hosted or loaded.
- Fixed tempo and meter; no controllers, program changes or pitch bend.
- Windows, macOS and screen-reader use have not been validated.
- Internal storage identifiers keep the former name MNEMOBARD for compatibility (below).
- More in the [user guide](docs/USER_GUIDE.md#known-limitations).

## Privacy and local-first behaviour

No account, telemetry, analytics, network service or synchronisation. MNEMOTOAD reads and writes only inside your vault, and only when you act. Preset and other files are never executed.

## Compatibility identifiers

The product was named MNEMOBARD before 0.2.0. These identifiers keep that spelling so existing vaults keep working:

| Identifier | Reason |
| --- | --- |
| Plugin ID `mnemobard` | Keys the plugin folder, settings and enabled state |
| View types `mnemobard-*` | Saved layouts reopen views by type |
| Command IDs `mnemobard:open-*` | Hotkeys are bound to them |
| Folder `MNEMOBARD/` | Existing records live there |
| Front-matter keys `mnemobard_*`, data blocks `mnemobard-motif` / `mnemobard-composition` | The storage format |
| Recovery formats `mnemobard-recovery`, `mnemobard-editor-draft` | Existing checkpoints stay readable |
| MIDI conductor track name `MNEMOBARD conductor` | Part of the exact exported bytes |

## Development

```sh
pnpm install
pnpm check          # typecheck + lint + tests + production build
pnpm dev:vault      # deploy into the marked disposable dev-vault/
pnpm dev:obsidian   # isolated Obsidian for native checks
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [AGENTS.md](AGENTS.md). Brand colours and the mascot: [docs/BRAND.md](docs/BRAND.md). Release notes: [docs/RELEASE_0.2.0.md](docs/RELEASE_0.2.0.md).

## License

[MIT](LICENSE) © 2026 Jason Persinger. Bundled third-party code (`yaml`, ISC; `midi-file`, MIT) is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Author

Jason Persinger.
