'use client';

import { useState } from 'react';
import { flagFor } from '@/lib/cuisineFlags';
import { cuisineLabel } from '@/components/ui';

// Loosely world-positioned "region cards" rather than literal coastlines —
// this fits the app's existing card-based recipe-box aesthetic better than
// attempting real geography, and reads clearly at any zoom level.
const REGIONS = [
  {
    name: 'North America',
    x: 30, y: 30, w: 230, h: 160,
    pins: [
      { cuisine: 'american', x: 70, y: 110 },
      { cuisine: 'southern', x: 145, y: 110 },
      { cuisine: 'new-mexico', x: 220, y: 110 },
    ],
  },
  {
    name: 'Mexico & Caribbean',
    x: 90, y: 210, w: 200, h: 100,
    pins: [
      { cuisine: 'mexican', x: 140, y: 260 },
      { cuisine: 'caribbean', x: 240, y: 260 },
    ],
  },
  {
    name: 'Europe',
    x: 390, y: 20, w: 170, h: 120,
    pins: [
      { cuisine: 'italian', x: 418, y: 80 },
      { cuisine: 'french', x: 475, y: 80 },
      { cuisine: 'spanish', x: 532, y: 80 },
    ],
  },
  {
    name: 'Mediterranean & Middle East',
    x: 420, y: 160, w: 230, h: 100,
    pins: [
      { cuisine: 'mediterranean', x: 478, y: 210 },
      { cuisine: 'middle-eastern', x: 593, y: 210 },
    ],
  },
  {
    name: 'South Asia',
    x: 670, y: 190, w: 140, h: 120,
    pins: [{ cuisine: 'indian', x: 740, y: 250 }],
  },
  {
    name: 'East Asia',
    x: 760, y: 20, w: 210, h: 140,
    pins: [
      { cuisine: 'chinese', x: 795, y: 90 },
      { cuisine: 'japanese', x: 865, y: 90 },
      { cuisine: 'korean', x: 935, y: 90 },
    ],
  },
  {
    name: 'Southeast Asia',
    x: 790, y: 180, w: 190, h: 120,
    pins: [
      { cuisine: 'thai', x: 822, y: 240 },
      { cuisine: 'vietnamese', x: 885, y: 240 },
      { cuisine: 'asian', x: 948, y: 240 },
    ],
  },
];

/**
 * @param {string[]} cuisinesPresent - which cuisine slugs actually have recipes
 * @param {(cuisine: string) => void} onSelect
 */
export default function CuisineWorldMap({ cuisinesPresent, onSelect }) {
  const [hoveredPin, setHoveredPin] = useState(null);

  return (
    <div className="index-card p-4 sm:p-6 mb-4">
      <svg viewBox="0 0 1010 340" className="w-full h-auto" role="img" aria-label="Map of cuisines, tap a flag to browse that cuisine">
        <defs>
          <pattern id="mapDots" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="rgb(var(--color-ink) / 0.06)" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="1010" height="340" rx="16" fill="rgb(var(--color-paper))" />
        <rect x="0" y="0" width="1010" height="340" rx="16" fill="url(#mapDots)" />

        {REGIONS.map((region) => {
          const activePins = region.pins.filter((p) => cuisinesPresent.includes(p.cuisine));
          if (!activePins.length) return null;
          return (
            <g key={region.name}>
              <rect
                x={region.x}
                y={region.y}
                width={region.w}
                height={region.h}
                rx={28}
                fill="rgb(var(--color-card))"
                stroke="rgb(var(--color-line))"
                strokeWidth="1.5"
              />
              <text
                x={region.x + region.w / 2}
                y={region.y + 20}
                textAnchor="middle"
                fontSize="11"
                letterSpacing="0.06em"
                fill="rgb(var(--color-ink) / 0.45)"
                style={{ textTransform: 'uppercase' }}
              >
                {region.name}
              </text>
              {activePins.map((pin) => {
                const isHovered = hoveredPin === pin.cuisine;
                return (
                  <g
                    key={pin.cuisine}
                    onClick={() => onSelect(pin.cuisine)}
                    onMouseEnter={() => setHoveredPin(pin.cuisine)}
                    onMouseLeave={() => setHoveredPin(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={pin.x}
                      cy={pin.y}
                      r={isHovered ? 24 : 22}
                      fill="rgb(var(--color-card))"
                      stroke="rgb(var(--color-rust))"
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      style={{ transition: 'r 0.15s, stroke-width 0.15s' }}
                    />
                    <text x={pin.x} y={pin.y + 8} textAnchor="middle" fontSize="22" style={{ pointerEvents: 'none' }}>
                      {flagFor(pin.cuisine)}
                    </text>
                    <text
                      x={pin.x}
                      y={pin.y + 40}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={isHovered ? 700 : 500}
                      fill={isHovered ? 'rgb(var(--color-rust))' : 'rgb(var(--color-ink) / 0.7)'}
                      style={{ pointerEvents: 'none' }}
                    >
                      {cuisineLabel(pin.cuisine)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
