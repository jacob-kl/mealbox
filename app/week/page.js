import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { currentWeekStart, parseDate } from '@/lib/dates';
import { NavBar } from '@/components/ui';
import WeekView from '@/components/WeekView';

export default async function WeekPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile?.onboarded) redirect('/onboarding');

  const weekStart = currentWeekStart(params?.week ? parseDate(params.week) : new Date());

  const { data: household } = await supabase
    .from('households')
    .select('id, settings')
    .eq('id', profile.household_id)
    .single();

  const { data: members } = await supabase
    .from('profiles')
    .select('id, display_name, color, target_calories, target_protein_g, target_carbs_g, target_fat_g, allergies')
    .eq('household_id', profile.household_id);

  const { data: weekPlan } = await supabase
    .from('week_plans')
    .select('id, cuisine_focus')
    .eq('household_id', profile.household_id)
    .eq('week_start', weekStart)
    .maybeSingle();

  let meals = [];

  if (weekPlan) {
    const { data: mealRows } = await supabase
      .from('week_plan_meals')
      .select('*, recipe:recipe_id(id, name, cuisine, tags, macros_per_serving, steps, steps_detailed, ingredients, ingredients_full)')
      .eq('week_plan_id', weekPlan.id)
      .order('day_index');
    meals = mealRows || [];
  }

  const { data: ingredientCatalog } = await supabase
    .from('ingredients')
    .select('name, cal, protein, carbs, fat, serving_qty, serving_unit, sub_group, dietary_tags, allergens')
    .order('name');

  return (
    <>
      <NavBar active="/week" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <WeekView
          weekStart={weekStart}
          weekPlanId={weekPlan?.id ?? null}
          cuisineFocus={weekPlan?.cuisine_focus ?? null}
          household={household}
          members={members || []}
          meals={meals}
          ingredientCatalog={ingredientCatalog || []}
        />
      </main>
    </>
  );
}
