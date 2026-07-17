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
  // West Africa cluster
  Nigeria: { group: 'west-african', cuisines: ['west-african'] },
  Ghana: { group: 'west-african', cuisines: ['west-african'] },
  Senegal: { group: 'west-african', cuisines: ['west-african'] },
  "Côte d'Ivoire": { group: 'west-african', cuisines: ['west-african'] },
  Mali: { group: 'west-african', cuisines: ['west-african'] },
  Guinea: { group: 'west-african', cuisines: ['west-african'] },
  'Burkina Faso': { group: 'west-african', cuisines: ['west-african'] },
  'Guinea-Bissau': { group: 'west-african', cuisines: ['west-african'] },
  // East Africa cluster
  Ethiopia: { group: 'east-african', cuisines: ['east-african'] },
  Kenya: { group: 'east-african', cuisines: ['east-african'] },
  Tanzania: { group: 'east-african', cuisines: ['east-african'] },
  Uganda: { group: 'east-african', cuisines: ['east-african'] },
  Somalia: { group: 'east-african', cuisines: ['east-african'] },
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
  // Single-country cuisines added later
  Mongolia: { group: 'mongolian', cuisines: ['mongolian'] },
  Peru: { group: 'peruvian', cuisines: ['peruvian'] },
  Brazil: { group: 'brazilian', cuisines: ['brazilian'] },
  Russia: { group: 'russian', cuisines: ['russian'] },
  Germany: { group: 'german', cuisines: ['german'] },
  Argentina: { group: 'argentinian', cuisines: ['argentinian'] },
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
for (const [label, rings] of [['Alaska', alaskaRings], ['Hawaii', hawaiiRings]]) {
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

// Precise, real state boundaries sourced from Wikimedia Commons (see
// scripts/extract-wiki-states.py) for the 45 states it cleanly covers -
// already pre-aligned into this exact 960x500 world coordinate space, no
// further transform needed. Alaska and Hawaii were already added above in
// their true position. The remaining 3 (Louisiana, Massachusetts,
// Washington) fall back to geoAlbersUsa below.
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
let wikiStates = {};
try {
  wikiStates = JSON.parse(fs.readFileSync('scripts/wiki-states-aligned.json', 'utf8'));
} catch {
  console.warn('No wiki-states-aligned.json found - all states will use geoAlbersUsa fallback');
}

let wikiCount = 0;
for (const f of usStatesGeo) {
  const name = f.properties.name;
  if (name === 'Alaska' || name === 'Hawaii') continue; // already added above in true position
  const abbr = NAME_TO_ABBR[name];
  const wikiPaths = abbr && wikiStates[abbr];

  if (wikiPaths?.length) {
    wikiCount++;
    for (let i = 0; i < wikiPaths.length; i++) {
      shapes.push({
        id: `state-${f.id}${i > 0 ? `-${i}` : ''}`,
        name,
        d: wikiPaths[i],
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
console.log(`  ${wikiCount} states from precise Wikimedia source, ${usStatesGeo.length - wikiCount} from geoAlbersUsa fallback`);
console.log('Unclaimed countries (gray, not clickable):', worldGeo.features.filter((f) => f.properties.name !== 'United States of America' && !COUNTRY_GROUPS[f.properties.name]).length);
