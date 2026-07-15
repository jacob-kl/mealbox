import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
  if (weekPlan) {
    const { data } = await supabase
      .from('week_plan_meals')
      .select('*, recipe:recipe_id(id, name, cuisine, tags, macros_per_serving, steps, steps_detailed, ingredients, ingredients_full)')
      .eq('week_plan_id', weekPlan.id)
      .eq('day_index', dayIndex)
      .or(`profile_id.eq.${user.id},profile_id.is.null`);
    plannedMeals = data || [];
  }

  const { data: logEntries } = await supabase
    .from('meal_log')
    .select('*')
    .eq('profile_id', user.id)
    .eq('log_date', date);

  const { data: recipeCatalog } = await supabase
    .from('recipes')
    .select('id, name, meal_type, cuisine, tags, macros_per_serving, ingredients, steps')
    .or(`household_id.is.null,household_id.eq.${profile.household_id}`)
    .order('name');

  const { data: ingredientCatalog } = await supabase
    .from('ingredients')
    .select('name, cal, protein, carbs, fat, serving_qty, serving_unit, serving_label, sub_group, dietary_tags, allergens')
    .order('name');

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
          recipeCatalog={recipeCatalog || []}
          ingredientCatalog={ingredientCatalog || []}
          defaultToFull={defaultToFull}
          householdMembers={householdMembers || []}
        />
      </main>
    </>
  );
}
