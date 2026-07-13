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
  // Floor, not round — a planned meal should never exceed its calorie
  // budget. Any gap left over gets closed by a recommended supplement
  // (see lib/supplements.js) instead of overshooting the actual meal.
  return Math.max(0.25, Math.floor(raw * 4) / 4);
}

/**
 * Scaling a single recipe's portion up or down multiplies every macro by
 * the same factor — it can never change the recipe's underlying protein-
 * to-carb-to-fat ratio. So "scale up to hit protein" on a carb-heavy dish
 * (rice, pasta, potatoes) just drags carbs up in lockstep right along with
 * it, often far past target, while barely moving protein. That's a math
 * fact, not a tuning knob — no multiplier fixes a ratio mismatch.
 *
 * Servings are calorie-only now. Protein is instead handled at recipe
 * *selection* time (see the protein-density bias in pickCandidate) —
 * steering toward recipes whose protein-per-calorie ratio already fits the
 * target, rather than distorting portions of whatever recipe was picked.
 */
export function servingsForTargets(macrosPerServing, { targetCalories }) {
  return servingsForTarget(macrosPerServing, targetCalories);
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
