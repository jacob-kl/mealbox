import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeRecipeMacros } from '@/lib/nutrition';
import { canEditMealPlan } from '@/lib/permissions';
import { rewriteStepsForSubstitution } from '@/lib/stepRewrite';

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { weekPlanMealId, oldIngredient, newIngredient, newQty, listType = 'quick' } = await request.json();
  if (!weekPlanMealId || !oldIngredient) {
    return NextResponse.json({ error: 'weekPlanMealId and oldIngredient are required' }, { status: 400 });
  }
  if (listType !== 'quick' && listType !== 'full') {
    return NextResponse.json({ error: 'listType must be "quick" or "full"' }, { status: 400 });
  }
  // newIngredient omitted = remove that ingredient entirely rather than
  // replacing it with something else.
  const isRemoval = !newIngredient;

  const { data: profile } = await supabase.from('profiles').select('household_id, household_role').eq('id', user.id).single();
  const householdId = profile?.household_id;

  if (!canEditMealPlan(profile?.household_role)) {
    return NextResponse.json({ error: 'Only the head chef or sous chefs can edit the meal plan.' }, { status: 403 });
  }

  const { data: meal } = await supabase
    .from('week_plan_meals')
    .select(
      'id, recipe_id, recipe:recipe_id(base_servings, ingredients, ingredients_full, steps, steps_detailed), ' +
        'ingredients_override, ingredients_full_override, steps_override, steps_full_override, ' +
        'week_plan_id, week_plans!inner(household_id)'
    )
    .eq('id', weekPlanMealId)
    .single();

  if (!meal || meal.week_plans?.household_id !== householdId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: ingredientRows } = await supabase.from('ingredients').select('*');
  const ingredientsByName = Object.fromEntries((ingredientRows || []).map((i) => [i.name, i]));

  if (!isRemoval && !ingredientsByName[newIngredient]) {
    return NextResponse.json({ error: `"${newIngredient}" isn't in the ingredient database yet.` }, { status: 400 });
  }

  // Quick and full are edited independently - each has its own ingredient
  // list, its own steps, and its own override columns. Work from whichever
  // one this request targets.
  const ingredientsField = listType === 'full' ? 'ingredients_full' : 'ingredients';
  const overrideField = listType === 'full' ? 'ingredients_full_override' : 'ingredients_override';
  const stepsField = listType === 'full' ? 'steps_detailed' : 'steps';
  const stepsOverrideField = listType === 'full' ? 'steps_full_override' : 'steps_override';
  const macrosField = listType === 'full' ? 'computed_macros_full' : 'computed_macros';

  const currentLines = meal[overrideField]?.length ? meal[overrideField] : meal.recipe?.[ingredientsField] || [];
  const baseServingsForCurrent = meal[overrideField]?.length ? 1 : meal.recipe?.base_servings || 1;
  const currentSteps = meal[stepsOverrideField]?.length ? meal[stepsOverrideField] : meal.recipe?.[stepsField] || [];

  if (!currentLines.length) {
    return NextResponse.json({ error: 'No ingredients found for this meal to edit.' }, { status: 400 });
  }

  const targetIndex = currentLines.findIndex((l) => l.ingredient === oldIngredient);
  if (targetIndex === -1) {
    return NextResponse.json({ error: `"${oldIngredient}" isn't in this meal.` }, { status: 400 });
  }

  let updatedLines;
  let updatedSteps = currentSteps;
  if (isRemoval) {
    updatedLines = currentLines.filter((_, i) => i !== targetIndex);
  } else {
    const newIngredientRow = ingredientsByName[newIngredient];
    updatedLines = currentLines.map((l, i) =>
      i === targetIndex
        ? {
            ingredient: newIngredient,
            qty: newQty != null ? newQty : newIngredientRow.serving_qty,
            note: `swapped for ${oldIngredient}`,
            unit: newIngredientRow.serving_unit || null,
          }
        : l
    );
    // Best-effort: update the wording of the steps to match, so instructions
    // don't keep naming an ingredient that's no longer actually in the dish.
    const { steps: rewritten } = rewriteStepsForSubstitution(currentSteps, oldIngredient, newIngredient);
    updatedSteps = rewritten;
  }

  let macros;
  try {
    macros = computeRecipeMacros(updatedLines, ingredientsByName, baseServingsForCurrent);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const updatePayload = { [overrideField]: updatedLines, [macrosField]: macros };
  if (updatedSteps !== currentSteps) updatePayload[stepsOverrideField] = updatedSteps;

  const { error } = await supabase.from('week_plan_meals').update(updatePayload).eq('id', weekPlanMealId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ingredients: updatedLines, macros, steps: updatedSteps });
}
