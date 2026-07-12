// lib/nutrition.js
// Scales an ingredient's per-serving macros to an arbitrary quantity, and
// aggregates a recipe's ingredient list into per-serving macro totals.
// This mirrors the f(key, qty) helper described in the project history:
// every macro is derived programmatically from the ingredient database,
// never hand-entered.

const MACRO_KEYS = ['cal', 'protein', 'carbs', 'fat', 'fiber'];

/**
 * @param {Object} ingredient - a row from the ingredients table/seed file
 * @param {number} qty - quantity in the ingredient's own serving_unit
 */
export function scaleIngredient(ingredient, qty) {
  const servingQty = ingredient.serving_qty || 1;
  const multiplier = qty / servingQty;
  const scaled = {};
  for (const key of MACRO_KEYS) {
    scaled[key] = (ingredient[key] || 0) * multiplier;
  }
  return scaled;
}

/**
 * @param {Array<{ingredient:string, qty:number}>} recipeIngredients
 * @param {Record<string, Object>} ingredientsByName
 * @param {number} baseServings
 */
export function computeRecipeMacros(recipeIngredients, ingredientsByName, baseServings = 1) {
  const totals = { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  for (const line of recipeIngredients) {
    const ingredient = ingredientsByName[line.ingredient];
    if (!ingredient) {
      throw new Error(`Unknown ingredient reference: "${line.ingredient}"`);
    }
    const scaled = scaleIngredient(ingredient, line.qty);
    for (const key of MACRO_KEYS) totals[key] += scaled[key];
  }

  const perServing = {};
  for (const key of MACRO_KEYS) {
    perServing[key] = Math.round((totals[key] / baseServings) * 10) / 10;
  }
  return perServing;
}

/**
 * Given a recipe's per-serving macros and a person's target calories for
 * that meal slot, returns how many servings they should be given (rounded
 * to the nearest quarter-serving, the same granularity the original app
 * used for splitting portions between two people).
 */
export function servingsForTarget(macrosPerServing, targetCalories) {
  if (!macrosPerServing.cal) return 1;
  const raw = targetCalories / macrosPerServing.cal;
  return Math.max(0.25, Math.round(raw * 4) / 4);
}

export function scaleMacros(macrosPerServing, servings) {
  const scaled = {};
  for (const key of MACRO_KEYS) {
    scaled[key] = Math.round((macrosPerServing[key] || 0) * servings * 10) / 10;
  }
  return scaled;
}
