'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, Badge, Button, CUISINES, cuisineLabel, CuisinePill } from '@/components/ui';
import RecipeDetail from '@/components/RecipeDetail';
import { dayLabel, addDays } from '@/lib/dates';
import { DEFAULT_MEAL_STRUCTURE } from '@/lib/weekBuilder';

const SLOT_ORDER = { breakfast: 0, lunch: 1, dinner: 2, dessert: 3, snack1: 4, snack2: 5, snack3: 6, snack4: 7 };
function bySlotOrder(a, b) {
  return (SLOT_ORDER[a.meal_slot] ?? 99) - (SLOT_ORDER[b.meal_slot] ?? 99);
}

function macrosForShared(meal, profileId) {
  const base = meal.computed_macros || meal.recipe?.macros_per_serving;
  if (!base) return null;
  const portion = meal.portions?.find((p) => p.profileId === profileId);
  const servings = portion?.servings ?? 1;
  return {
    cal: Math.round(base.cal * servings),
    protein: Math.round(base.protein * servings),
    carbs: Math.round(base.carbs * servings),
    fat: Math.round(base.fat * servings),
    servings,
  };
}

function macrosForIndividual(meal) {
  const base = meal.computed_macros || meal.recipe?.macros_per_serving;
  if (!base) return null;
  const servings = meal.servings ?? 1;
  return {
    cal: Math.round(base.cal * servings),
    protein: Math.round(base.protein * servings),
    carbs: Math.round(base.carbs * servings),
    fat: Math.round(base.fat * servings),
    servings,
  };
}

/** The recipe as actually planned — swaps in the personalized ingredient
 * list (more chicken, less rice, etc.) when one was computed, so "View
 * recipe" shows what's actually being eaten, not the library default. */
function effectiveRecipe(meal) {
  if (!meal.recipe) return null;
  if (!meal.ingredients_override) return meal.recipe;
  return { ...meal.recipe, ingredients: meal.ingredients_override };
}

/** Sums every meal that day into a per-member total — shared meals
 * (dinner/breakfast, possibly split into main+side) each contribute that
 * member's portion; individual meals (lunch/snacks) contribute only to the
 * member they belong to. */
function computeDayTotals(dayMeals, members) {
  const totals = {};
  for (const m of members) totals[m.id] = { cal: 0, protein: 0, carbs: 0, fat: 0 };

  for (const meal of dayMeals) {
    const base = meal.computed_macros || meal.recipe?.macros_per_serving;
    if (!base) continue;

    if (meal.profile_id === null) {
      for (const portion of meal.portions || []) {
        const t = totals[portion.profileId];
        if (!t) continue;
        t.cal += base.cal * portion.servings;
        t.protein += base.protein * portion.servings;
        t.carbs += base.carbs * portion.servings;
        t.fat += base.fat * portion.servings;
      }
    } else {
      const t = totals[meal.profile_id];
      if (!t) continue;
      const servings = meal.servings ?? 1;
      t.cal += base.cal * servings;
      t.protein += base.protein * servings;
      t.carbs += base.carbs * servings;
      t.fat += base.fat * servings;
    }
  }

  for (const id of Object.keys(totals)) {
    totals[id] = {
      cal: Math.round(totals[id].cal),
      protein: Math.round(totals[id].protein),
      carbs: Math.round(totals[id].carbs),
      fat: Math.round(totals[id].fat),
    };
  }
  return totals;
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

export default function WeekView({ weekStart, weekPlanId, cuisineFocus, household, members, meals, ingredientCatalog = [] }) {
  const defaultToFull = household?.settings?.recipeDetailDefault !== 'quick';
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(null); // `${dayIndex}-${mealSlot}-${profileId ?? 'shared'}`
  const [cuisineChoice, setCuisineChoice] = useState(cuisineFocus || '');
  const [lunchPlan, setLunchPlan] = useState(
    household?.settings?.mealStructure?.lunchPlan || DEFAULT_MEAL_STRUCTURE.lunchPlan
  );
  const [togglingLunch, setTogglingLunch] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

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

  async function swap(dayIndex, mealSlot, profileId = null, course = 'main', cuisine = null) {
    const key = `${dayIndex}-${mealSlot}-${profileId ?? course}`;
    setSwapping(key);
    await fetch('/api/week/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekPlanId, dayIndex, mealSlot, profileId, course, cuisine }),
    });
    setSwapping(null);
    router.refresh();
  }

  async function toggleLunchStrategy(dayIndex) {
    if (!household) return;
    setTogglingLunch(dayIndex);
    const nextStrategy = lunchPlan[dayIndex] === 'batch' ? 'fresh' : 'batch';
    const nextLunchPlan = { ...lunchPlan, [dayIndex]: nextStrategy };
    setLunchPlan(nextLunchPlan);

    const mealStructure = { ...(household.settings?.mealStructure || DEFAULT_MEAL_STRUCTURE), lunchPlan: nextLunchPlan };
    await supabase
      .from('households')
      .update({ settings: { ...household.settings, mealStructure } })
      .eq('id', household.id);
    setTogglingLunch(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link href={`/week?week=${addDays(weekStart, -7)}`} className="text-sm text-pine hover:underline">
            ← Prev week
          </Link>
          <div>
            <p className="tab-label text-rust mb-1">Week of {weekStart}</p>
            <h1 className="font-display text-3xl">This Week</h1>
          </div>
          <Link href={`/week?week=${addDays(weekStart, 7)}`} className="text-sm text-pine hover:underline">
            Next week →
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={cuisineChoice}
            onChange={(e) => setCuisineChoice(e.target.value)}
            className="border border-line rounded-card px-3 py-2 bg-card text-sm"
          >
            <option value="">Any cuisine</option>
            {CUISINES.map((c) => (
              <option key={c} value={c}>
                {cuisineLabel(c)}
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
            const sharedMeals = dayMeals.filter((m) => m.profile_id === null).sort(bySlotOrder);
            const lunches = dayMeals.filter((m) => m.meal_slot === 'lunch' && m.profile_id);
            const snacks = dayMeals.filter((m) => m.meal_slot.startsWith('snack'));
            const lunchStrategy = lunchPlan[dayIndex] || 'batch';
            const dayTotals = computeDayTotals(dayMeals, members);

            return (
              <Card key={dayIndex}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="tab-label text-ink/50">{dayLabel(weekStart, dayIndex)}</p>
                  <div className="text-right">
                    {members.map((member) => {
                      const t = dayTotals[member.id];
                      if (!t || !t.cal) return null;
                      return (
                        <p key={member.id} className="font-mono text-xs text-ink/60 flex items-center justify-end gap-1.5">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: member.color }} />
                          {t.cal} cal · {t.protein}p · {t.carbs}c · {t.fat}f
                        </p>
                      );
                    })}
                  </div>
                </div>

                {sharedMeals.length === 0 && lunches.length === 0 && (
                  <p className="text-sm text-ink/50 italic">Nothing planned this day.</p>
                )}

                {sharedMeals.map((shared) => (
                  <div key={shared.id} className="mb-4 last:mb-0">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-xs uppercase tab-label text-ink/40">
                        {shared.meal_slot}
                        {shared.course === 'side' ? ' · side' : sharedMeals.length > 1 ? ' · main' : ''}
                      </p>
                      <button
                        onClick={() => swap(dayIndex, shared.meal_slot, null, shared.course)}
                        disabled={swapping === `${dayIndex}-${shared.meal_slot}-${shared.course}`}
                        className="text-xs text-pine hover:underline shrink-0"
                      >
                        {swapping === `${dayIndex}-${shared.meal_slot}-${shared.course}` ? 'Swapping…' : 'Swap'}
                      </button>
                    </div>
                    {shared.recipe ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setExpandedId(expandedId === shared.id ? null : shared.id)}
                          className="text-left"
                        >
                          <h3 className="font-display text-lg mb-0.5">
                            {shared.recipe.name}
                            <span className="text-xs text-pine ml-2">{expandedId === shared.id ? 'Hide' : 'View recipe'}</span>
                          </h3>
                        </button>
                        <CuisinePill cuisine={shared.recipe.cuisine} seed={shared.recipe.name} className="mb-2" />
                        <div className="space-y-1">
                          {members.map((member) => (
                            <MacroLine
                              key={member.id}
                              macros={macrosForShared(shared, member.id)}
                              memberColor={member.color}
                              memberName={member.display_name}
                            />
                          ))}
                        </div>
                        {expandedId === shared.id && (
                          <RecipeDetail recipe={effectiveRecipe(shared)} weekPlanMealId={shared.id} ingredientCatalog={ingredientCatalog} defaultToFull={defaultToFull} householdMembers={members} />
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-ink/50 italic">No recipe matched — try Rebuild, or loosen filters in Settings.</p>
                    )}
                  </div>
                ))}

                {lunches.length > 0 && (
                  <div className="mt-2 pt-3 border-t border-line space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="tab-label text-ink/40">Lunch</p>
                      <button
                        onClick={() => toggleLunchStrategy(dayIndex)}
                        disabled={togglingLunch === dayIndex}
                        className={`text-xs px-2 py-0.5 rounded-card border ${lunchStrategy === 'fresh' ? 'bg-gold/30 border-gold' : 'border-line'}`}
                        title="Toggle batch vs. fresh — rebuild the week to apply"
                      >
                        {togglingLunch === dayIndex ? '…' : lunchStrategy === 'fresh' ? 'Fresh' : 'Batch'}
                      </button>
                    </div>
                    {lunches.map((lunch) => {
                      const member = members.find((m) => m.id === lunch.profile_id);
                      const macros = macrosForIndividual(lunch);
                      const isExpanded = expandedId === lunch.id;
                      return (
                        <div key={lunch.id}>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => lunch.recipe && setExpandedId(isExpanded ? null : lunch.id)}
                              className="text-sm text-left flex-1"
                              disabled={!lunch.recipe}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: member?.color }} />
                                {lunch.recipe?.name || 'No match'}
                                {lunch.recipe && <span className="text-xs text-pine ml-1.5">{isExpanded ? 'Hide' : 'View'}</span>}
                              </span>
                              {macros && (
                                <p className="font-mono text-xs text-ink/60 ml-4">
                                  {macros.cal} cal · {macros.protein}p · {macros.carbs}c · {macros.fat}f
                                </p>
                              )}
                            </button>
                            <button
                              onClick={() => swap(dayIndex, 'lunch', lunch.profile_id)}
                              disabled={swapping === `${dayIndex}-lunch-${lunch.profile_id}`}
                              className="text-xs text-pine hover:underline shrink-0"
                            >
                              {swapping === `${dayIndex}-lunch-${lunch.profile_id}` ? 'Swapping…' : 'Swap'}
                            </button>
                          </div>
                          {isExpanded && (
                            <RecipeDetail recipe={effectiveRecipe(lunch)} weekPlanMealId={lunch.id} ingredientCatalog={ingredientCatalog} defaultToFull={defaultToFull} householdMembers={members} />
                          )}
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
                      const macros = macrosForIndividual(snack);
                      const isExpanded = expandedId === snack.id;
                      return (
                        <div key={snack.id}>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => snack.recipe && setExpandedId(isExpanded ? null : snack.id)}
                              className="text-sm text-left flex-1"
                              disabled={!snack.recipe}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: member?.color }} />
                                {snack.recipe?.name || 'No match'}
                                {snack.recipe && <span className="text-xs text-pine ml-1.5">{isExpanded ? 'Hide' : 'View'}</span>}
                              </span>
                              {macros && (
                                <p className="font-mono text-xs text-ink/60 ml-4">
                                  {macros.cal} cal · {macros.protein}p · {macros.carbs}c · {macros.fat}f
                                </p>
                              )}
                            </button>
                            <button
                              onClick={() => swap(dayIndex, snack.meal_slot, snack.profile_id)}
                              disabled={swapping === `${dayIndex}-${snack.meal_slot}-${snack.profile_id}`}
                              className="text-xs text-pine hover:underline shrink-0"
                            >
                              {swapping === `${dayIndex}-${snack.meal_slot}-${snack.profile_id}` ? 'Swapping…' : 'Swap'}
                            </button>
                          </div>
                          {isExpanded && (
                            <RecipeDetail recipe={effectiveRecipe(snack)} weekPlanMealId={snack.id} ingredientCatalog={ingredientCatalog} defaultToFull={defaultToFull} householdMembers={members} />
                          )}
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
