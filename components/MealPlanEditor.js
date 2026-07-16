'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULT_ON = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };
const DEFAULT_STRATEGY = { 0: 'batch', 1: 'batch', 2: 'batch', 3: 'batch', 4: 'batch', 5: 'batch', 6: 'batch' };
const DEFAULT_MEAL_DAYS = {
  0: { breakfast: false, dinner: true, dessert: false },
  1: { breakfast: false, dinner: true, dessert: false },
  2: { breakfast: false, dinner: true, dessert: false },
  3: { breakfast: false, dinner: true, dessert: false },
  4: { breakfast: false, dinner: true, dessert: false },
  5: { breakfast: false, dinner: true, dessert: false },
  6: { breakfast: true, dinner: false, dessert: false },
};

function buildProfileState(m) {
  return {
    lunch: {
      days: { ...DEFAULT_ON, ...(m.lunch_schedule?.days || {}) },
      strategy: { ...DEFAULT_STRATEGY, ...(m.lunch_schedule?.strategy || {}) },
    },
    mealDays: Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { ...DEFAULT_MEAL_DAYS[d], ...(m.meal_days?.[d] || {}) }])
    ),
    snacksPerDay: m.snacks_per_day ?? 1,
  };
}

/**
 * Per-person meal planning: which days each person wants breakfast/dinner/
 * dessert (a shared dish still gets cooked if anyone wants it that day -
 * this is about whether THIS person gets a portion), their own lunch
 * schedule (days + batch/fresh), and their own snack count. Tabs switch
 * between people; the head chef can edit anyone's and copy one person's
 * whole setup to everyone else at once.
 */
export default function MealPlanEditor({ members, currentUserId, isHeadOfKitchen }) {
  const supabase = createClient();
  const [activeId, setActiveId] = useState(members[0]?.id);
  const [state, setState] = useState(Object.fromEntries(members.map((m) => [m.id, buildProfileState(m)])));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!members?.length) {
    return <p className="text-sm text-ink/50">No household members found yet.</p>;
  }

  const active = members.find((m) => m.id === activeId);
  const canEditActive = isHeadOfKitchen || activeId === currentUserId;
  const current = state[activeId] || buildProfileState({});

  function update(fn) {
    setSaved(false);
    setCopied(false);
    setState((prev) => ({ ...prev, [activeId]: fn(prev[activeId]) }));
  }

  function toggleMealDay(dayIndex, mealType) {
    update((s) => ({
      ...s,
      mealDays: { ...s.mealDays, [dayIndex]: { ...s.mealDays[dayIndex], [mealType]: !s.mealDays[dayIndex][mealType] } },
    }));
  }

  function toggleLunchDay(dayIndex) {
    update((s) => ({ ...s, lunch: { ...s.lunch, days: { ...s.lunch.days, [dayIndex]: !s.lunch.days[dayIndex] } } }));
  }

  function toggleLunchStrategy(dayIndex) {
    update((s) => ({
      ...s,
      lunch: { ...s.lunch, strategy: { ...s.lunch.strategy, [dayIndex]: s.lunch.strategy[dayIndex] === 'batch' ? 'fresh' : 'batch' } },
    }));
  }

  function setSnacksPerDay(n) {
    update((s) => ({ ...s, snacksPerDay: n }));
  }

  async function persist(profileId, profileState) {
    await supabase
      .from('profiles')
      .update({
        lunch_schedule: profileState.lunch,
        meal_days: profileState.mealDays,
        snacks_per_day: profileState.snacksPerDay,
      })
      .eq('id', profileId);
  }

  async function handleSave() {
    setSaving(true);
    await persist(activeId, current);
    setSaving(false);
    setSaved(true);
  }

  async function copyToAll() {
    setCopying(true);
    setCopied(false);
    const others = members.filter((m) => m.id !== activeId);
    setState((prev) => {
      const next = { ...prev };
      for (const m of others) next[m.id] = current;
      return next;
    });
    await Promise.all(others.map((m) => persist(m.id, current)));
    await persist(activeId, current);
    setCopying(false);
    setCopied(true);
    setSaved(true);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setActiveId(m.id);
              setSaved(false);
              setCopied(false);
            }}
            className={`text-sm px-3 py-1.5 rounded-card border ${
              activeId === m.id ? 'bg-pine text-white border-pine' : 'border-line'
            }`}
          >
            {m.display_name}
          </button>
        ))}
      </div>

      {!canEditActive && (
        <p className="text-xs text-ink/50 mb-3">Only {active?.display_name} or the head chef can change this.</p>
      )}

      <p className="text-xs font-medium text-ink/60 mb-1.5">Breakfast &amp; dinner &amp; dessert</p>
      <p className="text-xs text-ink/50 mb-2">
        A shared dish still gets cooked if anyone in the household wants it that day - this is just whether{' '}
        {active?.display_name} gets a portion of it.
      </p>
      <div className="overflow-x-auto mb-4">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="text-left font-normal text-ink/50 pb-1 pr-3"></th>
              {['breakfast', 'dinner', 'dessert'].map((meal) => (
                <th key={meal} className="font-normal text-ink/50 pb-1 px-2 capitalize">
                  {meal}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_NAMES.map((name, dayIndex) => (
              <tr key={dayIndex} className="border-t border-line">
                <td className="py-1 pr-3 whitespace-nowrap">{name}</td>
                {['breakfast', 'dinner', 'dessert'].map((meal) => (
                  <td key={meal} className="text-center py-1 px-2">
                    <input
                      type="checkbox"
                      checked={!!current.mealDays[dayIndex]?.[meal]}
                      onChange={() => toggleMealDay(dayIndex, meal)}
                      disabled={!canEditActive}
                      className="w-4 h-4 accent-pine cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs font-medium text-ink/60 mb-1.5">Lunch</p>
      <div className="space-y-1.5 mb-4">
        {DAY_NAMES.map((name, dayIndex) => {
          const enabled = !!current.lunch.days[dayIndex];
          const strategy = current.lunch.strategy[dayIndex] || 'batch';
          return (
            <div key={dayIndex} className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2 w-32 shrink-0">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleLunchDay(dayIndex)}
                  disabled={!canEditActive}
                  className="w-4 h-4 accent-pine cursor-pointer disabled:cursor-not-allowed"
                />
                {name}
              </label>
              {enabled && (
                <button
                  type="button"
                  onClick={() => toggleLunchStrategy(dayIndex)}
                  disabled={!canEditActive}
                  className={`text-xs px-3 py-1 rounded-card border disabled:cursor-not-allowed ${
                    strategy === 'fresh' ? 'bg-gold/30 border-gold' : 'border-line'
                  }`}
                >
                  {strategy === 'fresh' ? 'Fresh' : 'Batch'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs font-medium text-ink/60 mb-1.5">Snacks per day</p>
      <select
        value={current.snacksPerDay}
        onChange={(e) => setSnacksPerDay(Number(e.target.value))}
        disabled={!canEditActive}
        className="border border-line rounded-card px-3 py-1.5 bg-card text-sm mb-4 disabled:opacity-50"
      >
        {[0, 1, 2, 3, 4].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      {canEditActive && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-card bg-pine text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved && !copied ? 'Saved ✓' : `Save ${active?.display_name}'s plan`}
          </button>
          {isHeadOfKitchen && members.length > 1 && (
            <button
              type="button"
              onClick={copyToAll}
              disabled={copying}
              className="text-xs px-3 py-1.5 rounded-card border border-line hover:bg-paper disabled:opacity-50"
            >
              {copying ? 'Copying…' : copied ? 'Copied to everyone ✓' : `Copy ${active?.display_name}'s plan to everyone`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
