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
  // Generic "asian" catch-all cluster - nearby countries not otherwise claimed
  Malaysia: { group: 'asian', cuisines: ['asian'] },
  Indonesia: { group: 'asian', cuisines: ['asian'] },
  Philippines: { group: 'asian', cuisines: ['asian'] },
  Myanmar: { group: 'asian', cuisines: ['asian'] },
  Cambodia: { group: 'asian', cuisines: ['asian'] },
  Laos: { group: 'asian', cuisines: ['asian'] },
  Taiwan: { group: 'asian', cuisines: ['asian'] },
};

// United States: every state belongs to the broad "usa" group (american +
// southern), EXCEPT New Mexico, which is its own micro-region. New Mexico
// ALSO carries 'usa' as a secondary group so it still lights up when the
// broad US region is what's active (hovering Colorado highlights the
// whole country, New Mexico included) - but hovering New Mexico directly
// resolves to its own smaller group first, since the component always
// picks the group with the fewest members among a shape's groups.
function usGroupsFor(stateName) {
  return stateName === 'New Mexico' ? ['new-mexico', 'usa'] : ['usa'];
}
function usCuisinesFor(stateName) {
  return stateName === 'New Mexico' ? ['new-mexico'] : ['american', 'southern'];
}

const worldGeo = feature(worldTopo, worldTopo.objects.countries);
const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], worldGeo);
const path = geoPath(projection);

const shapes = [];

// World countries, skipping the low-res "United States of America" blob -
// real individual states replace it below.
for (const f of worldGeo.features) {
  const name = f.properties.name;
  if (name === 'United States of America') continue;
  const d = path(f);
  if (!d) continue;
  const mapped = COUNTRY_GROUPS[name];
  shapes.push({
    id: `country-${f.id}`,
    name,
    d,
    groups: mapped ? [mapped.group] : null, // null = unclaimed, not clickable
    cuisines: mapped ? mapped.cuisines : null,
    kind: 'country',
  });
}

// US states: geoAlbersUsa is the standard projection for exactly this case
// (continental US normal, Alaska/Hawaii as correctly-scaled insets) - fit
// into a hand-placed box sized/positioned to sit where the US actually
// belongs on the world canvas above (verified visually).
const usStatesGeo = feature(usTopo, usTopo.objects.states).features;
const US_BOX = { x: 55, y: 55, width: 215, height: 145 };
const usProjection = geoAlbersUsa().fitSize(
  [US_BOX.width, US_BOX.height],
  { type: 'FeatureCollection', features: usStatesGeo }
);
const usPathGen = geoPath(usProjection);

for (const f of usStatesGeo) {
  const name = f.properties.name;
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
console.log('Unclaimed countries (gray, not clickable):', worldGeo.features.filter((f) => f.properties.name !== 'United States of America' && !COUNTRY_GROUPS[f.properties.name]).length);
