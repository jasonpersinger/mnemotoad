# Data model proposal

Milestone 1A status: schema-1 entity contracts and Markdown/YAML/owned-JSON persistence are implemented under Prompt 002. Musical processing/export semantics below remain specifications for later work. See [DEVELOPMENT.md](DEVELOPMENT.md) for supported input limits, unknown-field preservation, full-source conflicts and manual recovery. No MIDI/editor implementation exists.

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
| `mnemobard_kind` | `patch`, `motif`, or `composition`. |
| `mnemobard_schema` | Positive integer; proposed current value 1. |
| `title` | Nonempty human-facing title; not an ID. |
| `tags` | Ordinary Obsidian string list; user-defined tags supported. |

Owned JSON uses `schemaVersion: 1`, matching `mnemobard_schema`. A mismatch, duplicate owned blocks, invalid JSON/YAML, or duplicate ID blocks editing and produces a diagnostic; no block is chosen arbitrarily. Unknown user frontmatter and prose remain unchanged semantically. Preserve unknown JSON fields on a supported schema; reject unsupported semantics rather than dropping fields. Serialization may format the owned block; it must not reformat unrelated text. Frontmatter APIs may normalize YAML formatting, so preserve values and prose and retain an exact-byte backup.

Source fingerprints are computed from file contents, not persisted as self-referential entity fields. A session holds base text/fingerprint and a transient edit generation. A file timestamp alone is insufficient conflict detection. Content changes from sync or another window are competing edits.

## Patch schema and example

Required: envelope and instrument text. Optional preset name, manufacturer, native vault attachment links, parameter list, effects chain, and unrestricted musical notes. Parameters are descriptive values with optional units and labels; their values never execute automation or instrument commands. Effects are ordered text entries. Instrument identity is a simple value in MVP; a separately versioned instrument catalog can be added later if user research requires it.

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

The persisted schema version is separate from plugin package version. Schema 1 is only a proposal. Validation has read-only diagnostics; it does not migrate on open. Each later migration defines input/output versions, pure transform, preserved unknown fields, fixtures, and a reviewable preview. Explicit approval is required before migration writes.

Before each replacement, write a uniquely named exact-text backup in Recovery. Before migration, also record source/target versions and progress. Use expected-content checks on the authoritative note; if it changed, stop and preserve both candidates. Migrations are idempotent per entity and resumable after interruption; no multi-file all-or-nothing claim. A failed migration does not make the old version unreadable. Unknown future schema is read-only; never downgrade automatically.

Recovery opens a selected backup/draft in a new path, validates it, and lets the user compare. Restoring a note with the same UUID intentionally creates a temporary duplicate; keep the recovery candidate outside the active entity index until replacement is explicitly authorized. Do not delete originals or backups automatically. Warn about recovery storage growth in settings and provide manual inspection; retention policy requires a later decision. No database or cache is a substitute for vault backups.

## Milestone 1B timing boundary

No persisted schema or source entity interface changed. The isolated experiment represents intermediate quarter positions as reduced BigInt fractions, preserving an original integer tick/PPQ pair exactly. Fractions are transient and are not JSON values written into entity blocks. Playback converts exact integrated microseconds to floating seconds at the Web Audio boundary. Its approximate seconds-to-ticks convenience API returns fractional ticks; exact inversion uses rational microseconds.

At a 1000→960 conversion, source tick 1 becomes exactly 24/25 destination ticks. The experiment's default integer projection rejects that value; explicit nearest rounding returns 1 with error +1/25 tick. This demonstrates where the previously proposed endpoint policy needs warnings and post-quantization bounds/overlap checks. It does not silently adopt a different persisted resolution, implement the proposed minimum-one-tick repair, or approve tempo-map storage. Repetition offsets remain exact until the final export projection, avoiding cumulative per-repeat rounding. Meter labeling is separate from elapsed-time conversion.

SMPTE divisions are recognized by division bit 15, including frame codes -24/-25/-29/-30 with a nonzero ticks/frame byte, then rejected before conversion with instructions to provide PPQ MIDI. -29 denotes drop-frame timing; it is not approximated as 29 integer frames/sec. Invalid frame codes/zero ticks/frame are malformed. Production MIDI import still requires bounded structural validation and an explicit policy for Type2, controllers, SysEx, meter/tempo changes and malformed files. See [1B report](MILESTONE_1B_REPORT.md).
