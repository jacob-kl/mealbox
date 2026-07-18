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
  'middle-eastern': '#C99A4A',
  indian: '#CC5B2E',
  chinese: '#B23A55',
  japanese: '#D88FA3',
  korean: '#4E7B8B',
  thai: '#8B5FBF',
  vietnamese: '#8FA83E',
  'southeast-asian': '#C4A63E',
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
};

/**
 * @param {(cuisines: string[], label: string) => void} onSelect - called
 *   with the cuisine slug(s) for the clicked region and a human label
 */
export default function CuisineWorldMap({ onSelect }) {
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

          return (
            <path
              key={shape.id}
              d={shape.d}
              transform={transform}
              fill={fill}
              stroke={shape.kind === 'state' ? '#FFFFFF' : '#8FA3AD'}
              strokeWidth={shape.kind === 'state' ? 0.6 : 0.5}
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
                onSelect(shape.cuisines, labelFor(shape.cuisines));
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
