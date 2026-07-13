// lib/weekBuilder.js
// Builds a full week of meals from the household's recipe pool. The
// household controls, per weekday, which of breakfast/lunch/dinner are even
// planned at all (a 7x3 grid), how many snacks per day, and for lunch
// specifically whether that day uses the week's batch-cooked lunch or a
// freshly-cooked one. Also powers single-meal "swap this" regeneration.
//
// Portion sizing is both calorie- and protein-aware (see servingsForTargets
// in lib/nutrition.js): a slot's serving count is scaled to whichever of
// calories or protein needs more, so an aggressive protein target doesn't
// get shorted by a recipe that happens to be calorie-dense but protein-light
// (a starchy side, for instance). Slot calorie/protein budgets are also
// renormalized per day to the meal types actually enabled that day, so
// turning off breakfast and snacks doesn't leave 30% of the day's targets
// permanently unreachable — the remaining slots pick up the slack.

import { servingsForTargets } from '@/lib/nutrition';

// Baseline relative weights before renormalization to whichever slots are
// actually enabled for a given day.
const BASE_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.35, snack: 0.15 };

/**
 * Given which meal types are enabled for a day (and whether snacks are
 * configured at all), returns calorie/protein budget fractions that sum to
 * 1.0 across just the enabled slots — so two enabled slots split 100% of
 * the day's targets between them, not 70%.
 */
export function computeMealShares(dayConfig, snacksPerDay) {
  const active = {};
  let total = 0;
  for (const slot of ['breakfast', 'lunch', 'dinner']) {
    if (dayConfig?.[slot]) {
      active[slot] = BASE_SHARE[slot];
      total += BASE_SHARE[slot];
    }
  }
  if (snacksPerDay > 0) {
    active.snack = BASE_SHARE.snack;
    total += BASE_SHARE.snack;
  }
  const shares = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  if (total === 0) return shares;
  for (const key of Object.keys(active)) shares[key] = active[key] / total;
  return shares;
}

// Which of breakfast/lunch/dinner are planned at all, per weekday (0=Mon..6=Sun).
export const DEFAULT_MEAL_DAYS = {
  0: { breakfast: false, lunch: true, dinner: true },
  1: { breakfast: false, lunch: true, dinner: true },
  2: { breakfast: false, lunch: true, dinner: true },
  3: { breakfast: false, lunch: true, dinner: true },
  4: { breakfast: false, lunch: true, dinner: true },
  5: { breakfast: false, lunch: true, dinner: true },
  6: { breakfast: true, lunch: true, dinner: false },
};

export const DEFAULT_MEAL_STRUCTURE = {
  snacksPerDay: 1,
  lunchPlan: { 0: 'batch', 1: 'batch', 2: 'batch', 3: 'batch', 4: 'batch', 5: 'batch', 6: 'batch' },
};

const SNACK_SLOTS = ['snack1', 'snack2', 'snack3', 'snack4'];
export const COURSE_SHARE = { main: 0.7, side: 0.3 }; // split of the meal's calorie budget when paired

function passesFilters(recipe, { mealType, course, courseIn, blockedTags, cuisine, excludeIds }) {
  if (recipe.meal_type !== mealType) return false;
  const recipeCourse = recipe.course || 'complete';
  if (courseIn && !courseIn.includes(recipeCourse)) return false;
  if (course && recipeCourse !== course) return false;
  if (excludeIds?.includes(recipe.id)) return false;
  if (blockedTags?.length && recipe.tags?.some((t) => blockedTags.includes(t))) return false;
  if (cuisine && recipe.cuisine !== cuisine) return false;
  return true;
}

/**
 * Picks a candidate recipe, progressively relaxing soft constraints
 * (cuisine focus) if nothing matches. The dietary blocklist is never relaxed.
 */
export function pickCandidate(recipePool, { mealType, course = null, courseIn = null, blockedTags, cuisine, excludeIds }) {
  const attempts = [
    { mealType, course, courseIn, blockedTags, cuisine, excludeIds },
    { mealType, course, courseIn, blockedTags, cuisine: null, excludeIds },
    // last resort: allow a repeat, but keep the dietary blocklist hard
    { mealType, course, courseIn, blockedTags, cuisine: null, excludeIds: [] },
  ];

  for (const attempt of attempts) {
    const candidates = recipePool.filter((r) => passesFilters(r, attempt));
    if (candidates.length) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }
  return null;
}

function scalePortionsFor(recipe, calorieShare, proteinShare, members) {
  return members.map((m) => ({
    profileId: m.id,
    servings: servingsForTargets(recipe.macros_per_serving, {
      targetCalories: m.targetCalories * calorieShare,
      targetProtein: m.targetProteinG != null && proteinShare != null ? m.targetProteinG * proteinShare : null,
    }),
  }));
}

function sharedMealRow({ recipePool, dayIndex, mealType, filterCourse, filterCourseIn, storeCourse, calorieShare, proteinShare, members, blockedTags, cuisine, excludeIds }) {
  const recipe = pickCandidate(recipePool, { mealType, course: filterCourse, courseIn: filterCourseIn, blockedTags, cuisine, excludeIds });

  const portions = recipe ? scalePortionsFor(recipe, calorieShare, proteinShare, members) : [];

  return {
    dayIndex,
    mealSlot: mealType,
    course: storeCourse,
    profileId: null,
    recipeId: recipe?.id ?? null,
    recipe: recipe ?? null,
    label: null,
    portions,
  };
}

/**
 * Builds the shared meal(s) for a slot. For dinner, picks from complete
 * dishes AND standalone mains together (so a handful of split main/side
 * recipes never crowds out the much larger complete-dish library) — a side
 * only gets added on top when the pick that came back happens to be a
 * 'main'. Breakfast is always a single pick, no course filtering.
 */
function sharedMeals({ recipePool, dayIndex, mealType, calorieShare, proteinShare, members, blockedTags, cuisine, excludeIds }) {
  if (mealType === 'dinner') {
    const primary = sharedMealRow({
      recipePool,
      dayIndex,
      mealType,
      filterCourseIn: ['complete', 'main'],
      storeCourse: 'main',
      calorieShare,
      proteinShare,
      members,
      blockedTags,
      cuisine,
      excludeIds,
    });

    const rows = [primary];
    const pickedCourse = primary.recipe?.course || 'complete';

    if (pickedCourse === 'main') {
      const sidePool = recipePool.filter((r) => r.meal_type === 'dinner' && (r.course || 'complete') === 'side');
      if (sidePool.length) {
        // Re-scale the main down to its course share now that we know a
        // side is joining it (the main still carries the full protein
        // target — it's the protein source).
        rows[0] = {
          ...primary,
          portions: scalePortionsFor(primary.recipe, calorieShare * COURSE_SHARE.main, proteinShare, members),
        };

        const excludeWithMain = primary.recipeId ? [...excludeIds, primary.recipeId] : excludeIds;
        rows.push(
          sharedMealRow({
            recipePool,
            dayIndex,
            mealType,
            filterCourse: 'side',
            storeCourse: 'side',
            calorieShare: calorieShare * COURSE_SHARE.side,
            proteinShare: null, // sides scale by calories only
            members,
            blockedTags,
            cuisine,
            excludeIds: excludeWithMain,
          })
        );
      }
    }

    return rows;
  }

  return [
    sharedMealRow({
      recipePool,
      dayIndex,
      mealType,
      filterCourse: null, // breakfast is never split into main/side
      storeCourse: 'main',
      calorieShare,
      proteinShare,
      members,
      blockedTags,
      cuisine,
      excludeIds,
    }),
  ];
}

function individualMeal({ recipePool, dayIndex, mealSlot, member, mealType, blockedTags, cuisine, excludeIds, calorieShare, proteinShare }) {
  const recipe = pickCandidate(recipePool, { mealType, blockedTags, cuisine, excludeIds });

  const servings = recipe
    ? servingsForTargets(recipe.macros_per_serving, {
        targetCalories: member.targetCalories * calorieShare,
        targetProtein: member.targetProteinG != null ? member.targetProteinG * proteinShare : null,
      })
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
 * @param {Array} params.members - [{id, targetCalories, targetProteinG}]
 * @param {Object} params.mealDays - {0..6: {breakfast, lunch, dinner}} which slots are planned
 * @param {Object} params.mealStructure - {snacksPerDay, lunchPlan: {0..6: 'batch'|'fresh'}}
 * @param {string[]} params.blockedTags - household-wide dietary exclusions
 * @param {string|null} params.cuisineFocus - restrict the whole week to one cuisine
 * @param {string[]} params.recentRecipeIds - avoid repeating these (last 2-3 weeks)
 */
export function generateWeek({
  recipePool,
  members,
  mealDays = DEFAULT_MEAL_DAYS,
  mealStructure = DEFAULT_MEAL_STRUCTURE,
  blockedTags = [],
  cuisineFocus = null,
  recentRecipeIds = [],
}) {
  const used = new Set(recentRecipeIds);
  const meals = [];
  const snacksPerDay = Math.max(0, Math.min(4, mealStructure.snacksPerDay ?? 1));
  const lunchPlan = mealStructure.lunchPlan || DEFAULT_MEAL_STRUCTURE.lunchPlan;

  // 1. Shared breakfast/dinner per day, only where enabled. Dinner may
  // produce a main+side pair instead of a single recipe.
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayConfig = mealDays[dayIndex] || {};
    const shares = computeMealShares(dayConfig, snacksPerDay);
    for (const mealType of ['breakfast', 'dinner']) {
      if (!dayConfig[mealType]) continue;
      const rows = sharedMeals({
        recipePool,
        dayIndex,
        mealType,
        calorieShare: shares[mealType],
        proteinShare: shares[mealType],
        members,
        blockedTags,
        cuisine: cuisineFocus,
        excludeIds: [...used],
      });
      for (const meal of rows) {
        if (meal.recipeId) used.add(meal.recipeId);
        meals.push(meal);
      }
    }
  }

  // 2. Lunch — one "batch" recipe per member reused across all their batch
  // days, plus an independently-picked recipe for each "fresh" day. Only
  // for days where lunch is enabled at all.
  const batchLunchByMember = {};
  for (const member of members) {
    const recipe = pickCandidate(recipePool, {
      mealType: 'lunch',
      blockedTags,
      cuisine: cuisineFocus,
      excludeIds: [],
    });
    batchLunchByMember[member.id] = recipe;
  }

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayConfig = mealDays[dayIndex] || {};
    if (!dayConfig.lunch) continue;
    const shares = computeMealShares(dayConfig, snacksPerDay);
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
            ? servingsForTargets(recipe.macros_per_serving, {
                targetCalories: member.targetCalories * shares.lunch,
                targetProtein: member.targetProteinG != null ? member.targetProteinG * shares.lunch : null,
              })
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
            calorieShare: shares.lunch,
            proteinShare: shares.lunch,
          })
        );
      }
    }
  }

  // 3. Snacks — independently picked per day, per member, per slot.
  if (snacksPerDay > 0) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const dayConfig = mealDays[dayIndex] || {};
      const shares = computeMealShares(dayConfig, snacksPerDay);
      const perSnackShare = shares.snack / snacksPerDay;
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
            calorieShare: perSnackShare,
            proteinShare: perSnackShare,
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
 * Regenerate a single meal slot — a shared dinner/breakfast row (main or
 * side), or one person's lunch/snack. calorieShare/proteinShare should be
 * computed by the caller via computeMealShares so a swap stays consistent
 * with however the rest of that day was built.
 */
export function swapMeal({
  recipePool,
  dayIndex,
  mealSlot,
  mealType,
  course = 'main',
  filterCourse = null,
  filterCourseIn = null,
  members,
  profileId = null,
  blockedTags = [],
  cuisine = null,
  excludeId,
  calorieShare,
  proteinShare,
}) {
  if (!profileId) {
    return sharedMealRow({
      recipePool,
      dayIndex,
      mealType,
      filterCourse,
      filterCourseIn,
      storeCourse: course,
      calorieShare: calorieShare ?? BASE_SHARE[mealType],
      proteinShare: proteinShare ?? calorieShare ?? BASE_SHARE[mealType],
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
    calorieShare: calorieShare ?? BASE_SHARE[mealType] ?? 0.2,
    proteinShare: proteinShare ?? calorieShare ?? BASE_SHARE[mealType] ?? 0.2,
  });
}
