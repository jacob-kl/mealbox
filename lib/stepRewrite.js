// lib/stepRewrite.js
// When an ingredient is swapped, the recipe's step text was written for the
// original ingredient and doesn't automatically update (swapping chicken for
// turkey doesn't rewrite "rub the chicken..." to "rub the turkey..."). This
// extracts a reasonable core keyword from each ingredient name and does a
// word-boundary, case-preserving find/replace through the steps.
//
// This is a heuristic, not a parser - it correctly handles the common case
// (protein-for-protein swaps, which are the overwhelming majority of
// substitutions in this app) without attempting to understand arbitrary
// phrasing. Ingredients whose name doesn't reduce to a clean single keyword
// (or where the keyword doesn't actually appear in the steps) are left as-is
// rather than risking a wrong or partial rewrite.

const PREP_PREFIXES = new Set([
  'ground', 'frozen', 'fresh', 'boneless', 'skinless', 'canned', 'dried',
  'raw', 'cooked', 'smoked', 'diced', 'sliced', 'chopped', 'minced', 'whole',
]);

// Strip a leading parenthetical/trailing qualifier like "(raw)" and split
// into words, then drop any leading prep-descriptor words to find the
// actual core noun - "Ground turkey" -> "turkey", "Turkey breast (raw)" ->
// "turkey", "Frozen shrimp" -> "shrimp".
function coreKeyword(ingredientName) {
  const cleaned = ingredientName.replace(/\([^)]*\)/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < words.length - 1 && PREP_PREFIXES.has(words[i].toLowerCase())) i++;
  return words[i]?.toLowerCase() || null;
}

// Replace `find` with `replacement` in `text`, preserving the original
// capitalization pattern at each match site (all-caps, capitalized, or
// lowercase) so "Chicken" -> "Turkey" and "chicken" -> "turkey" both read
// naturally, not just a single blind substitution.
function replacePreservingCase(text, find, replacement) {
  const pattern = new RegExp(`\\b${find}\\b`, 'gi');
  return text.replace(pattern, (match) => {
    if (match === match.toUpperCase()) return replacement.toUpperCase();
    if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  });
}

/**
 * @param {string[]} steps
 * @param {string} oldIngredientName
 * @param {string} newIngredientName
 * @returns {{steps: string[], changed: boolean}}
 */
export function rewriteStepsForSubstitution(steps, oldIngredientName, newIngredientName) {
  if (!steps?.length) return { steps, changed: false };

  const oldKeyword = coreKeyword(oldIngredientName);
  const newKeyword = coreKeyword(newIngredientName);
  if (!oldKeyword || !newKeyword || oldKeyword === newKeyword) {
    return { steps, changed: false };
  }

  let changed = false;
  const rewritten = steps.map((step) => {
    const pattern = new RegExp(`\\b${oldKeyword}\\b`, 'i');
    if (!pattern.test(step)) return step;
    changed = true;
    return replacePreservingCase(step, oldKeyword, newKeyword);
  });

  return { steps: rewritten, changed };
}
