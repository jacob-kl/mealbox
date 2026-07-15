import xml.etree.ElementTree as ET
from svgelements import SVG, Path, Matrix
import json
import re
import sys

# One-time extraction: pulls precise US state boundaries from the Wikimedia
# Commons "Blank Map World Secondary Political Divisions" SVG (a properly
# maintained, ISO-3166-2-labeled political map) and aligns them into the
# same 960x500 world-map coordinate space used by generate-map-data.mjs.
#
# Re-run this if the source SVG is ever updated. Requires: pip install
# svgelements. Pass the source SVG path as the first argument.
#
# 45 of 50 states resolve cleanly by ISO code (US-XX, or US-XX-N for a few
# multi-part states like US-TX-2/US-CA-2). Alaska and Hawaii are excluded
# deliberately - this source file shows them in their true, geographically
# distant world positions (correct for a world map) rather than the
# conventional US-map inset near California, so mixing them in would blow
# up the bounding-box fit. Louisiana, Massachusetts, and Washington have no
# identifiable id in this particular file (the geometry exists but isn't
# labeled) - all five of these are generated separately via geoAlbersUsa
# in generate-map-data.mjs, which already positions them correctly.

SVG_PATH = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/Blank_Map_World_Secondary_Political_Divisions.svg'

STATE_ABBR = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
              'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
              'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
EXCLUDE = {'AK', 'HI', 'LA', 'MA', 'WA'}  # AK/HI: true distant position in this world map, not the US-map inset convention. LA/MA/WA: no identifiable geometry in this file.

tree = ET.parse(SVG_PATH)
root = tree.getroot()
all_ids = [e.get('id') for e in root.iter() if e.get('id')]

id_for_state = {}
for st in STATE_ABBR:
    if st in EXCLUDE:
        continue
    base = f'US-{st}'
    if base in all_ids:
        id_for_state[st] = base
    else:
        numbered = sorted([i for i in all_ids if i and re.match(rf'^{base}-\d+$', i)])
        if numbered:
            id_for_state[st] = numbered[-1]

svg = SVG.parse(SVG_PATH)
elements_by_id = {}
for el in svg.elements():
    eid = el.values.get('id') if hasattr(el, 'values') else None
    if eid:
        elements_by_id[eid] = el

# Pass 1: collect flattened (untransformed-further) paths + combined bbox
raw = {}
overall_bbox = None
for st, elid in id_for_state.items():
    el = elements_by_id.get(elid)
    if el is None:
        continue
    paths = [el] if isinstance(el, Path) else [d for d in el.select() if isinstance(d, Path)]
    paths = [p for p in paths if p.d()]
    if not paths:
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

src_minx, src_miny, src_maxx, src_maxy = overall_bbox
src_w, src_h = src_maxx - src_minx, src_maxy - src_miny

# Target box: the precise continental-US bounding box already established
# in my existing 960x500 world map (computed from the real US polygon in
# the d3-geo/world-atlas data a few rounds ago).
TARGET = {'x': 170.54, 'y': 91.85, 'w': 146.49, 'h': 75.76}

scale = min(TARGET['w'] / src_w, TARGET['h'] / src_h)
scaled_w, scaled_h = src_w * scale, src_h * scale
offset_x = TARGET['x'] + (TARGET['w'] - scaled_w) / 2
offset_y = TARGET['y'] + (TARGET['h'] - scaled_h) / 2

print(f'Source bbox: {src_w:.1f} x {src_h:.1f}  ->  scale={scale:.4f}  ->  scaled: {scaled_w:.1f} x {scaled_h:.1f}')
print(f'Target box: {TARGET}')

# Build the transform: translate to origin, scale, translate into target position
matrix = Matrix.translate(-src_minx, -src_miny)
matrix *= Matrix.scale(scale, scale)
matrix *= Matrix.translate(offset_x, offset_y)

output = {}
for st, paths in raw.items():
    d_strings = []
    for p in paths:
        p2 = p * matrix
        d_strings.append(p2.d())
    output[st] = d_strings

import os
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wiki-states-aligned.json')
json.dump(output, open(out_path, 'w'))
print(f'Aligned and saved {len(output)} states to {out_path}')
