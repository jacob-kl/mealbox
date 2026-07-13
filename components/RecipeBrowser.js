'use client';

import { useMemo, useState } from 'react';
import { Card, Badge } from '@/components/ui';

const MEAL_TYPES = ['dinner', 'lunch', 'breakfast', 'snack', 'sauce', 'dessert'];

export default function RecipeBrowser({ recipes }) {
  const cuisinesPresent = useMemo(() => [...new Set(recipes.map((r) => r.cuisine))].sort(), [recipes]);
  const [cuisine, setCuisine] = useState(cuisinesPresent[0] || 'all');
  const [mealType, setMealType] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      if (cuisine !== 'all' && r.cuisine !== cuisine) return false;
      if (mealType !== 'all' && r.meal_type !== mealType) return false;
      if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [recipes, cuisine, mealType, query]);

  const grouped = useMemo(() => {
    const map = {};
    for (const r of filtered) {
      map[r.cuisine] = map[r.cuisine] || [];
      map[r.cuisine].push(r);
    }
    return map;
  }, [filtered]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes…"
          className="border border-line rounded-card px-3 py-2 bg-card text-sm flex-1 min-w-[160px]"
        />
        <select
          value={cuisine}
          onChange={(e) => setCuisine(e.target.value)}
          className="border border-line rounded-card px-3 py-2 bg-card text-sm capitalize"
        >
          <option value="all">All cuisines</option>
          {cuisinesPresent.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={mealType}
          onChange={(e) => setMealType(e.target.value)}
          className="border border-line rounded-card px-3 py-2 bg-card text-sm capitalize"
        >
          <option value="all">All meal types</option>
          {MEAL_TYPES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {Object.keys(grouped).length === 0 && (
        <p className="text-ink/50 italic">No recipes match those filters.</p>
      )}

      {Object.entries(grouped).map(([cuisineName, list]) => (
        <div key={cuisineName} className="mb-8">
          <p className="tab-label text-rust mb-3 capitalize">{cuisineName}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((r) => {
              const open = openId === r.id;
              return (
                <Card key={r.id} className="cursor-pointer" >
                  <div onClick={() => setOpenId(open ? null : r.id)}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg">{r.name}</h3>
                      <span className="text-xs uppercase tab-label text-ink/40">{r.meal_type}</span>
                    </div>
                    {r.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {r.tags.map((t) => (
                          <Badge key={t} tone="pine">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {r.macros_per_serving && (
                      <p className="font-mono text-xs text-ink/60 mt-2">
                        {r.macros_per_serving.cal} cal · {r.macros_per_serving.protein}p ·{' '}
                        {r.macros_per_serving.carbs}c · {r.macros_per_serving.fat}f (per serving)
                      </p>
                    )}
                  </div>

                  {open && (
                    <div className="mt-4 pt-4 border-t border-line text-sm">
                      <p className="font-medium mb-1">Ingredients</p>
                      <ul className="list-disc list-inside space-y-0.5 text-ink/70 mb-3">
                        {r.ingredients.map((ing, i) => (
                          <li key={i}>
                            {ing.qty} {ing.ingredient}
                            {ing.note ? ` — ${ing.note}` : ''}
                          </li>
                        ))}
                      </ul>
                      <p className="font-medium mb-1">Steps</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-ink/70">
                        {r.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
