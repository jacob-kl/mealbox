'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Badge, Button, CUISINES } from '@/components/ui';
import { dayLabel } from '@/lib/dates';

const SNACK_SLOTS = ['snack1', 'snack2', 'snack3', 'snack4'];

function macrosForShared(recipe, portions, profileId) {
  if (!recipe?.macros_per_serving) return null;
  const portion = portions?.find((p) => p.profileId === profileId);
  const servings = portion?.servings ?? 1;
  const m = recipe.macros_per_serving;
  return {
    cal: Math.round(m.cal * servings),
    protein: Math.round(m.protein * servings),
    carbs: Math.round(m.carbs * servings),
    fat: Math.round(m.fat * servings),
    servings,
  };
}

function macrosForIndividual(recipe, servings) {
  if (!recipe?.macros_per_serving) return null;
  const m = recipe.macros_per_serving;
  return {
    cal: Math.round(m.cal * servings),
    protein: Math.round(m.protein * servings),
    carbs: Math.round(m.carbs * servings),
    fat: Math.round(m.fat * servings),
    servings,
  };
}

function MacroLine({ macros, memberColor, memberName }) {
  if (!macros) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5">
        {memberColor && <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: memberColor }} />}
        {memberName}
      </span>
      <span className="font-mono text-xs text-ink/70">
        {macros.cal} cal · {macros.protein}p · {macros.carbs}c · {macros.fat}f
        <span className="text-ink/40"> ({macros.servings}x)</span>
      </span>
    </div>
  );
}

export default function WeekView({ weekStart, weekPlanId, cuisineFocus, members, meals }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(null); // `${dayIndex}-${mealSlot}-${profileId ?? 'shared'}`
  const [cuisineChoice, setCuisineChoice] = useState(cuisineFocus || '');

  const byDay = useMemo(() => {
    const map = {};
    for (const m of meals) {
      map[m.day_index] = map[m.day_index] || [];
      map[m.day_index].push(m);
    }
    return map;
  }, [meals]);

  async function generateWeek(cuisine) {
    setLoading(true);
    await fetch('/api/week/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStart, cuisineFocus: cuisine || null }),
    });
    setLoading(false);
    router.refresh();
  }

  async function swap(dayIndex, mealSlot, profileId = null, cuisine = null) {
    const key = `${dayIndex}-${mealSlot}-${profileId ?? 'shared'}`;
    setSwapping(key);
    await fetch('/api/week/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekPlanId, dayIndex, mealSlot, profileId, cuisine }),
    });
    setSwapping(null);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p className="tab-label text-rust mb-1">Week of {weekStart}</p>
          <h1 className="font-display text-3xl">This Week</h1>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={cuisineChoice}
            onChange={(e) => setCuisineChoice(e.target.value)}
            className="border border-line rounded-card px-3 py-2 bg-card text-sm capitalize"
          >
            <option value="">Any cuisine</option>
            {CUISINES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
          <Button onClick={() => generateWeek(cuisineChoice)} disabled={loading}>
            {loading ? 'Building…' : weekPlanId ? 'Rebuild week' : 'Build this week'}
          </Button>
        </div>
      </div>

      {!weekPlanId ? (
        <Card>
          <p className="text-ink/70">
            No plan yet for this week. Pick a cuisine focus if you like, or leave it on
            &ldquo;Any cuisine&rdquo; and let Mealbox build the week from your recipe library —
            including everyone&apos;s lunches and snacks based on your Settings.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 7 }, (_, dayIndex) => {
            const dayMeals = byDay[dayIndex] || [];
            const shared = dayMeals.find((m) => m.profile_id === null);
            const lunches = dayMeals.filter((m) => m.meal_slot === 'lunch' && m.profile_id);
            const snacks = dayMeals.filter((m) => m.meal_slot.startsWith('snack'));

            return (
              <Card key={dayIndex}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="tab-label text-ink/50">{dayLabel(weekStart, dayIndex)}</p>
                    {shared?.label && <Badge tone="gold" className="mt-1">{shared.label}</Badge>}
                  </div>
                  {shared && (
                    <Button
                      variant="secondary"
                      onClick={() => swap(dayIndex, shared.meal_slot)}
                      disabled={swapping === `${dayIndex}-${shared.meal_slot}-shared`}
                    >
                      {swapping === `${dayIndex}-${shared.meal_slot}-shared` ? 'Swapping…' : 'Swap'}
                    </Button>
                  )}
                </div>

                {shared?.recipe ? (
                  <>
                    <p className="text-xs uppercase tab-label text-ink/40 mb-1">{shared.meal_slot}</p>
                    <h3 className="font-display text-xl mb-1">{shared.recipe.name}</h3>
                    <p className="text-xs text-ink/50 capitalize mb-3">{shared.recipe.cuisine}</p>
                    <div className="space-y-1.5">
                      {members.map((member) => (
                        <MacroLine
                          key={member.id}
                          macros={macrosForShared(shared.recipe, shared.portions, member.id)}
                          memberColor={member.color}
                          memberName={member.display_name}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink/50 italic mb-3">No dinner matched — try Rebuild, or loosen filters in Settings.</p>
                )}

                {lunches.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-line space-y-2">
                    <p className="tab-label text-ink/40">Lunch</p>
                    {lunches.map((lunch) => {
                      const member = members.find((m) => m.id === lunch.profile_id);
                      const macros = macrosForIndividual(lunch.recipe, lunch.servings);
                      return (
                        <div key={lunch.id} className="flex items-center justify-between gap-2">
                          <div className="text-sm">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: member?.color }} />
                              {lunch.recipe?.name || 'No match'}
                            </span>
                            {macros && (
                              <p className="font-mono text-xs text-ink/60 ml-4">
                                {macros.cal} cal · {macros.protein}p · {macros.carbs}c · {macros.fat}f
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => swap(dayIndex, 'lunch', lunch.profile_id)}
                            disabled={swapping === `${dayIndex}-lunch-${lunch.profile_id}`}
                            className="text-xs text-pine hover:underline shrink-0"
                          >
                            {swapping === `${dayIndex}-lunch-${lunch.profile_id}` ? 'Swapping…' : 'Swap'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {snacks.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-line space-y-2">
                    <p className="tab-label text-ink/40">Snacks</p>
                    {snacks.map((snack) => {
                      const member = members.find((m) => m.id === snack.profile_id);
                      const macros = macrosForIndividual(snack.recipe, snack.servings);
                      return (
                        <div key={snack.id} className="flex items-center justify-between gap-2">
                          <div className="text-sm">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: member?.color }} />
                              {snack.recipe?.name || 'No match'}
                            </span>
                            {macros && (
                              <p className="font-mono text-xs text-ink/60 ml-4">
                                {macros.cal} cal · {macros.protein}p · {macros.carbs}c · {macros.fat}f
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => swap(dayIndex, snack.meal_slot, snack.profile_id)}
                            disabled={swapping === `${dayIndex}-${snack.meal_slot}-${snack.profile_id}`}
                            className="text-xs text-pine hover:underline shrink-0"
                          >
                            {swapping === `${dayIndex}-${snack.meal_slot}-${snack.profile_id}` ? 'Swapping…' : 'Swap'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
