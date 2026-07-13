'use client';

import { useEffect, useState } from 'react';

export const THEMES = [
  { id: 'harvest', label: 'Harvest', blurb: 'Warm recipe-box classic', from: '#C1502E', to: '#D9A441' },
  { id: 'citrus', label: 'Citrus', blurb: 'Bold & modern', from: '#F0641E', to: '#0E8A7D' },
  { id: 'berry', label: 'Berry', blurb: 'Soft & playful', from: '#D6336C', to: '#6C3483' },
  { id: 'ocean', label: 'Ocean', blurb: 'Clean & breezy', from: '#FF6B5B', to: '#12677A' },
];

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState('harvest');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || 'harvest');
  }, []);

  function applyTheme(id) {
    document.documentElement.dataset.theme = id;
    localStorage.setItem('mealbox-theme', id);
    setTheme(id);
    setOpen(false);
  }

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
        <div className="absolute right-0 mt-2 index-card p-2 w-48 z-20">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTheme(t.id)}
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
        </div>
      )}
    </div>
  );
}
