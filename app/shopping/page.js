import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { currentWeekStart, parseDate } from '@/lib/dates';
import { NavBar } from '@/components/ui';
import ShoppingList from '@/components/ShoppingList';

export default async function ShoppingPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single();
  if (!profile?.household_id) redirect('/onboarding');

  const weekStart = currentWeekStart(params?.week ? parseDate(params.week) : new Date());

  const { data: weekPlan } = await supabase
    .from('week_plans')
    .select('id')
    .eq('household_id', profile.household_id)
    .eq('week_start', weekStart)
    .maybeSingle();

  let meals = [];
  let checks = [];

  if (weekPlan) {
    const { data: mealRows } = await supabase
      .from('week_plan_meals')
      .select('*, recipe:recipe_id(ingredients, base_servings)')
      .eq('week_plan_id', weekPlan.id);
    meals = mealRows || [];

    const { data: checkRows } = await supabase
      .from('shopping_list_checks')
      .select('ingredient_name, checked')
      .eq('week_plan_id', weekPlan.id);
    checks = checkRows || [];
  }

  return (
    <>
      <NavBar active="/shopping" />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <ShoppingList weekStart={weekStart} weekPlanId={weekPlan?.id ?? null} meals={meals} checks={checks} />
      </main>
    </>
  );
}
