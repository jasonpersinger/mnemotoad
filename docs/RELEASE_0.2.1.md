# MNEMOTOAD 0.2.1

*Remember what you’ve yet to compose.* Released by Jason Persinger under the MIT License. Requires Obsidian 1.15.0 or later (desktop); validated on Linux.

## Fixed

- **Audition is now audible.** In 0.2.0, MOTIF and CANVAS playback ran (the transport advanced and stopped normally), but every note played at about −50 dBFS. On ordinary speakers that is effectively silent. Notes now play at a clearly audible level: about −17.6 dBFS for a velocity-96 note, and louder with velocity. All notes pass through one shared limiter, so dense chords and arrangements cannot clip.
  - Measured in Obsidian: MOTIF peaks went from −45.9 dBFS to −9.7 dBFS; a CANVAS arrangement peaked at −14.2 dBFS.
  - The owner confirmed the playback by ear.

## Unchanged

MIDI export, timing, compilation, source review, saving and recovery are unchanged. The only source change is the audition voice (`src/music/audio.ts`). Golden MIDI fixtures are byte-identical. Records, settings and checkpoints from 0.2.0 or 0.1.0 load as before; the plugin ID is still `mnemobard`.

## Upgrading

Replace `main.js`, `manifest.json` and `styles.css` in `<vault>/.obsidian/plugins/mnemobard/` and restart Obsidian.

## Known issues

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md). Windows, macOS and screen-reader use have not been validated.
