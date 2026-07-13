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

/**
 * Like servingsForTarget, but also considers a protein target for the slot.
 * Takes whichever multiplier is larger — calories or protein — so a
 * protein-dense goal doesn't get shorted just because a recipe happens to
 * be calorie-dense but protein-light (rice, potatoes, pasta sides, etc.).
 * This can mean running over the slot's calorie budget when the recipe
 * isn't very protein-dense; that's the right tradeoff for someone with an
 * aggressive protein target rather than silently under-hitting protein.
 */
export function servingsForTargets(macrosPerServing, { targetCalories, targetProtein }) {
  if (!macrosPerServing.cal) return 1;
  const byCalories = targetCalories / macrosPerServing.cal;
  const byProtein = macrosPerServing.protein > 0 && targetProtein != null ? targetProtein / macrosPerServing.protein : 0;
  // Chase protein, but never let a single recipe's portion balloon past a
  // realistic size just to hit an aggressive protein target — 6x a serving
  // of meatloaf isn't a fix, it's a differently-broken number. Cap the
  // protein-driven portion at 1.5x what calories alone called for, or 3
  // servings absolute, whichever is larger than the calorie-only baseline.
  const ABSOLUTE_MAX_SERVINGS = 3;
  const cap = Math.max(byCalories, Math.min(ABSOLUTE_MAX_SERVINGS, byCalories * 1.5));
  const raw = Math.min(Math.max(byCalories, byProtein), cap);
  return Math.max(0.25, Math.round(raw * 4) / 4);
}

/**
 * Only show a unit for genuinely measurable units — countable units like
 * "clove" or "tortilla" already read fine as a bare number next to the
 * ingredient name (the noun is in the name), so we skip those.
 */
const DISPLAYABLE_UNITS = {
  g: 'g',
  g_dry: 'g',
  g_raw: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  tsp: 'tsp',
  tbsp: 'tbsp',
  cup: 'cup',
  fl_oz: 'fl oz',
  oz: 'oz',
  lb: 'lb',
  pinch: 'pinch',
};

export function formatQty(qty, unit) {
  const displayUnit = DISPLAYABLE_UNITS[unit];
  return displayUnit ? `${qty}${displayUnit}` : `${qty}`;
}

export function scaleMacros(macrosPerServing, servings) {
  const scaled = {};
  for (const key of MACRO_KEYS) {
    scaled[key] = Math.round((macrosPerServing[key] || 0) * servings * 10) / 10;
  }
  return scaled;
}
