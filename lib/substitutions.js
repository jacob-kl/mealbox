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
  // role (any protein for any protein — chicken, tofu, another cheese —
  // not just "another item from the dairy aisle"), so a paneer allergy or
  // unavailability surfaces chicken breast as an option, not just other
  // cheeses. Vegetables, sauces, and fats stay matched within their
  // grocery category instead, since a culinary swap matters more there
  // than raw macro role.
  const useRoleMatch = role === 'protein' || role === 'carb';

  const candidates = ingredientCatalog.filter((i) => {
    if (i.name === ingredientName) return false;
    return useRoleMatch ? classifyIngredientRole(i) === role : categorize(i.name) === category;
  });

  const scored = candidates.map((i) => {
    const d = density(i);
    const dist = Math.sqrt((d.protein - origDensity.protein) ** 2 + (d.carbs - origDensity.carbs) ** 2 + (d.fat - origDensity.fat) ** 2);
    return { ingredient: i, dist };
  });

  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, maxSuggestions).map((s) => s.ingredient);
}
