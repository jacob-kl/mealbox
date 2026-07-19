'use client';

import { useMemo, useState } from 'react';
import { MAP_SHAPES, MAP_WIDTH, MAP_HEIGHT } from '@/lib/mapShapes';
import { cuisineLabel } from '@/components/ui';

// Every shape belongs to one or more "hover groups" (see generate-map-data
// script). When several shapes belong to the same group they act as one
// region: hover or click any member and the whole group responds together.
// A shape that belongs to more than one group (New Mexico and the Southern
// states - each is both its own micro-region AND part of the broader "usa"
// group) resolves to whichever of its groups has the FEWEST members, so
// hovering New Mexico directly picks the small 'new-mexico' group, while
// hovering any other state picks the big 'usa' group, which New Mexico
// and the Southern states still belong to and light up as part of.
// Some shapes (like Palestine's West Bank/Gaza polygon in this
// low-resolution 110m dataset) are so small that the standard stroke
// width visually consumes the entire fill area, making the fill color
// unreadable no matter what it's set to. This computes an approximate
// bounding-box diagonal from the path's coordinate pairs so genuinely
// tiny shapes can get a proportionally thinner outline instead.
function shapeBoundingDiagonal(d) {
  const coords = d.match(/-?\d+\.?\d*/g);
  if (!coords || coords.length < 4) return Infinity;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < coords.length - 1; i += 2) {
    const x = parseFloat(coords[i]);
    const y = parseFloat(coords[i + 1]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
}

function computeGroupSizes(shapes) {
  const sizes = {};
  for (const s of shapes) {
    if (!s.groups) continue;
    for (const g of s.groups) sizes[g] = (sizes[g] || 0) + 1;
  }
  return sizes;
}

function mostSpecificGroup(shape, groupSizes) {
  if (!shape.groups?.length) return null;
  return shape.groups.reduce((best, g) => (groupSizes[g] < groupSizes[best] ? g : best), shape.groups[0]);
}

// Each region gets its own distinct color rather than one shared accent -
// grouped so that geographically-adjacent regions (e.g. Italy/France/Spain
// in Europe) stay visually distinct from their neighbors.
const GROUP_COLORS = {
  usa: '#4A7FB5',
  southern: '#4CA771',
  'new-mexico': '#C0392B',
  mexican: '#E0A028',
  caribbean: '#8B4A6B',
  italian: '#D4714A',
  french: '#6C7FD1',
  spanish: '#B8863B',
  mediterranean: '#3FA7A0',
  indian: '#CC5B2E',
  chinese: '#B23A55',
  japanese: '#D88FA3',
  korean: '#4E7B8B',
  thai: '#8B5FBF',
  vietnamese: '#8FA83E',
  'north-african': '#CC3333',
  'west-african': '#3FA05C',
  'east-african': '#D6673E',
  'central-african': '#7B5EA7',
  'south-african': '#3E8FA0',
  mongolian: '#A67C52',
  peruvian: '#C0473E',
  brazilian: '#4A9B4E',
  russian: '#8B4A6B',
  german: '#D4A83E',
  argentinian: '#5B8DD9',
  hawaiian: '#E0757A',
  'central-american': '#8B6F47',
  chilean: '#A6467E',
  paraguayan: '#C4A93E',
  uruguayan: '#4AACA0',
  bolivian: '#D68C45',
  colombian: '#E0785A',
  ecuadorian: '#7A93D4',
  venezuelan: '#B83A3A',
  guyanese: '#E8C547',
  surinamese: '#9B5FA8',
  canadian: '#D14545',
  australian: '#C77D3F',
  'new-zealander': '#4A9B85',
  polish: '#5B7A99',
  portuguese: '#2E6B8A',
  irish: '#3F8F4A',
  swedish: '#4A6FA5',
  swiss: '#8B2942',
  burmese: '#D4A843',
  laotian: '#4A9B7A',
  cambodian: '#C25B3A',
  malaysian: '#3D5FA8',
  bruneian: '#D9B33D',
  indonesian: '#A8344A',
  filipino: '#5BA8D9',
  'papua-new-guinean': '#6B4A8A',
  greenland: '#A8D4E8',
  antarctica: '#3D5566',
  lebanese: '#3D7A4A',
  israeli: '#3D6FA8',
  jordanian: '#B8622E',
  turkish: '#C23B3B',
  saudi: '#2D8659',
  syrian: '#8A3838',
  palestinian: '#7A4A8A',
};

/**
 * @param {(cuisines: string[], label: string) => void} onSelect - called
 *   with the cuisine slug(s) for the clicked region and a human label
 */
export default function CuisineWorldMap({ onSelect, onEasterEgg }) {
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const [hoveredLabel, setHoveredLabel] = useState(null);

  const groupSizes = useMemo(() => computeGroupSizes(MAP_SHAPES), []);

  function labelFor(cuisines) {
    return cuisines.map(cuisineLabel).join(' & ');
  }

  return (
    <div className="index-card p-3 sm:p-5">
      <div className="mb-3 px-1">
        <p className="tab-label text-rust mb-1">Browse by region</p>
        <p
          className="font-display text-2xl sm:text-3xl leading-tight transition-opacity duration-150"
          style={{ opacity: hoveredLabel ? 1 : 0, minHeight: '1.5em' }}
        >
          {hoveredLabel || '\u00A0'}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="w-full h-auto rounded-card"
        onMouseLeave={() => {
          setHoveredGroup(null);
          setHoveredLabel(null);
        }}
      >
        {/* Literal colors throughout below - CSS custom properties (var(--x))
            don't reliably resolve when set directly as SVG fill/stroke
            presentation attributes, so this stays independent of the theme. */}
        <rect
          x={0}
          y={0}
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
          fill="#BEDCEA"
          onMouseEnter={() => {
            setHoveredGroup(null);
            setHoveredLabel(null);
          }}
        />
        {MAP_SHAPES.map((shape) => {
          const clickable = !!shape.groups;
          const activeGroup = clickable ? mostSpecificGroup(shape, groupSizes) : null;
          const isActive = clickable && hoveredGroup === activeGroup;
          const isDimmed = hoveredGroup && !isActive;
          const transform = shape.translateX != null ? `translate(${shape.translateX},${shape.translateY})` : undefined;

          const fill = clickable ? GROUP_COLORS[activeGroup] || '#999999' : '#FFFFFF';
          const baseStrokeWidth = shape.kind === 'state' ? 0.6 : 0.5;
          const isTinyShape = shape.kind !== 'state' && shapeBoundingDiagonal(shape.d) < 6;
          const strokeWidth = isTinyShape ? baseStrokeWidth * 0.15 : baseStrokeWidth;

          return (
            <path
              key={shape.id}
              d={shape.d}
              transform={transform}
              fill={fill}
              stroke={shape.kind === 'state' ? '#FFFFFF' : '#8FA3AD'}
              strokeWidth={strokeWidth}
              opacity={isDimmed ? 0.3 : 1}
              style={{ cursor: clickable ? 'pointer' : 'default', transition: 'opacity 0.15s' }}
              onMouseEnter={() => {
                // Unclaimed countries still need to clear any previous
                // selection on hover - otherwise moving off a colored
                // region onto blank land leaves the old highlight stuck.
                if (!clickable) {
                  setHoveredGroup(null);
                  setHoveredLabel(null);
                  return;
                }
                setHoveredGroup(activeGroup);
                setHoveredLabel(labelFor(shape.cuisines));
              }}
              onClick={() => {
                if (!clickable) return;
                if (shape.name === 'Greenland' || shape.name === 'Antarctica') {
                  onEasterEgg(shape.name);
                  return;
                }
                onSelect(shape.cuisines, labelFor(shape.cuisines));
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
