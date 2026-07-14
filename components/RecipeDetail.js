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
 * @param {string} [weekPlanMealId] - if given, ingredients become swappable/removable
 *   (this is a planned meal instance, not the read-only recipe library)
 * @param {Array} [ingredientCatalog] - full ingredients table, needed for swap suggestions
 */
export default function RecipeDetail({ recipe, weekPlanMealId, ingredientCatalog = [] }) {
  const router = useRouter();
  const [swappingIndex, setSwappingIndex] = useState(null);
  const [removingIndex, setRemovingIndex] = useState(null);
  const [removeError, setRemoveError] = useState(null);
  const [showDetailed, setShowDetailed] = useState(false);

  if (!recipe) return null;
  const canEdit = !!weekPlanMealId && ingredientCatalog.length > 0;

  async function handleRemove(ingredientName, index) {
    setRemovingIndex(index);
    setRemoveError(null);
    try {
      const res = await fetch('/api/week/swap-ingredient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekPlanMealId, oldIngredient: ingredientName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Remove failed');
      router.refresh();
    } catch (err) {
      setRemoveError(err.message);
    } finally {
      setRemovingIndex(null);
    }
  }

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
                  {canEdit && (
                    <span className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSwappingIndex(swappingIndex === i ? null : i);
                          setRemoveError(null);
                        }}
                        className="text-xs text-pine hover:underline"
                      >
                        {swappingIndex === i ? 'Cancel' : 'Swap'}
                      </button>
                      <button
                        type="button"
                        disabled={removingIndex === i}
                        onClick={() => handleRemove(ing.ingredient, i)}
                        className="text-xs text-rust hover:underline disabled:opacity-50"
                      >
                        {removingIndex === i ? 'Removing…' : 'Remove'}
                      </button>
                    </span>
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
          {removeError && <p className="text-xs text-rust mb-3 -mt-2">{removeError}</p>}
        </>
      )}
      {recipe.steps?.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium">Steps</p>
            {recipe.steps_detailed?.length > 0 && (
              <div className="flex text-xs border border-line rounded-full overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDetailed(false)}
                  className={`px-2.5 py-0.5 ${!showDetailed ? 'bg-pine text-white' : 'hover:bg-paper'}`}
                >
                  Quick
                </button>
                <button
                  type="button"
                  onClick={() => setShowDetailed(true)}
                  className={`px-2.5 py-0.5 ${showDetailed ? 'bg-pine text-white' : 'hover:bg-paper'}`}
                >
                  Full
                </button>
              </div>
            )}
          </div>
          <ol className="list-decimal list-inside space-y-1 text-ink/70">
            {(showDetailed && recipe.steps_detailed?.length > 0 ? recipe.steps_detailed : recipe.steps).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
