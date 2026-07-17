'use client';

import { useEffect, useState } from 'react';

export const THEMES = [
  { id: 'harvest', label: 'Harvest', blurb: 'Warm recipe-box classic', from: '#C1502E', to: '#D9A441' },
  { id: 'citrus', label: 'Citrus', blurb: 'Bold & modern', from: '#F0641E', to: '#0E8A7D' },
  { id: 'berry', label: 'Berry', blurb: 'Soft & playful', from: '#D6336C', to: '#6C3483' },
  { id: 'ocean', label: 'Ocean', blurb: 'Clean & breezy', from: '#FF6B5B', to: '#12677A' },
  { id: 'forest', label: 'Forest', blurb: 'Woodland green', from: '#B45309', to: '#2D5A3D' },
  { id: 'olive', label: 'Olive', blurb: 'Muted khaki', from: '#A16207', to: '#6B7223' },
  { id: 'sunflower', label: 'Sunflower', blurb: 'Bright & bold', from: '#CA8A04', to: '#1E3A8A' },
  { id: 'desert', label: 'Desert', blurb: 'Terracotta & turquoise', from: '#C2410C', to: '#0D9488' },
  { id: 'coral', label: 'Coral', blurb: 'Beachy & warm', from: '#FF6F61', to: '#14B8A6' },
  { id: 'charcoal', label: 'Charcoal', blurb: 'Dark, high contrast', from: '#A3E635', to: '#38BDF8' },
  { id: 'blush', label: 'Blush', blurb: 'Soft pink & violet', from: '#EC4899', to: '#8B5CF6' },
  { id: 'lavender', label: 'Lavender', blurb: 'Purple & sage', from: '#9333EA', to: '#65A30D' },
  { id: 'plum', label: 'Plum', blurb: 'Wine & bronze', from: '#9D174D', to: '#78350F' },
  { id: 'midnight', label: 'Midnight', blurb: 'Dark navy, neon accents', from: '#22D3EE', to: '#E879F9' },
  { id: 'slate', label: 'Slate', blurb: 'Cool & minimal', from: '#0EA5E9', to: '#64748B' },
  { id: 'mint', label: 'Mint', blurb: 'Fresh mint & coral', from: '#14B8A6', to: '#FB7185' },
];

function useTheme() {
  const [theme, setThemeState] = useState('harvest');
  useEffect(() => {
    setThemeState(document.documentElement.dataset.theme || 'harvest');
  }, []);
  function applyTheme(id) {
    document.documentElement.dataset.theme = id;
    localStorage.setItem('mealbox-theme', id);
    setThemeState(id);
  }
  return [theme, applyTheme];
}

/**
 * Full theme picker for the Settings page — each card is scoped with its
 * own data-theme, so it renders using that theme's ACTUAL font, card
 * shape, shadow, and background pattern (not just a flat color swatch).
 * This is the primary way to browse themes; the header swatch is a quick
 * jump-back for whatever's already active.
 */
export function ThemeGrid() {
  const [theme, applyTheme] = useTheme();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          data-theme={t.id}
          onClick={() => applyTheme(t.id)}
          className={`index-card p-4 text-left relative overflow-hidden transition-transform hover:-translate-y-0.5 ${
            theme === t.id ? 'ring-2 ring-offset-2' : ''
          }`}
          style={{
            backgroundColor: 'rgb(var(--color-card))',
            backgroundImage: 'var(--body-pattern)',
            backgroundSize: 'var(--body-pattern-size)',
            ...(theme === t.id ? { '--tw-ring-color': 'rgb(var(--color-rust))', outlineColor: 'rgb(var(--color-rust))' } : {}),
          }}
        >
          <span
            className="w-9 h-9 rounded-full border block mb-3"
            style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})`, borderColor: 'rgb(var(--color-line))' }}
          />
          <span className="font-display text-lg block" style={{ color: 'rgb(var(--color-ink))' }}>
            {t.label}
          </span>
          <span className="text-xs block mt-0.5" style={{ color: 'rgb(var(--color-ink) / 0.55)' }}>
            {t.blurb}
          </span>
          {theme === t.id && (
            <span
              className="absolute top-3 right-3 text-xs font-mono px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgb(var(--color-rust))', color: 'white' }}
            >
              Active
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function ThemeSwitcher() {
  const [theme, applyTheme] = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-full border border-line"
        style={{ background: `linear-gradient(135deg, ${THEMES.find((t) => t.id === theme)?.from}, ${THEMES.find((t) => t.id === theme)?.to})` }}
        aria-label="Switch color theme"
      />
      {open && (
        <div className="fixed inset-0 z-20" onClick={() => setOpen(false)}>
          <div
            className="absolute right-4 top-16 index-card p-2 w-52 max-h-[70vh] !overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  applyTheme(t.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-card hover:bg-paper text-left ${theme === t.id ? 'bg-paper' : ''}`}
              >
                <span
                  className="w-6 h-6 rounded-full border border-line shrink-0"
                  style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
                />
                <span>
                  <span className="text-sm block leading-tight">{t.label}</span>
                  <span className="text-xs text-ink/50 block leading-tight">{t.blurb}</span>
                </span>
              </button>
            ))}
            <p className="text-xs text-ink/40 text-center pt-2 border-t border-line mt-1">
              More themes in Settings →
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
