// One-time data generation script: converts real-world topojson (country
// and US-state boundaries) into simplified SVG paths, tagged with which
// cuisine "hover group" each shape belongs to. Output is a static JS file
// consumed by CuisineWorldMap.js - no runtime geo processing needed.
// Re-run with `node scripts/generate-map-data.mjs` if the cuisine-to-
// region mapping below ever changes.

import { geoNaturalEarth1, geoPath } from 'd3-geo';
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
  Brazil: { group: 'brazilian', cuisines: ['brazilian'] },
  Russia: { group: 'russian', cuisines: ['russian'] },
  Germany: { group: 'german', cuisines: ['german'] },
  Argentina: { group: 'argentinian', cuisines: ['argentinian'] },
  // Central America - distinct enough from Mexican cuisine (and from each
  // other) to get its own cluster rather than folding into 'mexican'.
  Guatemala: { group: 'central-american', cuisines: ['central-american'] },
  Belize: { group: 'central-american', cuisines: ['central-american'] },
  Honduras: { group: 'central-american', cuisines: ['central-american'] },
  'El Salvador': { group: 'central-american', cuisines: ['central-american'] },
  Nicaragua: { group: 'central-american', cuisines: ['central-american'] },
  'Costa Rica': { group: 'central-american', cuisines: ['central-american'] },
  Panama: { group: 'central-american', cuisines: ['central-american'] },
  // More South American countries, each its own dedicated group rather
  // than folded into a neighbor - Peru/Brazil/Argentina already set that
  // precedent, and lumping (e.g. Chile under 'argentinian') was tried and
  // explicitly rejected before.
  Chile: { group: 'chilean', cuisines: ['chilean'] },
  Paraguay: { group: 'paraguayan', cuisines: ['paraguayan'] },
  Uruguay: { group: 'uruguayan', cuisines: ['uruguayan'] },
  Bolivia: { group: 'bolivian', cuisines: ['bolivian'] },
  Colombia: { group: 'colombian', cuisines: ['colombian'] },
  Ecuador: { group: 'ecuadorian', cuisines: ['ecuadorian'] },
  Venezuela: { group: 'venezuelan', cuisines: ['venezuelan'] },
  Guyana: { group: 'guyanese', cuisines: ['guyanese'] },
  Suriname: { group: 'surinamese', cuisines: ['surinamese'] },
  // French Guiana has no recipes registered to a map group - it isn't a
  // separate feature in this world-atlas dataset at all (it's absorbed
  // into France's polygon, since it's legally a French overseas
  // territory rather than an independent country), so there's no shape
  // to color for it regardless of cuisine tagging.
  Canada: { group: 'canadian', cuisines: ['canadian'] },
  Australia: { group: 'australian', cuisines: ['australian'] },
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

// US states: the simplest possible approach turns out to be the right
// one - project each state directly through the SAME Natural Earth 1
// `path` used for every other country on the map, from us-atlas (already
// imported above, previously only used for the fallback). Since Canada,
// Mexico, and the states all end up traced through the identical
// projection, they align exactly where their real borders touch - no
// stitching or correction required.
//
// This replaces a much more elaborate previous approach: sourcing state
// shapes from an external, hand-traced "blank map" SVG, fitting its
// aggregate bounding box to the world map's continental-US box, then
// surgically snapping specific vertices back onto the real Canada/Mexico
// border to close gaps the external source's own distortion left behind
// (up to ~16 units in places, plus one narrower case - Texas's Rio
// Grande - needing a nearest-point match against Mexico's own boundary
// since it isn't a straight line). All of that apparatus existed only to
// work around geoAlbersUsa: a projection specifically built to make the
// continental US look good in isolation, which is exactly why it never
// naturally tiled with a Natural-Earth-1-projected Canada and Mexico.
// Dropping geoAlbersUsa for the states in favor of projecting the same
// real geography everything else already uses removed the problem at the
// source: measured borders now come out touching at 0.0000 units, no
// manual correction needed anywhere (Wisconsin's ~3.5 unit gap to Canada
// is correctly real - Lake Superior is genuinely between them).
//
// Alaska is the one exception - its Aleutian Islands cross the
// antimeridian, and this projection handles that badly if pulled directly
// from us-atlas (islands end up scattered near the opposite edge of the
// map). It's already handled above in true position, extracted from the
// world dataset's own US polygon, same as Hawaii - so it's skipped here.
const usStatesGeo = feature(usTopo, usTopo.objects.states).features;
// us-atlas includes Pacific/Caribbean territories (Guam, American Samoa,
// Northern Mariana Islands, Puerto Rico, US Virgin Islands) at their true,
// far-flung positions - Guam alone would render clear across the map near
// Japan. Puerto Rico is already handled as its own country (Caribbean
// group); the rest aren't part of any cuisine group here, so exclude all
// five rather than let them render as stray, uncolored shapes far from
// the continental US.
const NON_STATE_TERRITORIES = new Set([
  'American Samoa', 'Guam', 'Commonwealth of the Northern Mariana Islands',
  'Puerto Rico', 'United States Virgin Islands',
]);
for (const f of usStatesGeo) {
  const name = f.properties.name;
  if (name === 'Alaska' || name === 'Hawaii') continue; // already added above in true position
  if (NON_STATE_TERRITORIES.has(name)) continue;
  const d = path(f);
  if (!d) continue;
  shapes.push({
    id: `state-${f.id}`,
    name,
    d,
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
console.log('Unclaimed countries (gray, not clickable):', worldGeo.features.filter((f) => f.properties.name !== 'United States of America' && !COUNTRY_GROUPS[f.properties.name]).length);
