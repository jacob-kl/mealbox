import json
import os
import sys

from svgelements import SVG, Path, Matrix

# One-time extraction: pulls precise US state boundaries from a clean,
# properly-labeled blank US states map (every state is its own
# <path class="XX"> using the two-letter postal abbreviation) and aligns
# them into the same 960x500 world-map coordinate space used by
# generate-map-data.mjs.
#
# Supersedes extract-wiki-states.py, which only resolved 45 of 50 states
# because its source (a world map's "secondary political divisions" layer)
# had no identifiable id for Louisiana, Massachusetts, or Washington. Those
# three fell back to a raw geoAlbersUsa projection that doesn't share the
# other 45 states' alignment, so their borders didn't actually line up with
# their neighbors - Louisiana rendered fully displaced out into the Gulf,
# and Washington was visibly rotated against Oregon/Idaho, each leaving
# gaps/overlaps that read as "missing" chunks of the map.
#
# This source labels all 48 continental states individually, so all 48 now
# come from ONE consistent projection/alignment - no more seams. DC is
# pulled too since it's labeled here (previously it always used the rough
# fallback, being absent from the old source entirely).
#
# Alaska and Hawaii are still deliberately excluded: this source draws them
# in the conventional US-map inset position near California, but
# generate-map-data.mjs places them in their true geographic position for
# the surrounding world map (see that file's comments) - mixing conventions
# would put two different Alaskas/Hawaiis on the map.
#
# Re-run if the source SVG is ever updated. Requires: pip install
# svgelements. Pass the source SVG path as the first argument.

SVG_PATH = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/Blank_US_Map__states_only_.svg'

STATE_ABBR = [
    'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia',
    'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
    'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt',
    'va', 'wa', 'wv', 'wi', 'wy', 'dc',
]
# True distant world position for these two is handled separately in
# generate-map-data.mjs - this source's inset-near-California versions
# of Alaska/Hawaii are intentionally never used.
EXCLUDE = {'ak', 'hi'}

svg = SVG.parse(SVG_PATH)
elements_by_class = {}
for el in svg.elements():
    cls = el.values.get('class') if hasattr(el, 'values') else None
    if cls and cls not in elements_by_class:
        elements_by_class[cls] = el

raw = {}
overall_bbox = None
missing = []
for st in STATE_ABBR:
    if st in EXCLUDE:
        continue
    el = elements_by_class.get(st)
    if el is None:
        missing.append(st)
        continue
    paths = [el] if isinstance(el, Path) else [d for d in el.select() if isinstance(d, Path)]
    paths = [p for p in paths if p.d()]
    if not paths:
        missing.append(st)
        continue
    raw[st] = paths
    for p in paths:
        b = p.bbox()
        if b is None:
            continue
        if overall_bbox is None:
            overall_bbox = list(b)
        else:
            overall_bbox[0] = min(overall_bbox[0], b[0])
            overall_bbox[1] = min(overall_bbox[1], b[1])
            overall_bbox[2] = max(overall_bbox[2], b[2])
            overall_bbox[3] = max(overall_bbox[3], b[3])

if missing:
    print(f'WARNING: no usable path found for: {missing}')

src_minx, src_miny, src_maxx, src_maxy = overall_bbox
src_w, src_h = src_maxx - src_minx, src_maxy - src_miny

# Target box: the precise continental-US bounding box already established
# in the 960x500 world map (computed live from the real US polygon in the
# d3-geo/world-atlas data - see generate-map-data.mjs's continentalBounds).
TARGET = {'x': 170.54438866057626, 'y': 91.84865549544398, 'w': 146.4816216708424, 'h': 75.76606708166946}

scale = min(TARGET['w'] / src_w, TARGET['h'] / src_h)
scaled_w, scaled_h = src_w * scale, src_h * scale
offset_x = TARGET['x'] + (TARGET['w'] - scaled_w) / 2
offset_y = TARGET['y'] + (TARGET['h'] - scaled_h) / 2

print(f'Source bbox: {src_w:.1f} x {src_h:.1f}  ->  scale={scale:.4f}  ->  scaled: {scaled_w:.1f} x {scaled_h:.1f}')
print(f'States resolved: {len(raw)} / {len(STATE_ABBR) - len(EXCLUDE)}')

matrix = Matrix.translate(-src_minx, -src_miny)
matrix *= Matrix.scale(scale, scale)
matrix *= Matrix.translate(offset_x, offset_y)

output = {}
for st, paths in raw.items():
    d_strings = []
    for p in paths:
        p2 = p * matrix
        d_strings.append(p2.d())
    output[st.upper()] = d_strings

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'us-states-aligned.json')
json.dump(output, open(out_path, 'w'))
print(f'Aligned and saved {len(output)} states to {out_path}')
