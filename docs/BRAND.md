# MNEMOTOAD brand and mascot

> **Status (0.2.0):** the colours are canonical. The mascot is **B2 — The Curmudgeon**, approved by the owner (Jason Persinger) from the Grump refinement.

## The five canonical colours

| Name | Hex | Token | Role |
| --- | --- | --- | --- |
| Near Black | `#070707` | `--mnemotoad-black` | Mascot eyes and mouth; the deepest surface (mascot plate in dark themes) |
| Dark Umber | `#28231c` | `--mnemotoad-umber` | Mascot spots; the edge of the mascot plate in dark themes |
| Swamp Green | `#317b22` | `--mnemotoad-green` | Mascot body; selection marker in dark themes; the “ready” chip border |
| Occult Violet | `#801a86` | `--mnemotoad-violet` | Primary actions; header rule; focus and selection in light themes |
| Sulfur Yellow | `#f4e409` | `--mnemotoad-yellow` | Mascot eye highlights; focus ring in dark themes |

These exact values must not be approximated or substituted. No other brand colours are used.

### Implementation

- **One token block** at the top of `styles.css`, scoped to `.mnemobard-module`, MNEMOTOAD’s dialogs (`.modal.mnemobard-wide-modal`) and its settings tab (`.mnemobard-settings`). Obsidian’s global theme variables are never modified; `tests/brand-tokens.test.ts` enforces this.
- **One brand layer** at the end of `styles.css`, which uses variables only (no literal colours).
- Text, surfaces, borders and disabled states keep Obsidian’s theme variables, so community themes and both light and dark modes keep working.
- One neutral helper, `--mnemotoad-on-violet: #ffffff`, labels violet buttons. It is not a brand colour.

### Contrast (WCAG 2.x, against Obsidian’s default surfaces)

| Pairing | Ratio | Use |
| --- | --- | --- |
| White label on violet | 8.71 : 1 | Primary buttons (both themes) |
| Violet on `#ffffff` / `#f6f6f6` | 8.71 / 8.06 : 1 | Light theme: focus ring, selection bar |
| Green on `#ffffff` | 5.27 : 1 | Light theme: “ready” border |
| Yellow on `#1e1e1e` / `#262626` | 12.66 / 11.49 : 1 | Dark theme: focus ring |
| Green on `#1e1e1e` | 3.17 : 1 | Dark theme: selection bar, “ready” border (non-text, ≥ 3 : 1) |
| Green on near black | 3.8 : 1 | Dark theme: mascot on its plate |
| **Not used:** violet on `#1e1e1e` | 1.91 : 1 | Too low; violet is never a dark-theme indicator or text colour |
| **Not used:** yellow on `#ffffff` | 1.32 : 1 | Too low; yellow is never a light-theme indicator |
| **Not used:** green on umber | 2.96 : 1 | Why the dark-theme mascot plate is near black, not umber |

Yellow is not used for warnings; warnings keep Obsidian’s own warning colours. No state is conveyed by colour alone: every status chip, selection and review state is also stated in text or by an ARIA attribute.

## Mascot

### Reference

The owner supplied `salamander-transparent.png` as the authoritative reference for **fidelity**, not for the animal. It is not part of this repository and is not redistributed. Measured characteristics:

- 690×478 px drawn on blocks of about 22.5 px, giving a logical grid of about **30×21** and about **302 opaque logical pixels**.
- **Four flat colours**: body orange (85 %), dark-red spots (6.5 %), black (5 %) and one white eye highlight. No partial alpha; no shading, gradients, texture, outline or antialiasing.
- A black square eye with a single highlight block, a few 1–2-block spots, a transparent notch for the mouth, and some toes as detached blocks.

The rule taken from it: *copy the simplicity, not the animal.* The mascot uses no outline, one body colour, square eyes with one highlight pixel and a few spots. Swamp green replaces orange, umber replaces dark red and yellow replaces white.

### Approved mascot: B2 — The Curmudgeon

The canonical mascot is **B2 — The Curmudgeon**: Concept B (The Grump) with a lopsided scowl. The right end of the mouth sags one row, and only 5 of its 262 pixels differ from Concept B. It is 24×24 and uses four colours: near black, umber, green and yellow. The owner approved it from `assets/mascot/refinement/comparison-sheet.png`.

| File | Role |
| --- | --- |
| `assets/mascot/mnemotoad-mascot.png` | **Canonical** 24×24 master. A byte-identical copy of the approved `refinement/b2-curmudgeon.png` (SHA-256 `56b47400c0f133d1…`). |
| `assets/mascot/mnemotoad-mascot@8x.png` | ×8 nearest-neighbour preview (byte copy of the approved preview). |
| `assets/mascot/mascot.json` | The same pixel grid, used at runtime. This is the only mascot data in the plugin bundle. |

The mascot appears in three places, and nowhere else:

- **Module headers** (PATCHBOOK, MOTIF, CANVAS), 2× = 48 px, decorative (`aria-hidden`; the eyebrow names the product).
- **The PATCHBOOK empty detail pane**, 2×.
- **The settings About panel**, 4× = 96 px, labelled *“MNEMOTOAD mascot: The Curmudgeon, a grumpy green toad”*.

`src/ui/mascot.ts` draws it as SVG on whole pixels with `shape-rendering: crispEdges` at integer scales. There is no animation. On displays with a fractional device-pixel ratio, the browser maps logical pixels to device pixels unevenly; this is inherent to fractional scaling.

**Verification.** `node scripts/mascot-verify.mjs` checks that `mascot.json` names the approved B2, that the canonical PNG is byte-identical to the approved file and pixel-identical to `mascot.json`, that it uses canonical colours and binary alpha only, and that the ×8 copy is an exact nearest-neighbour enlargement. `tests/mascot.test.ts` pins the SHA-256 and proves that the verifier rejects a substituted sprite or a drifted grid.

### Development references (not shipped)

Concepts A, B and C (`assets/mascot/sprites.json`, `<id>.png`, `concept-sheet.png`) and the Grump refinement variants B1–B3 (`assets/mascot/refinement/`) are kept as development references only. None of them is bundled or displayed.

### Concepts

All three are 24×24 logical pixels and use four of the five colours (violet was not needed). Each has 262–326 opaque logical pixels, so their density is comparable to the reference.

| Concept | Description |
| --- | --- |
| A — The Familiar *(RC provisional favourite, superseded)* | Squat and forward-facing, with wide-set 3×3 eyes, a flat mouth and three spots. The most legible at 24 px. |
| B — The Grump | Wider and lower (24×13), with slanted lids and mouth corners turned down. The basis of the approved B2. |
| C — The Watcher | Taller, with prominent 4×4 eyes, the same eye construction as the reference. Quiet and observant; reads a little more frog-like. |

### Concept files

`assets/mascot/`:

- `sprites.json`: the concept grids, one character per pixel.
- `<id>.png`: native 24×24 masters.
- `<id>@8x.png`: nearest-neighbour previews.
- `concept-sheet.png`.

Every PNG is RGBA with alpha 0 or 255 only, contains no ancillary colour chunks and uses only canonical colours.

### Commands

- `node scripts/mascot-generate.mjs` regenerates the PNGs. It is deterministic and has no dependencies.
- `node scripts/mascot-verify.mjs` checks the palette, alpha, dimensions and nearest-neighbour scaling with an independent decoder. `tests/mascot.test.ts` runs it, and also proves that it rejects off-palette, partial-alpha, wrongly sized and smoothed images.
- `python3 scripts/mascot-compare.py <reference.png>` writes review sheets beside the reference into `output/release-candidate/` (git-ignored). This needs Pillow.
