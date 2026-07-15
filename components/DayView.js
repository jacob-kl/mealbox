'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, Button, CuisinePill } from '@/components/ui';
import RecipeDetail from '@/components/RecipeDetail';
import BarcodeScanner from '@/components/BarcodeScanner';
import { recommendSupplements } from '@/lib/supplements';
import { addDays, friendlyDate } from '@/lib/dates';

const SLOT_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  dessert: 'Dessert',
  snack1: 'Snack',
  snack2: 'Snack',
  snack3: 'Snack',
  snack4: 'Snack',
};

const SLOT_ORDER = { breakfast: 0, lunch: 1, dinner: 2, dessert: 3, snack1: 4, snack2: 5, snack3: 6, snack4: 7 };
function bySlotOrder(a, b) {
  return (SLOT_ORDER[a.meal_slot] ?? 99) - (SLOT_ORDER[b.meal_slot] ?? 99);
}

function macrosFor(meal, profileId) {
  const base = meal.computed_macros || meal.recipe?.macros_per_serving;
  if (!base) return null;
  const servings = meal.profile_id
    ? meal.servings
    : meal.portions?.find((p) => p.profileId === profileId)?.servings ?? 1;
  return {
    cal: Math.round(base.cal * servings),
    protein: Math.round(base.protein * servings),
    carbs: Math.round(base.carbs * servings),
    fat: Math.round(base.fat * servings),
    servings,
  };
}

/** The recipe as actually planned — swaps in the personalized ingredient
 * list when one was computed, so "View recipe" shows what's actually being
 * eaten (more chicken, less rice, etc.), not the library default. */
function effectiveRecipe(meal) {
  if (!meal.recipe) return null;
  if (!meal.ingredients_override) return meal.recipe;
  return { ...meal.recipe, ingredients: meal.ingredients_override };
}

export default function DayView({ date, profile, plannedMeals, logEntries, hasWeekPlan, recipeCatalog = [], ingredientCatalog = [], defaultToFull = true, householdMembers = [] }) {
  const supabase = createClient();
  const router = useRouter();
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customCal, setCustomCal] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [scanNote, setScanNote] = useState(null);
  const [busy, setBusy] = useState(false);

  const suggestions = useMemo(() => {
    const q = customName.trim().toLowerCase();
    if (q.length < 2) return [];
    const recipeMatches = recipeCatalog
      .filter((r) => r.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((r) => ({
        type: 'recipe',
        key: `r-${r.id}`,
        name: r.name,
        detail: 'recipe, per serving',
        cal: r.macros_per_serving?.cal ?? 0,
        protein: r.macros_per_serving?.protein ?? 0,
        carbs: r.macros_per_serving?.carbs ?? 0,
        fat: r.macros_per_serving?.fat ?? 0,
      }));
    const ingredientMatches = ingredientCatalog
      .filter((i) => i.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((i) => ({
        type: 'ingredient',
        key: `i-${i.name}`,
        name: i.name,
        detail: i.serving_label || `per ${i.serving_qty}${i.serving_unit || ''}`,
        cal: i.cal ?? 0,
        protein: i.protein ?? 0,
        carbs: i.carbs ?? 0,
        fat: i.fat ?? 0,
      }));
    return [...recipeMatches, ...ingredientMatches].slice(0, 8);
  }, [customName, recipeCatalog, ingredientCatalog]);

  function applySuggestion(s) {
    setCustomName(s.name);
    setCustomCal(String(Math.round(s.cal)));
    setCustomProtein(String(Math.round(s.protein)));
    setCustomCarbs(String(Math.round(s.carbs)));
    setCustomFat(String(Math.round(s.fat)));
  }

  const loggedByMealId = useMemo(() => {
    const map = {};
    for (const entry of logEntries) {
      if (entry.week_plan_meal_id) map[entry.week_plan_meal_id] = entry;
    }
    return map;
  }, [logEntries]);

  const customEntries = logEntries.filter((e) => !e.week_plan_meal_id);

  const totals = useMemo(() => {
    return logEntries.reduce(
      (acc, e) => ({
        cal: acc.cal + Number(e.cal),
        protein: acc.protein + Number(e.protein),
        carbs: acc.carbs + Number(e.carbs),
        fat: acc.fat + Number(e.fat),
      }),
      { cal: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [logEntries]);

  async function togglePlanned(meal) {
    setBusy(true);
    const existing = loggedByMealId[meal.id];
    if (existing) {
      await supabase.from('meal_log').delete().eq('id', existing.id);
    } else {
      const macros = macrosFor(meal, profile.id);
      await supabase.from('meal_log').insert({
        profile_id: profile.id,
        log_date: date,
        week_plan_meal_id: meal.id,
        cal: macros?.cal ?? 0,
        protein: macros?.protein ?? 0,
        carbs: macros?.carbs ?? 0,
        fat: macros?.fat ?? 0,
      });
    }
    setBusy(false);
    router.refresh();
  }

  async function addCustom(e) {
    e.preventDefault();
    setBusy(true);
    await supabase.from('meal_log').insert({
      profile_id: profile.id,
      log_date: date,
      custom_name: customName || 'Custom item',
      cal: Number(customCal) || 0,
      protein: Number(customProtein) || 0,
      carbs: Number(customCarbs) || 0,
      fat: Number(customFat) || 0,
    });
    setCustomName('');
    setCustomCal('');
    setCustomProtein('');
    setCustomCarbs('');
    setCustomFat('');
    setScanNote(null);
    setShowCustomForm(false);
    setBusy(false);
    router.refresh();
  }

  async function removeCustom(id) {
    setBusy(true);
    await supabase.from('meal_log').delete().eq('id', id);
    setBusy(false);
    router.refresh();
  }

  const remaining = {
    cal: Math.round(profile.target_calories - totals.cal),
    protein: Math.round(profile.target_protein_g - totals.protein),
    carbs: Math.round(profile.target_carbs_g - totals.carbs),
    fat: Math.round(profile.target_fat_g - totals.fat),
  };

  const snackCatalog = useMemo(() => recipeCatalog.filter((r) => r.meal_type === 'snack'), [recipeCatalog]);
  const supplementSuggestions = useMemo(
    () => recommendSupplements(remaining, snackCatalog),
    [remaining, snackCatalog]
  );

  async function addSupplement(recipe) {
    setBusy(true);
    const m = recipe.macros_per_serving;
    await supabase.from('meal_log').insert({
      profile_id: profile.id,
      log_date: date,
      custom_name: recipe.name,
      cal: m?.cal ?? 0,
      protein: m?.protein ?? 0,
      carbs: m?.carbs ?? 0,
      fat: m?.fat ?? 0,
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link href={`/dashboard?date=${addDays(date, -1)}`} className="text-sm text-pine hover:underline">
          ← Prev
        </Link>
        <div className="text-center">
          <p className="tab-label text-rust mb-1">Today</p>
          <h1 className="font-display text-2xl">{friendlyDate(date)}</h1>
        </div>
        <Link href={`/dashboard?date=${addDays(date, 1)}`} className="text-sm text-pine hover:underline">
          Next →
        </Link>
      </div>

      <Card className="mb-6">
        <p className="tab-label text-ink/50 mb-3">Today&apos;s macros</p>
        <div className="grid grid-cols-4 gap-3 font-mono text-sm text-center">
          {[
            ['Calories', totals.cal, profile.target_calories, remaining.cal],
            ['Protein', totals.protein, profile.target_protein_g, remaining.protein, 'g'],
            ['Carbs', totals.carbs, profile.target_carbs_g, remaining.carbs, 'g'],
            ['Fat', totals.fat, profile.target_fat_g, remaining.fat, 'g'],
          ].map(([label, eaten, target, left, unit = '']) => (
            <div key={label}>
              <p className="text-ink/50 text-xs mb-1">{label}</p>
              <p className="text-lg">
                {Math.round(eaten)}
                {unit}
              </p>
              <p className="text-xs text-ink/40">of {Math.round(target)}{unit}</p>
              <p className={`text-xs mt-1 ${left < 0 ? 'text-rust' : 'text-pine'}`}>
                {left < 0 ? `${Math.abs(left)}${unit} over` : `${left}${unit} left`}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {!hasWeekPlan && (
        <Card className="mb-6">
          <p className="text-sm text-ink/60">
            No week plan built yet for this week.{' '}
            <Link href="/week" className="text-pine hover:underline">
              Build this week
            </Link>{' '}
            to see your planned meals here — or just log things manually below.
          </p>
        </Card>
      )}

      {plannedMeals.length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="tab-label text-rust">Planned</p>
          {[...plannedMeals].sort(bySlotOrder).map((meal) => {
            const macros = macrosFor(meal, profile.id);
            const checked = !!loggedByMealId[meal.id];
            const expanded = expandedId === meal.id;
            return (
              <Card key={meal.id} className={checked ? 'opacity-60' : ''}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy || !meal.recipe}
                    onChange={() => togglePlanned(meal)}
                    className="w-5 h-5 accent-pine cursor-pointer shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => meal.recipe && setExpandedId(expanded ? null : meal.id)}
                    className="flex-1 text-left"
                    disabled={!meal.recipe}
                  >
                    <p className="text-xs uppercase tab-label text-ink/40">
                      {SLOT_LABELS[meal.meal_slot]}
                      {meal.course === 'side' ? ' · Side' : ''}
                    </p>
                    <p className="font-display text-lg">
                      {meal.recipe?.name || 'No recipe matched'}
                      {meal.recipe && <span className="text-xs text-pine ml-2">{expanded ? 'Hide recipe' : 'View recipe'}</span>}
                    </p>
                    {meal.recipe?.cuisine && <CuisinePill cuisine={meal.recipe.cuisine} seed={meal.recipe.name} className="mb-1.5" />}
                    {macros && (
                      <p className="font-mono text-xs text-ink/60">
                        {macros.cal} cal · {macros.protein}p · {macros.carbs}c · {macros.fat}f
                        {macros.servings !== 1 && <span className="text-ink/40"> ({macros.servings}x serving)</span>}
                      </p>
                    )}
                  </button>
                </div>
                {expanded && (
                  <RecipeDetail recipe={effectiveRecipe(meal)} weekPlanMealId={meal.id} ingredientCatalog={ingredientCatalog} defaultToFull={defaultToFull} householdMembers={householdMembers} />
                )}
              </Card>
            );
          })}
        </div>
      )}

      {supplementSuggestions.length > 0 && (
        <div className="space-y-3 mb-6">
          <div>
            <p className="tab-label text-rust">Recommended supplements</p>
            <p className="text-xs text-ink/50">
              Your planned meals land under target on purpose — here&apos;s what would close the rest of the way.
            </p>
          </div>
          {supplementSuggestions.map((recipe) => {
            const m = recipe.macros_per_serving;
            const expanded = expandedId === `supp-${recipe.id}`;
            return (
              <Card key={recipe.id}>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : `supp-${recipe.id}`)}
                    className="text-left flex-1"
                  >
                    <p className="font-display text-base">
                      {recipe.name}
                      <span className="text-xs text-pine ml-2">{expanded ? 'Hide recipe' : 'View recipe'}</span>
                    </p>
                    <p className="font-mono text-xs text-ink/60">
                      {Math.round(m.cal)} cal · {Math.round(m.protein)}p · {Math.round(m.carbs)}c · {Math.round(m.fat)}f
                    </p>
                  </button>
                  <Button variant="secondary" onClick={() => addSupplement(recipe)} disabled={busy}>
                    + Add
                  </Button>
                </div>
                {expanded && <RecipeDetail recipe={recipe} defaultToFull={defaultToFull} householdMembers={householdMembers} />}
              </Card>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="tab-label text-rust">Off-plan / custom</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setShowScanner((v) => !v);
                if (!showCustomForm) setShowCustomForm(true);
              }}
              className="text-sm text-pine hover:underline"
            >
              {showScanner ? 'Hide scanner' : '📷 Scan barcode'}
            </button>
            <button onClick={() => setShowCustomForm((v) => !v)} className="text-sm text-pine hover:underline">
              {showCustomForm ? 'Cancel' : '+ Add something'}
            </button>
          </div>
        </div>

        {showScanner && (
          <BarcodeScanner
            onFound={(result) => {
              setCustomName(result.name);
              setCustomCal(String(Math.round(result.cal)));
              setCustomProtein(String(Math.round(result.protein)));
              setCustomCarbs(String(Math.round(result.carbs)));
              setCustomFat(String(Math.round(result.fat)));
              setScanNote(result.note);
              setShowScanner(false);
            }}
            onClose={() => setShowScanner(false)}
          />
        )}

        {showCustomForm && (
          <Card>
            <form onSubmit={addCustom} className="space-y-2">
              <div className="relative">
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="What did you eat? (start typing to search recipes & ingredients)"
                  required
                  autoComplete="off"
                  className="w-full border border-line rounded-card px-3 py-2 bg-card text-sm outline-none focus:border-pine"
                />
                {suggestions.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 index-card p-1 max-h-56 overflow-y-auto">
                    {suggestions.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => applySuggestion(s)}
                        className="w-full text-left px-2 py-1.5 rounded-card hover:bg-paper text-sm flex items-center justify-between gap-2"
                      >
                        <span>
                          {s.name}
                          <span className="text-xs text-ink/40 ml-2">{s.detail}</span>
                        </span>
                        <span className="font-mono text-xs text-ink/50 shrink-0">{Math.round(s.cal)} cal</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {scanNote && <p className="text-xs text-ink/70 bg-gold/15 rounded-card px-2 py-1">📷 {scanNote}</p>}
              <div className="grid grid-cols-4 gap-2">
                <input
                  type="number"
                  value={customCal}
                  onChange={(e) => setCustomCal(e.target.value)}
                  placeholder="Cal"
                  className="border border-line rounded-card px-2 py-2 bg-card text-sm"
                />
                <input
                  type="number"
                  value={customProtein}
                  onChange={(e) => setCustomProtein(e.target.value)}
                  placeholder="Protein g"
                  className="border border-line rounded-card px-2 py-2 bg-card text-sm"
                />
                <input
                  type="number"
                  value={customCarbs}
                  onChange={(e) => setCustomCarbs(e.target.value)}
                  placeholder="Carbs g"
                  className="border border-line rounded-card px-2 py-2 bg-card text-sm"
                />
                <input
                  type="number"
                  value={customFat}
                  onChange={(e) => setCustomFat(e.target.value)}
                  placeholder="Fat g"
                  className="border border-line rounded-card px-2 py-2 bg-card text-sm"
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                Log it
              </Button>
            </form>
          </Card>
        )}

        {customEntries.map((entry) => (
          <Card key={entry.id} className="flex items-center justify-between">
            <div>
              <p className="font-display">{entry.custom_name}</p>
              <p className="font-mono text-xs text-ink/60">
                {entry.cal} cal · {entry.protein}p · {entry.carbs}c · {entry.fat}f
              </p>
            </div>
            <button onClick={() => removeCustom(entry.id)} className="text-xs text-rust hover:underline">
              Remove
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
