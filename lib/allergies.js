// lib/allergies.js
// Matches a recipe's ingredients against a household's declared allergies,
// and distinguishes ingredients that can be served separately (a garnish or
// topping the allergic person can just skip) from ones baked into the dish
// itself (which mean the whole recipe isn't safe for them as written).

// The 9 allergens covered by US labeling law (FALCPA + sesame, added 2023) -
// these match the `allergens` tags already applied to ingredients.json.
export const COMMON_ALLERGENS = [
  { id: 'peanut', label: 'Peanut' },
  { id: 'tree_nut', label: 'Tree Nut' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'fish', label: 'Fish' },
  { id: 'egg', label: 'Egg' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'soy', label: 'Soy' },
  { id: 'gluten', label: 'Gluten' },
  { id: 'sesame', label: 'Sesame' },
];

// Ingredient-line notes containing these phrases mean the ingredient is a
// separate component (garnish, topping, side, optional add-in) rather than
// something cooked into the base of the dish - so an allergic person can
// have the rest of the meal and just skip that one part.
const SEPARABLE_HINTS = ['for serving', 'garnish', 'topping', 'optional', 'on the side', 'for dipping'];

function isSeparableLine(line) {
  const note = (line.note || '').toLowerCase();
  return SEPARABLE_HINTS.some((hint) => note.includes(hint));
}

/**
 * @param {{ingredient: string, qty: number, note?: string}[]} ingredientLines
 * @param {{name: string, allergens?: string[], sub_group?: string}[]} ingredientCatalog
 * @param {{name: string, category: string}[]} allergies - one household member's declared allergies
 * @returns {{allergyName: string, lines: {ingredient: string, separable: boolean}[]}[]}
 */
export function findAllergyConflicts(ingredientLines, ingredientCatalog, allergies) {
  if (!ingredientLines?.length || !allergies?.length) return [];
  const catalogByName = Object.fromEntries(ingredientCatalog.map((i) => [i.name, i]));
  const conflicts = [];

  for (const allergy of allergies) {
    const matchingLines = [];
    for (const line of ingredientLines) {
      const catalogEntry = catalogByName[line.ingredient];
      let matches = false;
      if (allergy.category !== 'custom') {
        matches = !!catalogEntry?.allergens?.includes(allergy.category);
      } else {
        // Custom (typed) allergies aren't in the fixed allergen taxonomy -
        // match by name/sub_group text search instead.
        const needle = allergy.name.toLowerCase();
        matches =
          line.ingredient.toLowerCase().includes(needle) ||
          (catalogEntry?.sub_group || '').toLowerCase().includes(needle);
      }
      if (matches) {
        matchingLines.push({ ingredient: line.ingredient, separable: isSeparableLine(line) });
      }
    }
    if (matchingLines.length) {
      conflicts.push({ allergyName: allergy.name, lines: matchingLines });
    }
  }
  return conflicts;
}

/**
 * Rolls conflicts up across every household member for a given recipe.
 * @param {{ingredient: string, qty: number, note?: string}[]} ingredientLines
 * @param {{name: string, allergens?: string[], sub_group?: string}[]} ingredientCatalog
 * @param {{id: string, display_name: string, allergies?: {name: string, category: string}[]}[]} members
 * @returns {{member: string, allergyName: string, allSeparable: boolean, lines: {ingredient: string, separable: boolean}[]}[]}
 */
export function findHouseholdAllergyConflicts(ingredientLines, ingredientCatalog, members) {
  const results = [];
  for (const member of members || []) {
    const conflicts = findAllergyConflicts(ingredientLines, ingredientCatalog, member.allergies);
    for (const c of conflicts) {
      results.push({
        member: member.display_name,
        allergyName: c.allergyName,
        allSeparable: c.lines.every((l) => l.separable),
        lines: c.lines,
      });
    }
  }
  return results;
}
