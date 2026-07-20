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
  Lebanon: { group: 'lebanese', cuisines: ['lebanese'] },
  Israel: { group: 'israeli', cuisines: ['israeli'] },
  Jordan: { group: 'jordanian', cuisines: ['jordanian'] },
  Turkey: { group: 'turkish', cuisines: ['turkish'] },
  'Saudi Arabia': { group: 'saudi', cuisines: ['saudi'] },
  Syria: { group: 'syrian', cuisines: ['syrian'] },
  Palestine: { group: 'palestinian', cuisines: ['palestinian'] },
  // Southeast Asian cluster - Taiwan intentionally excluded, since it isn't
  // part of Southeast Asia and lumping it in would repeat the same
  // inaccurate-labeling problem this rename was meant to fix.
  Malaysia: { group: 'malaysian', cuisines: ['malaysian'] },
  Indonesia: { group: 'indonesian', cuisines: ['indonesian'] },
  Philippines: { group: 'filipino', cuisines: ['filipino'] },
  Myanmar: { group: 'burmese', cuisines: ['burmese'] },
  Cambodia: { group: 'cambodian', cuisines: ['cambodian'] },
  Laos: { group: 'laotian', cuisines: ['laotian'] },
  Brunei: { group: 'bruneian', cuisines: ['bruneian'] },
  'Papua New Guinea': { group: 'papua-new-guinean', cuisines: ['papua-new-guinean'] },
  // New Guinea itself isn't a separate country in this dataset - it's the
  // island, split between Indonesia's western half (Papua/West Papua
  // provinces, covered above) and Papua New Guinea's eastern half
  // (also covered above). There's no third shape to assign a group to.
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
  Guatemala: { group: 'guatemalan', cuisines: ['guatemalan'] },
  Belize: { group: 'belizean', cuisines: ['belizean'] },
  Honduras: { group: 'honduran', cuisines: ['honduran'] },
  'El Salvador': { group: 'salvadoran', cuisines: ['salvadoran'] },
  Nicaragua: { group: 'nicaraguan', cuisines: ['nicaraguan'] },
  'Costa Rica': { group: 'costa-rican', cuisines: ['costa-rican'] },
  Panama: { group: 'panamanian', cuisines: ['panamanian'] },
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
  // French Guiana is extracted from France's MultiPolygon as its own
  // standalone shape further below (same ring-centroid technique used for
  // Alaska/Hawaii), since its cuisine is genuinely distinct from mainland
  // France's despite the territorial status.
  Canada: { group: 'canadian', cuisines: ['canadian'] },
  Australia: { group: 'australian', cuisines: ['australian'] },
  'New Zealand': { group: 'new-zealander', cuisines: ['new-zealander'] },
  Poland: { group: 'polish', cuisines: ['polish'] },
  Portugal: { group: 'portuguese', cuisines: ['portuguese'] },
  Ireland: { group: 'irish', cuisines: ['irish'] },
  Sweden: { group: 'swedish', cuisines: ['swedish'] },
  Switzerland: { group: 'swiss', cuisines: ['swiss'] },
  // Greenland and Antarctica are easter eggs, not real cuisine content -
  // clicking them is special-cased by name in CuisineWorldMap.js to show
  // a joke image instead of filtering recipes. They still need a truthy
  // `groups` entry here so the map treats them as clickable/colored.
  Greenland: { group: 'greenland', cuisines: ['greenland'] },
  Antarctica: { group: 'antarctica', cuisines: ['antarctica'] },
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

// Regional drill-down maps: some clusters (Middle East, Southeast Asia)
// contain several countries too small to comfortably click on a full
// world map. Rather than force them to share one color/behavior, each
// gets its own zoomed-in sub-map, generated by re-fitting a fresh
// projection to ONLY that cluster's geometry - the same countries render
// far larger since they're no longer sharing space with the whole globe.
const REGIONS = {
  'middle-east': {
    label: 'Middle East',
    countries: ['Lebanon', 'Israel', 'Jordan', 'Turkey', 'Saudi Arabia', 'Syria', 'Palestine'],
    width: 800,
    height: 620,
  },
  'southeast-asia': {
    label: 'Southeast Asia',
    countries: ['Myanmar', 'Laos', 'Cambodia', 'Thailand', 'Malaysia', 'Brunei', 'Indonesia', 'Philippines', 'Papua New Guinea'],
    width: 1000,
    height: 560,
  },
  'central-america': {
    label: 'Central America',
    countries: ['Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama'],
    width: 700,
    height: 620,
  },
};

function generateRegionShapes(countryNames, regionWidth, regionHeight) {
  const features = countryNames
    .map((name) => worldGeo.features.find((f) => f.properties.name === name))
    .filter(Boolean);
  const collection = { type: 'FeatureCollection', features };
  const regionProjection = geoNaturalEarth1().fitSize([regionWidth, regionHeight], collection);
  const regionPath = geoPath(regionProjection);
  const regionShapes = [];
  for (const f of features) {
    const name = f.properties.name;
    const d = regionPath(f);
    if (!d) continue;
    const mapped = COUNTRY_GROUPS[name];
    regionShapes.push({
      id: `region-country-${f.id ?? name}`,
      name,
      d,
      groups: mapped ? [mapped.group] : null,
      cuisines: mapped ? mapped.cuisines : null,
      kind: 'country',
    });
  }
  return regionShapes;
}

const regionShapeSets = {};
for (const [regionKey, config] of Object.entries(REGIONS)) {
  regionShapeSets[regionKey] = {
    shapes: generateRegionShapes(config.countries, config.width, config.height),
    width: config.width,
    height: config.height,
  };
}

// Reverse lookup so the main world-map loop can tag each country with
// which region it belongs to (if any) - drives the "click opens the
// zoomed regional map instead of filtering directly" behavior.
const countryToRegion = {};
for (const [regionKey, config] of Object.entries(REGIONS)) {
  for (const name of config.countries) countryToRegion[name] = regionKey;
}

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
    region: countryToRegion[name] ?? null,
  });
}

// France's MultiPolygon includes French Guiana as a genuinely separate
// ring (confirmed by its own lon/lat centroid, roughly lon=-53, lat=4 -
// unmistakably South America, nowhere near mainland France or Corsica).
// Its cuisine is distinct enough from mainland France's to warrant its
// own shape and color, so extract it the same way Alaska/Hawaii are
// pulled out of the US's MultiPolygon below, rather than letting
// mainlandOnly() discard it along with Corsica.
const franceFeature = worldGeo.features.find((f) => f.properties.name === 'France');
function ringCentroidGeneric(ring) {
  let sx = 0, sy = 0, n = 0;
  for (const point of ring[0]) { sx += point[0]; sy += point[1]; n++; }
  return [sx / n, sy / n];
}
const frenchGuianaRings = [];
for (const ring of franceFeature.geometry.coordinates) {
  const [lon, lat] = ringCentroidGeneric(ring);
  if (lon < -40 && lat > -5 && lat < 15) frenchGuianaRings.push(ring);
}
if (frenchGuianaRings.length > 0) {
  const fgFeature = { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: frenchGuianaRings }, properties: {} };
  const fgPath = path(fgFeature);
  if (fgPath) {
    shapes.push({
      id: 'country-french-guiana',
      name: 'French Guiana',
      d: fgPath,
      groups: ['french-guianese'],
      cuisines: ['french-guianese'],
      kind: 'country',
    });
  }
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
const regionMeta = Object.fromEntries(
  Object.entries(REGIONS).map(([key, config]) => [key, { label: config.label, width: config.width, height: config.height }])
);
const output = `// AUTO-GENERATED by scripts/generate-map-data.mjs — do not hand-edit.
// Real country + US state boundaries, simplified and projected to SVG paths,
// tagged with cuisine hover-groups. Re-run the generator script if the
// cuisine-to-region mapping changes.
export const MAP_WIDTH = ${WIDTH};
export const MAP_HEIGHT = ${HEIGHT};
export const MAP_SHAPES = ${JSON.stringify(shapes)};

// Regional drill-down maps (zoomed sub-views for country clusters too
// small to click comfortably on the full world map). REGION_META has the
// label/width/height per region; REGION_SHAPES has each region's own
// zoomed shape array, keyed the same way.
export const REGION_META = ${JSON.stringify(regionMeta)};
export const REGION_SHAPES = ${JSON.stringify(Object.fromEntries(Object.entries(regionShapeSets).map(([k, v]) => [k, v.shapes])))};
`;

fs.writeFileSync('lib/mapShapes.js', output);
console.log(`Generated ${shapes.length} shapes (${worldCountryCount} countries, ${usStatesGeo.length} US states) -> lib/mapShapes.js`);
console.log('Unclaimed countries (gray, not clickable):', worldGeo.features.filter((f) => f.properties.name !== 'United States of America' && !COUNTRY_GROUPS[f.properties.name]).length);
for (const [key, set] of Object.entries(regionShapeSets)) {
  console.log(`Region "${key}": ${set.shapes.length} shapes at ${set.width}x${set.height}`);
}

