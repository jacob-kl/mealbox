// lib/shoppingList.js
// Aggregates every ingredient needed across a week's planned meals into a
// single shopping list. Shared meals (dinner/breakfast) sum servings across
// all members eating the same dish; individual meals (lunch/snacks) are
// summed as-is since each row already represents one person's pick.
//
// Grocery-friendly conversion: nobody shops in grams. For ingredients that
// are actually bought as a can, bunch, or whole produce item, convert the
// raw gram total into "how many of these to grab" instead.

const SHOPPING_UNITS = {
  'Black beans': { unit: 'can', label: 'can(s)', per: 250 },
  'Cannellini beans': { unit: 'can', label: 'can(s)', per: 250 },
  'Garbanzo beans': { unit: 'can', label: 'can(s)', per: 250 },
  'Pinto beans': { unit: 'can', label: 'can(s)', per: 250 },
  'Diced tomatoes (canned)': { unit: 'can', label: 'can(s)', per: 400 },
  'Canned tuna (in water)': { unit: 'can', label: 'can(s)', per: 120 },
  'Frozen peas': { unit: 'bag', label: 'bag(s), frozen', per: 450 },
  'Frozen edamame (shelled)': { unit: 'bag', label: 'bag(s), frozen', per: 340 },
  'Frozen shrimp': { unit: 'bag', label: 'bag(s), frozen', per: 450 },
  'Frozen mixed berries': { unit: 'bag', label: 'bag(s), frozen', per: 300 },
  'Frozen mango chunks': { unit: 'bag', label: 'bag(s), frozen', per: 300 },
  'Yellow onion': { unit: 'onion', label: 'medium onion(s)', per: 110 },
  'Red onion': { unit: 'onion', label: 'medium red onion(s)', per: 150 },
  Carrot: { unit: 'carrot', label: 'large carrot(s)', per: 70 },
  'English cucumber': { unit: 'cucumber', label: 'cucumber(s)', per: 300 },
  'Bell pepper': { unit: 'pepper', label: 'bell pepper(s)', per: 120 },
  'Red bell pepper': { unit: 'pepper', label: 'red bell pepper(s)', per: 120 },
  Zucchini: { unit: 'zucchini', label: 'zucchini', per: 200 },
  'Sweet potato': { unit: 'sweet potato', label: 'sweet potato(es)', per: 130 },
  'Yukon gold potato': { unit: 'potato', label: 'potato(es)', per: 170 },
  'Broccoli florets': { unit: 'broccoli', label: 'head(s) of broccoli', per: 300 },
  'Baby spinach': { unit: 'spinach', label: 'bag(s) of baby spinach', per: 142 },
  'Cherry tomatoes': { unit: 'tomatoes', label: 'pint(s) cherry tomatoes', per: 300 },
  'Romaine lettuce': { unit: 'lettuce', label: 'head(s) of romaine', per: 500 },
  'Bok choy': { unit: 'bokchoy', label: 'head(s) of bok choy', per: 300 },
  Apple: { unit: 'apple', label: 'apple(s)', per: 182 },
  Banana: { unit: 'banana', label: 'banana(s)', per: 118 },
  Plantain: { unit: 'plantain', label: 'plantain(s)', per: 150 },
};

/**
 * @param {Array} meals - week_plan_meals rows, each with a joined `recipe`
 *   object that includes `ingredients` and `base_servings`.
 * @returns {Array<{ingredient: string, qty: number, unit: string|null, packCount: number|null, packLabel: string|null}>}
 */
export function buildShoppingList(meals) {
  const totals = {}; // ingredient name -> { qty, unit }

  for (const meal of meals) {
    const usingOverride = !!meal.ingredients_override?.length;
    const ingredientLines = usingOverride ? meal.ingredients_override : meal.recipe?.ingredients;
    if (!ingredientLines?.length) continue;

    const totalServings = meal.profile_id
      ? meal.servings ?? 1
      : (meal.portions || []).reduce((sum, p) => sum + (p.servings || 0), 0);

    if (!totalServings) continue;

    // Personalized ingredient lists are already normalized to 1 serving
    // (see personalizeRecipe), so the base to scale against is always 1 —
    // only the original recipe's ingredients need dividing by base_servings.
    const baseServings = usingOverride ? 1 : meal.recipe?.base_servings || 1;
    const scale = totalServings / baseServings;

    for (const line of ingredientLines) {
      const neededQty = line.qty * scale;
      const key = line.ingredient;
      if (!totals[key]) {
        totals[key] = { ingredient: key, qty: 0, unit: line.unit || null };
      }
      totals[key].qty += neededQty;
    }
  }

  return Object.values(totals)
    .map((item) => {
      const packaging = SHOPPING_UNITS[item.ingredient];
      if (packaging) {
        const packCount = Math.max(1, Math.ceil(item.qty / packaging.per));
        return { ...item, qty: Math.round(item.qty * 10) / 10, packCount, packLabel: packaging.label };
      }
      return { ...item, qty: Math.round(item.qty * 10) / 10, packCount: null, packLabel: null };
    })
    .sort((a, b) => a.ingredient.localeCompare(b.ingredient));
}
