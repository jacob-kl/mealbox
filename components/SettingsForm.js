'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, Button } from '@/components/ui';
import AllergyEditor from '@/components/AllergyEditor';
import HouseholdMemberManager from '@/components/HouseholdMemberManager';
import LunchScheduleEditor from '@/components/LunchScheduleEditor';
import { ThemeGrid } from '@/components/ThemeSwitcher';
import { DEFAULT_MEAL_DAYS, DEFAULT_MEAL_STRUCTURE } from '@/lib/weekBuilder';
import { DIET_TYPES } from '@/lib/macros';
import { DAY_NAMES } from '@/lib/dates';

const BLOCKABLE_TAGS = [
  { tag: 'fish', label: 'Fish' },
  { tag: 'shellfish', label: 'Shellfish' },
  { tag: 'mushroom', label: 'Mushroom' },
  { tag: 'raw-onion', label: 'Raw onion' },
  { tag: 'lentil', label: 'Lentils' },
  { tag: 'okra', label: 'Okra' },
  { tag: 'eggplant', label: 'Eggplant' },
];

const MEAL_COLUMNS = ['breakfast', 'dinner', 'dessert'];

export default function SettingsForm({ household, members, ingredientCatalog = [], currentUserId, pendingMembers = [] }) {
  const supabase = createClient();
  const isHeadOfKitchen = members.find((m) => m.id === currentUserId)?.household_role === 'head_of_kitchen';
  const router = useRouter();

  const [blockedTags, setBlockedTags] = useState(household.settings?.blockedTags || []);
  const [mealDays, setMealDays] = useState(household.settings?.mealDays || DEFAULT_MEAL_DAYS);
  const [mealStructure, setMealStructure] = useState(
    household.settings?.mealStructure || DEFAULT_MEAL_STRUCTURE
  );
  const [units, setUnits] = useState(household.settings?.units || 'imperial');
  const [recipeDetailDefault, setRecipeDetailDefault] = useState(household.settings?.recipeDetailDefault || 'full');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleTag(tag) {
    setBlockedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function toggleMealDay(dayIndex, mealType) {
    setMealDays((prev) => ({
      ...prev,
      [dayIndex]: { ...prev[dayIndex], [mealType]: !prev[dayIndex]?.[mealType] },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from('households')
      .update({ settings: { ...household.settings, blockedTags, mealDays, mealStructure, units, recipeDetailDefault } })
      .eq('id', household.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-display text-xl mb-1">Units</h2>
        <p className="text-sm text-ink/60 mb-3">
          Used for the macro calculator and weight tracker across the household.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setUnits('imperial')}
            className={`text-sm px-4 py-2 rounded-card border ${units === 'imperial' ? 'bg-pine text-white border-pine' : 'border-line'}`}
          >
            Imperial (ft/in, lb)
          </button>
          <button
            type="button"
            onClick={() => setUnits('metric')}
            className={`text-sm px-4 py-2 rounded-card border ${units === 'metric' ? 'bg-pine text-white border-pine' : 'border-line'}`}
          >
            Metric (cm, kg)
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Recipe detail default</h2>
        <p className="text-sm text-ink/60 mb-3">
          Which version opens first on Today and Week — Quick is a fast-reference short ingredient
          list, Full is the complete authentic recipe. You can always switch per-recipe either way.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRecipeDetailDefault('quick')}
            className={`text-sm px-4 py-2 rounded-card border ${recipeDetailDefault === 'quick' ? 'bg-pine text-white border-pine' : 'border-line'}`}
          >
            Quick
          </button>
          <button
            type="button"
            onClick={() => setRecipeDetailDefault('full')}
            className={`text-sm px-4 py-2 rounded-card border ${recipeDetailDefault === 'full' ? 'bg-pine text-white border-pine' : 'border-line'}`}
          >
            Full
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Invite people</h2>
        {isHeadOfKitchen ? (
          <>
            <p className="text-sm text-ink/60 mb-3">
              Share this code so others can join <strong>{household.name}</strong>. As head of kitchen,
              you're the only one who can invite new people.
            </p>
            <p className="font-mono text-2xl tracking-widest bg-paper border border-line rounded-card px-4 py-2 inline-block">
              {household.invite_code}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink/60">
            Only the head of kitchen ({members.find((m) => m.household_role === 'head_of_kitchen')?.display_name || 'someone in your household'}) can invite new people.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-3">Household members</h2>
        {isHeadOfKitchen ? (
          <HouseholdMemberManager household={household} members={members} pendingMembers={pendingMembers} />
        ) : (
          <>
            <p className="text-xs text-ink/50 mb-2">The head of kitchen can invite new people to the household.</p>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm border-b border-line last:border-0 pb-2 last:pb-0">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: m.color }} />
                    {m.display_name}
                    {m.household_role === 'head_of_kitchen' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-pine/15 text-pine">Head of kitchen</span>
                    )}
                    {m.household_role === 'kitchen' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-gold/20 text-ink/70">Kitchen</span>
                    )}
                    <span className="text-xs text-ink/40 capitalize">
                      ({m.goal}{m.diet_type && m.diet_type !== 'balanced' ? `, ${DIET_TYPES[m.diet_type]?.label || m.diet_type}` : ''})
                    </span>
                  </span>
                  <span className="font-mono text-xs text-ink/70">
                    {m.target_calories} cal · {m.target_protein_g}p / {m.target_carbs_g}c / {m.target_fat_g}f
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Allergies</h2>
        <p className="text-sm text-ink/60 mb-3">
          For each allergy, mark whether it's okay served on the side (a topping or garnish the person
          can just skip) or needs to be left out of the dish entirely. When it must be left out and the
          ingredient is cooked into the recipe, the whole household's meal that night will skip it too -
          unless the recipe includes a separately-prepared portion for that person.
        </p>
        <div className="space-y-3">
          {members.map((m) => (
            <AllergyEditor key={m.id} member={m} ingredientCatalog={ingredientCatalog} />
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Dietary exclusions</h2>
        <p className="text-sm text-ink/60 mb-3">
          Recipes tagged with these are never auto-selected for your household.
        </p>
        <div className="flex flex-wrap gap-2">
          {BLOCKABLE_TAGS.map(({ tag, label }) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`text-sm px-3 py-1.5 rounded-card border ${
                blockedTags.includes(tag) ? 'bg-rust text-white border-rust' : 'border-line'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Theme</h2>
        <p className="text-sm text-ink/60 mb-4">
          Each one is a full look, not just a color swap — different fonts, card shapes, and
          background patterns. Tap one to preview it live.
        </p>
        <ThemeGrid />
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Which meals to plan</h2>
        <p className="text-sm text-ink/60 mb-4">
          Check a box to have the auto-builder plan that meal on that day. Leave a whole column
          unchecked — like breakfast — and it&apos;s never planned at all.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left font-normal text-ink/50 pb-2"></th>
                {MEAL_COLUMNS.map((meal) => (
                  <th key={meal} className="font-normal text-ink/50 pb-2 capitalize">
                    {meal}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_NAMES.map((name, dayIndex) => (
                <tr key={dayIndex} className="border-t border-line">
                  <td className="py-2 pr-3 font-medium whitespace-nowrap">{name}</td>
                  {MEAL_COLUMNS.map((meal) => (
                    <td key={meal} className="text-center py-2">
                      <input
                        type="checkbox"
                        checked={!!mealDays[dayIndex]?.[meal]}
                        onChange={() => toggleMealDay(dayIndex, meal)}
                        className="w-5 h-5 accent-pine cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Snacks</h2>
        <label className="text-sm text-ink/60 block mb-1">Snacks per day</label>
        <select
          value={mealStructure.snacksPerDay}
          onChange={(e) =>
            setMealStructure((prev) => ({ ...prev, snacksPerDay: Number(e.target.value) }))
          }
          className="border border-line rounded-card px-3 py-2 bg-card text-sm"
        >
          {[0, 1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Lunch schedule</h2>
        <p className="text-sm text-ink/60 mb-4">
          Each person can have their own lunch days and their own batch-vs-fresh style — so one
          person can batch-cook the same lunch all week while someone else gets something
          different every day.
        </p>
        <LunchScheduleEditor members={members} currentUserId={currentUserId} isHeadOfKitchen={isHeadOfKitchen} />
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Per-meal calorie limits</h2>
        <p className="text-sm text-ink/60 mb-4">
          Optional ceiling for each meal type — useful for a day where only one meal is planned
          (like dinner-only when lunch is a team outing) so that one meal doesn&apos;t inherit the
          whole day&apos;s calories. Leftover calories show up as Recommended supplements on the
          Today tab instead. Leave blank for no limit.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {['breakfast', 'lunch', 'dinner', 'dessert', 'snack'].map((meal) => (
            <div key={meal}>
              <label className="text-sm text-ink/60 block mb-1 capitalize">{meal}</label>
              <input
                type="number"
                min="0"
                placeholder="No limit"
                value={mealStructure.mealCaps?.[meal] ?? ''}
                onChange={(e) =>
                  setMealStructure((prev) => ({
                    ...prev,
                    mealCaps: {
                      ...prev.mealCaps,
                      [meal]: e.target.value === '' ? null : Number(e.target.value),
                    },
                  }))
                }
                className="w-full border border-line rounded-card px-3 py-2 bg-card text-sm"
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
        {saved && <span className="text-sm text-pine">Saved.</span>}
      </div>
    </div>
  );
}
