'use client';

import { useMemo, useState } from 'react';
import { MAP_SHAPES, MAP_WIDTH, MAP_HEIGHT } from '@/lib/mapShapes';

// Every shape belongs to one or more "hover groups" (see generate-map-data
// script). When several shapes belong to the same group they act as one
// region: hover or click any member and the whole group responds together.
// A shape that belongs to more than one group (only New Mexico, currently -
// it's both its own micro-region AND part of the broader "usa" group)
// resolves to whichever of its groups has the FEWEST members, so hovering
// New Mexico directly picks the small 'new-mexico' group, while hovering
// any other state picks the big 'usa' group, which New Mexico still
// belongs to and lights up as part of.
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

/**
 * @param {(cuisines: string[], label: string) => void} onSelect - called
 *   with the cuisine slug(s) for the clicked region and a human label
 */
export default function CuisineWorldMap({ onSelect }) {
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const [hoveredLabel, setHoveredLabel] = useState(null);

  const groupSizes = useMemo(() => computeGroupSizes(MAP_SHAPES), []);

  return (
    <div className="index-card p-3 sm:p-5">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="tab-label text-rust">Browse by region</p>
        <p className="text-xs text-ink/50 h-4">{hoveredLabel || ''}</p>
      </div>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="w-full h-auto rounded-card"
        style={{ background: 'rgb(var(--color-line) / 0.25)' }}
        onMouseLeave={() => {
          setHoveredGroup(null);
          setHoveredLabel(null);
        }}
      >
        {MAP_SHAPES.map((shape) => {
          const clickable = !!shape.groups;
          const activeGroup = clickable ? mostSpecificGroup(shape, groupSizes) : null;
          const isActive = clickable && hoveredGroup === activeGroup;
          const isDimmed = hoveredGroup && !isActive;
          const transform = shape.translateX != null ? `translate(${shape.translateX},${shape.translateY})` : undefined;

          let fill;
          if (!clickable) {
            fill = 'rgb(var(--color-line) / 0.7)';
          } else if (isActive) {
            fill = 'rgb(var(--color-rust))';
          } else {
            fill = 'rgb(var(--color-rust) / 0.5)';
          }

          return (
            <path
              key={shape.id}
              d={shape.d}
              transform={transform}
              fill={fill}
              stroke={shape.kind === 'state' ? 'rgb(var(--color-paper))' : 'rgb(var(--color-ink) / 0.15)'}
              strokeWidth={shape.kind === 'state' ? 0.6 : 0.5}
              opacity={isDimmed ? 0.28 : 1}
              style={{ cursor: clickable ? 'pointer' : 'default', transition: 'opacity 0.15s, fill 0.15s' }}
              onMouseEnter={() => {
                if (!clickable) return;
                setHoveredGroup(activeGroup);
                setHoveredLabel(activeGroup === 'usa' ? 'United States' : activeGroup === 'new-mexico' ? 'New Mexico' : shape.name);
              }}
              onClick={() => {
                if (!clickable) return;
                const label = activeGroup === 'usa' ? 'United States' : activeGroup === 'new-mexico' ? 'New Mexico' : shape.name;
                onSelect(shape.cuisines, label);
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
