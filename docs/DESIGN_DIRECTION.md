# Design direction

Status: exploratory interaction concepts. No final palette, typography, icons, ornamental treatment, or visual styling is approved. No UI has been implemented. Functional boundaries are in [PRODUCT_SPEC.md](PRODUCT_SPEC.md).

## Identity and legibility

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
