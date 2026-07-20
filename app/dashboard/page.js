import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { currentWeekStart, dayIndexForDate, isoDate, parseDate } from '@/lib/dates';
import { NavBar } from '@/components/ui';
import DayView from '@/components/DayView';

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile?.onboarded) redirect('/onboarding');

  const { data: household } = await supabase.from('households').select('settings').eq('id', profile.household_id).single();
  const defaultToFull = household?.settings?.recipeDetailDefault !== 'quick';

  const { data: householdMembers } = await supabase
    .from('profiles')
    .select('id, display_name, allergies')
    .eq('household_id', profile.household_id);

  const date = params?.date || isoDate();
  const weekStart = currentWeekStart(parseDate(date));
  const dayIndex = dayIndexForDate(parseDate(date));

  const { data: weekPlan } = await supabase
    .from('week_plans')
    .select('id')
    .eq('household_id', profile.household_id)
    .eq('week_start', weekStart)
    .maybeSingle();

  let plannedMeals = [];
  let lunchBatchCount = {};
  if (weekPlan) {
    const { data } = await supabase
      .from('week_plan_meals')
      .select('*, recipe:recipe_id(id, name, cuisine, tags, macros_per_serving, macros_per_serving_full, steps, steps_detailed, ingredients, ingredients_full)')
      .eq('week_plan_id', weekPlan.id)
      .eq('day_index', dayIndex)
      .or(`profile_id.eq.${user.id},profile_id.is.null`);
    plannedMeals = data || [];

    const { data: weekLunches } = await supabase
      .from('week_plan_meals')
      .select('profile_id, recipe_id')
      .eq('week_plan_id', weekPlan.id)
      .eq('meal_slot', 'lunch')
      .eq('profile_id', user.id);
    for (const m of weekLunches || []) {
      if (!m.recipe_id) continue;
      const key = `${m.profile_id}-${m.recipe_id}`;
      lunchBatchCount[key] = (lunchBatchCount[key] || 0) + 1;
    }

    if (plannedMeals.length) {
      const { data: reactionRows } = await supabase
        .from('meal_reactions')
        .select('week_plan_meal_id, profile_id, reaction')
        .in('week_plan_meal_id', plannedMeals.map((m) => m.id));
      const reactionsByMeal = {};
      for (const r of reactionRows || []) {
        reactionsByMeal[r.week_plan_meal_id] = reactionsByMeal[r.week_plan_meal_id] || [];
        reactionsByMeal[r.week_plan_meal_id].push({ profile_id: r.profile_id, reaction: r.reaction });
      }
      plannedMeals = plannedMeals.map((m) => ({ ...m, reactions: reactionsByMeal[m.id] || [] }));
    }
  }

  const { data: logEntries } = await supabase
    .from('meal_log')
    .select('*')
    .eq('profile_id', user.id)
    .eq('log_date', date);

  const recipeCatalog = await fetchAll(() =>
    supabase
      .from('recipes')
      .select('id, name, meal_type, cuisine, tags, macros_per_serving, ingredients, steps')
      .or(`household_id.is.null,household_id.eq.${profile.household_id}`)
      .order('name')
      .order('id')
  );

  const ingredientCatalog = await fetchAll(() =>
    supabase
      .from('ingredients')
      .select('name, cal, protein, carbs, fat, serving_qty, serving_unit, serving_label, sub_group, dietary_tags, allergens')
      .order('name')
      .order('id')
  );

  return (
    <>
      <NavBar active="/dashboard" />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <DayView
          date={date}
          profile={profile}
          plannedMeals={plannedMeals}
          logEntries={logEntries || []}
          hasWeekPlan={!!weekPlan}
          recipeCatalog={recipeCatalog}
          ingredientCatalog={ingredientCatalog}
          defaultToFull={defaultToFull}
          householdMembers={householdMembers || []}
          lunchBatchCount={lunchBatchCount}
        />
      </main>
    </>
  );
}
