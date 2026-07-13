// lib/substitutions.js
// Suggests swap candidates for an ingredient — same grocery category (so a
// protein doesn't get replaced with a spice), ranked by how close their
// macro density is to the original, so the swap doesn't wreck the recipe's
// nutrition. Always paired in the UI with a free-text custom option, since
// no automatic list will cover every allergy or local availability issue.

import { categorize } from '@/lib/shoppingList';
import { classifyIngredientRole } from '@/lib/nutrition';

function density(ingredient) {
  const cal = ingredient.cal || 1;
  return {
    protein: (ingredient.protein || 0) / cal,
    carbs: (ingredient.carbs || 0) / cal,
    fat: (ingredient.fat || 0) / cal,
  };
}

/**
 * @param {string} ingredientName - the ingredient being replaced
 * @param {Array} ingredientCatalog - full ingredients table (name, cal, protein, carbs, fat, ...)
 * @param {number} maxSuggestions
 * @returns {Array} ingredient rows, closest macro match first
 */
export function suggestSubstitutes(ingredientName, ingredientCatalog, maxSuggestions = 6) {
  const original = ingredientCatalog.find((i) => i.name === ingredientName);
  if (!original) return [];

  const role = classifyIngredientRole(original);
  const category = categorize(ingredientName);
  const origDensity = density(original);

  // Protein and starch sources are usually swapped across their functional
  // role too (chicken for tofu, rice for pasta), not just within one
  // grocery aisle — but that shouldn't come at the expense of the obvious
  // same-category options (mozzarella should suggest other cheeses FIRST,
  // not skip straight to salmon just because cheese also has decent
  // protein density). So: union both pools rather than picking one, and
  // let the macro-similarity sort put the closest matches first regardless
  // of which pool they came from.
  const useRoleMatch = role === 'protein' || role === 'carb';

  const candidates = ingredientCatalog.filter((i) => {
    if (i.name === ingredientName) return false;
    const sameCategory = categorize(i.name) === category;
    const sameRole = useRoleMatch && classifyIngredientRole(i) === role;
    return sameCategory || sameRole;
  });

  const scored = candidates.map((i) => {
    const d = density(i);
    const dist = Math.sqrt((d.protein - origDensity.protein) ** 2 + (d.carbs - origDensity.carbs) ** 2 + (d.fat - origDensity.fat) ** 2);
    return { ingredient: i, dist };
  });

  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, maxSuggestions).map((s) => s.ingredient);
}
