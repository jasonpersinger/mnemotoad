"""MNEMOTOAD mascot review sheets (NOT released assets). Places the user's salamander reference beside the three toad
concepts for fidelity comparison and writes them under output/release-candidate/ (git-ignored). The reference is read
from the path given and never copied into assets/ or the plugin.

Usage: python3 scripts/mascot-compare.py <salamander-transparent.png>
Writes: output/release-candidate/mascot/comparison.png, reference-stats.json,
        output/release-candidate/12-mascot-native.png, output/release-candidate/13-mascot-enlarged.png
Requires Pillow (review tooling only; the release generator scripts/mascot-generate.mjs has no dependencies)."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SPEC = json.loads(Path('assets/mascot/sprites.json').read_text())
OUT = Path('output/release-candidate'); (OUT / 'mascot').mkdir(parents=True, exist_ok=True)
DARK, LIGHT, INK_D, INK_L = (30, 30, 30, 255), (255, 255, 255, 255), (218, 218, 218, 255), (34, 34, 34, 255)
try: FONT = ImageFont.truetype('/usr/share/fonts/noto/NotoSansMono-Regular.ttf', 15); SMALL = ImageFont.truetype('/usr/share/fonts/noto/NotoSansMono-Regular.ttf', 12)
except OSError: FONT = SMALL = ImageFont.load_default()

def sprite(concept):
    im = Image.new('RGBA', (SPEC['size'],) * 2, (0, 0, 0, 0))
    for y, row in enumerate(concept['rows']):
        for x, key in enumerate(row):
            if key != SPEC['transparent']: im.putpixel((x, y), tuple(int(SPEC['palette'][key][i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    return im
def stats(concept):
    keys = [k for row in concept['rows'] for k in row if k != SPEC['transparent']]
    xs = [x for row in concept['rows'] for x, k in enumerate(row) if k != '.']; ys = [y for y, row in enumerate(concept['rows']) for k in row if k != '.']
    return {'opaqueLogicalPixels': len(keys), 'boundingBox': f'{max(xs) - min(xs) + 1}×{max(ys) - min(ys) + 1}', 'colours': {SPEC['palette'][k]: round(keys.count(k) / len(keys), 3) for k in sorted(set(keys))}}

reference = Image.open(sys.argv[1]).convert('RGBA'); W, H = reference.size; px = reference.load()
white = [(x, y) for y in range(H) for x in range(W) if px[x, y][3] == 255 and min(px[x, y][:3]) > 230]
block = ((max(p[0] for p in white) - min(p[0] for p in white) + 1) + (max(p[1] for p in white) - min(p[1] for p in white) + 1)) / 2
opaque = [(x, y) for y in range(H) for x in range(W) if px[x, y][3] > 0]
bw, bh = max(p[0] for p in opaque) - min(p[0] for p in opaque) + 1, max(p[1] for p in opaque) - min(p[1] for p in opaque) + 1
ref = {'file': Path(sys.argv[1]).name, 'pixels': f'{W}×{H}', 'blockPx': round(block, 1), 'logicalGrid': f'{round(bw / block)}×{round(bh / block)}',
       'opaqueLogicalPixels': round(len(opaque) / block ** 2), 'partialAlphaPixels': sum(1 for x, y in opaque if px[x, y][3] < 255)}
report = {'reference': ref, 'concepts': {c['id']: {'name': c['name'], **stats(c)} for c in SPEC['concepts']}}
(OUT / 'mascot' / 'reference-stats.json').write_text(json.dumps(report, indent=2) + '\n')

def label(draw, xy, text, fill, font=FONT): draw.text(xy, text, fill=fill, font=font)
# Comparison sheet: reference (downscaled to the concepts' logical-pixel scale with NEAREST) beside the concepts ×8.
S = 8; tile = SPEC['size'] * S; ref_scaled = reference.resize((round(W / block * S), round(H / block * S)), Image.NEAREST)
sheet = Image.new('RGBA', (40 + ref_scaled.width + 40 + 3 * (tile + 24), 120 + 2 * (tile + 40) + 40), DARK)
d = ImageDraw.Draw(sheet)
label(d, (20, 16), 'MNEMOTOAD mascot concepts vs. the supplied fidelity reference (review sheet, not a release asset)', INK_D)
label(d, (20, 40), f"Reference: {ref['file']} — {ref['logicalGrid']} logical px (~{ref['blockPx']} px blocks), shown at the same ×{S} logical scale", INK_D, SMALL)
label(d, (20, 58), 'Concepts: 24×24 logical px, five canonical colours only, ×8 nearest neighbour, on dark and light backgrounds', INK_D, SMALL)
sheet.alpha_composite(ref_scaled, (20, 100)); label(d, (20, 100 + ref_scaled.height + 6), 'salamander-transparent.png', INK_D, SMALL); label(d, (20, 100 + ref_scaled.height + 22), '(user-supplied reference)', INK_D, SMALL)
x0 = 40 + ref_scaled.width + 20
for row, bg in enumerate([DARK, LIGHT]):
    for i, c in enumerate(SPEC['concepts']):
        x, y = x0 + i * (tile + 24), 100 + row * (tile + 40)
        d.rectangle([x - 4, y - 4, x + tile + 3, y + tile + 3], fill=bg); sheet.alpha_composite(sprite(c).resize((tile, tile), Image.NEAREST), (x, y))
        label(d, (x, y + tile + 8), f"{'ABC'[i]} — {c['name']}", INK_D, SMALL)
sheet.save(OUT / 'mascot' / 'comparison.png')

# 12: native resolution (1:1), each concept on dark and light; 13: ×8 nearest-neighbour previews.
native = Image.new('RGBA', (3 * 150 + 20, 120), DARK); d = ImageDraw.Draw(native)
for i, c in enumerate(SPEC['concepts']):
    x = 20 + i * 150; d.rectangle([x - 6, 30, x + 30, 66], fill=DARK); d.rectangle([x + 40, 30, x + 76, 66], fill=LIGHT)
    native.alpha_composite(sprite(c), (x + 6, 36)); native.alpha_composite(sprite(c), (x + 46, 36)); label(d, (x - 6, 76), f"{'ABC'[i]} {c['name']}", INK_D, SMALL)
label(d, (14, 6), 'Native 24×24, actual size (1 sprite pixel = 1 image pixel)', INK_D, SMALL); native.save(OUT / '12-mascot-native.png')
big = Image.new('RGBA', (3 * (tile + 24) + 20, tile + 70), DARK); d = ImageDraw.Draw(big)
for i, c in enumerate(SPEC['concepts']):
    big.alpha_composite(sprite(c).resize((tile, tile), Image.NEAREST), (20 + i * (tile + 24), 34)); label(d, (20 + i * (tile + 24), tile + 42), f"{'ABC'[i]} — {c['name']} (×8 nearest neighbour)", INK_D, SMALL)
label(d, (20, 8), 'MNEMOTOAD mascot concepts, enlarged ×8 with nearest-neighbour scaling', INK_D, SMALL); big.save(OUT / '13-mascot-enlarged.png')
print(json.dumps(report, indent=1))
