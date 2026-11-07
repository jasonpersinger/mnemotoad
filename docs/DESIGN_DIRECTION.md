# Design direction

Status: final palette, typography, icons/artwork and ornamental treatment remain unapproved. Prompt006's functional MOTIF interface is implemented with culled Canvas and host controls/themes; PATCHBOOK was not redesigned. The3A/3B review sections distinguish actual screenshots from remaining exploratory concepts. Functional scope is in [PRODUCT_SPEC.md](PRODUCT_SPEC.md).

## Identity and legibility

2A implementation uses three named registers, numbered rows, a browser/detail divider, quiet small labels, native form controls and an ordered Signal path list. Dense metadata remains legible in default light/dark themes and a narrow desktop pane; no texture, remote font, animation or custom icon system was added. Provisional screenshots are in ignored `output/patchbook/native-dark.png`, `native-light.png` and `native-narrow.png`. Human review may refine density, labels and hierarchy before final visual identity. This implementation does not approve a decorative font, palette or final brand mark.

The intended character is mysterious, experimental, esoteric, and slightly antiquated. Express that through quiet terminology, restrained engraved or manuscript-like accents, and optional diagrams around musical context. Keep pitch, time, velocity, error messages, and transport controls direct and familiar. A musician should never need to decode a metaphor to save a note or stop sound.

Use the system/Obsidian interface font for operational controls. A decorative title treatment, muted ink-like accent, or small sigil could be explored after approval. No forced dark mode, background texture behind note grids, ornate small text, flashing decoration, or remote fonts. Brand atmosphere must survive in the user’s own theme without sacrificing contrast.

## Navigation and workspace

Provide one MNEMOBARD entry command/ribbon action opening a hub, plus commands for Create patch, Open PATCHBOOK, Create motif, Open MOTIF, Create composition, Open CANVAS, and Export MIDI. Use standard Obsidian leaves and split-pane navigation. Entity notes remain accessible through the file explorer, quick switcher, links, and ordinary Markdown editing.

Each module view identifies the active note, save state, and related patch/motif/composition links. Opening a relationship reuses/reveals the relevant entity view or opens its Markdown note; do not take over the workspace. Restore active entity IDs through view state. Keep pop-out editing explicitly unsupported until its ownership and audio behavior are tested.

CANVAS labels should include “Composition planner” in help and view descriptions so users can distinguish it from Obsidian’s native Canvas. Do not intercept existing Canvas commands or `.canvas` files.

## Preliminary layouts

These are information layouts, not styling mockups.

```text
PATCHBOOK
[Search sounds...] [Tags/filter]                  [Create patch]
Patch list               | Instrument / preset
  Dusk glass             | Editable metadata and parameter list
  Reed dust              | Ordered effects; preview; attachments
                         | Linked motifs and compositions; notes
```

```text
MOTIF — Glass answer                    [Dirty / Saving / Saved]
[Play] [Stop] [Loop]  Tempo 120  Meter 4/4  Snap 1/16
Patch: Dusk glass       [Open patch]        [Export MIDI]
Keyboard | Bar ruler ----------------------------------------
and pitch| Scrollable piano roll with notes and selection
labels   | -------------------------------------------------
[Note list] Pitch  Start  Duration  Velocity   [Add] [Delete]
```

```text
CANVAS — Threshold study               [Open source note]
[Play MIDI preview] [Stop] Tempo 100 Meter 4/4 [Export MIDI]
Sections | Threshold -----------| Opening -------------------
Lanes    | Bars 1     2     3     4     5     6     7     8
Glass    | [Glass answer x4-------------------------------]
Reed     |             [Reed phrase x2---------------------]
Notes    | Reference: station.wav     Marker: Open texture
Inspector: selected clip / motif / repeats / lane patch
```

Patch preview audio and timeline recording links are clearly labeled. The arrangement preview plays MIDI through the basic synth; it does not promise the sound of the patch or aligned field recording playback.

Narrow views collapse the inspector into a separate tab or drawer with a labeled toggle. Do not shrink note handles below useful targets to preserve a three-column layout. Lists and tables should scroll within the view; editing errors remain visible. Normal Obsidian editor notes can stay in an adjacent pane.

## Interaction architecture

Use DOM controls for forms, menus, inspectors, note/clip lists, status, and errors. Use Canvas 2D for the dense piano roll and arrangement grid; small SVG is appropriate for icons or sparse overlays. Share musical-coordinate math across draw/hit-test/snap while keeping module-specific gestures separate. See [ARCHITECTURE.md](ARCHITECTURE.md).

An initial gesture vocabulary: draw note, click/select, additive selection, marquee, drag move, edge resize, scroll, anchored zoom, and Escape to cancel. Numeric fields provide exact alternate entry. Internal motif drag-and-drop duplicates the Add motif picker’s command. One completed gesture is one undo entry. Preview drag state does not trigger disk writes. A changed source motif visibly updates live composition references; length changes show their consequences before commit.

Expose command-palette actions without default global shortcuts, consistent with [Obsidian plugin guidelines](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Releasing/Plugin%20guidelines.md). Local editing keys apply only inside a focused editor, never while typing in text inputs or another note. Space may toggle focused transport; Escape cancels a gesture or stops owned preview. Platform modifiers and user hotkeys take priority.

## Accessibility and status

- Provide a keyboard-operable note list and clip list using the same domain commands as pointer editing; fields announce pitch number/name, musical position, duration, velocity, and selection.
- Use visible focus and labeled controls; no hover-only actions. Selection, errors, muted context, and missing assets have text/shape cues as well as color.
- Respect reduced motion and user font scaling. Keep optional decorative motion off by default; transport movement communicates timing, with a textual position alternative.
- Offer high-contrast note boundaries and ruler labels. Test normal text at WCAG AA contrast targets, large text/controls appropriately, high DPI, and both themes. Treat these as future validation goals, not present compliance claims.
- Announce save completion/conflict and selection changes at a controlled rate; avoid live-region announcements every animation frame. Read-only/future-schema modes explain the issue and offer Open source / Export recoverable draft where meaningful.
- Error actions should be specific: Retry save, Compare revisions, Save draft copy, Relink attachment, or Cancel import. Show Saved only after confirmed persistence.

## Theme compatibility

Scope every CSS rule under a MNEMOBARD root class. Use Obsidian background, text, interactive, accent, border, focus, and spacing tokens; avoid modifying app-wide CSS or built-in note layouts. Read resolved colors for canvas at render time and refresh on supported appearance events or a scoped appearance observer. Test actual theme toggles rather than assuming CSS variables recolor existing pixels. [Official styling reference](https://docs.obsidian.md/Reference/CSS%20variables/About%20styling).

Use device-pixel ratio for backing resolution, retain CSS-sized geometry for pointer mapping, and invalidate cached grid drawing on resize/zoom/theme changes. Share no theme-specific assets across machines. Rendering performance and screen-reader usability both need feasibility tests; neither is supplied by Canvas automatically.

## Decisions requiring design review

Approve the interaction hierarchy and hub-versus-direct-view navigation first. Then compare two or three static style directions using approved local assets: restrained manuscript, laboratory ledger, or minimal instrument panel. Evaluate a dense piano roll, a conflict dialog, and PATCHBOOK in light/dark themes before selecting a style. No asset generation or frontend implementation is part of this milestone.


## Milestone2B provisional review

The existing archival register now includes plain asset rows, inline vault selection/import confirmation, a compact audition control and a recovery register with comparison sections. Controls use host variables/fonts and visible focus; no brand assets or typography were finalized. Nine actual light/dark/narrow application captures live under `output/patchbook/milestone-2b/`; see the2B report. Screen-reader/community-theme certification remains open.

## Milestone3A MOTIF review

Actual editor screenshots: [3A review directory](../output/motif/milestone-3a/) and [report image index](MILESTONE_3A_REPORT.md#g-interface-and-design). The implemented layout combines a restrained register header/status, explicit transport, collapsible musical settings, compact editing controls, pitch/time Canvas and accessible note register. Host fonts/theme variables remain authoritative; no new imagery or final palette was selected.

Bars/beat subdivisions carry different contrast; pitch rows alternate subtly; notes remain legible with velocity shading. Selection adds a strong border/marker and textual count. The playhead is distinct without animation unrelated to playback. Light/dark and425px pane were exercised; high-DPI backing was emulated. Numeric controls and a bounded note list provide an alternative to pointer gestures. Screen-reader/community-theme/popout certification remains open.

Proposals for later shared visual review: retain consistent register labels, explicit Saved/Unsaved/Conflict terminology and grouped transport/edit controls; evaluate density with musicians before applying these patterns to PATCHBOOK. PATCHBOOK was not redesigned in3A. No recommendation here approves final typography, icons, artwork or broad styling changes.

## Milestone3B targeted review

Actual [3B screenshots](../output/motif/milestone-3b/) add native import-preview/fidelity and export-snapshot/destination dialogs, Transform notes and Selection actions disclosures, searchable PATCHBOOK context and exact musical-position entry. The note list is collapsible; C-octave labels are clearer. Controls stay theme-native with visible focus and text diagnostics. No PATCHBOOK redesign, new fonts/artwork or final brand system was introduced.

Dark/light/narrow and keyboard position entry were tested in the disposable Linux host. Review the warning hierarchy and selected-part wording with musicians; the5k latency and dense numeric inspector still warrant usability work. Screen-reader/popout/community-theme certification remains open. Broader redesign and final identity remain proposals requiring review.

## Milestone 4A CANVAS direction

Prompt008 approves a dark-first CANVAS workspace, scoped to this module. Its archival heading, large lane/time surface, fixed lane gutter, violet host accent and spare controls make the timeline primary. Lane management, score settings, clip register and diagnostics are collapsible; selected-clip controls sit below the timeline. Bar/beat lines follow the composition meter, repetition separators follow full source length, and selected/error clips add outlines and textual markers instead of color alone.

All colors use active Obsidian variables; no global dark theme or custom fonts/artwork were introduced. Default dark/light and620px desktop layouts were inspected in the actual host. Native keyboard nudge/undo and numerical alternatives were exercised. A narrow pane exposes less musical time, so scrolling/zoom are necessary; clip labels may be abbreviated. The paged clip list is the textual alternative, not a screen-reader certification.

Review actual captures in [output/canvas/milestone-4a/](../output/canvas/milestone-4a/). Stronger shared instrument/archival styling, final typography/icons and cross-module visual unification remain proposals for later human review. PATCHBOOK/MOTIF styling is preserved.

## Milestone 4D CANVAS hierarchy

Primary: identity, essential transport, the timeline with section/marker ruler (sticky on tall panes). Context: one bounded inspector directly beneath the timeline, uppercase muted context label, accent left rule, facts as a definition grid — never more than one large editor visible. Secondary: collapsed disclosures (structure lists, lane management, seek/export, routing, compilation diagnostics, clip list, prose) in muted text. Diagnostics use severity rules (error/warning colours from the theme), musical names and positions first, UUIDs only in tooltips. No new colours, gradients or animation; dark and light themes verified.

## Milestone 4E freshness presentation

A quiet one-line indicator beside the save status (muted when current, accent when refreshed/checking, warning colour for conflicts or unavailable notes). A bounded banner appears only when something needs attention, with the explanation first, the safe choices before the destructive one, and the destructive one behind an explicit confirmation that states what is kept. Titles and musical areas (sections, clips and lanes, routing…) are used instead of UUIDs; the note path is reachable via *Open composition Markdown*. Host theme tokens only; verified in dark, light, narrow and high-DPI.
