import { readFile, writeFile } from 'node:fs/promises';

const MAPSHAPES_FILE = 'lib/mapShapes.js';
const mapRaw = await readFile(MAPSHAPES_FILE, 'utf-8');
const mapLines = mapRaw.split('\n');
let mapShapesFound = false;
const mapUpdated = mapLines.map((line) => {
  const prefix = 'export const MAP_SHAPES = ';
  if (line.startsWith(prefix)) {
    mapShapesFound = true;
    const shapes = JSON.parse(line.slice(prefix.length, -1));
    const iceland = shapes.find((s) => s.name === 'Iceland');
    if (!iceland) throw new Error('Iceland shape not found in MAP_SHAPES');
    if (iceland.groups !== null || iceland.cuisines !== null) {
      console.log('Iceland already tagged:', JSON.stringify(iceland.groups), JSON.stringify(iceland.cuisines), '- leaving as is.');
    } else {
      iceland.groups = ['icelandic'];
      iceland.cuisines = ['icelandic'];
      console.log('Tagged Iceland with icelandic cuisine.');
    }
    return prefix + JSON.stringify(shapes) + ';';
  }
  return line;
});
if (!mapShapesFound) throw new Error('MAP_SHAPES line not found.');
await writeFile(MAPSHAPES_FILE, mapUpdated.join('\n'));

const COLORS_FILE = 'components/CuisineWorldMap.js';
const colorsRaw = await readFile(COLORS_FILE, 'utf-8');
const ANCHOR = "  irish: '#3F8F4A',\n";
if (!colorsRaw.includes(ANCHOR)) {
  throw new Error('Could not find the anchor line for irish color - has components/CuisineWorldMap.js changed?');
}
if (colorsRaw.includes('icelandic:')) {
  console.log('icelandic color already present - skipping.');
} else {
  const INSERT = "  icelandic: '#5B8FA8',\n";
  const colorsUpdated = colorsRaw.replace(ANCHOR, ANCHOR + INSERT);
  await writeFile(COLORS_FILE, colorsUpdated);
  console.log('Added icelandic color to GROUP_COLORS.');
}

console.log('Done.');
