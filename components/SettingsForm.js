'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, Button } from '@/components/ui';
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

const MEAL_COLUMNS = ['breakfast', 'lunch', 'dinner'];

export default function SettingsForm({ household, members }) {
  const supabase = createClient();
  const router = useRouter();

  const [blockedTags, setBlockedTags] = useState(household.settings?.blockedTags || []);
  const [mealDays, setMealDays] = useState(household.settings?.mealDays || DEFAULT_MEAL_DAYS);
  const [mealStructure, setMealStructure] = useState(
    household.settings?.mealStructure || DEFAULT_MEAL_STRUCTURE
  );
  const [units, setUnits] = useState(household.settings?.units || 'imperial');
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

  function toggleLunchStrategy(dayIndex) {
    setMealStructure((prev) => ({
      ...prev,
      lunchPlan: {
        ...prev.lunchPlan,
        [dayIndex]: prev.lunchPlan[dayIndex] === 'batch' ? 'fresh' : 'batch',
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from('households')
      .update({ settings: { ...household.settings, blockedTags, mealDays, mealStructure, units } })
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
        <h2 className="font-display text-xl mb-1">Invite people</h2>
        <p className="text-sm text-ink/60 mb-3">
          Share this code so others can join <strong>{household.name}</strong>.
        </p>
        <p className="font-mono text-2xl tracking-widest bg-paper border border-line rounded-card px-4 py-2 inline-block">
          {household.invite_code}
        </p>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-3">Household members</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm border-b border-line last:border-0 pb-2 last:pb-0">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: m.color }} />
                {m.display_name}
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
        <h2 className="font-display text-xl mb-1">Snacks & lunch style</h2>
        <label className="text-sm text-ink/60 block mb-1">Snacks per day</label>
        <select
          value={mealStructure.snacksPerDay}
          onChange={(e) =>
            setMealStructure((prev) => ({ ...prev, snacksPerDay: Number(e.target.value) }))
          }
          className="border border-line rounded-card px-3 py-2 bg-card text-sm mb-4"
        >
          {[0, 1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <label className="text-sm text-ink/60 block mb-2">
          On days lunch is checked above — tap to switch between a batch-cooked lunch (same
          recipe all week) and a freshly cooked one just for that day
        </label>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((name, dayIndex) => {
            if (!mealDays[dayIndex]?.lunch) return null;
            const strategy = mealStructure.lunchPlan?.[dayIndex] || 'batch';
            return (
              <button
                key={dayIndex}
                type="button"
                onClick={() => toggleLunchStrategy(dayIndex)}
                className={`text-sm px-3 py-1.5 rounded-card border ${
                  strategy === 'fresh' ? 'bg-gold/30 border-gold' : 'border-line'
                }`}
                title={strategy === 'fresh' ? 'Freshly cooked' : 'Batch lunch'}
              >
                {name.slice(0, 3)} · {strategy === 'fresh' ? 'Fresh' : 'Batch'}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl mb-1">Per-meal calorie limits</h2>
        <p className="text-sm text-ink/60 mb-4">
          Optional ceiling for each meal type — useful for a day where only one meal is planned
          (like dinner-only when lunch is a team outing) so that one meal doesn&apos;t inherit the
          whole day&apos;s calories. Leftover calories show up as Recommended supplements on the
          Today tab instead. Leave blank for no limit.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['breakfast', 'lunch', 'dinner', 'snack'].map((meal) => (
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
