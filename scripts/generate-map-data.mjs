// One-time data generation script: converts real-world topojson (country
// and US-state boundaries) into simplified SVG paths, tagged with which
// cuisine "hover group" each shape belongs to. Output is a static JS file
// consumed by CuisineWorldMap.js - no runtime geo processing needed.
// Re-run with `node scripts/generate-map-data.mjs` if the cuisine-to-
// region mapping below ever changes.

import { geoNaturalEarth1, geoAlbersUsa, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-110m.json' with { type: 'json' };
import usTopo from 'us-atlas/states-10m.json' with { type: 'json' };
import fs from 'fs';

const WIDTH = 960;
const HEIGHT = 500;

// --- Country name -> cuisine hover-group mapping ---
// Single-country cuisines get their own group (their country name is the
// group id, e.g. "Italy"). Multi-country cuisines share a group id, so
// hovering any member highlights the whole cluster.
const COUNTRY_GROUPS = {
  Mexico: { group: 'mexican', cuisines: ['mexican'] },
  Italy: { group: 'italian', cuisines: ['italian'] },
  France: { group: 'french', cuisines: ['french'] },
  Spain: { group: 'spanish', cuisines: ['spanish'] },
  India: { group: 'indian', cuisines: ['indian'] },
  China: { group: 'chinese', cuisines: ['chinese'] },
  Japan: { group: 'japanese', cuisines: ['japanese'] },
  'South Korea': { group: 'korean', cuisines: ['korean'] },
  Thailand: { group: 'thai', cuisines: ['thai'] },
  Vietnam: { group: 'vietnamese', cuisines: ['vietnamese'] },
  // Caribbean cluster
  Jamaica: { group: 'caribbean', cuisines: ['caribbean'] },
  Cuba: { group: 'caribbean', cuisines: ['caribbean'] },
  'Dominican Rep.': { group: 'caribbean', cuisines: ['caribbean'] },
  'Trinidad and Tobago': { group: 'caribbean', cuisines: ['caribbean'] },
  'The Bahamas': { group: 'caribbean', cuisines: ['caribbean'] },
  Haiti: { group: 'caribbean', cuisines: ['caribbean'] },
  'Puerto Rico': { group: 'caribbean', cuisines: ['caribbean'] },
  // Mainland Caribbean-coast countries - grouped with the islands rather
  // than off on their own, given the shared coastal/Caribbean culinary
  // influence (plantains, seafood, similar spice profiles).
  Colombia: { group: 'caribbean', cuisines: ['caribbean'] },
  Venezuela: { group: 'caribbean', cuisines: ['caribbean'] },
  Guyana: { group: 'caribbean', cuisines: ['caribbean'] },
  Suriname: { group: 'caribbean', cuisines: ['caribbean'] },
  // Mediterranean cluster
  Greece: { group: 'mediterranean', cuisines: ['mediterranean'] },
  Croatia: { group: 'mediterranean', cuisines: ['mediterranean'] },
  Cyprus: { group: 'mediterranean', cuisines: ['mediterranean'] },
  // Middle Eastern cluster
  Lebanon: { group: 'middle-eastern', cuisines: ['middle-eastern'] },
  Israel: { group: 'middle-eastern', cuisines: ['middle-eastern'] },
  Jordan: { group: 'middle-eastern', cuisines: ['middle-eastern'] },
  Turkey: { group: 'middle-eastern', cuisines: ['middle-eastern'] },
  'Saudi Arabia': { group: 'middle-eastern', cuisines: ['middle-eastern'] },
  Syria: { group: 'middle-eastern', cuisines: ['middle-eastern'] },
  // Southeast Asian cluster - Taiwan intentionally excluded, since it isn't
  // part of Southeast Asia and lumping it in would repeat the same
  // inaccurate-labeling problem this rename was meant to fix.
  Malaysia: { group: 'southeast-asian', cuisines: ['southeast-asian'] },
  Indonesia: { group: 'southeast-asian', cuisines: ['southeast-asian'] },
  Philippines: { group: 'southeast-asian', cuisines: ['southeast-asian'] },
  Myanmar: { group: 'southeast-asian', cuisines: ['southeast-asian'] },
  Cambodia: { group: 'southeast-asian', cuisines: ['southeast-asian'] },
  Laos: { group: 'southeast-asian', cuisines: ['southeast-asian'] },
  // North Africa cluster
  Morocco: { group: 'north-african', cuisines: ['north-african'] },
  Egypt: { group: 'north-african', cuisines: ['north-african'] },
  Tunisia: { group: 'north-african', cuisines: ['north-african'] },
  Algeria: { group: 'north-african', cuisines: ['north-african'] },
  Libya: { group: 'north-african', cuisines: ['north-african'] },
  Sudan: { group: 'north-african', cuisines: ['north-african'] },
  'W. Sahara': { group: 'north-african', cuisines: ['north-african'] },
  // West Africa cluster
  Nigeria: { group: 'west-african', cuisines: ['west-african'] },
  Ghana: { group: 'west-african', cuisines: ['west-african'] },
  Senegal: { group: 'west-african', cuisines: ['west-african'] },
  "Côte d'Ivoire": { group: 'west-african', cuisines: ['west-african'] },
  Mali: { group: 'west-african', cuisines: ['west-african'] },
  Guinea: { group: 'west-african', cuisines: ['west-african'] },
  'Burkina Faso': { group: 'west-african', cuisines: ['west-african'] },
  'Guinea-Bissau': { group: 'west-african', cuisines: ['west-african'] },
  Benin: { group: 'west-african', cuisines: ['west-african'] },
  Gambia: { group: 'west-african', cuisines: ['west-african'] },
  Liberia: { group: 'west-african', cuisines: ['west-african'] },
  Mauritania: { group: 'west-african', cuisines: ['west-african'] },
  Niger: { group: 'west-african', cuisines: ['west-african'] },
  'Sierra Leone': { group: 'west-african', cuisines: ['west-african'] },
  Togo: { group: 'west-african', cuisines: ['west-african'] },
  // East Africa cluster
  Ethiopia: { group: 'east-african', cuisines: ['east-african'] },
  Kenya: { group: 'east-african', cuisines: ['east-african'] },
  Tanzania: { group: 'east-african', cuisines: ['east-african'] },
  Uganda: { group: 'east-african', cuisines: ['east-african'] },
  Somalia: { group: 'east-african', cuisines: ['east-african'] },
  Burundi: { group: 'east-african', cuisines: ['east-african'] },
  Djibouti: { group: 'east-african', cuisines: ['east-african'] },
  Eritrea: { group: 'east-african', cuisines: ['east-african'] },
  Madagascar: { group: 'east-african', cuisines: ['east-african'] },
  Rwanda: { group: 'east-african', cuisines: ['east-african'] },
  'S. Sudan': { group: 'east-african', cuisines: ['east-african'] },
  Somaliland: { group: 'east-african', cuisines: ['east-african'] },
  // Central Africa cluster
  'Dem. Rep. Congo': { group: 'central-african', cuisines: ['central-african'] },
  Cameroon: { group: 'central-african', cuisines: ['central-african'] },
  Congo: { group: 'central-african', cuisines: ['central-african'] },
  Gabon: { group: 'central-african', cuisines: ['central-african'] },
  Chad: { group: 'central-african', cuisines: ['central-african'] },
  'Central African Rep.': { group: 'central-african', cuisines: ['central-african'] },
  'Eq. Guinea': { group: 'central-african', cuisines: ['central-african'] },
  // South Africa cluster
  'South Africa': { group: 'south-african', cuisines: ['south-african'] },
  Namibia: { group: 'south-african', cuisines: ['south-african'] },
  Botswana: { group: 'south-african', cuisines: ['south-african'] },
  Lesotho: { group: 'south-african', cuisines: ['south-african'] },
  eSwatini: { group: 'south-african', cuisines: ['south-african'] },
  Zimbabwe: { group: 'south-african', cuisines: ['south-african'] },
  Angola: { group: 'south-african', cuisines: ['south-african'] },
  Malawi: { group: 'south-african', cuisines: ['south-african'] },
  Mozambique: { group: 'south-african', cuisines: ['south-african'] },
  Zambia: { group: 'south-african', cuisines: ['south-african'] },
  // Single-country cuisines added later
  Mongolia: { group: 'mongolian', cuisines: ['mongolian'] },
  Peru: { group: 'peruvian', cuisines: ['peruvian'] },
  Bolivia: { group: 'peruvian', cuisines: ['peruvian'] },
  Ecuador: { group: 'peruvian', cuisines: ['peruvian'] },
  Brazil: { group: 'brazilian', cuisines: ['brazilian'] },
  Russia: { group: 'russian', cuisines: ['russian'] },
  Germany: { group: 'german', cuisines: ['german'] },
  Argentina: { group: 'argentinian', cuisines: ['argentinian'] },
  Chile: { group: 'argentinian', cuisines: ['argentinian'] },
  Uruguay: { group: 'argentinian', cuisines: ['argentinian'] },
  Paraguay: { group: 'argentinian', cuisines: ['argentinian'] },
  // Central America - distinct enough from Mexican cuisine (and from each
  // other) to get its own cluster rather than folding into 'mexican'.
  Guatemala: { group: 'central-american', cuisines: ['central-american'] },
  Belize: { group: 'central-american', cuisines: ['central-american'] },
  Honduras: { group: 'central-american', cuisines: ['central-american'] },
  'El Salvador': { group: 'central-american', cuisines: ['central-american'] },
  Nicaragua: { group: 'central-american', cuisines: ['central-american'] },
  'Costa Rica': { group: 'central-american', cuisines: ['central-american'] },
  Panama: { group: 'central-american', cuisines: ['central-american'] },
};

// United States: every state belongs to one of three groups now - New
// Mexico and the defined Southern states are their own micro-regions,
// everything else is the broad "usa" (American) group. New Mexico and the
// Southern states ALSO carry 'usa' as a secondary group so they still
// light up when the broad region is what's active (hovering a non-special
// state highlights the whole country, Southern and New Mexico included) -
// but hovering one of them directly resolves to its own smaller group
// first, since the component always picks the group with the fewest
// members among a shape's groups.
const SOUTHERN_STATES = new Set([
  'Texas', 'Louisiana', 'Mississippi', 'Alabama', 'Georgia', 'South Carolina',
  'North Carolina', 'Tennessee', 'Arkansas', 'Kentucky', 'Virginia', 'West Virginia', 'Florida',
]);
function usGroupsFor(stateName) {
  if (stateName === 'New Mexico') return ['new-mexico', 'usa'];
  if (stateName === 'Hawaii') return ['hawaiian', 'usa'];
  if (SOUTHERN_STATES.has(stateName)) return ['southern', 'usa'];
  return ['usa'];
}
function usCuisinesFor(stateName) {
  if (stateName === 'New Mexico') return ['new-mexico'];
  if (stateName === 'Hawaii') return ['hawaiian'];
  if (SOUTHERN_STATES.has(stateName)) return ['southern'];
  return ['american'];
}

const worldGeo = feature(worldTopo, worldTopo.objects.countries);
const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], worldGeo);
const path = geoPath(projection);

const shapes = [];

// A few countries bundle a geographically distant overseas territory into
// the same MultiPolygon (e.g. France includes French Guiana, which renders
// as a stray dot near Venezuela on a world map). For those, keep only the
// largest ring by bounding-box span (the mainland), same technique used
// for the US/Alaska separation above.
const TRIM_TO_MAINLAND = new Set(['France']);

function mainlandOnly(f) {
  let best = null;
  let bestSpan = -1;
  for (const ring of f.geometry.coordinates) {
    const ringFeature = { type: 'Feature', geometry: { type: f.geometry.type === 'MultiPolygon' ? 'Polygon' : 'LineString', coordinates: ring }, properties: {} };
    const b = path.bounds(ringFeature);
    const span = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
    if (span > bestSpan) {
      bestSpan = span;
      best = ring;
    }
  }
  return { ...f, geometry: { type: 'Polygon', coordinates: best } };
}

// World countries, skipping the low-res "United States of America" blob -
// real individual states replace it below.
for (const f of worldGeo.features) {
  const name = f.properties.name;
  if (name === 'United States of America') continue;
  const trimmed = TRIM_TO_MAINLAND.has(name) ? mainlandOnly(f) : f;
  const d = path(trimmed);
  if (!d) continue;
  const mapped = COUNTRY_GROUPS[name];
  shapes.push({
    id: `country-${f.id ?? name}`,
    name,
    d,
    groups: mapped ? [mapped.group] : null, // null = unclaimed, not clickable
    cuisines: mapped ? mapped.cuisines : null,
    kind: 'country',
  });
}

// Alaska and Hawaii, in their TRUE world position - not the conventional
// US-map inset near California. That convention exists for standalone US
// maps with no surrounding context; on a world map where Canada and Russia
// are both visible, an inset just looks like a placement error. Classified
// by each ring's real lon/lat centroid (robust regardless of projection),
// then rendered through the exact same Natural-Earth-1 pipeline as every
// other country, so they land in genuinely correct relative position.
const usFeature = worldGeo.features.find((f) => f.properties.name === 'United States of America');
function ringCentroid(ring) {
  let sx = 0, sy = 0, n = 0;
  for (const point of ring[0]) { sx += point[0]; sy += point[1]; n++; }
  return [sx / n, sy / n];
}
const alaskaRings = [];
const hawaiiRings = [];
for (const ring of usFeature.geometry.coordinates) {
  const [lon, lat] = ringCentroid(ring);
  if (lon < -140 && lat > 45) alaskaRings.push(ring);
  else if (lon < -140 && lat < 30) hawaiiRings.push(ring);
}

// Hawaii's true-position footprint is honest but tiny - a handful of small
// islands read as a near-invisible speck at world-map scale, easy to miss
// and hard to hover/click. Deliberately scale it up around its own
// lon/lat centroid before projecting (a cosmetic exaggeration, same idea
// as an inset on a conventional US map, just applied in place rather than
// relocating it). Scaling pre-projection instead of post-projection is an
// approximation - it's only exactly area-preserving-in-shape if the local
// map scale is isotropic - but Hawaii's whole extent is a few degrees, well
// away from any pole, so Natural-Earth-1 distortion across it is
// negligible and the result is visually indistinguishable from scaling
// the projected shape directly. Tune this constant if it still feels too
// small/large.
const HAWAII_SCALE = 3.2;
function scalePolygonsAroundCentroid(polygons, factor) {
  let sx = 0, sy = 0, n = 0;
  for (const poly of polygons) {
    for (const [x, y] of poly[0]) { sx += x; sy += y; n++; }
  }
  const cx = sx / n, cy = sy / n;
  return polygons.map((poly) => poly.map((ring) => ring.map(([x, y]) => [
    cx + (x - cx) * factor,
    cy + (y - cy) * factor,
  ])));
}
const hawaiiRingsScaled = scalePolygonsAroundCentroid(hawaiiRings, HAWAII_SCALE);

for (const [label, rings] of [['Alaska', alaskaRings], ['Hawaii', hawaiiRingsScaled]]) {
  const f = { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: rings }, properties: {} };
  const d = path(f);
  if (!d) continue;
  shapes.push({
    id: `state-us-${label.toLowerCase()}`,
    name: label,
    d,
    groups: usGroupsFor(label),
    cuisines: usCuisinesFor(label),
    kind: 'state',
  });
}

// US states: geoAlbersUsa is the standard projection for exactly this case
// (continental US normal, Alaska/Hawaii as correctly-scaled insets). To
// align it correctly against the surrounding countries, we find the actual
// continental-US ring within the world dataset's own US polygon (the
// largest ring by bounding-box span - Alaska, Hawaii, and small islands
// are all much smaller rings in the same MultiPolygon) and fit our states
// into THAT precise box, rather than a hand-guessed one.
const usWorldFeature = worldGeo.features.find((f) => f.properties.name === 'United States of America');
let continentalBounds = null;
let bestSpan = -1;
for (const ring of usWorldFeature.geometry.coordinates) {
  const ringFeature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: ring }, properties: {} };
  const b = path.bounds(ringFeature);
  const span = (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
  if (span > bestSpan) {
    bestSpan = span;
    continentalBounds = b;
  }
}
const US_BOX = {
  x: continentalBounds[0][0],
  y: continentalBounds[0][1],
  width: continentalBounds[1][0] - continentalBounds[0][0],
  height: continentalBounds[1][1] - continentalBounds[0][1],
};

const usStatesGeo = feature(usTopo, usTopo.objects.states).features;
// us-atlas includes Pacific/Caribbean territories (Guam, American Samoa,
// Northern Mariana Islands, Puerto Rico, US Virgin Islands) at longitudes
// wildly outside the continental US. Left in, they corrupt the fitSize()
// bounding box the same way Alaska's true position did - the box stretches
// to cover them, compressing every real state toward one side. It's subtle
// for centrally-located states but severe for states at the edge of the
// continental cluster (Washington ended up rendering near Kentucky).
const NON_STATE_TERRITORIES = new Set([
  'American Samoa', 'Guam', 'Commonwealth of the Northern Mariana Islands',
  'Puerto Rico', 'United States Virgin Islands',
]);
const usProjection = geoAlbersUsa().fitSize(
  [US_BOX.width, US_BOX.height],
  { type: 'FeatureCollection', features: usStatesGeo.filter((f) => !NON_STATE_TERRITORIES.has(f.properties.name)) }
);
const usPathGen = geoPath(usProjection);

// The precise-states source is a stylized "blank map" template, not GIS
// data (see extract-us-states.py) - its aggregate bbox is fit to line up
// with the target box, but the actual shape of its outer edge can still
// drift from the real border in between, since a global scale+translate
// can only guarantee alignment at the bbox's extremes, not along the whole
// curve. Measured up to ~16 units of gap in places (Idaho/Montana/North
// Dakota/Minnesota against Canada; Arizona/New Mexico/California/Texas
// against Mexico) even after the bbox fit.
//
// First attempt was a generic "snap any vertex within threshold to the
// nearest point on the neighboring country's full border" - too broad.
// Canada's border includes both shores of the Great Lakes, so states
// across a lake from Ontario (Wisconsin from across Lake Superior, plus
// Michigan/Ohio/Illinois/Indiana/Pennsylvania near Erie/Huron/Michigan)
// registered as "close to Canada" too, and got pulled toward the wrong
// shore - it snapped 1437 vertices when only a few dozen actually needed
// it. Wisconsin in particular doesn't border Canada at all (Lake Superior
// is between them); its measured "gap" was the correct natural distance,
// not a bug. Below uses two narrower, safer fixes instead, chosen per
// border depending on whether it's a straight line or not.
// Minimal M/L/Z (absolute or relative) path <-> polygon-array conversion -
// matches the simple polyline output these precise-state paths use.
function dToPolygons(d) {
  const tokens = d.match(/[MmLlZz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0;
  let cur = [0, 0];
  const polygons = [];
  let ring = null;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === 'M' || t === 'm') {
      if (ring?.length) polygons.push(ring);
      ring = [];
      i++;
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      cur = t === 'm' ? [cur[0] + x, cur[1] + y] : [x, y];
      ring.push([...cur]);
    } else if (t === 'L' || t === 'l') {
      i++;
      const x = parseFloat(tokens[i++]);
      const y = parseFloat(tokens[i++]);
      cur = t === 'l' ? [cur[0] + x, cur[1] + y] : [x, y];
      ring.push([...cur]);
    } else if (t === 'Z' || t === 'z') {
      i++;
      if (ring?.length) ring.push([...ring[0]]);
    } else {
      i++;
    }
  }
  if (ring?.length) polygons.push(ring);
  return polygons;
}
function polygonsToD(polygons) {
  return polygons
    .map((ring) => {
      const [first, ...rest] = ring;
      return `M${first[0]},${first[1]}` + rest.map(([x, y]) => `L${x},${y}`).join('');
    })
    .join('');
}
// The part of the Canada border that's actually broken is simpler than
// "Canada's border" in general: WA/ID/MT/ND/MN's shared border with
// Canada is, by treaty, a straight run along the 49th parallel. In this
// projection a line of latitude projects to an exactly horizontal line
// (verified: y is constant across the whole relevant longitude range),
// which makes the fix simple and safe - snap each qualifying vertex's Y
// straight onto that line, X untouched. An earlier attempt did a full 2D
// nearest-point snap (against Canada's whole polygon, then against this
// line); both could reorder vertices relative to their neighbors and
// produce a self-intersecting polygon. Only moving Y, never X, can't
// reorder anything, so it can't self-intersect. The same straight-line
// trick also covers two Mexico borders that happen to be constant-
// latitude lines too: the Gadsden line (Arizona/New Mexico, ~31.33N) and
// California's border (~32.53N) - both verified against Mexico's own
// boundary data the same way the 49th parallel was.
const FORTY_NINTH_PARALLEL_Y = 93.0298480876821; // projection([any lon in range, 49])[1]
// Only these four measured a real gap (see the shapely check this was
// developed against). Washington's border also touches lat=49, but winds
// through the San Juan Islands/Strait of Georgia rather than running
// straight, and it already measured zero gap - snapping it to this
// straight-line approximation would flatten real, already-correct detail
// rather than fix anything. Wisconsin and everyone further east meet
// Canada across the Great Lakes or a different segment, not this line.
const FORTY_NINTH_PARALLEL_STATES = new Set(['Idaho', 'Montana', 'North Dakota', 'Minnesota']);
const GADSDEN_LINE_Y = 147.94797758590673; // projection([any lon in range, 31.333])[1]
const GADSDEN_LINE_STATES = new Set(['Arizona', 'New Mexico']);
const CALIFORNIA_MEXICO_LINE_Y = 144.18130997660614; // projection([any lon in range, 32.5311])[1]
const CALIFORNIA_MEXICO_LINE_STATES = new Set(['California']);
const SNAP_THRESHOLD = 8; // units in the 960x500 space - comfortably above the ~5.5-16 measured gaps
const PARALLEL_LINE_CORRECTIONS = [
  { y: FORTY_NINTH_PARALLEL_Y, states: FORTY_NINTH_PARALLEL_STATES },
  { y: GADSDEN_LINE_Y, states: GADSDEN_LINE_STATES },
  { y: CALIFORNIA_MEXICO_LINE_Y, states: CALIFORNIA_MEXICO_LINE_STATES },
];

// A naive "snap every vertex within threshold" was tried first and broke:
// near a state's corner with a neighbor, the boundary heads away from the
// line again (south, toward the next state), and those vertices can also
// be within threshold - flattening them to the same Y as the true border
// vertices collapses the Y-separation that kept the polygon simple, and
// any small X-wiggle along the way (there's always some, even a couple of
// units) turns into a self-intersection once everything shares one Y.
// Minnesota's stretch is worse: its closest approach to Canada sits inside
// a long, genuinely jagged run (the Lake of the Woods/Northwest Angle
// detail), where flattening the whole thing would both self-intersect
// and erase real, correct geography.
//
// Fix: per ring, start at its single closest point to the line, then grow
// the snap set outward one vertex at a time in each direction, but only
// while the vertex is within threshold AND its x keeps moving the same
// way the run has been going. The moment either fails - threshold
// exceeded, or x reverses - stop extending in that direction. A run
// selected this way is x-monotonic by construction, so flattening it to
// one y can never fold back over itself; it also naturally halts right
// at a corner or a wiggly patch instead of ploughing through it.
// Grows a monotonic run outward from a ring's closest-to-target vertex,
// in both directions, sharing ONE direction across both walks. An earlier
// version tracked direction separately per walk, which let the forward
// and backward sides each settle on an opposite trend - producing a
// peak/valley exactly at the seed that self-intersects once everything in
// the run gets flattened to the same value. The backward walk here uses a
// reversed comparison (prevKey vs k, instead of k vs prevKey) specifically
// so that, read in normal increasing-index order, both halves agree on
// the same monotonic direction.
function growMonotonicRun(n, seedIdx, dist, threshold, keyOf) {
  const include = new Set([seedIdx]);
  let dir = null;
  {
    let prevKey = keyOf(seedIdx);
    let i = (seedIdx + 1) % n;
    while (i !== seedIdx) {
      if (dist[i] >= threshold) break;
      const k = keyOf(i);
      if (k !== prevKey) {
        const stepDir = k > prevKey ? 1 : -1;
        if (dir === null) dir = stepDir;
        else if (stepDir !== dir) break;
      }
      include.add(i);
      prevKey = k;
      i = (i + 1) % n;
    }
  }
  {
    let prevKey = keyOf(seedIdx);
    let i = (seedIdx - 1 + n) % n;
    while (i !== seedIdx) {
      if (dist[i] >= threshold) break;
      const k = keyOf(i);
      if (k !== prevKey) {
        const stepDir = prevKey > k ? 1 : -1; // reversed vs forward - see comment above
        if (dir === null) dir = stepDir;
        else if (stepDir !== dir) break;
      }
      include.add(i);
      prevKey = k;
      i = (i - 1 + n) % n;
    }
  }
  return include;
}
function snapRingToParallel(ring, targetY, threshold) {
  const n = ring.length;
  if (n < 3) return { ring, snapped: 0 };
  const dist = ring.map(([, y]) => Math.abs(y - targetY));
  let seedIdx = 0;
  for (let i = 1; i < n; i++) if (dist[i] < dist[seedIdx]) seedIdx = i;
  if (dist[seedIdx] >= threshold) return { ring, snapped: 0 };

  const include = growMonotonicRun(n, seedIdx, dist, threshold, (i) => ring[i][0]);
  let snapped = 0;
  const newRing = ring.map(([x, y], idx) => {
    if (include.has(idx)) {
      snapped++;
      return [x, targetY];
    }
    return [x, y];
  });
  return { ring: newRing, snapped };
}
function largestRingIndex(polygons) {
  let best = 0;
  for (let i = 1; i < polygons.length; i++) {
    if (polygons[i].length > polygons[best].length) best = i;
  }
  return best;
}
function snapStraightBorders(d, name) {
  const polygons = dToPolygons(d);
  const mainIdx = largestRingIndex(polygons);
  let snapped = 0;
  for (const { y, states } of PARALLEL_LINE_CORRECTIONS) {
    if (!states.has(name)) continue;
    const result = snapRingToParallel(polygons[mainIdx], y, SNAP_THRESHOLD);
    snapped += result.snapped;
    polygons[mainIdx] = result.ring;
  }
  return { d: polygonsToD(polygons), snapped };
}

// Texas's border with Mexico is the Rio Grande - a real, winding river,
// not a straight line, so there's no fixed target Y to snap to here.
// Measured up to ~5 units of gap along a long stretch of it even after
// the bbox fit (same root cause as the other borders: a global fit only
// guarantees alignment at the extremes). Instead, snap qualifying Texas
// vertices onto the nearest point of Mexico's own boundary directly - this
// is the right target to align to since both are tracing the same river,
// just simplified differently. The self-intersection risk is the same as
// before, so the same run-growing guard applies, generalized: instead of
// requiring x to keep moving one way, require the matched point's INDEX
// in Mexico's point list to keep moving one way. Both chains have to
// progress together in a consistent direction, or the run stops there -
// still can't fold back on itself. Candidate points are restricted to a
// bounding box around the Texas border specifically (not Mexico's full
// perimeter), both so nothing far away can ever be "nearest" by
// coincidence and so this can't repeat the Great-Lakes mistake.
function neighborBorderPointsNear(countryName, lonRange, latRange) {
  const f = worldGeo.features.find((ft) => ft.properties.name === countryName);
  if (!f) return [];
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const pts = [];
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [lon, lat] of ring) {
        if (lon < lonRange[0] || lon > lonRange[1] || lat < latRange[0] || lat > latRange[1]) continue;
        const p = projection([lon, lat]);
        if (p) pts.push(p);
      }
    }
  }
  return pts;
}
const MEXICO_TEXAS_BORDER_POINTS = neighborBorderPointsNear('Mexico', [-107, -96], [25, 32]);
const TEXAS_SNAP_THRESHOLD = 6; // just above the ~5 measured gap
function snapRingToNeighborPoints(ring, neighborPoints, threshold) {
  const n = ring.length;
  if (n < 3 || neighborPoints.length === 0) return { ring, snapped: 0 };
  const matches = ring.map(([x, y]) => {
    let bestIdx = -1;
    let bestD2 = Infinity;
    for (let j = 0; j < neighborPoints.length; j++) {
      const [nx, ny] = neighborPoints[j];
      const d2 = (nx - x) ** 2 + (ny - y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = j;
      }
    }
    return { point: neighborPoints[bestIdx], targetIdx: bestIdx, dist: Math.sqrt(bestD2) };
  });
  let seedIdx = 0;
  for (let i = 1; i < n; i++) if (matches[i].dist < matches[seedIdx].dist) seedIdx = i;
  if (matches[seedIdx].dist >= threshold) return { ring, snapped: 0 };

  const dist = matches.map((m) => m.dist);
  const include = growMonotonicRun(n, seedIdx, dist, threshold, (i) => matches[i].targetIdx);
  let snapped = 0;
  const newRing = ring.map((pt, idx) => {
    if (include.has(idx)) {
      snapped++;
      return matches[idx].point;
    }
    return pt;
  });
  return { ring: newRing, snapped };
}
function snapTexasToMexico(d, name) {
  if (name !== 'Texas') return { d, snapped: 0 };
  const polygons = dToPolygons(d);
  const mainIdx = largestRingIndex(polygons);
  const result = snapRingToNeighborPoints(polygons[mainIdx], MEXICO_TEXAS_BORDER_POINTS, TEXAS_SNAP_THRESHOLD);
  polygons[mainIdx] = result.ring;
  return { d: polygonsToD(polygons), snapped: result.snapped };
}
function snapStateBorders(d, name) {
  const step1 = snapStraightBorders(d, name);
  const step2 = snapTexasToMexico(step1.d, name);
  return { d: step2.d, snapped: step1.snapped + step2.snapped };
}

// Precise, real state boundaries sourced from a clean, properly-labeled
// blank US states map (see scripts/extract-us-states.py) - already
// pre-aligned into this exact 960x500 world coordinate space, no further
// transform needed. Covers all 48 continental states + DC from ONE
// consistent projection, so every border actually lines up with its
// neighbor - no more the seams from the old two-source setup, where
// Louisiana, Massachusetts, and Washington fell back to a geoAlbersUsa
// projection that didn't align with the other 45 (Louisiana rendered
// fully displaced into the Gulf; Washington was visibly rotated against
// Oregon/Idaho). Alaska and Hawaii were already added above in their true
// position. geoAlbersUsa below is now just a defensive fallback in case a
// future source update ever drops a state.
const NAME_TO_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
  Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
};
let preciseStates = {};
try {
  preciseStates = JSON.parse(fs.readFileSync('scripts/us-states-aligned.json', 'utf8'));
} catch {
  console.warn('No us-states-aligned.json found - all states will use geoAlbersUsa fallback');
}

let preciseCount = 0;
let totalSnapped = 0;
for (const f of usStatesGeo) {
  const name = f.properties.name;
  if (name === 'Alaska' || name === 'Hawaii') continue; // already added above in true position
  const abbr = NAME_TO_ABBR[name];
  const precisePaths = abbr && preciseStates[abbr];


  if (precisePaths?.length) {
    preciseCount++;
    for (let i = 0; i < precisePaths.length; i++) {
      const { d: snappedD, snapped } = snapStateBorders(precisePaths[i], name);
      totalSnapped += snapped;
      if (snapped) console.log(`    ${name}${i > 0 ? ` (part ${i})` : ''}: ${snapped} vertices snapped to the real border`);
      shapes.push({
        id: `state-${f.id}${i > 0 ? `-${i}` : ''}`,
        name,
        d: snappedD,
        // already aligned to final world coordinates - no translate needed
        groups: usGroupsFor(name),
        cuisines: usCuisinesFor(name),
        kind: 'state',
      });
    }
    continue;
  }

  const d = usPathGen(f);
  if (!d) continue;
  shapes.push({
    id: `state-${f.id}`,
    name,
    d,
    translateX: US_BOX.x,
    translateY: US_BOX.y,
    groups: usGroupsFor(name),
    cuisines: usCuisinesFor(name),
    kind: 'state',
  });
}

const worldCountryCount = worldGeo.features.length - 1; // minus the skipped US blob
const output = `// AUTO-GENERATED by scripts/generate-map-data.mjs — do not hand-edit.
// Real country + US state boundaries, simplified and projected to SVG paths,
// tagged with cuisine hover-groups. Re-run the generator script if the
// cuisine-to-region mapping changes.
export const MAP_WIDTH = ${WIDTH};
export const MAP_HEIGHT = ${HEIGHT};
export const MAP_SHAPES = ${JSON.stringify(shapes)};
`;

fs.writeFileSync('lib/mapShapes.js', output);
console.log(`Generated ${shapes.length} shapes (${worldCountryCount} countries, ${usStatesGeo.length} US states) -> lib/mapShapes.js`);
console.log(`  ${preciseCount} states from the precise source, ${usStatesGeo.length - preciseCount} from geoAlbersUsa fallback`);
console.log(`  ${totalSnapped} vertices snapped onto the real Canada/Mexico border (ID/MT/ND/MN, AZ/NM, CA, TX)`);
console.log('Unclaimed countries (gray, not clickable):', worldGeo.features.filter((f) => f.properties.name !== 'United States of America' && !COUNTRY_GROUPS[f.properties.name]).length);
