'use client';

import { useMemo, useState } from 'react';
import { Card, Badge, cuisineLabel } from '@/components/ui';
import { flagFor } from '@/lib/cuisineFlags';
import RecipeDetail from '@/components/RecipeDetail';
import CuisineWorldMap from '@/components/CuisineWorldMap';

const MEAL_TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'sauce', 'dessert'];
const MEAL_TYPE_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
  sauce: 'Sauces',
  dessert: 'Desserts',
};

export default function RecipeBrowser({ recipes }) {
  const [query, setQuery] = useState('');
  // null = map view (default landing state). Once a region is picked or a
  // search is entered, this becomes an array of cuisine slugs to show, or
  // 'all' to show everything.
  const [activeCuisines, setActiveCuisines] = useState(null);
  const [activeLabel, setActiveLabel] = useState(null);
  const [openId, setOpenId] = useState(null);

  const cuisinesPresent = useMemo(() => [...new Set(recipes.map((r) => r.cuisine))].sort(), [recipes]);
  const showingMap = activeCuisines === null && !query;

  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      if (Array.isArray(activeCuisines) && !activeCuisines.includes(r.cuisine)) return false;
      if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [recipes, query, activeCuisines]);

  const grouped = useMemo(() => {
    const cuisineOrder = Array.isArray(activeCuisines) ? activeCuisines : cuisinesPresent;
    const byCuisine = {};
    for (const cuisine of cuisineOrder) {
      const recipesInCuisine = filtered.filter((r) => r.cuisine === cuisine);
      if (!recipesInCuisine.length) continue;
      const byMealType = {};
      for (const mealType of MEAL_TYPE_ORDER) {
        const matches = recipesInCuisine.filter((r) => r.meal_type === mealType);
        if (matches.length) byMealType[mealType] = matches;
      }
      byCuisine[cuisine] = byMealType;
    }
    return byCuisine;
  }, [filtered, cuisinesPresent, activeCuisines]);

  function handleMapSelect(cuisines, label) {
    setActiveCuisines(cuisines);
    setActiveLabel(label);
  }

  function backToMap() {
    setActiveCuisines(null);
    setActiveLabel(null);
    setQuery('');
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {!showingMap && (
          <button type="button" onClick={backToMap} className="text-sm text-pine hover:underline shrink-0">
            ← Map
          </button>
        )}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value) setActiveCuisines('all');
          }}
          placeholder="Search all recipes…"
          className="flex-1 min-w-[160px] border border-line rounded-card px-3 py-2 bg-card text-sm"
        />
        <select
          value={Array.isArray(activeCuisines) && activeCuisines.length === 1 ? activeCuisines[0] : 'all'}
          onChange={(e) => {
            setActiveCuisines(e.target.value === 'all' ? 'all' : [e.target.value]);
            setActiveLabel(e.target.value === 'all' ? null : cuisineLabel(e.target.value));
          }}
          className="border border-line rounded-card px-3 py-2 bg-card text-sm"
        >
          <option value="all">All cuisines</option>
          {cuisinesPresent.map((c) => (
            <option key={c} value={c}>
              {cuisineLabel(c)}
            </option>
          ))}
        </select>
      </div>

      {showingMap ? (
        <CuisineWorldMap onSelect={handleMapSelect} />
      ) : (
        <>
          {activeLabel && (
            <h2 className="font-display text-2xl mb-4">
              {Array.isArray(activeCuisines) && activeCuisines.length === 1 && (
                <span aria-hidden="true">{flagFor(activeCuisines[0])} </span>
              )}
              {activeLabel}
            </h2>
          )}

          {Object.keys(grouped).length === 0 && <p className="text-ink/50 italic">No recipes match those filters.</p>}

          {Object.entries(grouped).map(([cuisineName, byMealType]) => (
            <div key={cuisineName} className="mb-10">
              {(!activeLabel || Object.keys(grouped).length > 1) && (
                <h2 className="font-display text-2xl mb-4">
                  <span aria-hidden="true">{flagFor(cuisineName)} </span>
                  {cuisineLabel(cuisineName)}
                </h2>
              )}
              {Object.entries(byMealType).map(([mealType, list]) => (
                <div key={mealType} className="mb-6">
                  <p className="tab-label text-rust mb-3">{MEAL_TYPE_LABELS[mealType]}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {list.map((r) => {
                      const open = openId === r.id;
                      return (
                        <Card key={r.id} className="cursor-pointer">
                          <div onClick={() => setOpenId(open ? null : r.id)}>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-display text-lg">{r.name}</h3>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {r.household_id && <Badge>private</Badge>}
                              {r.course && r.course !== 'complete' && <Badge>{r.course}</Badge>}
                              {r.tags?.map((t) => <Badge key={t}>{t}</Badge>)}
                            </div>
                            {r.macros_per_serving && (
                              <p className="font-mono text-xs text-ink/60 mt-2">
                                {r.macros_per_serving.cal} cal · {r.macros_per_serving.protein}p ·{' '}
                                {r.macros_per_serving.carbs}c · {r.macros_per_serving.fat}f (per serving)
                              </p>
                            )}
                          </div>
                          {open && <RecipeDetail recipe={r} />}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
