import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeRecipeMacros } from '@/lib/nutrition';

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { weekPlanMealId, oldIngredient, newIngredient, newQty } = await request.json();
  if (!weekPlanMealId || !oldIngredient) {
    return NextResponse.json({ error: 'weekPlanMealId and oldIngredient are required' }, { status: 400 });
  }
  // newIngredient omitted = remove that ingredient entirely rather than
  // replacing it with something else.
  const isRemoval = !newIngredient;

  const { data: profile } = await supabase.from('profiles').select('household_id').eq('id', user.id).single();
  const householdId = profile?.household_id;

  const { data: meal } = await supabase
    .from('week_plan_meals')
    .select('id, recipe_id, recipe:recipe_id(base_servings, ingredients), ingredients_override, week_plan_id, week_plans!inner(household_id)')
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

  // Work from whatever ingredient list is currently in effect for this meal
  // instance — the personalized override if one exists (already normalized
  // to 1 serving), otherwise the base recipe's ingredients as seeded.
  const currentLines = meal.ingredients_override?.length
    ? meal.ingredients_override
    : meal.recipe?.ingredients || [];
  const baseServingsForCurrent = meal.ingredients_override?.length ? 1 : meal.recipe?.base_servings || 1;

  if (!currentLines.length) {
    return NextResponse.json({ error: 'No ingredients found for this meal to edit.' }, { status: 400 });
  }

  const targetIndex = currentLines.findIndex((l) => l.ingredient === oldIngredient);
  if (targetIndex === -1) {
    return NextResponse.json({ error: `"${oldIngredient}" isn't in this meal.` }, { status: 400 });
  }

  let updatedLines;
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
  }

  let macros;
  try {
    macros = computeRecipeMacros(updatedLines, ingredientsByName, baseServingsForCurrent);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const { error } = await supabase
    .from('week_plan_meals')
    .update({ ingredients_override: updatedLines, computed_macros: macros })
    .eq('id', weekPlanMealId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ingredients: updatedLines, macros });
}
