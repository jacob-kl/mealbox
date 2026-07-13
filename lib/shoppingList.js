// lib/shoppingList.js
// Aggregates every ingredient needed across a week's planned meals into a
// single shopping list. Shared meals (dinner/breakfast) sum servings across
// all members eating the same dish; individual meals (lunch/snacks) are
// summed as-is since each row already represents one person's pick.

/**
 * @param {Array} meals - week_plan_meals rows, each with a joined `recipe`
 *   object that includes `ingredients` and `base_servings`.
 * @returns {Array<{ingredient: string, qty: number, unit: string|null}>}
 */
export function buildShoppingList(meals) {
  const totals = {}; // ingredient name -> { qty, unit }

  for (const meal of meals) {
    const recipe = meal.recipe;
    if (!recipe?.ingredients?.length) continue;

    const totalServings = meal.profile_id
      ? meal.servings ?? 1
      : (meal.portions || []).reduce((sum, p) => sum + (p.servings || 0), 0);

    if (!totalServings) continue;

    const scale = totalServings / (recipe.base_servings || 1);

    for (const line of recipe.ingredients) {
      const neededQty = line.qty * scale;
      const key = line.ingredient;
      if (!totals[key]) {
        totals[key] = { ingredient: key, qty: 0, unit: line.unit || null };
      }
      totals[key].qty += neededQty;
    }
  }

  return Object.values(totals)
    .map((item) => ({ ...item, qty: Math.round(item.qty * 10) / 10 }))
    .sort((a, b) => a.ingredient.localeCompare(b.ingredient));
}
