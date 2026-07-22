'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatQty } from '@/lib/nutrition';
import { suggestSubstitutes, DIETARY_FILTERS } from '@/lib/substitutions';
import { findHouseholdAllergyConflicts } from '@/lib/allergies';
import { canEditMealPlan } from '@/lib/permissions';

function SwapPicker({ ingredientName, weekPlanMealId, ingredientCatalog, listType, onDone }) {
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
        body: JSON.stringify({ weekPlanMealId, oldIngredient: ingredientName, newIngredient, listType }),
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
 * @param {boolean} [defaultToFull] - household's Quick/Full display preference
 */
export default function RecipeDetail({ recipe, weekPlanMealId, ingredientCatalog = [], defaultToFull = false, householdMembers = [], currentUserRole, batchMultiplier = 1 }) {
  const router = useRouter();
  const [swappingIndex, setSwappingIndex] = useState(null);
  const [removingIndex, setRemovingIndex] = useState(null);
  const [removeError, setRemoveError] = useState(null);
  const [showFull, setShowFull] = useState(defaultToFull);

  if (!recipe) return null;
  const canEdit = !!weekPlanMealId && ingredientCatalog.length > 0 && canEditMealPlan(currentUserRole);
  const hasFull = recipe.ingredients_full?.length > 0 || recipe.steps_detailed?.length > 0;
  const displayIngredients = showFull && recipe.ingredients_full?.length > 0 ? recipe.ingredients_full : recipe.ingredients;
  const displaySteps = showFull && recipe.steps_detailed?.length > 0 ? recipe.steps_detailed : recipe.steps;
  const editingActive = canEdit;
  const listType = showFull ? 'full' : 'quick';
  // The full ingredient list is genuinely different from the quick one (more
  // authentic, more items), so it has its own real macro count - show it
  // explicitly rather than let the quick-list numbers up in the card header
  // silently disagree with what's actually listed below.
  const showFullMacros = showFull && recipe.macros_per_serving_full && recipe.ingredients_full?.length > 0;
  const allergyConflicts = findHouseholdAllergyConflicts(displayIngredients, ingredientCatalog, householdMembers);

  async function handleRemove(ingredientName, index) {
    setRemovingIndex(index);
    setRemoveError(null);
    try {
      const res = await fetch('/api/week/swap-ingredient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekPlanMealId, oldIngredient: ingredientName, listType }),
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
      {allergyConflicts.length > 0 && (
        <div className="mb-3 p-2.5 rounded-card bg-rust/10 border border-rust/30 space-y-1.5">
          {allergyConflicts.map((c, i) => (
            <p key={i} className="text-xs text-ink/80">
              <span className="font-medium text-rust">{c.member} is allergic to {c.allergyName}.</span>{' '}
              {c.allSeparable ? (
                <>Every {c.allergyName.toLowerCase()} ingredient here is a topping/side ({c.lines.map((l) => l.ingredient).join(', ')}) — safe to serve for everyone and just leave off {c.member}'s portion.</>
              ) : (
                <>
                  {c.lines.some((l) => !l.separable) && (
                    <>Cooked into the dish itself ({c.lines.filter((l) => !l.separable).map((l) => l.ingredient).join(', ')}) — as written, this recipe isn't safe for {c.member}. Either leave it out for the whole household, or prepare a separate {c.allergyName.toLowerCase()}-free portion for {c.member}.</>
                  )}
                </>
              )}
            </p>
          ))}
        </div>
      )}

      {hasFull && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-ink/50">{showFull ? 'Full recipe — for reference' : 'Quick version'}</p>
          <div className="flex text-xs border border-line rounded-full overflow-hidden">
            <button
              type="button"
              onClick={() => setShowFull(false)}
              className={`px-2.5 py-0.5 ${!showFull ? 'bg-pine text-white' : 'hover:bg-paper'}`}
            >
              Quick
            </button>
            <button
              type="button"
              onClick={() => setShowFull(true)}
              className={`px-2.5 py-0.5 ${showFull ? 'bg-pine text-white' : 'hover:bg-paper'}`}
            >
              Full
            </button>
          </div>
        </div>
      )}

      {showFullMacros && (
        <p className="font-mono text-xs text-ink/60 mb-3 -mt-1 bg-paper rounded-card px-2.5 py-1.5">
          Full recipe: {recipe.macros_per_serving_full.cal} cal · {recipe.macros_per_serving_full.protein}p ·{' '}
          {recipe.macros_per_serving_full.carbs}c · {recipe.macros_per_serving_full.fat}f (per serving)
          {recipe.macros_per_serving && recipe.macros_per_serving.cal !== recipe.macros_per_serving_full.cal && (
            <span className="text-ink/40"> — tracked plan uses the quick version's {recipe.macros_per_serving.cal} cal</span>
          )}
        </p>
      )}

      {recipe.description && (
        <p className="text-sm text-ink/70 mb-3 leading-relaxed">{recipe.description}</p>
      )}

      {displayIngredients?.length > 0 && (
        <>
          <p className="font-medium mb-1">
            Ingredients
            {batchMultiplier > 1 && (
              <span className="font-normal text-xs text-ink/50"> — per day (total for {batchMultiplier} batched days)</span>
            )}
          </p>
          <ul className="space-y-0.5 text-ink/70 mb-3">
            {displayIngredients.map((ing, i) => (
              <li key={i}>
                <div className="flex items-center justify-between gap-2">
                  <span className="list-disc">
                    • {formatQty(ing.qty, ing.unit)}
                    {batchMultiplier > 1 ? ` (${formatQty(ing.qty * batchMultiplier, ing.unit)})` : ''} {ing.ingredient}
                    {ing.note ? ` — ${ing.note}` : ''}
                  </span>
                  {editingActive && (
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
                {editingActive && swappingIndex === i && (
                  <SwapPicker
                    ingredientName={ing.ingredient}
                    weekPlanMealId={weekPlanMealId}
                    ingredientCatalog={ingredientCatalog}
                    listType={listType}
                    onDone={() => setSwappingIndex(null)}
                  />
                )}
              </li>
            ))}
          </ul>
          {removeError && <p className="text-xs text-rust mb-3 -mt-2">{removeError}</p>}
        </>
      )}
      {displaySteps?.length > 0 && (
        <>
          <p className="font-medium mb-1">Steps</p>
          <ol className="list-decimal list-inside space-y-1 text-ink/70">
            {displaySteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
