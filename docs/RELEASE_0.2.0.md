# MNEMOTOAD 0.2.0

*Remember what you’ve yet to compose.* Released by Jason Persinger under the MIT License. Requires Obsidian 1.15.0 or later (desktop); validated on Linux.

0.2.0 is the first release under the name **MNEMOTOAD**, formerly MNEMOBARD 0.1.0. It is a drop-in upgrade. It adds the new identity and documentation, and leaves the musical engine, storage and recovery behaviour unchanged.

## New in 0.2.0

### Identity

- **MNEMOBARD → MNEMOTOAD.** The new name appears in the plugin name, commands (*MNEMOTOAD: Open PATCHBOOK / MOTIF / CANVAS*), view titles, module headers, settings, notices and error messages. The module names are unchanged.
- **Brand colours**: Near Black `#070707`, Dark Umber `#28231c`, Swamp Green `#317b22`, Occult Violet `#801a86` and Sulfur Yellow `#f4e409`, applied sparingly within Obsidian’s light and dark themes:
  - violet primary buttons with white labels;
  - a yellow focus ring in dark themes and a violet one in light themes;
  - a green selection marker in dark themes and a violet one in light themes;
  - a violet header rule.
  - Obsidian’s own theme colours are never overridden. See [BRAND.md](BRAND.md).
- **Mascot — The Curmudgeon:** a 24×24 pixel toad. It appears in the module headers, PATCHBOOK’s empty state and a new **About** panel in settings (version, author, licence).
- **License:** MIT (`LICENSE`).

### Fixed

- **Recovery register:** checkpoints of records that were never saved were labelled *Original missing*, suggesting lost data. They now read **Never saved**, matching the inspector.

### Compatibility

- The plugin ID stays `mnemobard`, and the folder `MNEMOBARD/`, the front-matter keys, the recovery formats, the view types and the command IDs are all unchanged. Settings, hotkeys, open views, records and checkpoints carry over.
- Verified: upgrading a test vault from 0.1.0 left all 4,115 files under `MNEMOBARD/` byte-identical. That covered 795 records, 1,175 checkpoints and the settings file.
- Records written by 0.1.0 are pinned in automated tests: they load, resolve, compile and save in place.
- MIDI output is **byte-identical** to the validated release candidate (72 arrangements, 4 motifs) and to the golden fixtures.
- Tabs Obsidian has not loaded yet may show the old title until opened once.

## Capabilities from earlier milestones (unchanged in 0.2.0)

- **PATCHBOOK:** instrument, patch and effects-chain registers; search, filter, sort and archive; linking existing vault files and importing confirmed copies; one-at-a-time audio preview; reverse references to motifs.
- **MOTIF:** piano roll with drawing, moving, resizing and chords; exact numeric editing; transpose, quantize and velocity transformations; undo and redo (100 entries, up to 16 MiB); sine audition; MIDI import with fidelity checks and preserved PPQ; MIDI export; PATCHBOOK association.
- **CANVAS:** lanes and clips with exact placement and repetition; sections, markers and recording references; compilation; audition (play, pause, resume, stop); Type 1 multitrack MIDI export with summary and DAW guidance.
- **Source-reference protection:** each clip records its motif’s saved revision. A changed motif must be reviewed and acknowledged before compiling, and unsaved drafts are never used.
- **Safety:** explicit and protected saves (stale-save conflicts are blocked, your edits are kept); checkpoints for drafts and pre-save backups; a read-only recovery register with consent-gated loading; unknown metadata preserved; unsupported future schemas open read-only.
- **Interface:** a shared page structure, one primary action per row, keyboard access and visible focus, and narrow-pane layouts (4J).
- **MIDI interoperability:** independently parsed exports; import verified in REAPER 7.84 on Linux.

## Known limitations

- Not a DAW: no plugin hosting, audio rendering, recording or mixing. Audition uses sine tones; MIDI exports contain no audio. Patches are organisational references.
- Fixed tempo and meter; note data only.
- Windows, macOS and screen-reader use have not been validated. DAW import has been verified only in REAPER 7.84 on Linux.
- Internal identifiers keep the MNEMOBARD spelling for compatibility.
- See the [user guide](USER_GUIDE.md#known-limitations) for the full list.
