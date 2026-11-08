# Known issues — MNEMOTOAD 0.2.0

Unresolved, nonblocking issues recorded at release. None affects saved data, MIDI output or recovery.

| Area | Issue |
| --- | --- |
| Platform testing | Windows and macOS have not been independently validated. 0.2.0 was validated on Linux with Obsidian 1.15.0. |
| Accessibility | Dedicated screen-reader testing has not been done. Keyboard access and visible focus have been tested. |
| MIDI interoperability | REAPER 7.84 on Linux is the only independently tested DAW. |
| MIDI track naming | Exported arrangement track names include internal lane identifiers (UUIDs) before the lane name. |
| Theme behaviour | The **Create** buttons in the MOTIF and arrangement MIDI export dialogs use Obsidian’s accent colour instead of the MNEMOTOAD violet. |
| Upgrade tab titles | After upgrading from MNEMOBARD 0.1.0, tabs Obsidian has not loaded yet keep the old “MNEMOBARD · …” title until opened once. |
| Plugin guidelines | Three code paths use Obsidian’s global `app` object instead of the plugin instance, and the settings About panel uses an `<h2>` heading where `setHeading()` is recommended. These are Obsidian guideline recommendations, not functional defects. |
| Intermittent tests (development only) | Two in-Obsidian regression suites (CANVAS 4E’s file-rename step and MOTIF’s first pointer drag after a cold start) occasionally time out when run back to back. Both pass when run independently on the release-candidate and final builds. |
