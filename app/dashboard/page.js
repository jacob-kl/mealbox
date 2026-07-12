import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { currentWeekStart } from '@/lib/dates';
import { NavBar } from '@/components/ui';
import WeekView from '@/components/WeekView';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile?.onboarded) redirect('/onboarding');

  const weekStart = currentWeekStart();

  const { data: members } = await supabase
    .from('profiles')
    .select('id, display_name, color, target_calories, target_protein_g, target_carbs_g, target_fat_g')
    .eq('household_id', profile.household_id);

  const { data: weekPlan } = await supabase
    .from('week_plans')
    .select('id, cuisine_focus')
    .eq('household_id', profile.household_id)
    .eq('week_start', weekStart)
    .maybeSingle();

  let days = [];
  let lunches = [];

  if (weekPlan) {
    const { data: dayRows } = await supabase
      .from('week_plan_days')
      .select('*, recipe:recipe_id(id, name, cuisine, tags, macros_per_serving, steps, ingredients)')
      .eq('week_plan_id', weekPlan.id)
      .order('day_index');
    days = dayRows || [];

    const { data: lunchRows } = await supabase
      .from('week_plan_lunches')
      .select('*, recipe:recipe_id(id, name, cuisine, macros_per_serving)')
      .eq('week_plan_id', weekPlan.id);
    lunches = lunchRows || [];
  }

  return (
    <>
      <NavBar active="/dashboard" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <WeekView
          weekStart={weekStart}
          weekPlanId={weekPlan?.id ?? null}
          cuisineFocus={weekPlan?.cuisine_focus ?? null}
          members={members || []}
          days={days}
          lunches={lunches}
        />
      </main>
    </>
  );
}
