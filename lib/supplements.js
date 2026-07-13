// lib/supplements.js
// Preferred meals (lunch/dinner/whatever the household enabled) are sized
// to land at or under target — never over. Whatever calorie/protein gap
// remains for the day is real, and forcing it closed by inflating a meal's
// portion is what caused the overshoot problems in the first place.
// Instead, suggest a small number of snack-type recipes that would close
// that gap, so the person can add them if they want to, rather than have
// the app silently distort a meal to chase a target it structurally can't
// hit cleanly.

/**
 * @param {Object} remaining - {cal, protein, carbs, fat} still needed today
 * @param {Array} snackCatalog - recipes with meal_type 'snack' (id, name, macros_per_serving)
 * @param {number} maxSuggestions
 */
export function recommendSupplements(remaining, snackCatalog, maxSuggestions = 3) {
  if (!remaining || remaining.cal < 80 || !snackCatalog?.length) return [];

  // Prefer recipes whose protein-per-calorie density matches how protein-
  // starved the remaining gap is, so a big protein gap surfaces protein-
  // dense snacks (protein shake, cottage cheese) rather than a random pick.
  const neededDensity = remaining.cal > 0 ? Math.max(0, remaining.protein) / remaining.cal : 0;

  const scored = snackCatalog
    .filter((r) => r.macros_per_serving?.cal > 0)
    .map((r) => {
      const density = r.macros_per_serving.protein / r.macros_per_serving.cal;
      // Closer density match AND not wildly bigger than the remaining
      // calorie gap both count toward a better fit.
      const densityFit = -Math.abs(density - neededDensity);
      const sizeFit = r.macros_per_serving.cal <= remaining.cal ? 0 : -1;
      return { recipe: r, score: densityFit + sizeFit };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxSuggestions).map((s) => s.recipe);
}
