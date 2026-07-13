'use client';

import { useEffect, useState } from 'react';

export const THEMES = [
  { id: 'harvest', label: 'Harvest', swatch: '#C1502E' },
  { id: 'citrus', label: 'Citrus', swatch: '#F0641E' },
  { id: 'berry', label: 'Berry', swatch: '#D6336C' },
  { id: 'ocean', label: 'Ocean', swatch: '#FF6B5B' },
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
        style={{ backgroundColor: THEMES.find((t) => t.id === theme)?.swatch }}
        aria-label="Switch color theme"
      />
      {open && (
        <div className="absolute right-0 mt-2 index-card p-2 flex gap-1.5 z-20">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTheme(t.id)}
              title={t.label}
              className={`w-7 h-7 rounded-full border-2 ${theme === t.id ? 'border-ink' : 'border-transparent'}`}
              style={{ backgroundColor: t.swatch }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
