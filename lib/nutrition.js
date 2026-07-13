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

/**
 * Classifies an ingredient by which macro dominates its calories — this is
 * what lets personalizeRecipe decide "this is the protein source, boost
 * it" vs "this is the starch, don't just let it balloon along for the ride."
 */
export function classifyIngredientRole(ingredient) {
  if (!ingredient || !ingredient.cal) return 'other';
  // Density (grams per 100 calories), not calorie *fraction* — fraction
  // misclassifies real protein sources that also carry fat (paneer, chicken
  // thighs, salmon) as "fat," and misclassifies low-calorie garnish
  // vegetables (bell pepper) as "carb" just because what little calorie
  // they have happens to be carb-shaped.
  const proteinPer100Cal = ((ingredient.protein || 0) * 100) / ingredient.cal;
  const carbPer100Cal = ((ingredient.carbs || 0) * 100) / ingredient.cal;
  const fatPer100Cal = ((ingredient.fat || 0) * 100) / ingredient.cal;

  // Density alone isn't enough — a near-zero-calorie ingredient with a
  // trace of protein (bok choy, soy sauce, a splash of broth) produces a
  // wildly inflated density ratio from dividing by almost nothing, and can
  // outrank genuine protein sources. Require a minimum calorie floor so
  // "this is the protein/starch source" means something in absolute terms,
  // not just relative to its own negligible calorie count.
  if (proteinPer100Cal >= 6 && ingredient.cal >= 40) return 'protein';
  // A real starch (rice, pasta, potato) is both carb-dense AND calorie-
  // dense per unit — this excludes low-calorie vegetables whose calories
  // just happen to skew carb (bell pepper, broccoli, onion).
  if (carbPer100Cal >= 15 && ingredient.cal >= 60) return 'carb';
  if (fatPer100Cal >= 8 && ingredient.cal >= 30) return 'fat';
  return 'other';
}

/**
 * Adjusts a recipe's ingredient quantities toward a target instead of
 * scaling the whole recipe by one uniform factor. Uniform scaling can't
 * change a recipe's underlying macro ratio at all — if the protein source
 * and the starch get multiplied by the same number, carbs come along for
 * the ride in exact lockstep with protein, no matter what number you pick.
 *
 * This instead: boosts the protein-source ingredient(s) toward the protein
 * target (capped at a realistic 0.5x-2.5x of the original amount — "more
 * chicken," not "5x the chicken"), then sizes the carb-source ingredient(s)
 * to whatever calorie budget is left over, and leaves aromatics/veg/sauce
 * ("other") and cooking fat close to their original amounts since those are
 * what make it still taste like the recipe, not what's being dialed in.
 *
 * @param {Object} recipe - {ingredients, base_servings}
 * @param {Record<string, Object>} ingredientsByName
 * @param {Object} targets - {targetCalories, targetProtein, targetCarbs}
 * @returns {{ingredients: Array, macros: Object}} adjusted ingredient lines
 *   (already normalized to a single serving) and the resulting totals.
 */
export function personalizeRecipe(recipe, ingredientsByName, { targetCalories, targetProtein, targetCarbs }) {
  const baseServings = recipe.base_servings || 1;

  const lines = recipe.ingredients.map((line) => {
    const ingredient = ingredientsByName[line.ingredient];
    const macrosAtFullQty = ingredient ? scaleIngredient(ingredient, line.qty) : { cal: 0, protein: 0, carbs: 0, fat: 0 };
    // Normalize to "per 1 serving" up front so every downstream number
    // (and the returned ingredient qty) is already serving-sized.
    const perServingQty = line.qty / baseServings;
    const perServingMacros = {};
    for (const key of MACRO_KEYS) perServingMacros[key] = (macrosAtFullQty[key] || 0) / baseServings;
    const cal = perServingMacros.cal || 0.0001;
    return {
      line,
      perServingQty,
      perServingMacros,
      proteinDensity: (perServingMacros.protein * 100) / cal,
      role: classifyIngredientRole(ingredient),
    };
  });

  // Some ingredients (beans, lentils) are legitimately borderline between
  // "protein source" and "starch/fiber" — density alone can flag them as
  // protein even when a recipe already has a much stronger, more obvious
  // protein source (chicken, shrimp). In that case, treat the borderline
  // one as its secondary role instead, so it doesn't get boosted alongside
  // the real protein source and drag its carbs up right along with it.
  const strongestProteinDensity = Math.max(0, ...lines.filter((l) => l.role === 'protein').map((l) => l.proteinDensity));
  for (const l of lines) {
    if (l.role !== 'protein') continue;
    if (l.proteinDensity < strongestProteinDensity * 0.7) {
      const ingredient = ingredientsByName[l.line.ingredient];
      const carbPer100Cal = ingredient ? ((ingredient.carbs || 0) * 100) / (ingredient.cal || 1) : 0;
      if (carbPer100Cal >= 15 && l.perServingMacros.cal >= 60) l.role = 'carb';
    }
  }

  const proteinLines = lines.filter((l) => l.role === 'protein');
  const carbLines = lines.filter((l) => l.role === 'carb');
  const otherLines = lines.filter((l) => l.role === 'other' || l.role === 'fat');

  const baseProteinFromRole = proteinLines.reduce((sum, l) => sum + l.perServingMacros.protein, 0);
  const otherCal = otherLines.reduce((sum, l) => sum + l.perServingMacros.cal, 0);
  const baseCarbCal = carbLines.reduce((sum, l) => sum + l.perServingMacros.cal, 0);
  const baseCarbGrams = carbLines.reduce((sum, l) => sum + l.perServingMacros.carbs, 0);

  // How much to scale the protein source(s) — bounded to something a
  // person would actually cook, never a wild multiple, AND never (when
  // avoidable) pushing the protein source's own calories past the whole
  // slot's calorie budget by itself.
  let proteinScale = 1;
  if (baseProteinFromRole > 0 && targetProtein != null) {
    const scaleForProteinTarget = targetProtein / baseProteinFromRole;
    const proteinLinesCalAt1x = proteinLines.reduce((sum, l) => sum + l.perServingMacros.cal, 0);
    const maxScaleByCalorieBudget =
      proteinLinesCalAt1x > 0 && targetCalories != null
        ? Math.max(0.5, (targetCalories - otherCal) / proteinLinesCalAt1x)
        : 2.5;
    proteinScale = Math.min(2.5, scaleForProteinTarget, maxScaleByCalorieBudget);
    proteinScale = Math.max(0.5, proteinScale);
  }
  const proteinCalAfterScale = proteinLines.reduce((sum, l) => sum + l.perServingMacros.cal * proteinScale, 0);

  // Carb/starch ingredients are sized to a direct carb-*gram* target when
  // one is given — this is the lever that actually keeps a day's total
  // carbs in check on a tight budget, rather than an indirect "whatever
  // calories happen to be left over" guess that can still leave two
  // carb-heavy meals blowing the day's total between them even though each
  // looks reasonable in isolation. Falls back to the calorie-remainder
  // approach only when no carb target is supplied.
  let carbScale = 1;
  if (baseCarbCal > 0) {
    if (targetCarbs != null && baseCarbGrams > 0) {
      carbScale = Math.min(2, Math.max(0.15, targetCarbs / baseCarbGrams));
    } else if (targetCalories != null) {
      const remainingForCarbs = targetCalories - proteinCalAfterScale - otherCal;
      carbScale = Math.min(2, Math.max(0.3, remainingForCarbs / baseCarbCal));
    }
  }

  const adjustedIngredients = [];
  const totals = { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  for (const l of lines) {
    let scale = 1;
    if (l.role === 'protein') scale = proteinScale;
    else if (l.role === 'carb') scale = carbScale;
    // 'other' and 'fat' roles stay at their natural per-serving amount.

    const scaledQty = Math.round(l.perServingQty * scale * 10) / 10;
    adjustedIngredients.push({ ...l.line, qty: scaledQty });

    for (const key of MACRO_KEYS) totals[key] += (l.perServingMacros[key] || 0) * scale;
  }

  const macros = {};
  for (const key of MACRO_KEYS) macros[key] = Math.round(totals[key] * 10) / 10;

  return { ingredients: adjustedIngredients, macros };
}
