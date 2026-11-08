# MNEMOTOAD user guide

*Remember what you’ve yet to compose.* This guide covers MNEMOTOAD 0.2.0. For installation, see the [README](../README.md#install-manual-desktop-only).

MNEMOTOAD has three modules. Open each one from the command palette with **MNEMOTOAD: Open PATCHBOOK**, **MNEMOTOAD: Open MOTIF** or **MNEMOTOAD: Open CANVAS**. Every record is an ordinary Markdown note in your vault. Changes are written only when you press a **Save** button or Ctrl/Cmd+S.

## PATCHBOOK — remember the sound

PATCHBOOK has three registers: **Instruments**, **Patches** and **Effects chains**. Choose a register, then press **New record**, fill in the form and press **Save record**.

- **Instruments**: the manufacturer or developer, the type, the platform or format, a description and tags.
- **Patches**: choose an instrument, a category, a mood or character, parameters with values and units, tags and any effects chains.
- **Effects chains**: an ordered list of stages, each with parameter notes. You can reorder the stages.
- **Search, filter and sort**: filter by instrument, category, tag and visibility (active or archived). **Clear filters** resets them.
- **Archive record** hides a record from the active list without deleting it. It stays in your vault.
- **Manage assets** links existing vault files (audio, screenshots, preset files) or imports a confirmed copy of a local file. Removing an association keeps the file. **Play preview** plays one audio file at a time; MNEMOTOAD never hosts instruments and never runs preset files.
- A patch shows **Motifs using this patch**, with an **Open in MOTIF** button. Associations are changed from MOTIF.

Record IDs (UUIDs) are shown only in advanced details. Names come first.

## MOTIF — the phrase before the piece

- **New motif** starts an unsaved draft. New motifs use 120 BPM, 4/4 and 960 PPQ. Change tempo and meter in the musical settings, then **Apply musical settings**.
- Draw notes on the piano roll, or use **Add note**. Drag to move, drag the edge to resize, and select several notes for chords. Different-pitch polyphony works.
- The **note inspector** edits the primary selected note exactly: position in bar:beat:tick, pitch, start tick, duration in ticks and velocity. **Apply to primary note** never snaps. A keyboard alternative lists the notes.
- **Same-pitch overlaps are refused.** If an edit would make two notes of the same pitch overlap, the change is not applied. The feedback line says *overlapping same-pitch notes are unsupported*, and the form keeps your unapplied values; use **Discard note changes** to drop them.
- **Transformations** (transpose, quantize starts, set velocity) apply to the selected notes or to all notes, as one undoable step.
- **Undo / Redo** keep up to 100 steps, limited to about 16 MiB of history. Very large full-document edits can evict older steps sooner.
- **Play motif / Stop motif** auditions with a simple sine tone. This is a sketch tool, not a synthesizer.
- **PATCHBOOK context** associates the motif with a patch. **Open in PATCHBOOK** jumps to it. *Sound and usage* lists the saved compositions that use this motif.
- **Import MIDI** shows a preview, then imports one track and channel you choose. Imported timing keeps the file’s PPQ exactly. Anything that cannot be represented is reported before you confirm. **Export MIDI** writes a *new* file; it never overwrites one.

## CANVAS — where saved motifs become a piece

- **New composition**, then **Add lane** (a new composition starts with no lanes).
- **Place motif** opens a picker. Search your saved motifs, choose a position in bar:beat:tick and the number of repetitions. Only **saved** motifs can be placed. Unsaved MOTIF drafts are never used as sources.
- Select a clip to edit its exact position and repetitions, then **Apply clip placement**. You can also duplicate it, move it to another lane or delete it. Lanes can be renamed, reordered and deleted.
- Sections, markers and recording references (audio files in the vault) organise the timeline. They never change compilation, routing or MIDI bytes. Recording references are not played.
- **Compile arrangement** turns the composition into exact MIDI events. **Play arrangement**, **Pause**, **Resume**, **Return to start** and **Stop arrangement** play the compiled result as sine tones. Any musical edit makes the compilation stale; the status chip always says so in words.
- **Export arrangement MIDI** writes a new Type 1 MIDI file from exactly the compilation you heard. The dialog summarises tracks, duration and DAW guidance.
- **Source review.** Each clip remembers the saved revision of its motif. When a saved motif changes, CANVAS shows **Source review required** and blocks compiling. **Review changed sources** shows what changed and which placements are affected. **Acknowledge** to accept the change, then compile again. A changed motif never silently alters your arrangement.

## Moving between modules

**Open in PATCHBOOK**, **Open in MOTIF** and **Open in CANVAS** move between related records. If you leave a module with unsaved changes, the draft stays open and a recovery checkpoint is written. Nothing is lost and nothing is saved for you.

## MIDI behaviour and limitations

- **Note data only.** Notes, one fixed tempo and one fixed meter per motif or composition. No tempo or meter changes, program changes, controllers, pitch bend or sustain.
- **Timing.** Compositions use 960 PPQ. A motif whose PPQ cannot be converted exactly cannot be placed; MNEMOTOAD refuses rather than round. Ticks are exact integers end to end.
- **Import limits.** Files up to 2 MiB, 128 tracks and 50,000 events. Import is done in a background worker you can cancel.
- **Export.** MOTIF and CANVAS export Type 1 files: a conductor track (tempo, meter and the composition length as end of track), then note tracks. Export always creates a new file.
- **DAWs.** Import into REAPER 7.84 (Linux) has been verified with **Expand MIDI tracks** and **Import MIDI tempo map to project tempo map** ticked. REAPER trims each item to its last note. The file itself keeps the full length, including trailing silence, and the export dialog explains this. Other DAWs have not been tested.

## Storage and recovery

All records live under the content folder, `MNEMOBARD/` by default. The folder name is kept from the former product name; see [Retained identifiers](../README.md#retained-identifiers).

| Folder | Contents |
| --- | --- |
| `Instruments/`, `Patches/`, `Effects Chains/` | PATCHBOOK records |
| `Motifs/`, `Compositions/` | MOTIF and CANVAS records: front matter plus a fenced JSON data block |
| `Assets/` | Imported copies of your files (default import folder) |
| `Exports/` | Suggested destination for exported MIDI |
| `Recovery/<record id>/` | Recovery checkpoints (JSON) |

- You can edit a note’s Markdown body freely. Your writing and unknown front-matter fields are kept on every save.
- **Saving is protected.** If a note changed on disk since you opened it, Save is blocked (*Note changed elsewhere · your edits are kept · Save blocked*). Reload the saved version or keep your draft. A clean, unedited view refreshes itself automatically.
- **Checkpoints.** Pre-save backups and unsaved drafts are written as checkpoints. MNEMOTOAD never deletes, prunes or rewrites them.
- **Recovery register** (PATCHBOOK **Recovery register**, MOTIF **Motif recovery**, CANVAS **Composition recovery**): search, filter by module or type, page through and inspect checkpoints, read-only. Rows say whether the original is available, changed since the checkpoint (*conflict*), missing, or never saved. **Load draft without saving** needs an explicit confirmation and only opens a draft; nothing is written until you Save.
- Records with an unknown future schema open read-only. Duplicate IDs are reported and never merged automatically.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| The plugin does not appear after copying files | The folder must be `.obsidian/plugins/mnemobard/`. Turn off Restricted mode in Community plugins, then enable MNEMOTOAD. |
| A tab still says “MNEMOBARD · …” after upgrading | Obsidian shows a cached title for tabs it has not loaded yet. Click the tab once. |
| *Source review required* | A saved motif changed. Review and acknowledge it, then compile. |
| *Note changed elsewhere … Save blocked* | Another editor or sync changed the note. Reload the saved version, or keep your draft and compare. |
| A note edit is not applied | Check the feedback line. Same-pitch overlaps and out-of-range values are refused, never silently changed. |
| MIDI import is blocked | The file exceeds the limits or contains data MOTIF cannot represent. The preview lists each issue. |
| No sound | Audition uses Web Audio. Check the system output device, and press Return to start before playing. |
| An item looks short in REAPER | REAPER trims items to their last note. The exported file keeps the full length. |
| *Settings are read-only* | `data.json` was written by a newer version or is invalid. MNEMOTOAD does not overwrite it; repair or restore it. |

## Known limitations

- MNEMOTOAD is not a DAW. Audition plays simple sine tones; it is not equivalent to an external synthesizer, and MIDI export contains no rendered audio.
- Instrument and patch records are organisational references; MNEMOTOAD does not host, load or play the sounds they describe.
- Desktop only. Verified on Linux with Obsidian 1.15.0; Windows and macOS have not been validated.
- Fixed tempo and meter, note-only MIDI. No audio recording, mixing or plugin hosting.
- DAW import verified only for REAPER 7.84 on Linux.
- Screen-reader validation is incomplete. Keyboard access and visible focus have been tested; screen-reader behaviour has not.
- Internal storage identifiers keep the former name MNEMOBARD (plugin ID, `MNEMOBARD/` folder, front-matter keys, recovery formats) for compatibility.
- Reverse references list saved records only; unsaved drafts are not listed.
- Undo keeps 100 small edits even on a 10,000-note motif, but full-document edits (renames, settings) evict older steps sooner.
- A freshness refresh of a clean view resets that view’s undo history.
- Opening a multi-megabyte checkpoint in the recovery inspector takes about half a second. Checkpoints of documents that are not in the vault have no name until their details are read (**Read all checkpoint details**).
- Batch source review is blocked during an external composition conflict, or while the motif has an unsaved MOTIF draft.
- Recording-reference filenames containing `# [ ] |` are not supported.
