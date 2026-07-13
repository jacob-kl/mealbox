import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { swapMeal, DEFAULT_STRUCTURE_RULES, MEAL_CALORIE_SHARE, DEFAULT_MEAL_STRUCTURE } from '@/lib/weekBuilder';

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { weekPlanId, dayIndex, mealSlot, profileId = null, cuisine = null } = await request.json();
  if (!weekPlanId || dayIndex == null || !mealSlot) {
    return NextResponse.json({ error: 'weekPlanId, dayIndex, and mealSlot are required' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single();
  const householdId = profile?.household_id;

  const { data: weekPlan } = await supabase
    .from('week_plans')
    .select('household_id')
    .eq('id', weekPlanId)
    .single();
  if (!weekPlan || weekPlan.household_id !== householdId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: household } = await supabase
    .from('households')
    .select('settings')
    .eq('id', householdId)
    .single();
  const structureRules = household?.settings?.structureRules || DEFAULT_STRUCTURE_RULES;
  const blockedTags = household?.settings?.blockedTags || [];

  const isSharedSlot = mealSlot === 'dinner' || mealSlot === 'breakfast';
  const rule = isSharedSlot
    ? structureRules.find((r) => r.dayIndex === dayIndex && r.mealType === mealSlot) || {
        dayIndex,
        mealType: mealSlot,
        requiredTag: null,
      }
    : null;

  const mealType = isSharedSlot ? mealSlot : mealSlot.startsWith('snack') ? 'snack' : 'lunch';

  let query = supabase
    .from('week_plan_meals')
    .select('recipe_id')
    .eq('week_plan_id', weekPlanId)
    .eq('day_index', dayIndex)
    .eq('meal_slot', mealSlot);
  query = profileId ? query.eq('profile_id', profileId) : query.is('profile_id', null);
  const { data: currentMeal } = await query.maybeSingle();

  const { data: members } = await supabase
    .from('profiles')
    .select('id, target_calories')
    .eq('household_id', householdId);

  const { data: recipePool } = await supabase
    .from('recipes')
    .select('*')
    .or(`household_id.is.null,household_id.eq.${householdId}`);

  const membersForBuilder = (members || []).map((m) => ({
    id: m.id,
    targetCalories: m.target_calories || 2000,
  }));

  const newMeal = swapMeal({
    recipePool: recipePool || [],
    dayIndex,
    mealSlot,
    mealType,
    requiredTag: rule?.requiredTag ?? null,
    members: membersForBuilder,
    profileId,
    blockedTags,
    cuisine,
    excludeId: currentMeal?.recipe_id,
    calorieShare: MEAL_CALORIE_SHARE[mealType],
  });

  const update = {
    recipe_id: newMeal.recipeId,
    label: newMeal.label,
    ...(profileId ? { servings: newMeal.servings } : { portions: newMeal.portions }),
  };

  let updateQuery = supabase
    .from('week_plan_meals')
    .update(update)
    .eq('week_plan_id', weekPlanId)
    .eq('day_index', dayIndex)
    .eq('meal_slot', mealSlot);
  updateQuery = profileId ? updateQuery.eq('profile_id', profileId) : updateQuery.is('profile_id', null);
  const { error } = await updateQuery;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ meal: newMeal });
}
