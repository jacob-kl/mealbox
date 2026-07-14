'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatQty } from '@/lib/nutrition';
import { suggestSubstitutes, DIETARY_FILTERS } from '@/lib/substitutions';

function SwapPicker({ ingredientName, weekPlanMealId, ingredientCatalog, onDone }) {
  const router = useRouter();
  const [customName, setCustomName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dietaryFilter, setDietaryFilter] = useState(null);

  const suggestions = suggestSubstitutes(ingredientName, ingredientCatalog, { maxSuggestions: 6, dietaryFilter });

  async function doSwap(newIngredient) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/week/swap-ingredient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekPlanMealId, oldIngredient: ingredientName, newIngredient }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Swap failed');
      router.refresh();
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 mb-2 p-2 bg-paper rounded-card text-xs space-y-2">
      <p className="text-ink/60">Swap {ingredientName} for:</p>

      <div className="flex flex-wrap gap-1">
        {DIETARY_FILTERS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setDietaryFilter(dietaryFilter === tag ? null : tag)}
            className={`px-2 py-0.5 rounded-full border text-xs ${
              dietaryFilter === tag ? 'bg-pine text-white border-pine' : 'border-line text-ink/50 hover:border-pine'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              disabled={busy}
              onClick={() => doSwap(s.name)}
              className="px-2 py-1 rounded-card border border-line bg-card hover:bg-pine hover:text-white hover:border-pine transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {s.name}
              {s.dietary_tags?.includes(dietaryFilter) && dietaryFilter && (
                <span className="text-[10px] opacity-70">✓ {dietaryFilter}</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-ink/40 italic">
          {dietaryFilter ? `No ${dietaryFilter} matches on file — try a custom substitute below.` : 'No close matches on file — try a custom substitute below.'}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (customName.trim()) doSwap(customName.trim());
        }}
        className="flex gap-1.5"
      >
        <input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          list={`ingredient-options-${ingredientName}`}
          placeholder="Or type your own substitute…"
          className="flex-1 border border-line rounded-card px-2 py-1 bg-card text-xs"
        />
        <datalist id={`ingredient-options-${ingredientName}`}>
          {ingredientCatalog.map((i) => (
            <option key={i.name} value={i.name} />
          ))}
        </datalist>
        <button type="submit" disabled={busy} className="px-2 py-1 rounded-card border border-line bg-card hover:bg-paper">
          {busy ? '…' : 'Swap'}
        </button>
      </form>
      {error && <p className="text-rust">{error}</p>}
    </div>
  );
}

/**
 * @param {Object} recipe
 * @param {string} [weekPlanMealId] - if given, ingredients become swappable
 *   (this is a planned meal instance, not the read-only recipe library)
 * @param {Array} [ingredientCatalog] - full ingredients table, needed for swap suggestions
 */
export default function RecipeDetail({ recipe, weekPlanMealId, ingredientCatalog = [] }) {
  const [swappingIndex, setSwappingIndex] = useState(null);

  if (!recipe) return null;
  const canSwap = !!weekPlanMealId && ingredientCatalog.length > 0;

  return (
    <div className="mt-3 pt-3 border-t border-line text-sm">
      {recipe.ingredients?.length > 0 && (
        <>
          <p className="font-medium mb-1">Ingredients</p>
          <ul className="space-y-0.5 text-ink/70 mb-3">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                <div className="flex items-center justify-between gap-2">
                  <span className="list-disc">
                    • {formatQty(ing.qty, ing.unit)} {ing.ingredient}
                    {ing.note ? ` — ${ing.note}` : ''}
                  </span>
                  {canSwap && (
                    <button
                      type="button"
                      onClick={() => setSwappingIndex(swappingIndex === i ? null : i)}
                      className="text-xs text-pine hover:underline shrink-0"
                    >
                      {swappingIndex === i ? 'Cancel' : 'Swap'}
                    </button>
                  )}
                </div>
                {swappingIndex === i && (
                  <SwapPicker
                    ingredientName={ing.ingredient}
                    weekPlanMealId={weekPlanMealId}
                    ingredientCatalog={ingredientCatalog}
                    onDone={() => setSwappingIndex(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {recipe.steps?.length > 0 && (
        <>
          <p className="font-medium mb-1">Steps</p>
          <ol className="list-decimal list-inside space-y-0.5 text-ink/70">
            {recipe.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
