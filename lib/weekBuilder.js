// lib/weekBuilder.js
// Builds a full week of meals from the household's recipe pool, respecting
// per-household structure rules (themed nights, breakfast-for-dinner, etc.),
// dietary blocklist tags, and an optional cuisine focus for the whole week.
// Also powers single-day "swap this meal" regeneration.

import { servingsForTarget } from '@/lib/nutrition';

export const MEAL_CALORIE_SHARE = {
  breakfast: 0.15,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.15,
};

export const DEFAULT_STRUCTURE_RULES = [
  { dayIndex: 0, mealType: 'dinner', label: null, requiredTag: null }, // Monday
  { dayIndex: 1, mealType: 'dinner', label: 'Leftovers Night', requiredTag: 'leftovers-friendly' },
  { dayIndex: 2, mealType: 'dinner', label: null, requiredTag: null },
  { dayIndex: 3, mealType: 'dinner', label: null, requiredTag: null },
  { dayIndex: 4, mealType: 'dinner', label: null, requiredTag: null },
  { dayIndex: 5, mealType: 'dinner', label: null, requiredTag: null },
  { dayIndex: 6, mealType: 'breakfast', label: 'Breakfast for Dinner', requiredTag: null },
];

function passesFilters(recipe, { mealType, requiredTag, blockedTags, cuisine, excludeIds }) {
  if (recipe.meal_type !== mealType) return false;
  if (excludeIds?.includes(recipe.id)) return false;
  if (blockedTags?.length && recipe.tags?.some((t) => blockedTags.includes(t))) return false;
  if (requiredTag && !recipe.tags?.includes(requiredTag)) return false;
  if (cuisine && recipe.cuisine !== cuisine) return false;
  return true;
}

/**
 * Picks a candidate recipe, progressively relaxing soft constraints
 * (cuisine focus, then the day's required theme tag) if nothing matches.
 * The dietary blocklist is never relaxed.
 */
export function pickCandidate(recipePool, { mealType, requiredTag, blockedTags, cuisine, excludeIds }) {
  const attempts = [
    { mealType, requiredTag, blockedTags, cuisine, excludeIds },
    { mealType, requiredTag, blockedTags, cuisine: null, excludeIds },
    { mealType, requiredTag: null, blockedTags, cuisine, excludeIds },
    { mealType, requiredTag: null, blockedTags, cuisine: null, excludeIds },
    // last resort: allow a repeat, but keep the dietary blocklist hard
    { mealType, requiredTag: null, blockedTags, cuisine: null, excludeIds: [] },
  ];

  for (const attempt of attempts) {
    const candidates = recipePool.filter((r) => passesFilters(r, attempt));
    if (candidates.length) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }
  return null;
}

/**
 * @param {Object} params
 * @param {Array} params.recipePool - all recipes available to the household
 * @param {Array} params.members - [{id, targetCalories}]
 * @param {Array} params.structureRules - per-day rules, defaults to DEFAULT_STRUCTURE_RULES
 * @param {string[]} params.blockedTags - household-wide dietary exclusions
 * @param {string|null} params.cuisineFocus - restrict the whole week to one cuisine
 * @param {string[]} params.recentRecipeIds - avoid repeating these (last 2-3 weeks)
 */
export function generateWeek({
  recipePool,
  members,
  structureRules = DEFAULT_STRUCTURE_RULES,
  blockedTags = [],
  cuisineFocus = null,
  recentRecipeIds = [],
}) {
  const usedThisWeek = new Set(recentRecipeIds);
  const days = [];

  for (const rule of structureRules) {
    const recipe = pickCandidate(recipePool, {
      mealType: rule.mealType,
      requiredTag: rule.requiredTag,
      blockedTags,
      cuisine: cuisineFocus,
      excludeIds: [...usedThisWeek],
    });

    if (recipe) usedThisWeek.add(recipe.id);

    const portions = recipe
      ? members.map((m) => ({
          profileId: m.id,
          servings: servingsForTarget(
            recipe.macros_per_serving,
            m.targetCalories * MEAL_CALORIE_SHARE[rule.mealType]
          ),
        }))
      : [];

    days.push({
      dayIndex: rule.dayIndex,
      mealType: rule.mealType,
      label: rule.label,
      recipeId: recipe?.id ?? null,
      recipe: recipe ?? null,
      portions,
    });
  }

  // Lunches are batch-cooked once per person for the whole week.
  const lunches = members.map((member) => {
    const recipe = pickCandidate(recipePool, {
      mealType: 'lunch',
      requiredTag: null,
      blockedTags,
      cuisine: cuisineFocus,
      excludeIds: [],
    });
    return {
      profileId: member.id,
      recipeId: recipe?.id ?? null,
      recipe: recipe ?? null,
      servings: recipe
        ? servingsForTarget(recipe.macros_per_serving, member.targetCalories * MEAL_CALORIE_SHARE.lunch)
        : 1,
    };
  });

  return { days, lunches };
}

/**
 * Regenerate a single day, e.g. after the user taps "I don't like this" or
 * picks a different cuisine just for that night.
 */
export function swapDay({ recipePool, rule, members, blockedTags = [], cuisine = null, excludeId }) {
  const recipe = pickCandidate(recipePool, {
    mealType: rule.mealType,
    requiredTag: rule.requiredTag,
    blockedTags,
    cuisine,
    excludeIds: excludeId ? [excludeId] : [],
  });

  const portions = recipe
    ? members.map((m) => ({
        profileId: m.id,
        servings: servingsForTarget(
          recipe.macros_per_serving,
          m.targetCalories * MEAL_CALORIE_SHARE[rule.mealType]
        ),
      }))
    : [];

  return {
    dayIndex: rule.dayIndex,
    mealType: rule.mealType,
    label: rule.label,
    recipeId: recipe?.id ?? null,
    recipe: recipe ?? null,
    portions,
  };
}
