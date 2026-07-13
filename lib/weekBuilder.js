// lib/weekBuilder.js
// Builds a full week of meals from the household's recipe pool, respecting
// per-household structure rules (themed nights, breakfast-for-dinner, etc.),
// a configurable meal structure (how many snacks per day, which weekdays get
// a batch-cooked lunch vs. a freshly-cooked one), and dietary blocklist tags.
// Also powers single-meal "swap this" regeneration.

import { servingsForTarget } from '@/lib/nutrition';

export const MEAL_CALORIE_SHARE = {
  breakfast: 0.15,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.15, // total snack budget for the day, split across however many snack slots are configured
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

export const DEFAULT_MEAL_STRUCTURE = {
  snacksPerDay: 1,
  lunchPlan: { 0: 'batch', 1: 'batch', 2: 'batch', 3: 'batch', 4: 'batch', 5: 'batch', 6: 'batch' },
};

const SNACK_SLOTS = ['snack1', 'snack2', 'snack3', 'snack4'];

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

function sharedMeal({ recipePool, rule, members, blockedTags, cuisine, excludeIds }) {
  const recipe = pickCandidate(recipePool, {
    mealType: rule.mealType,
    requiredTag: rule.requiredTag,
    blockedTags,
    cuisine,
    excludeIds,
  });

  const portions = recipe
    ? members.map((m) => ({
        profileId: m.id,
        servings: servingsForTarget(recipe.macros_per_serving, m.targetCalories * MEAL_CALORIE_SHARE[rule.mealType]),
      }))
    : [];

  return {
    dayIndex: rule.dayIndex,
    mealSlot: rule.mealType,
    profileId: null,
    recipeId: recipe?.id ?? null,
    recipe: recipe ?? null,
    label: rule.label,
    portions,
  };
}

function individualMeal({ recipePool, dayIndex, mealSlot, member, mealType, blockedTags, cuisine, excludeIds, calorieShare }) {
  const recipe = pickCandidate(recipePool, {
    mealType,
    requiredTag: null,
    blockedTags,
    cuisine,
    excludeIds,
  });

  const servings = recipe
    ? servingsForTarget(recipe.macros_per_serving, member.targetCalories * calorieShare)
    : 1;

  return {
    dayIndex,
    mealSlot,
    profileId: member.id,
    recipeId: recipe?.id ?? null,
    recipe: recipe ?? null,
    label: null,
    servings,
  };
}

/**
 * @param {Object} params
 * @param {Array} params.recipePool - all recipes available to the household
 * @param {Array} params.members - [{id, targetCalories}]
 * @param {Array} params.structureRules - per-day dinner/breakfast rules
 * @param {Object} params.mealStructure - {snacksPerDay, lunchPlan: {0..6: 'batch'|'fresh'}}
 * @param {string[]} params.blockedTags - household-wide dietary exclusions
 * @param {string|null} params.cuisineFocus - restrict the whole week to one cuisine
 * @param {string[]} params.recentRecipeIds - avoid repeating these (last 2-3 weeks)
 */
export function generateWeek({
  recipePool,
  members,
  structureRules = DEFAULT_STRUCTURE_RULES,
  mealStructure = DEFAULT_MEAL_STRUCTURE,
  blockedTags = [],
  cuisineFocus = null,
  recentRecipeIds = [],
}) {
  const used = new Set(recentRecipeIds);
  const meals = [];
  const snacksPerDay = Math.max(0, Math.min(4, mealStructure.snacksPerDay ?? 1));
  const lunchPlan = mealStructure.lunchPlan || DEFAULT_MEAL_STRUCTURE.lunchPlan;
  const snackShare = snacksPerDay > 0 ? MEAL_CALORIE_SHARE.snack / snacksPerDay : 0;

  // 1. Shared dinner/breakfast per day.
  for (const rule of structureRules) {
    const meal = sharedMeal({ recipePool, rule, members, blockedTags, cuisine: cuisineFocus, excludeIds: [...used] });
    if (meal.recipeId) used.add(meal.recipeId);
    meals.push(meal);
  }

  // 2. Lunch — one "batch" recipe per member reused across all their batch
  // days, plus an independently-picked recipe for each "fresh" day.
  const batchLunchByMember = {};
  for (const member of members) {
    const recipe = pickCandidate(recipePool, {
      mealType: 'lunch',
      requiredTag: null,
      blockedTags,
      cuisine: cuisineFocus,
      excludeIds: [],
    });
    batchLunchByMember[member.id] = recipe;
  }

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const strategy = lunchPlan[dayIndex] || 'batch';
    for (const member of members) {
      if (strategy === 'batch') {
        const recipe = batchLunchByMember[member.id];
        meals.push({
          dayIndex,
          mealSlot: 'lunch',
          profileId: member.id,
          recipeId: recipe?.id ?? null,
          recipe: recipe ?? null,
          label: null,
          servings: recipe
            ? servingsForTarget(recipe.macros_per_serving, member.targetCalories * MEAL_CALORIE_SHARE.lunch)
            : 1,
        });
      } else {
        meals.push(
          individualMeal({
            recipePool,
            dayIndex,
            mealSlot: 'lunch',
            member,
            mealType: 'lunch',
            blockedTags,
            cuisine: cuisineFocus,
            excludeIds: [],
            calorieShare: MEAL_CALORIE_SHARE.lunch,
          })
        );
      }
    }
  }

  // 3. Snacks — independently picked per day, per member, per slot.
  if (snacksPerDay > 0) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      for (const member of members) {
        const usedTodayForMember = [];
        for (let i = 0; i < snacksPerDay; i++) {
          const meal = individualMeal({
            recipePool,
            dayIndex,
            mealSlot: SNACK_SLOTS[i],
            member,
            mealType: 'snack',
            blockedTags,
            cuisine: cuisineFocus,
            excludeIds: usedTodayForMember,
            calorieShare: snackShare,
          });
          if (meal.recipeId) usedTodayForMember.push(meal.recipeId);
          meals.push(meal);
        }
      }
    }
  }

  return meals;
}

/**
 * Regenerate a single meal slot — a shared dinner/breakfast, or one
 * person's lunch/snack.
 */
export function swapMeal({
  recipePool,
  dayIndex,
  mealSlot,
  mealType,
  requiredTag = null,
  members,
  profileId = null,
  blockedTags = [],
  cuisine = null,
  excludeId,
  calorieShare,
}) {
  if (!profileId) {
    // Shared meal (dinner/breakfast) — same recipe scaled per member.
    const rule = { dayIndex, mealType, requiredTag, label: null };
    return sharedMeal({
      recipePool,
      rule,
      members,
      blockedTags,
      cuisine,
      excludeIds: excludeId ? [excludeId] : [],
    });
  }

  const member = members.find((m) => m.id === profileId);
  return individualMeal({
    recipePool,
    dayIndex,
    mealSlot,
    member,
    mealType,
    blockedTags,
    cuisine,
    excludeIds: excludeId ? [excludeId] : [],
    calorieShare: calorieShare ?? MEAL_CALORIE_SHARE[mealType] ?? 0.2,
  });
}
