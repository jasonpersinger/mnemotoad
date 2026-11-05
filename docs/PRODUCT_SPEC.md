# Product specification

Milestone 1A status: shared data/storage/settings and three under-development view shells are implemented. The MVP functional table and AC-01–10 below remain product targets, not completed editor/playback/export claims. See [MILESTONE_1A_REPORT.md](MILESTONE_1A_REPORT.md).

## Purpose and users

MNEMOBARD helps musicians retain the relationship between a sound, an idea, and a composition. The target outcome is a useful vault of musical material and an export that can continue in a DAW.

| Persona | Need | Successful outcome |
| --- | --- | --- |
| Composer collecting fragments | Capture a phrase and remember its intended sound | Reopen an editable motif with its patch and context intact. |
| Electronic musician or sound designer | Find a useful sound without remembering preset names | Search tags and parameters, inspect screenshots, audition a recorded preview. |
| Field recordist arranging material | Place recordings and musical ideas in an evolving plan | Reference source recordings, label sections, and see where ideas recur. |
| Musician already using Obsidian | Keep creative work alongside notes | Use ordinary links, readable files, themes, and command-palette navigation. |

These personas are product hypotheses from the brief, not validated interviews. Validate them with a small set of musicians before expanding beyond the integrated MVP.

## Primary workflows

1. **Capture a sound:** create a patch note; name its instrument and preset; add tags, ordered effect descriptions, optional parameter values, and vault attachment links. A preview recording describes the sound; the record does not load that instrument.
2. **Develop a fragment:** create a motif; draw or numerically enter notes; move, resize, select, delete, undo, quantize, and transpose; audition using the bundled basic synthesizer; link a patch.
3. **Plan a piece:** create a composition; add patch-associated lanes; choose a motif through an accessible picker or internal drag-and-drop; place, move, remove, and repeat instances; add section notes and markers.
4. **Continue elsewhere:** validate an arrangement, inspect export warnings, and create a new `.mid` in the vault. Open it in an independent MIDI application or DAW.
5. **Return later:** save, close Obsidian, reopen the relevant note/view, and recover identical notes, links, clips, timing, and metadata.

## Functional requirements

| ID | Requirement | Scope |
| --- | --- | --- |
| P-01 | Create/edit patch name, instrument/preset text, tags, parameters, and ordered effect descriptions. Preserve user prose and unknown frontmatter. | MVP |
| P-02 | Link vault screenshots, preset files, and audio previews; preview supported audio on request and open linked records. | MVP; no preset parsing |
| P-03 | Search patch names, instrument, tags, and linked records using a rebuildable in-memory index. | MVP |
| M-01 | Interactive polyphonic piano roll with selection, note creation/deletion, move/resize, velocity, snap, zoom/pan, and equivalent keyboard/numeric controls. | MVP |
| M-02 | Set a single tempo and time signature for a motif; play, stop, seek, and loop via a basic oscillator synth. | MVP |
| M-03 | Import a supported SMF track/channel into a new motif and export a motif as MIDI. Preserve the imported source file. | MVP; contract below |
| M-04 | Quantize starts and transpose notes with undo. Invalid out-of-range transposition is rejected as a whole. | MVP |
| M-05 | Invert, reverse, stretch/compress rhythms, and support richer MIDI/controller editing. | Later |
| C-01 | Multiple ordered lanes; link motifs; move and repeat full-length motif instances on a beat grid. | MVP |
| C-02 | Lane patch links override motif patch links for context; add labeled sections, markers, notes, and recording references. | MVP |
| C-03 | Preview MIDI arrangement through the shared synth and export deterministic Type 1 MIDI. | MVP |
| C-04 | Represent fades, transition intent, and development; audio waveforms and richer trim/overlap policies. | Later; narrative notes available in MVP |
| X-01 | Follow and repair relationships by stable identity; expose broken and ambiguous links without deleting records. | MVP |
| X-02 | Save during ordinary work, show dirty/saving/saved/error states, survive normal restart, and recover conflicts without silent overwrite. | MVP |
| X-03 | PATCHBOOK operates independently. MOTIF uses shared MIDI/audio services. CANVAS reads motif domain data without requiring the MOTIF editor UI. | MVP |

### MVP MIDI contract

- MIDI 1.0 SMF Types 0 and 1 with PPQ timing; user chooses one track/channel with notes to create a motif. Reject Type 2, SMPTE division, and files with changes of tempo or meter in this initial importer. Report the reason before creating a motif.
- Retain note pitch, start, duration, attack velocity and explicit source PPQ without snapping or normalizing imported ticks. New authored motifs default to 960 PPQ. Arrangement export converts to its 960 PPQ with explicit rounding warnings when necessary. Explicitly detect and report controllers, sustain, pitch bend, aftertouch, program changes, lyrics, or other events that the editable motif will not reproduce. Permit a clearly labeled note-only import after acknowledgement; otherwise cancel. SysEx is never transmitted or executed.
- Global tempo defaults to 120 quarter notes/minute and meter to 4/4 only when absent. Importer reports assumed defaults. Repeated identical tempo/meter declarations are not changes.
- Export motifs and arrangements with notes, tempo, meter, track names, and section markers. No promise of lossless arbitrary-MIDI round-trip. MIDI export does not carry proprietary patch sound, audio references, or rendered audio.
- Full event rules, clip expansion, channel allocation, and ambiguity policies belong to [DATA_MODEL.md](DATA_MODEL.md).

### MVP arrangement bounds

Proposed supported envelope: 16 lanes, 1,000 motif instances, 10,000 notes per motif, and 100,000 expanded arrangement notes; 15 pitched MIDI channels plus the designated percussion channel. Motifs have explicit length; instances repeat that full length at the composition’s tempo and meter. No clip trimming, time stretching, arbitrary instance transforms, or synchronized recording playback. Overlapping instances are allowed only when the resulting same-channel/same-pitch notes remain unambiguous; export preflight reports conflicts.

These are initial product limits and test fixtures, not verified capacity. Performance experiments may change them through review.

## Nonfunctional requirements

| ID | Requirement and proposed acceptance measure |
| --- | --- |
| N-01 Local-first/privacy | With network blocked, all MVP workflows work; no telemetry, remote assets, account, or runtime dependency download. |
| N-02 Interoperability | Every entity is documented Markdown/YAML/JSON; generated MIDI opens in an independent reader and a DAW. Disabling the plugin leaves notes, links, and exports available. |
| N-03 Data integrity | Originals remain byte-identical; unrecognized schemas and invalid files open without write access; save conflicts retain both revisions; no successful-save indication before write completion. |
| N-04 Performance | Proposed grid target: p95 frame work ≤16.7 ms during pan/drag at 1,000 visible notes within a 10,000-note motif on recorded reference hardware. Proposed input-to-visual response p95 ≤50 ms. Measure in real Obsidian; see [risks](RISKS.md). |
| N-05 Timing | Schedule against the audio clock; measure event scheduling and actual loopback onset separately. No sample-accuracy claim under OS sleep or stalled UI. Use experiment R2 before committing timing promises. |
| N-06 Accessibility | Complete essential creation/edit/save/export workflow using a keyboard; provide note and clip lists with labeled numeric fields, visible focus, and non-color status cues. Test a desktop screen reader. |
| N-07 Host compatibility | Use public Obsidian APIs and theme variables; test Linux, Windows, and macOS; preserve workspace restoration and clean up all resources. Initial desktop-only release proposed. |
| N-08 Maintainability | Typed domain with no Obsidian/DOM imports; automated tests cover timing, serialization, import/export, conflicts, migrations, lifecycle, and the integrated workflow. Pin reviewed dependencies. |

## Explicit exclusions and deferrals

Exclude VST/AU hosting, native audio drivers, DAW project editing, destructive audio/preset editing, multitrack audio rendering/mixing, recording, audio time stretch, mastering, external runtimes, cloud collaboration, accounts, telemetry, and remote soundfont dependencies. Hardware MIDI, staff notation, complex automation, tempo maps, mobile editing, extensive synthesis, waveform editing, and additional transforms are deferred. Plain notes can document these ideas without implementing their playback.

## Dependencies and critical seams

Stable IDs and persistence precede all modules. PATCHBOOK establishes the first record workflow. MOTIF supplies the note model and MIDI codec used by CANVAS. Composition preview/export must call the same clip-expansion and event-ordering functions. Every editor saves through the repository boundary. A patch link supplies musical context, never a promise of identical synthesis. The [architecture](ARCHITECTURE.md) defines the shared services; the [roadmap](ROADMAP.md) orders their validation.

TROUBADOUR’s tick/edit math, voice/gain logic, preservation/conflict patterns and regression fixtures could accelerate the MVP after authorization and adaptation. Its custom MIDI codec remains reference-only; the patch library, dense-grid renderer and lane arrangement compiler require new work. Schedule the MVP so it remains feasible if reuse is denied; see [audit classification](TROUBADOUR_AUDIT.md#16-component-reuse-classification).

## Integrated MVP acceptance criteria

| ID | Reviewable evidence |
| --- | --- |
| AC-01 | In a disposable vault, create a patch with instrument, tags, ordered effects, screenshot, and supported audio preview. Find it by tag and open its ordinary Markdown note. |
| AC-02 | Create an eight-bar motif containing overlapping pitches/chords; draw and numerically edit start/duration/velocity; select, move, resize, delete, undo/redo, quantize, and transpose. Link the patch; preview with network blocked. |
| AC-03 | Create a composition with at least two patch-linked lanes, place and repeat the motif, add a second motif, a section, marker, and recording link. Verify clip repetition in preview. |
| AC-04 | Wait for Saved, fully close/reopen Obsidian, and verify notes, instances, repeat counts, tempo/meter, patch links, and attachment paths against the saved files. |
| AC-05 | Export a new Type 1 MIDI. Independent parser and a desktop DAW agree on track note counts, ticks, durations, velocities, tempo/meter, repeat positions, and markers. Audio previews and patch timbres are visibly excluded. |
| AC-06 | Rename a linked note and an attachment; reload; relationships resolve. Delete a target and introduce duplicate IDs: show actionable diagnostics without arbitrary reassignment or deletion. |
| AC-07 | Modify a file externally while dirty, inject a save failure, truncate a record, and open a future schema. Preserve existing bytes and unsaved edits; show conflict/recovery choices. |
| AC-08 | Disable/re-enable modules and plugin repeatedly during playback; sound stops, listeners/timers/observers/workers are released, and open workspace locations restore. |
| AC-09 | Use keyboard-only editing and a screen reader for the essential workflow; verify default light/dark themes, a community theme, high DPI, and the proposed performance fixture. |
| AC-10 | Run supported and unsupported MIDI fixtures; reject unsupported timing/format explicitly, disclose event loss before note-only import, preserve original bytes, and export supported notes without drift beyond documented rounding. |

Release requires recorded results for all criteria on the cross-platform matrix, not just unit-test success. Milestone 0 proposes these tests; none has been run against a plugin.
