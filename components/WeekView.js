'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Badge, Button, CUISINES } from '@/components/ui';
import { dayLabel } from '@/lib/dates';

function scaledMacrosFor(recipe, portions, profileId) {
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

export default function WeekView({ weekStart, weekPlanId, cuisineFocus, members, days, lunches }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [swappingDay, setSwappingDay] = useState(null);
  const [cuisineChoice, setCuisineChoice] = useState(cuisineFocus || '');

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

  async function swapDay(dayIndex, cuisine = null) {
    setSwappingDay(dayIndex);
    await fetch('/api/week/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekPlanId, dayIndex, cuisine }),
    });
    setSwappingDay(null);
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
            &ldquo;Any cuisine&rdquo; and let Mealbox build the week from your recipe library.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {days.map((day) => (
            <Card key={day.day_index}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="tab-label text-ink/50">{dayLabel(weekStart, day.day_index)}</p>
                  {day.label && (
                    <Badge tone="gold" className="mt-1">
                      {day.label}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => swapDay(day.day_index)}
                  disabled={swappingDay === day.day_index}
                >
                  {swappingDay === day.day_index ? 'Swapping…' : 'Swap'}
                </Button>
              </div>

              {day.recipe ? (
                <>
                  <h3 className="font-display text-xl mb-1">{day.recipe.name}</h3>
                  <p className="text-xs text-ink/50 capitalize mb-3">{day.recipe.cuisine}</p>
                  <div className="space-y-1.5">
                    {members.map((member) => {
                      const macros = scaledMacrosFor(day.recipe, day.portions, member.id);
                      if (!macros) return null;
                      return (
                        <div key={member.id} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{ backgroundColor: member.color }}
                            />
                            {member.display_name}
                          </span>
                          <span className="font-mono text-xs text-ink/70">
                            {macros.cal} cal · {macros.protein}p · {macros.carbs}c · {macros.fat}f
                            <span className="text-ink/40"> ({macros.servings}x)</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink/50 italic">
                  No recipe matched this slot&apos;s rules — try swapping, or loosen the dietary
                  filters in Settings.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {lunches?.length > 0 && (
        <div className="mt-8">
          <p className="tab-label text-rust mb-3">Batch lunches this week</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {lunches.map((lunch) => {
              const member = members.find((m) => m.id === lunch.profile_id);
              if (!lunch.recipe) return null;
              const m = lunch.recipe.macros_per_serving;
              return (
                <Card key={lunch.id}>
                  <p className="text-sm flex items-center gap-1.5 mb-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: member?.color }}
                    />
                    {member?.display_name}
                  </p>
                  <h3 className="font-display text-lg mb-1">{lunch.recipe.name}</h3>
                  <p className="font-mono text-xs text-ink/70">
                    {Math.round(m.cal * lunch.servings)} cal · {Math.round(m.protein * lunch.servings)}p ·{' '}
                    {Math.round(m.carbs * lunch.servings)}c · {Math.round(m.fat * lunch.servings)}f
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
