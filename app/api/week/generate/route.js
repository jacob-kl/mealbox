import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateWeek, DEFAULT_MEAL_DAYS, DEFAULT_MEAL_STRUCTURE } from '@/lib/weekBuilder';

export async function POST(request) {
  const supabase = await createClient();
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

  const mealDays = household?.settings?.mealDays || DEFAULT_MEAL_DAYS;
  const mealStructure = household?.settings?.mealStructure || DEFAULT_MEAL_STRUCTURE;
  const blockedTags = household?.settings?.blockedTags || [];

  const { data: members } = await supabase
    .from('profiles')
    .select('id, display_name, color, target_calories, target_protein_g')
    .eq('household_id', householdId);

  const { data: recipePool } = await supabase
    .from('recipes')
    .select('*')
    .or(`household_id.is.null,household_id.eq.${householdId}`);

  const { data: ingredients } = await supabase.from('ingredients').select('*');
  const ingredientsByName = Object.fromEntries((ingredients || []).map((i) => [i.name, i]));

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
    const { data: recentMeals } = await supabase
      .from('week_plan_meals')
      .select('recipe_id')
      .in('week_plan_id', planIds);
    recentRecipeIds = (recentMeals || []).map((d) => d.recipe_id).filter(Boolean);
  }

  const membersForBuilder = (members || []).map((m) => ({
    id: m.id,
    targetCalories: m.target_calories || 2000,
    targetProteinG: m.target_protein_g ?? null,
  }));

  const meals = generateWeek({
    recipePool: recipePool || [],
    members: membersForBuilder,
    mealDays,
    mealStructure,
    blockedTags,
    cuisineFocus,
    recentRecipeIds,
    ingredientsByName,
  });

  const { data: weekPlan, error: weekPlanError } = await supabase
    .from('week_plans')
    .upsert({ household_id: householdId, week_start: weekStart, cuisine_focus: cuisineFocus }, { onConflict: 'household_id,week_start' })
    .select()
    .single();

  if (weekPlanError) return NextResponse.json({ error: weekPlanError.message }, { status: 500 });

  await supabase.from('week_plan_meals').delete().eq('week_plan_id', weekPlan.id);

  const rows = meals.map((m) => ({
    week_plan_id: weekPlan.id,
    day_index: m.dayIndex,
    meal_slot: m.mealSlot,
    profile_id: m.profileId,
    recipe_id: m.recipeId,
    label: m.label,
    course: m.course || 'main',
    servings: m.servings ?? 1,
    portions: m.portions ?? [],
    computed_macros: m.computedMacros ?? null,
    ingredients_override: m.ingredientsOverride ?? null,
  }));

  if (rows.length) {
    const { error: insertError } = await supabase.from('week_plan_meals').insert(rows);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ weekPlanId: weekPlan.id, meals });
}
