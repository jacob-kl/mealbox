'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COMMON_ALLERGENS } from '@/lib/allergies';

/**
 * @param {Object} member - a profile row, including its current `allergies` array
 * @param {{name: string, sub_group?: string}[]} ingredientCatalog - for the custom-allergen typeahead
 */
export default function AllergyEditor({ member, ingredientCatalog = [] }) {
  const supabase = createClient();
  const [allergies, setAllergies] = useState(member.allergies || []);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const suggestions = useMemo(() => {
    if (query.trim().length < 2) return [];
    const needle = query.toLowerCase();
    const alreadyAdded = new Set(allergies.map((a) => a.name.toLowerCase()));
    const names = new Set();
    for (const ing of ingredientCatalog) {
      if (names.size >= 6) break;
      if (alreadyAdded.has(ing.name.toLowerCase())) continue;
      if (ing.name.toLowerCase().includes(needle)) names.add(ing.name);
    }
    return [...names];
  }, [query, ingredientCatalog, allergies]);

  function hasCommon(id) {
    return allergies.some((a) => a.category === id);
  }

  function toggleCommon(allergen) {
    setSaved(false);
    setAllergies((prev) =>
      hasCommon(allergen.id)
        ? prev.filter((a) => a.category !== allergen.id)
        : [...prev, { name: allergen.label, category: allergen.id, separable_ok: false }]
    );
  }

  function addCustom(name) {
    setSaved(false);
    setAllergies((prev) => [...prev, { name, category: 'custom', separable_ok: false }]);
    setQuery('');
  }

  function removeCustom(name) {
    setSaved(false);
    setAllergies((prev) => prev.filter((a) => a.name !== name));
  }

  function toggleSeparable(name) {
    setSaved(false);
    setAllergies((prev) => prev.map((a) => (a.name === name ? { ...a, separable_ok: !a.separable_ok } : a)));
  }

  async function handleSave() {
    setSaving(true);
    await supabase.from('profiles').update({ allergies }).eq('id', member.id);
    setSaving(false);
    setSaved(true);
  }

  const customAllergies = allergies.filter((a) => a.category === 'custom');

  return (
    <div className="border border-line rounded-card p-3">
      <p className="text-sm font-medium mb-2">{member.display_name}</p>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {COMMON_ALLERGENS.map((allergen) => (
          <button
            key={allergen.id}
            type="button"
            onClick={() => toggleCommon(allergen)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              hasCommon(allergen.id) ? 'bg-rust text-white border-rust' : 'border-line'
            }`}
          >
            {allergen.label}
          </button>
        ))}
      </div>

      <div className="relative mb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to add another allergy (e.g. onion)…"
          className="w-full text-sm border border-line rounded-card px-3 py-1.5 bg-card"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-line rounded-card shadow-md overflow-hidden">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => addCustom(name)}
                className="block w-full text-left text-sm px-3 py-1.5 hover:bg-paper"
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {customAllergies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {customAllergies.map((a) => (
            <span key={a.name} className="text-xs px-2.5 py-1 rounded-full border border-line bg-paper flex items-center gap-1.5">
              {a.name}
              <button type="button" onClick={() => removeCustom(a.name)} className="text-ink/50 hover:text-rust">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {allergies.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-ink/50 mb-1.5">
            For each, is it okay served on the side, or does it need to be left out of the dish entirely?
          </p>
          <div className="space-y-1">
            {allergies.map((a) => (
              <label key={a.name} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!a.separable_ok} onChange={() => toggleSeparable(a.name)} />
                <span className="w-24 shrink-0">{a.name}</span>
                <span className="text-ink/50">
                  {a.separable_ok ? 'okay served on the side' : 'must be left out of the whole dish'}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="text-xs px-3 py-1.5 rounded-card bg-pine text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save allergies'}
      </button>
    </div>
  );
}
