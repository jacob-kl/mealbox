import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { swapMeal, computeMealShares, COURSE_SHARE, DEFAULT_MEAL_DAYS, DEFAULT_MEAL_STRUCTURE } from '@/lib/weekBuilder';
import { canEditMealPlan } from '@/lib/permissions';

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { weekPlanId, dayIndex, mealSlot, profileId = null, course = 'main', cuisine = null } = await request.json();
  if (!weekPlanId || dayIndex == null || !mealSlot) {
    return NextResponse.json({ error: 'weekPlanId, dayIndex, and mealSlot are required' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id, household_role')
    .eq('id', user.id)
    .single();
  const householdId = profile?.household_id;

  if (!canEditMealPlan(profile?.household_role)) {
    return NextResponse.json({ error: 'Only the head of kitchen or kitchen members can edit the meal plan.' }, { status: 403 });
  }

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
  const blockedTags = household?.settings?.blockedTags || [];
  const mealDays = household?.settings?.mealDays || DEFAULT_MEAL_DAYS;
  const mealStructure = household?.settings?.mealStructure || DEFAULT_MEAL_STRUCTURE;
  const snacksPerDay = Math.max(0, Math.min(4, mealStructure.snacksPerDay ?? 1));

  const isSharedSlot = mealSlot === 'dinner' || mealSlot === 'breakfast' || mealSlot === 'dessert';
  const mealType = isSharedSlot ? mealSlot : mealSlot.startsWith('snack') ? 'snack' : 'lunch';

  const dayShares = computeMealShares(mealDays[dayIndex] || {}, snacksPerDay);
  let baseShare = mealType === 'snack' ? dayShares.snack / snacksPerDay || 0 : dayShares[mealType];

  let query = supabase
    .from('week_plan_meals')
    .select('recipe_id')
    .eq('week_plan_id', weekPlanId)
    .eq('day_index', dayIndex)
    .eq('meal_slot', mealSlot);
  if (isSharedSlot) query = query.eq('course', course).is('profile_id', null);
  else query = profileId ? query.eq('profile_id', profileId) : query.is('profile_id', null);
  const { data: currentMeal } = await query.maybeSingle();

  const { data: members } = await supabase
    .from('profiles')
    .select('id, target_calories, target_protein_g, target_carbs_g')
    .eq('household_id', householdId);

  const { data: recipePool } = await supabase
    .from('recipes')
    .select('*')
    .or(`household_id.is.null,household_id.eq.${householdId}`);

  const { data: ingredients } = await supabase.from('ingredients').select('*');
  const ingredientsByName = Object.fromEntries((ingredients || []).map((i) => [i.name, i]));

  const membersForBuilder = (members || []).map((m) => ({
    id: m.id,
    targetCalories: m.target_calories || 2000,
    targetProteinG: m.target_protein_g ?? null,
    targetCarbsG: m.target_carbs_g ?? null,
  }));

  // If this is a paired main/side, only search for that course's recipes
  // and only swap that one course's share of the slot's budget. If there's
  // no sibling row, this is a standalone shared meal — search the combined
  // complete+main pool (same as generation) rather than restricting to
  // 'complete' only, so swapping doesn't lose access to most of the library.
  let calorieShare = baseShare;
  let filterCourse = null;
  let filterCourseIn = mealSlot === 'dinner' ? ['complete', 'main'] : null;
  if (isSharedSlot && mealSlot === 'dinner') {
    const { data: sibling } = await supabase
      .from('week_plan_meals')
      .select('id')
      .eq('week_plan_id', weekPlanId)
      .eq('day_index', dayIndex)
      .eq('meal_slot', mealSlot)
      .is('profile_id', null)
      .neq('course', course)
      .maybeSingle();
    if (sibling) {
      filterCourseIn = null;
      filterCourse = course;
      calorieShare = baseShare * (COURSE_SHARE[course] ?? 1);
    }
  }

  const newMeal = swapMeal({
    recipePool: recipePool || [],
    dayIndex,
    mealSlot,
    mealType,
    course,
    filterCourse,
    filterCourseIn,
    members: membersForBuilder,
    profileId,
    blockedTags,
    cuisine,
    excludeId: currentMeal?.recipe_id,
    calorieShare,
    ingredientsByName,
    mealCaps: mealStructure.mealCaps || DEFAULT_MEAL_STRUCTURE.mealCaps,
  });

  const update = {
    recipe_id: newMeal.recipeId,
    label: newMeal.label,
    computed_macros: newMeal.computedMacros ?? null,
    ingredients_override: newMeal.ingredientsOverride ?? null,
    ...(profileId ? { servings: newMeal.servings } : { portions: newMeal.portions }),
  };

  let updateQuery = supabase
    .from('week_plan_meals')
    .update(update)
    .eq('week_plan_id', weekPlanId)
    .eq('day_index', dayIndex)
    .eq('meal_slot', mealSlot);
  if (isSharedSlot) updateQuery = updateQuery.eq('course', course).is('profile_id', null);
  else updateQuery = profileId ? updateQuery.eq('profile_id', profileId) : updateQuery.is('profile_id', null);
  const { error } = await updateQuery;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ meal: newMeal });
}
