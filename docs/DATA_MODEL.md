# Data model proposal

Milestone3B status: schema1 motifs now support selected-part MIDI interchange, optional provenance, existing UUID patch relationships and exact bar/beat/tick UI conversion. Library/asset/Markdown contracts remain intact; no migration or tick normalization occurred. See the3B section and [MILESTONE_3B_REPORT.md](MILESTONE_3B_REPORT.md). Maps and arrangement contracts remain future work.

## Storage and authority

One entity is one ordinary Markdown note. YAML identifies the entity and provides searchable properties. Patch detail lives in YAML and prose; motif/composition detail lives in exactly one owned JSON code block. Standard MIDI is imported from an untouched source or exported to a new file; it is never a second editable authority.

| Content | Authoritative location | Derived or optional material |
| --- | --- | --- |
| Identity, kind, tags, display title | Entity frontmatter | In-memory ID/path index |
| Patch metadata and effect/parameter descriptions | Patch frontmatter and user prose | Search results |
| Motif patch association | Motif frontmatter ID | Native link alongside the ID |
| Motif notes, tempo, meter, length | Motif JSON block | Piano roll; explicit `.mid` export |
| Composition lanes, motif references, markers, sections | Composition JSON block | Timeline; explicit arrangement `.mid` export |
| Image/audio/preset assets | Original vault attachment | Resource URI; later optional peak caches |
| Relationship graph | Forward IDs in the owning entity | Native link summaries and reverse-reference index |
| Plugin preferences | Plugin `loadData`/`saveData` settings | No musical source data here |

Suggested creation folders, configurable later:

```text
MNEMOBARD/Patches/<descriptive-name>-<short-id>.md
MNEMOBARD/Motifs/<descriptive-name>-<short-id>.md
MNEMOBARD/Compositions/<descriptive-name>-<short-id>.md
MNEMOBARD/Assets/<user-selected-attachment>
MNEMOBARD/Exports/<name>-<unique-export-id>.mid
MNEMOBARD/Recovery/<entity-id>/<unique-recovery-id>.json
```

Folder and filename are not identity. Existing records can live elsewhere in the vault. Exports and recovery copies always use collision-free new paths. No original import, audio, or preset is overwritten. Recovery JSON contains the entity ID, original path, schema, timestamp, content fingerprint, and exact original text or unsaved draft as a JSON string; it is not indexed as an entity note. No automatic pruning in MVP.

## Common envelope and validation

| Field | Rule |
| --- | --- |
| `mnemobard_id` | UUID generated once on creation; independent of path/title; unique across entity notes. |
| `mnemobard_kind` | `patch`, `motif`, `composition`;2A adds `instrument` and `effects-chain`. |
| `mnemobard_schema` | Positive integer; proposed current value 1. |
| `title` | Nonempty human-facing title; not an ID. |
| `tags` | Ordinary Obsidian string list; user-defined tags supported. |

Owned JSON uses `schemaVersion: 1`, matching `mnemobard_schema`. A mismatch, duplicate owned blocks, invalid JSON/YAML, or duplicate ID blocks editing and produces a diagnostic; no block is chosen arbitrarily. Unknown user frontmatter and prose remain unchanged semantically. Preserve unknown JSON fields on a supported schema; reject unsupported semantics rather than dropping fields. Serialization may format the owned block; it must not reformat unrelated text. Frontmatter APIs may normalize YAML formatting, so preserve values and prose and retain an exact-byte backup.

Source fingerprints are computed from file contents, not persisted as self-referential entity fields. A session holds base text/fingerprint and a transient edit generation. A file timestamp alone is insufficient conflict detection. Content changes from sync or another window are competing edits.

## Patch schema and example

Original schema1 requires the envelope and instrument text, with optional preset, manufacturer, asset links, parameters and ordered effect descriptions. Prompt004 supersedes the earlier text-only instrument proposal:2A adds standalone instruments/chains and optional authoritative IDs while retaining existing text/effects arrays without migration. Parameters remain descriptive and never execute instrument commands. See the implemented extension below.

```markdown
---
mnemobard_id: 11111111-1111-4111-8111-111111111111
mnemobard_kind: patch
mnemobard_schema: 1
title: Dusk glass
instrument: Example synthesizer
manufacturer: Example maker
preset: User bank / Dusk glass
tags: [mnemobard/patch, glass, slow-attack]
mnemobard_images: ["[[MNEMOBARD/Assets/dusk-panel.png]]"]
mnemobard_audio: ["[[MNEMOBARD/Assets/dusk-preview.wav]]"]
mnemobard_presets: ["[[MNEMOBARD/Assets/dusk.preset]]"]
parameters:
  - name: Filter cutoff
    value: 1200
    unit: Hz
  - name: Attack
    value: 400
    unit: ms
effects:
  - "Chorus: low depth"
  - "Delay: dotted eighth"
---
# Dusk glass

Use a sparse upper-register phrase and leave room for the delay.
Preview: ![[MNEMOBARD/Assets/dusk-preview.wav]]
```

Nested parameter/effect data is valid YAML but should be edited through PATCHBOOK or text; the native Properties UI does not provide a full structured parameter editor. A minimal patch can omit these arrays. Changes must retain unknown manufacturer-specific fields.

## Motif schema and example

New authored motifs default to **960 ticks per quarter note**; imported motifs retain their explicit source PPQ (1–32767). Ticks always count quarter-note divisions, independent of time-signature denominator. Compositions use 960 PPQ and convert motif endpoints as specified below. Internal channel indices are 0–15. A motif represents one musical part and exports as one chosen channel, so individual notes do not own channels in v1. Import selects a track/channel rather than flattening an arbitrary multichannel file silently. The importer records an optional `importSourceChannel` (0–15) in its owned block for provenance/default motif-export channel; composition lane channel overrides it explicitly.

Required JSON fields: `schemaVersion`, `ppq`, `tempoMicrosecondsPerQuarter`, `meter`, `lengthTicks`, and `notes`. Tempo uses positive integer microseconds/quarter; a user-entered BPM is converted once using `round(60000000 / BPM)`. Proposed UI range 20–300 BPM. The `notes` array contains unique document-local IDs, integer pitch 0–127, integer `startTick >= 0`, integer `durationTicks >= 1`, and integer velocity 1–127. Start plus duration must fit explicit motif length. Velocity zero is a MIDI note-off encoding, not a sounding note.

````markdown
---
mnemobard_id: 22222222-2222-4222-8222-222222222222
mnemobard_kind: motif
mnemobard_schema: 1
title: Glass answer
tags: [mnemobard/motif, tentative]
mnemobard_patch_id: 11111111-1111-4111-8111-111111111111
mnemobard_patch: "[[MNEMOBARD/Patches/dusk-glass]]"
---
# Glass answer

Let the last interval hang.

```mnemobard-motif
{
  "schemaVersion": 1,
  "ppq": 960,
  "tempoMicrosecondsPerQuarter": 500000,
  "meter": { "numerator": 4, "denominator": 4 },
  "lengthTicks": 7680,
  "notes": [
    { "id": "n1", "pitch": 60, "startTick": 0, "durationTicks": 960, "velocity": 88 },
    { "id": "n2", "pitch": 67, "startTick": 1920, "durationTicks": 1920, "velocity": 76 }
  ]
}
```
````

This example is two bars of 4/4 at 120 BPM. The explicit end preserves silence and defines the repeat period. Motif patch ID is authoritative; its native link is a navigational companion. If a user changes the link to a different patch while retaining the old ID, show the disagreement and require an explicit association choice. A motif may have no patch.

### Timing and transformation rules

- Seconds at fixed tempo: `tick / ppq * tempoMicrosecondsPerQuarter / 1000000`. A bar has `ppq * 4 * numerator / denominator` ticks. Proposed editable meters: numerators 1–32, denominators 1, 2, 4, 8, 16, 32; meter changes deferred. BPM always counts quarter notes, including compound meter.
- Import retains source PPQ, ticks and durations exactly. Standalone motif export uses that PPQ and defaults to `importSourceChannel` when present (otherwise channel 0). Composition conversion occurs only when compiling/exporting: convert each absolute repeated start/end endpoint independently using `round(absoluteMotifTick * compositionPPQ / motif.ppq)` before adding the clip’s composition start. Derive duration from end minus start. A positive source note that collapses below one destination tick becomes one tick with a warning; this minimum-duration adjustment can exceed the ordinary half-tick endpoint bound and must be reported. Rounding may create overlaps/bounds violations, which preflight rejects rather than silently repairing. Compute repetitions in the source timebase before conversion to avoid cumulative per-repeat drift; there is no claim of exact conversion for all PPQs.
- Import length is the selected track’s end-of-track tick, retaining its trailing silence even when filtering to one channel. Reject empty/no-note selections and invalid notes beyond the declared end; do not guess phrase endings or crop to the last note. Unsupported tempo/meter ranges are diagnosed before creation.
- Quantize starts to the chosen grid; preserve durations; resolve ties toward the later grid point; extend motif length explicitly if needed. Imports are never automatically quantized. A note edit extending the end offers to extend length rather than silently truncate.
- Transpose by integer semitones. Reject the entire operation if any pitch leaves 0–127. Later inversion around integer pitch `p` uses `2*p - pitch`; later reversal uses `lengthTicks - (startTick + durationTicks)`; later rhythmic scaling must define rounding and collisions before adoption.
- Group moves preserve relative time/pitch intervals. Reject a move that would put any selected note outside pitch/time bounds rather than independently clamping notes; offer explicit phrase extension for an end-bound violation. Commit one undo step only after the complete candidate validates.
- Overlapping different pitches are supported. Overlapping same-pitch notes in the same motif are rejected in MVP to avoid ambiguous MIDI note-off and audition behavior. Adjacent notes may share a boundary; note-off precedes note-on at that tick.
- Import pairing handles note-on velocity zero as note-off. Unmatched notes, unmatched ends, or overlapping same-channel/same-pitch note-ons produce explicit diagnostics; ambiguous imports are rejected. Do not invent note endings silently.
- Use finite safe integers and size limits before expansion. Proposed defaults: 10 MiB MIDI input, 100,000 parsed events, 10,000 motif notes. Reject oversized input with a reason. Enforce parsing/event limits before allowing unbounded allocations; if the candidate library cannot support this safely, use a worker with timeout/termination and reassess before adoption.

## Composition schema and example

Required: envelope, matching block version, composition PPQ 960, fixed tempo/meter, explicit length, ordered lanes. Lane IDs, clip IDs, section IDs, and marker IDs are unique within the composition. Lane owns optional patch ID, an explicit MIDI channel, and optional `percussion` (default false); `percussion: true` requires channel index 9, and index 9 requires that explicit flag. Clip owns motif ID, start, and positive integer repeat count. No saved pixel positions determine music.

````markdown
---
mnemobard_id: 33333333-3333-4333-8333-333333333333
mnemobard_kind: composition
mnemobard_schema: 1
title: Threshold study
tags: [mnemobard/composition]
mnemobard_audio: ["[[MNEMOBARD/Assets/station.wav]]"]
---
# Threshold study

The recording is a reference for atmosphere, not synchronized playback.

```mnemobard-composition
{
  "schemaVersion": 1,
  "ppq": 960,
  "tempoMicrosecondsPerQuarter": 600000,
  "meter": { "numerator": 4, "denominator": 4 },
  "lengthTicks": 30720,
  "lanes": [
    {
      "id": "lane1",
      "name": "Glass",
      "patchId": "11111111-1111-4111-8111-111111111111",
      "midiChannel": 0,
      "clips": [
        {
          "id": "clip1",
          "motifId": "22222222-2222-4222-8222-222222222222",
          "startTick": 0,
          "repeatCount": 4
        }
      ]
    }
  ],
  "markers": [{ "id": "marker1", "tick": 15360, "label": "Open the texture" }],
  "sections": [{ "id": "section1", "startTick": 0, "endTick": 30720, "label": "Threshold" }],
  "audioRefs": [
    { "id": "audio1", "path": "MNEMOBARD/Assets/station.wav", "atTick": 0, "label": "Platform ambience" }
  ]
}
```

Related motif: [[MNEMOBARD/Motifs/glass-answer]]
Lane sound: [[MNEMOBARD/Patches/dusk-glass]]
````

This example repeats the two-bar motif four times across an eight-bar composition at 100 BPM. Motif tempo/meter controls standalone preview; composition tempo/meter overrides it when arranged. Tick counts are converted between explicit PPQs so musical quarter-note positions remain consistent; differing motif meter changes bar labels. No musical time stretching occurs. Lane patch overrides motif patch for contextual display only; neither maps a proprietary preset to a MIDI program.

For equal PPQ, repeated event start is `clip.startTick + repetitionIndex * motif.lengthTicks + note.startTick`, with `repetitionIndex` from zero through `repeatCount - 1`. For unequal PPQ, convert the source offset/end using the endpoint rule above. Clip end is `startTick + round(repeatCount * motif.lengthTicks * compositionPPQ / motif.ppq)`. It must fit composition length; extending length is an explicit editor command. Expansion is capped at 100,000 sounding notes. Sections use half-open ranges `[startTick,endTick)`; marker ticks may include the final end boundary. No clipping of notes at export.

### Live references and export snapshot

Instances are live references to motif IDs. Editing a motif updates every referencing composition, including repeat spacing if motif length changes. Show affected compositions before committing a length change; require acknowledgement and flag compositions whose saved bounds become invalid. Display a change summary when reopening an affected composition. Do not silently resize a different composition file. Pinned historical motif snapshots are deferred; the live-reference choice requires approval.

At export, capture and validate all referenced records and detect changes during capture. Freeze that in-memory set for compiler/serializer use. An export report records source IDs/fingerprints, note counts, channel mapping, warnings, and source versions. Its creation follows MIDI creation and may be retried if it fails; a report failure does not destroy a valid MIDI. Exports never rewrite their source notes.

### MIDI export semantics

- Type 1 output: conductor track for tempo, time signature, markers/section labels; one musical track per lane at composition PPQ. A motif export uses a conductor plus one musical track at its original PPQ. All tracks end explicitly at the entity length; preserve trailing silence using end-of-track delta times.
- Channels are zero-based internally; UI displays 1–16. Default allocation uses unique pitched channels avoiding index 9 (channel 10). Index 9 requires explicit percussion designation. MVP allows one lane per channel and up to 16 lanes, with at most 15 pitched lanes. No automatic program changes; future GM selection is independent from PATCHBOOK presets.
- Stable event ordering: absolute tick, note-off before note-on, then deterministic pitch/ID order; conductor metadata precedes musical events at tick zero. Convert absolute ticks to nonnegative track-local deltas only at serialization.
- If expanded notes overlap on the same lane/channel/pitch, fail preflight with clip/note IDs. Do not silently merge or truncate. Repetition boundaries release preceding notes before retriggering.
- Exclude audio references, preview recordings, parameter text, and proprietary patch files. Explain exclusions in the export UI. Section markers carry labels, not sound automation. No fade/controller export in v1.
- Validate bytes by an independent reader and a DAW; parsing our own output with the same codec alone is insufficient interoperability evidence.

## Asset references and native links

MVP assets are vault files. Top-level frontmatter link lists provide native attachment navigation and metadata indexing. Audio/image URIs are generated at runtime with `Vault.getResourcePath`; never store app-specific URLs or absolute `/home/...` paths. Opaque presets are linked/opened only on user request; their contents are not executed or parsed. External filesystem references are outside the MVP and require a later privacy/portability decision.

Composition `audioRefs.path` is a vault-relative asset path with a timeline marker, not a synchronized clip. It should correspond to an entry in the entity’s `mnemobard_audio` link list. These duplicate path hints can diverge: listen for rename events and conditionally update known owned references; on startup reconcile only exact, unambiguous known mappings. If a rename occurred while disabled and identity cannot be established, show Relink rather than matching by basename. Asset UUID/content-addressed catalog is deferred unless this limitation proves unacceptable. Asset content fingerprints can later detect replacement but are not identity guarantees.

Reject absolute paths, `..` traversal, unsupported URI schemes, and unexpected file types before path normalization/resolution; `normalizePath` alone is not a security boundary. Check filename legality/case collisions for Windows/macOS/Linux when creating files. Drag-and-drop may select a valid vault target; it cannot cause arbitrary filesystem traversal or execution. Decode/play on request; an unsupported codec is an actionable preview error, never a reason to modify the source.

## Relationship lifecycle

Entity UUIDs are authoritative references, with kinds checked during resolution. Native wikilinks use Obsidian resolution/generation helpers and source-note context; they enable navigation/backlinks without the plugin. Derived related-note lists can be rebuilt; do not maintain separate authoritative reverse links. JSON references alone do not appear in Obsidian’s graph, so update a narrowly owned link-summary region when the entity changes and preserve surrounding prose. Mark a stale summary instead of rewriting a note blindly after a concurrent edit.

Rename/move preserves UUID; index maps new path. Delete leaves a missing reference with explicit relink/remove-instance choices. Duplicate IDs require explicit user resolution; creating a copy through the plugin generates a new ID, while a filesystem copy retaining the ID becomes ambiguous. No automatic reassignment of references. Unsupported future schema targets block dependent editing/export where their musical meaning is unknown.

## Versioning, migration, backup, and recovery

The persisted schema version is separate from plugin package version. Schema1 contracts are implemented for the supported entity kinds; later musical semantics remain proposals. Validation has read-only diagnostics and does not migrate on open. Each later migration defines input/output versions, pure transform, preserved unknown fields, fixtures and a reviewable preview. Explicit approval is required before migration writes.

Before each replacement, write a uniquely named exact-text backup in Recovery. Before migration, also record source/target versions and progress. Use expected-content checks on the authoritative note; if it changed, stop and preserve both candidates. Migrations are idempotent per entity and resumable after interruption; no multi-file all-or-nothing claim. A failed migration does not make the old version unreadable. Unknown future schema is read-only; never downgrade automatically.

Recovery opens a selected backup/draft in a new path, validates it, and lets the user compare. Restoring a note with the same UUID intentionally creates a temporary duplicate; keep the recovery candidate outside the active entity index until replacement is explicitly authorized. Do not delete originals or backups automatically. Warn about recovery storage growth in settings and provide manual inspection; retention policy requires a later decision. No database or cache is a substitute for vault backups.

## Milestone 1B timing boundary

No persisted schema or source entity interface changed. The isolated experiment represents intermediate quarter positions as reduced BigInt fractions, preserving an original integer tick/PPQ pair exactly. Fractions are transient and are not JSON values written into entity blocks. Playback converts exact integrated microseconds to floating seconds at the Web Audio boundary. Its approximate seconds-to-ticks convenience API returns fractional ticks; exact inversion uses rational microseconds.

At a 1000→960 conversion, source tick 1 becomes exactly 24/25 destination ticks. The experiment's default integer projection rejects that value; explicit nearest rounding returns 1 with error +1/25 tick. This demonstrates where the previously proposed endpoint policy needs warnings and post-quantization bounds/overlap checks. It does not silently adopt a different persisted resolution, implement the proposed minimum-one-tick repair, or approve tempo-map storage. Repetition offsets remain exact until the final export projection, avoiding cumulative per-repeat rounding. Meter labeling is separate from elapsed-time conversion.

SMPTE divisions are recognized by division bit 15, including frame codes -24/-25/-29/-30 with a nonzero ticks/frame byte, then rejected before conversion with instructions to provide PPQ MIDI. -29 denotes drop-frame timing; it is not approximated as 29 integer frames/sec. Invalid frame codes/zero ticks/frame are malformed. Production MIDI import still requires bounded structural validation and an explicit policy for Type2, controllers, SysEx, meter/tempo changes and malformed files. See [1B report](MILESTONE_1B_REPORT.md).

## Milestone 2A library records

Implemented under Prompt004. Library notes use the existing UUID/kind/schema1/title envelope and surgical YAML codec. No musical payload/schema changed. New kinds have version1 contracts; unknown/newer versions remain read-only. No automatic catalog creation, effects conversion or bulk migration. Older builds do not understand the new kinds and must not edit them. Minimal new UI patch: name plus a selected instrument; old text-only patches remain valid.

| Typed field | YAML property | Contract |
| --- | --- | --- |
| description / notes | `mnemobard_description` / `mnemobard_notes` | Optional nonempty text, at most100,000 characters each. General notes are metadata; additional Markdown body content remains user-owned. |
| externalReferences | `mnemobard_external_references` | Up to100 http/https URLs without embedded credentials. No automatic fetch. |
| archived | `mnemobard_archived` | Optional boolean, active by default. Confirmed archive/restore does not move/delete notes or change relationships. |
| tags / assets / extra | Existing tags and `mnemobard_audio/images/presets`; arbitrary other YAML | Existing foundation contracts. New properties are namespaced so a user-owned `description`/`category` remains unrelated metadata. |

### Instrument record

Only name/title is required. Manufacturer/developer, instrument type and platform/format are optional free text, with no hardcoded supported-instrument registry.

```yaml
---
mnemobard_id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
mnemobard_kind: instrument
mnemobard_schema: 1
title: Ink module
manufacturer: Workshop
mnemobard_instrument_type: Software synthesizer
mnemobard_platform: VST3 / desktop
mnemobard_description: A source for granular textures.
tags: [digital, experimental]
---
```

### Effects-chain record

Required: title/envelope and ordered `mnemobard_effects` list (empty allowed, maximum256 stages). Each stage has a stable document-local ID and nonempty processor name; parameter notes and a vault preset wikilink are optional. Array order is signal-path order. Unknown fields on retained stage IDs survive edits. Removing a stage is explicit. No processing or preset loading occurs.

```yaml
---
mnemobard_id: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
mnemobard_kind: effects-chain
mnemobard_schema: 1
title: Atmosphere
mnemobard_effects:
  - id: stage-delay
    name: Tape delay
    parameterNotes: Quarter-note echoes, low feedback.
  - id: stage-eq
    name: Equalizer
    parameterNotes: Low cut at 100 Hz.
    presetLink: "[[Assets/low-cut.preset]]"
---
```

### Patch extension

The original `instrument` text remains a readable fallback. UUIDs are authoritative and case-insensitive. The service derives current fallback text/wikilinks from an explicitly chosen target. Renaming an instrument title changes derived UI labels without rewriting other patch files in the background.

```yaml
mnemobard_instrument_id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
mnemobard_instrument: "[[MNEMOBARD/Instruments/Ink module-aaaaaaaa.md]]"
mnemobard_effects_chain_ids: [bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb]
mnemobard_effects_chains: ["[[MNEMOBARD/Effects Chains/Atmosphere-bbbbbbbb.md]]"]
mnemobard_category: Pad
mnemobard_character: hushed
mnemobard_parameter_notes: Slow attack; leave room for echoes.
```

Chain IDs are unique (maximum100); companion links, when supplied, match their order/count. New/reassigned references must resolve uniquely to active targets of the correct kind. Existing missing/archived references can be retained while editing unrelated metadata and are diagnosed. No target is guessed by name/path and no missing hint is invented. Resolvable companions refresh on explicit patch Save; Obsidian may separately update wikilinks on rename. Stable IDs work either way.

Reverse associated-patch lists are derived from forward UUIDs. Confirmed archive never cascades or rewrites referencing patches. Active/archived/all queries and restore are supported. Physical deletion through Obsidian produces missing-reference diagnostics. Existing legacy effects text and structured parameters remain editable and are not silently converted to reusable chains.

### Preservation and editor-draft recovery

Creation validates its serialized result against the same8Mi-character readable-document limit before writing. Updates retain exact full-source revision checks and pre-save recovery. A changed owned YAML list may be reformatted within that property; surviving unknown stage values and unrelated YAML/prose are preserved. Exact pre-save recovery retains original bytes, including comments inside a changed structured field.

`EntityRepository.saveEditorDraft` appends JSON under the existing Recovery/<UUID> folder: format `mnemobard-editor-draft`, schemaVersion1, entity ID, optional original path/source, timestamp, raw draft, candidateSource when valid, and validationError when invalid. Blank names or invalid references are therefore recoverable without creating invalid authoritative notes. Checkpoints never replace entity files, are not indexed as notes and do not create multi-file transactions. Sessions retain edits arriving while an earlier version saves.

Recovery JSON is manually inspectable; automatic rehydration/history/pruning is not implemented. Drafts remain in memory across view/module closure while the plugin is enabled. Full plugin/application restart relies on Saved notes or confirmed recovery files, not workspace state. Last unacknowledged edits before a checkpoint are not guaranteed durable. Restore into a new comparison note before explicitly replacing an original.


## Milestone2B assets and explicit recovery

No entity schema change: `assets: {role: audio|image|preset, link: "[[vault/relative/file.ext]]"}[]` still maps to `mnemobard_audio/images/presets`. This applies to instruments, patches and chains. Selected files use portable full vault paths; native metadata resolution also supports existing contextual links. Ephemeral `app://` resources, browser File handles, absolute external paths and playback positions are never written into entity records. Asset categories describe use, not file-extension restrictions.

Removing/replacing an association changes only a pending draft until explicit Save; neither action deletes the attachment. Native FileManager link maintenance follows Obsidian's own settings. Asset identity remains path/link based, unlike entity UUIDs: moves without link maintenance become missing and require explicit selection. Malformed/future entity notes remain read-only and may require original Markdown repair before any form can open.

Preferences add `assetDirectory` to settings schema1 (default `<creationRoot>/Assets`, or `MNEMOBARD/Assets` for fresh settings). Existing unknown preferences remain preserved. Only visible vault-relative folders are allowed; imports confirm the destination each time. A selected external File is read at most100MiB, copied with public createBinary to an unoccupied path (UUID suffix on collision), then associated with the draft. Copy failure/cancellation may leave an unassociated complete/partial file; its path is reported and retained. Source files are read only; no remote URL import, move, overwrite retry or asset cleanup. Submitted host writes cannot be rolled back or reliably cancelled. No distributed/exclusive filesystem transaction guarantee.

Recovery storage formats remain the2A `mnemobard-editor-draft` and foundation `mnemobard-recovery`, both schemaVersion1. Discovery covers JSON files in visible documented `/Recovery/` subfolders, including earlier creation roots,100 per page with32MiB read budget. Individual inspection is limited to20MiB and display to64Ki characters per section; larger originals remain openable. Unknown/future/malformed/duplicate-key envelopes remain inspection-only. Common empty draft name/instrument/stage fields can load for correction; other invalid structures remain text-only. No musical checkpoint is edited by PATCHBOOK.

Recovery loading never rewrites source/checkpoint. For unchanged source, the loaded session captures that exact base; renamed notes resolve by UUID. Missing/duplicate/unreadable sources block restoration. A changed source is displayed alongside original/draft; only an explicit acknowledgment adopts that reviewed current text as the new save base, verified again before loading. The user then reviews and saves normally, including original-text backup and stale-write checks. No merge, automatic reopen, duplicate-ID comparison note, pruning or deletion. Source/backup history grows indefinitely; manual vault backup/management remains the user's responsibility. Very recent unacknowledged edits before a checkpoint are not crash-durable.

## Milestone3A production motifs

The schema1 example above is now the production MOTIF authority; import/export and composition examples remain future contracts. `description?` and `notes?` are compatible optional motif fields mapped to `mnemobard_description` and `mnemobard_notes` in YAML. Existing tags, patch IDs/links, custom YAML, musical/note extension fields and unrelated prose are preserved. Editor-generated local note IDs are fresh UUIDs; existing valid IDs are retained. No file rename changes entity identity.

New motifs:120BPM (500000µs/quarter),4/4,960PPQ,15360 ticks. PPQ1–32767 stays source-specific. Integer source ticks are authoritative; BigInt fractions are transient compiler values only and never JSON serialized. BPM changes convert once to integerµs and affect playback seconds; meter changes reinterpret bars without moving notes or changing length. Only empty motifs permit PPQ changes; length reductions reject out-of-range notes.

Editing uses quarter/eighth/sixteenth/eighth-triplet grids or off; unsupported fractional source-tick grids are rejected with guidance. Changing grid never quantizes existing notes. Numeric Apply uses exact source integers. Notes must fit explicit length; extending it is an explicit musical-setting edit. Different-pitch overlaps/chords are supported; same-pitch overlaps remain rejected.3A bounds are10000 notes,4096 quarter notes, pitch0–127, velocity1–127, meter numerator1–32 and denominator1/2/4/8/16/32, tempo20–300BPM. Larger/unsupported source records remain available for inspection.

Recognized `tempoMap`, `tempos`, `tempoChanges`, `meterChanges`, `timeSignatures`, `mnemobard_tempo_map` and `mnemobard_meter_map` metadata prevents editing/audition in3A; it is never silently removed. Unknown future schemas remain read-only. A future map/codec design must define additional semantics before changing these policies.

Musical checkpoints reuse existing append-only formats and conditional repository saving. A MOTIF-only validator/entry point loads reviewed recovery into an unsaved session; explicit Save is still required. Undo/selection/viewport/history are not authoritative musical data or persistent recovery history. See the [3A report](MILESTONE_3A_REPORT.md#f-persistence-and-recovery) for dirty/save/conflict/session behavior and limits.

## Milestone3B MIDI provenance and musical positions

Schema1 remains authoritative with no migration. Import preserves source PPQ, integer note starts/durations/attack velocities and selected-track end silence; `importSourceChannel` retains the chosen channel0–15. New imports receive fresh motif/note UUIDs. Optional `data.midiImport` is a portable extension object with bounded basename, format, zero-based track/channel and explicitly acknowledged issue codes:

```json
{ "filename": "study.mid", "format": 1, "track": 1, "channel": 3, "acknowledgedIssues": ["program-change"] }
```

No absolute source path, original binary copy, proprietary preset or external runtime dependency is authoritative. The original file remains unchanged; the extension is provenance, not a full retained MIDI event stream. Existing unknown fields/prose survive Save.

`patchId` remains the authoritative PATCHBOOK UUID; `patchLink` is a companion wikilink. New associations require an active unique patch. Existing missing/archived/ambiguous references remain stored during musical edits. Explicit reassociation/removal uses history; Save refreshes a uniquely active target's current path. No patch entity is copied or modified.

The UI convention is one-based `bar:beat:tick-offset`; a beat is the written denominator, not always a quarter.6/8 at960PPQ: beat480 ticks, bar2880, position2:1:0→2880. Exact fractional offsets are accepted where the total is an integer source tick (PPQ3/6-8:1:2:1/2→2). Unrepresentable positions are rejected, never rounded. Storage remains unchanged; numeric Apply/transformations are ordinary session edits.

3B MIDI policy: Types0/1 PPQ only, constant representable tempo/meter, one explicitly chosen track/channel. Timing maps, same-pitch ambiguity, stateful/unknown events and nonstandard notated beat scaling are blocked. Known annotation/instrument/release-velocity/click omissions require acknowledgment. Type1 export retains source resolution and exact endpoints, includes explicit track endings and reports excluded metadata/sound. Bounds and precise policies are in [MILESTONE_3B_REPORT](MILESTONE_3B_REPORT.md#b-midi-import). No arrangement or multi-part stored schema is implemented.
