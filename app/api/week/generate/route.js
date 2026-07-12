import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateWeek, DEFAULT_STRUCTURE_RULES } from '@/lib/weekBuilder';

export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { weekStart, cuisineFocus = null } = await request.json();
  if (!weekStart) return NextResponse.json({ error: 'weekStart is required (YYYY-MM-DD)' }, { status: 400 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single();

  const householdId = profile?.household_id;
  if (!householdId) return NextResponse.json({ error: 'No household on this profile' }, { status: 400 });

  const { data: household } = await supabase
    .from('households')
    .select('settings')
    .eq('id', householdId)
    .single();

  const structureRules = household?.settings?.structureRules || DEFAULT_STRUCTURE_RULES;
  const blockedTags = household?.settings?.blockedTags || [];

  const { data: members } = await supabase
    .from('profiles')
    .select('id, display_name, color, target_calories')
    .eq('household_id', householdId);

  const { data: recipePool } = await supabase
    .from('recipes')
    .select('*')
    .or(`household_id.is.null,household_id.eq.${householdId}`);

  // Avoid repeating recipes used in the last 14 days.
  const twoWeeksAgo = new Date(new Date(weekStart).getTime() - 14 * 86400000)
    .toISOString()
    .slice(0, 10);
  const { data: recentPlans } = await supabase
    .from('week_plans')
    .select('id')
    .eq('household_id', householdId)
    .gte('week_start', twoWeeksAgo)
    .lt('week_start', weekStart);

  let recentRecipeIds = [];
  if (recentPlans?.length) {
    const planIds = recentPlans.map((p) => p.id);
    const { data: recentDays } = await supabase
      .from('week_plan_days')
      .select('recipe_id')
      .in('week_plan_id', planIds);
    recentRecipeIds = (recentDays || []).map((d) => d.recipe_id).filter(Boolean);
  }

  const membersForBuilder = (members || []).map((m) => ({
    id: m.id,
    targetCalories: m.target_calories || 2000,
  }));

  const plan = generateWeek({
    recipePool: recipePool || [],
    members: membersForBuilder,
    structureRules,
    blockedTags,
    cuisineFocus,
    recentRecipeIds,
  });

  // Upsert the week_plans row, then replace its days/lunches.
  const { data: weekPlan, error: weekPlanError } = await supabase
    .from('week_plans')
    .upsert({ household_id: householdId, week_start: weekStart, cuisine_focus: cuisineFocus }, { onConflict: 'household_id,week_start' })
    .select()
    .single();

  if (weekPlanError) return NextResponse.json({ error: weekPlanError.message }, { status: 500 });

  await supabase.from('week_plan_days').delete().eq('week_plan_id', weekPlan.id);
  await supabase.from('week_plan_lunches').delete().eq('week_plan_id', weekPlan.id);

  const dayRows = plan.days.map((d) => ({
    week_plan_id: weekPlan.id,
    day_index: d.dayIndex,
    meal_type: d.mealType,
    label: d.label,
    recipe_id: d.recipeId,
    portions: d.portions,
  }));
  const { error: daysError } = await supabase.from('week_plan_days').insert(dayRows);
  if (daysError) return NextResponse.json({ error: daysError.message }, { status: 500 });

  const lunchRows = plan.lunches.map((l) => ({
    week_plan_id: weekPlan.id,
    profile_id: l.profileId,
    recipe_id: l.recipeId,
    servings: l.servings,
  }));
  if (lunchRows.length) {
    const { error: lunchError } = await supabase.from('week_plan_lunches').insert(lunchRows);
    if (lunchError) return NextResponse.json({ error: lunchError.message }, { status: 500 });
  }

  return NextResponse.json({ weekPlanId: weekPlan.id, plan });
}
