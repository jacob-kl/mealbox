// lib/weekBuilder.js
// Builds a full week of meals from the household's recipe pool. The
// household controls, per weekday, which of breakfast/lunch/dinner are even
// planned at all (a 7x3 grid), how many snacks per day, and for lunch
// specifically whether that day uses the week's batch-cooked lunch or a
// freshly-cooked one. Also powers single-meal "swap this" regeneration.
//
// Two complementary mechanisms handle protein targets, since scaling a
// single recipe uniformly can't change its underlying macro ratio at all:
//   1. Recipe *selection* (pickCandidate) biases toward recipes whose own
//      protein density already fits the target.
//   2. Recipe *personalization* (personalizeRecipe, in lib/nutrition.js)
//      then adjusts that recipe's protein-source ingredient(s) up and its
//      starch ingredient(s) down to fit the actual target — when the
//      ingredients table is available. Falls back to plain calorie scaling
//      when it isn't (e.g. an older code path).
// Slot calorie budgets are renormalized per day to the meal types actually
// enabled that day, so turning off breakfast and snacks doesn't leave 30%
// of the day's targets permanently unreachable — the remaining slots pick
// up the slack.

import { servingsForTarget, personalizeRecipe } from '@/lib/nutrition';

export const MEAL_CALORIE_SHARE = {
  breakfast: 0.15,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.15, // total snack budget for the day, split across however many snack slots are configured
};

// Baseline relative weights before renormalization to whichever slots are
// actually enabled for a given day. Dessert is intentionally small — it's
// a shared treat alongside dinner, not sized like a full meal.
const BASE_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.35, dessert: 0.08, snack: 0.15 };

/**
 * Given which meal types are enabled for a day (and whether snacks are
 * configured at all), returns calorie/protein budget fractions that sum to
 * 1.0 across just the enabled slots — so two enabled slots split 100% of
 * the day's targets between them, not 70%.
 */
export function computeMealShares(dayConfig, snacksPerDay) {
  const active = {};
  let total = 0;
  for (const slot of ['breakfast', 'lunch', 'dinner', 'dessert']) {
    if (dayConfig?.[slot]) {
      active[slot] = BASE_SHARE[slot];
      total += BASE_SHARE[slot];
    }
  }
  if (snacksPerDay > 0) {
    active.snack = BASE_SHARE.snack;
    total += BASE_SHARE.snack;
  }
  const shares = { breakfast: 0, lunch: 0, dinner: 0, dessert: 0, snack: 0 };
  if (total === 0) return shares;
  for (const key of Object.keys(active)) shares[key] = active[key] / total;
  return shares;
}

// Which of breakfast/lunch/dinner/dessert are planned at all, per weekday (0=Mon..6=Sun).
export const DEFAULT_MEAL_DAYS = {
  0: { breakfast: false, lunch: true, dinner: true, dessert: false },
  1: { breakfast: false, lunch: true, dinner: true, dessert: false },
  2: { breakfast: false, lunch: true, dinner: true, dessert: false },
  3: { breakfast: false, lunch: true, dinner: true, dessert: false },
  4: { breakfast: false, lunch: true, dinner: true, dessert: false },
  5: { breakfast: false, lunch: true, dinner: true, dessert: false },
  6: { breakfast: true, lunch: true, dinner: false, dessert: false },
};

export const DEFAULT_MEAL_STRUCTURE = {
  snacksPerDay: 1,
  lunchPlan: { 0: 'batch', 1: 'batch', 2: 'batch', 3: 'batch', 4: 'batch', 5: 'batch', 6: 'batch' },
  // Absolute calorie ceiling per meal type, in addition to the built-in
  // reasonable default below. null = use the default percentage cap
  // instead of a specific number - most households never need to touch
  // this at all.
  mealCaps: { breakfast: null, lunch: null, dinner: null, snack: null },
};

// Fallback ceiling used whenever a household hasn't set an explicit
// absolute cap for a meal type, expressed as a share of that person's own
// daily target so it scales sensibly for everyone regardless of their
// individual calorie needs. Without this, a day where only one meal type
// is enabled (dinner-only because lunch was a team outing, say) hands that
// single sitting 100% of the day's calories - mathematically consistent
// with the day's targets, but not a remotely reasonable single meal. These
// intentionally sum to well over 100% - they're a safety ceiling for the
// rare lean-day case, not a partition; a normal day with all slots enabled
// almost never gets close to them.
const DEFAULT_MEAL_CAP_SHARE = { breakfast: 0.35, lunch: 0.45, dinner: 0.5, snack: 0.2 };

/** Applies a household's per-meal-type calorie ceiling - an explicit
 * absolute number if the household set one, otherwise the built-in
 * percentage-of-target default above. fullTargetCalories is the relevant
 * person's (or, for a shared meal, the household average's) whole-day
 * target - the thing the percentage default is a share of. */
function applyMealCap(calories, mealType, mealCaps, fullTargetCalories) {
  let capped = calories;
  // The default percentage-of-target ceiling always applies - this is the
  // actual fix for "one meal eats the whole day." An explicit household
  // cap can only make it stricter (lower), never override it with
  // something looser, so a generous number set once during earlier
  // experimentation can't silently defeat the sensible default forever.
  const defaultShare = DEFAULT_MEAL_CAP_SHARE[mealType];
  if (defaultShare != null && fullTargetCalories) {
    capped = Math.min(capped, fullTargetCalories * defaultShare);
  }
  const explicitCap = mealCaps?.[mealType];
  if (explicitCap != null) {
    capped = Math.min(capped, explicitCap);
  }
  return capped;
}

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
 *
 * When proteinDensityTarget is given (a target g-protein-per-calorie ratio),
 * candidates are biased toward recipes whose own protein density is closer
 * to that ratio, instead of picking uniformly at random.
 */
export function pickCandidate(recipePool, { mealType, course = null, courseIn = null, blockedTags, cuisine, excludeIds, proteinDensityTarget = null }) {
  const attempts = [
    { mealType, course, courseIn, blockedTags, cuisine, excludeIds },
    { mealType, course, courseIn, blockedTags, cuisine: null, excludeIds },
    // last resort: allow a repeat, but keep the dietary blocklist hard
    { mealType, course, courseIn, blockedTags, cuisine: null, excludeIds: [] },
  ];

  for (const attempt of attempts) {
    const candidates = recipePool.filter((r) => passesFilters(r, attempt));
    if (!candidates.length) continue;

    if (proteinDensityTarget != null && candidates.length > 1) {
      const withDensity = candidates.map((r) => ({
        recipe: r,
        density: (r.macros_per_serving?.protein || 0) / (r.macros_per_serving?.cal || 1),
      }));
      withDensity.sort((a, b) => b.density - a.density);
      const topCount = Math.max(1, Math.ceil(withDensity.length * 0.4));
      const top = withDensity.slice(0, topCount);
      return top[Math.floor(Math.random() * top.length)].recipe;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return null;
}

/** Average g-protein-per-calorie ratio across a set of household members. */
function averageProteinDensity(members) {
  const withTargets = members.filter((m) => m.targetProteinG != null && m.targetCalories);
  if (!withTargets.length) return null;
  const sum = withTargets.reduce((acc, m) => acc + m.targetProteinG / m.targetCalories, 0);
  return sum / withTargets.length;
}

/**
 * Personalizes a recipe for a shared (household) meal: boosts the protein
 * source enough for whoever needs the most (so nobody's shorted by a
 * dish sized for the lowest need), sized against the household's average
 * calorie share for that slot.
 */
function personalizeForHousehold(recipe, ingredientsByName, members, calorieShare, mealType, mealCaps) {
  if (!ingredientsByName || !recipe) return null;
  const avgFullTarget = members.reduce((sum, m) => sum + m.targetCalories, 0) / members.length;
  const avgCalorieTarget = applyMealCap(avgFullTarget * calorieShare, mealType, mealCaps, avgFullTarget);
  const avgCarbsTarget = (members.reduce((sum, m) => sum + (m.targetCarbsG || 0), 0) / members.length) * calorieShare;
  const maxProteinTarget = Math.max(0, ...members.map((m) => (m.targetProteinG || 0) * calorieShare));
  try {
    return personalizeRecipe(recipe, ingredientsByName, {
      targetCalories: avgCalorieTarget,
      targetProtein: maxProteinTarget || null,
      targetCarbs: avgCarbsTarget || null,
    });
  } catch {
    return null; // missing an ingredient in the map, etc. — fall back to the plain recipe
  }
}

function scalePortionsFor(macrosPerServing, calorieShare, members, mealType, mealCaps) {
  return members.map((m) => ({
    profileId: m.id,
    servings: servingsForTarget(macrosPerServing, applyMealCap(m.targetCalories * calorieShare, mealType, mealCaps, m.targetCalories)),
  }));
}

function sharedMealRow({ recipePool, dayIndex, mealType, filterCourse, filterCourseIn, storeCourse, calorieShare, proteinDensityTarget, members, blockedTags, cuisine, excludeIds, ingredientsByName, mealCaps }) {
  const recipe = pickCandidate(recipePool, { mealType, course: filterCourse, courseIn: filterCourseIn, blockedTags, cuisine, excludeIds, proteinDensityTarget });

  if (!recipe) {
    return { dayIndex, mealSlot: mealType, course: storeCourse, profileId: null, recipeId: null, recipe: null, label: null, portions: [] };
  }

  const personalized = personalizeForHousehold(recipe, ingredientsByName, members, calorieShare, mealType, mealCaps);
  const effectiveMacros = personalized?.macros ?? recipe.macros_per_serving;
  const portions = scalePortionsFor(effectiveMacros, calorieShare, members, mealType, mealCaps);

  return {
    dayIndex,
    mealSlot: mealType,
    course: storeCourse,
    profileId: null,
    recipeId: recipe.id,
    recipe,
    label: null,
    portions,
    computedMacros: personalized?.macros ?? null,
    ingredientsOverride: personalized?.ingredients ?? null,
  };
}

/**
 * Builds the shared meal(s) for a slot. For dinner, picks from complete
 * dishes AND standalone mains together (so a handful of split main/side
 * recipes never crowds out the much larger complete-dish library) — a side
 * only gets added on top when the pick that came back happens to be a
 * 'main'. Breakfast is always a single pick, no course filtering.
 */
function sharedMeals({ recipePool, dayIndex, mealType, calorieShare, proteinDensityTarget, members, blockedTags, cuisine, excludeIds, ingredientsByName, mealCaps }) {
  if (mealType === 'dinner') {
    const primary = sharedMealRow({
      recipePool,
      dayIndex,
      mealType,
      filterCourseIn: ['complete', 'main'],
      storeCourse: 'main',
      calorieShare,
      proteinDensityTarget,
      members,
      blockedTags,
      cuisine,
      excludeIds,
      ingredientsByName,
      mealCaps,
    });

    const rows = [primary];
    const pickedCourse = primary.recipe?.course || 'complete';

    if (pickedCourse === 'main') {
      const sidePool = recipePool.filter((r) => r.meal_type === 'dinner' && (r.course || 'complete') === 'side');
      if (sidePool.length) {
        // Re-personalize/re-scale the main down to its course share now
        // that we know a side is joining it.
        const rescaled = sharedMealRow({
          recipePool: [primary.recipe],
          dayIndex,
          mealType,
          filterCourseIn: ['main'],
          storeCourse: 'main',
          calorieShare: calorieShare * COURSE_SHARE.main,
          proteinDensityTarget: null,
          members,
          blockedTags: [],
          cuisine: null,
          excludeIds: [],
          ingredientsByName,
          mealCaps,
        });
        rows[0] = { ...rescaled, recipeId: primary.recipeId, recipe: primary.recipe };

        const excludeWithMain = primary.recipeId ? [...excludeIds, primary.recipeId] : excludeIds;
        rows.push(
          sharedMealRow({
            recipePool,
            dayIndex,
            mealType,
            filterCourse: 'side',
            storeCourse: 'side',
            calorieShare: calorieShare * COURSE_SHARE.side,
            proteinDensityTarget: null, // sides aren't the protein source; no bias needed
            members,
            blockedTags,
            cuisine,
            excludeIds: excludeWithMain,
            ingredientsByName,
            mealCaps,
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
      proteinDensityTarget,
      members,
      blockedTags,
      cuisine,
      excludeIds,
      ingredientsByName,
      mealCaps,
    }),
  ];
}

function individualMeal({ recipePool, dayIndex, mealSlot, member, mealType, blockedTags, cuisine, excludeIds, calorieShare, proteinDensityTarget, ingredientsByName, mealCaps }) {
  const recipe = pickCandidate(recipePool, { mealType, blockedTags, cuisine, excludeIds, proteinDensityTarget });

  if (!recipe) {
    return { dayIndex, mealSlot, profileId: member.id, recipeId: null, recipe: null, label: null, servings: 1 };
  }

  const cappedCalorieTarget = applyMealCap(member.targetCalories * calorieShare, mealType, mealCaps, member.targetCalories);

  const personalized =
    ingredientsByName &&
    (() => {
      try {
        return personalizeRecipe(recipe, ingredientsByName, {
          targetCalories: cappedCalorieTarget,
          targetProtein: member.targetProteinG != null ? member.targetProteinG * calorieShare : null,
          targetCarbs: member.targetCarbsG != null ? member.targetCarbsG * calorieShare : null,
        });
      } catch {
        return null;
      }
    })();

  const effectiveMacros = personalized?.macros ?? recipe.macros_per_serving;
  // Personalization already targets this member's exact share directly —
  // a further serving multiplier isn't needed on top of it. Without
  // personalization (no ingredient map available), fall back to plain
  // calorie-based serving scaling of the recipe as seeded.
  const servings = personalized ? 1 : servingsForTarget(recipe.macros_per_serving, cappedCalorieTarget);

  return {
    dayIndex,
    mealSlot,
    profileId: member.id,
    recipeId: recipe.id,
    recipe,
    label: null,
    servings,
    computedMacros: personalized?.macros ?? null,
    ingredientsOverride: personalized?.ingredients ?? null,
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
 * @param {Record<string,Object>} [params.ingredientsByName] - full ingredient database, enables per-ingredient personalization
 */
export function generateWeek({
  recipePool,
  members,
  mealDays = DEFAULT_MEAL_DAYS,
  mealStructure = DEFAULT_MEAL_STRUCTURE,
  blockedTags = [],
  cuisineFocus = null,
  recentRecipeIds = [],
  ingredientsByName = null,
  lunchByProfile = null,
  mealDaysByProfile = null,
  snacksPerDayByProfile = null,
}) {
  const used = new Set(recentRecipeIds);
  const meals = [];
  const householdSnacksPerDay = Math.max(0, Math.min(4, mealStructure.snacksPerDay ?? 1));
  const mealCaps = mealStructure.mealCaps || DEFAULT_MEAL_STRUCTURE.mealCaps;
  const proteinDensityTarget = averageProteinDensity(members);

  // Per-member overrides for shared-meal participation, lunch schedule, and
  // snack count - each falls back to the household-wide setting when a
  // member has no personal override, so existing single-schedule
  // households keep working unchanged.
  function lunchEnabledFor(member, dayIndex) {
    const perMember = lunchByProfile?.[member.id]?.days?.[dayIndex];
    if (perMember != null) return perMember;
    return !!(mealDays[dayIndex] || {}).lunch;
  }
  function lunchStrategyFor(member, dayIndex) {
    const perMember = lunchByProfile?.[member.id]?.strategy?.[dayIndex];
    if (perMember) return perMember;
    return (mealStructure.lunchPlan || DEFAULT_MEAL_STRUCTURE.lunchPlan)[dayIndex] || 'batch';
  }
  // breakfast/dinner/dessert: whether THIS member wants a portion of that
  // day's shared dish, if the household is making one at all that day.
  function sharedMealWantedFor(member, mealType, dayIndex) {
    const perMember = mealDaysByProfile?.[member.id]?.[dayIndex]?.[mealType];
    if (perMember != null) return perMember;
    return !!(mealDays[dayIndex] || {})[mealType];
  }
  function snacksPerDayFor(member) {
    const perMember = snacksPerDayByProfile?.[member.id];
    if (perMember != null) return Math.max(0, Math.min(4, perMember));
    return householdSnacksPerDay;
  }
  // Each member's own effective dayConfig for THEIR individual share
  // calculation - reflects this specific member's own lunch/breakfast/
  // dinner/dessert participation, not just the household-wide defaults.
  function dayConfigFor(member, dayIndex) {
    return {
      breakfast: sharedMealWantedFor(member, 'breakfast', dayIndex),
      lunch: lunchEnabledFor(member, dayIndex),
      dinner: sharedMealWantedFor(member, 'dinner', dayIndex),
      dessert: sharedMealWantedFor(member, 'dessert', dayIndex),
    };
  }

  // 1. Shared breakfast/dinner/dessert per day, only where enabled. Dinner
  // may produce a main+side pair instead of a single recipe. Dessert skips
  // the protein-density selection bias — there's no reason to always favor
  // whichever dessert happens to be most protein-dense.
  //
  // The dish itself is shared - it's cooked once if ANY member wants it
  // that day ("any member" is the simple, reasonable stand-in for the
  // household-wide renormalization). Whether a SPECIFIC member gets a
  // portion of it is decided per-member right after, in scalePortionsFor.
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const anyLunchToday = members.some((m) => lunchEnabledFor(m, dayIndex));
    const anyBreakfastToday = members.some((m) => sharedMealWantedFor(m, 'breakfast', dayIndex));
    const anyDinnerToday = members.some((m) => sharedMealWantedFor(m, 'dinner', dayIndex));
    const anyDessertToday = members.some((m) => sharedMealWantedFor(m, 'dessert', dayIndex));
    const dayConfig = { breakfast: anyBreakfastToday, lunch: anyLunchToday, dinner: anyDinnerToday, dessert: anyDessertToday };
    // Snack share for the shared-meal renormalization uses the household
    // average snack count across members, so breakfast/dinner/dessert
    // shares aren't skewed by one member's personal snack preference.
    const avgSnacksPerDay = members.length ? members.reduce((sum, m) => sum + snacksPerDayFor(m), 0) / members.length : householdSnacksPerDay;
    const shares = computeMealShares(dayConfig, avgSnacksPerDay);
    for (const mealType of ['breakfast', 'dinner', 'dessert']) {
      if (!dayConfig[mealType]) continue;
      // Members who don't personally want this shared meal today still
      // need to be passed through so scalePortionsFor can give them a
      // zero portion - they're just excluded from the household average
      // used to size the recipe itself.
      const wantingMembers = members.filter((m) => sharedMealWantedFor(m, mealType, dayIndex));
      const rows = sharedMeals({
        recipePool,
        dayIndex,
        mealType,
        calorieShare: shares[mealType],
        proteinDensityTarget: mealType === 'dessert' ? null : proteinDensityTarget,
        members: wantingMembers.length ? wantingMembers : members,
        blockedTags,
        cuisine: cuisineFocus,
        excludeIds: [...used],
        ingredientsByName,
        mealCaps,
      });
      for (const meal of rows) {
        if (meal.recipeId) used.add(meal.recipeId);
        // Zero out the portion for anyone who didn't want this meal today,
        // so they aren't credited calories for food they're not eating.
        meal.portions = members.map((m) => {
          if (!wantingMembers.includes(m)) return { profileId: m.id, servings: 0 };
          return meal.portions.find((p) => p.profileId === m.id) || { profileId: m.id, servings: 0 };
        });
        meals.push(meal);
      }
    }
  }

  // 2. Lunch — one "batch" recipe per member reused across all their batch
  // days, plus an independently-picked recipe for each "fresh" day. Each
  // member has their own days-on and batch/fresh schedule.
  const batchLunchByMember = {};
  for (const member of members) {
    const recipe = pickCandidate(recipePool, {
      mealType: 'lunch',
      blockedTags,
      cuisine: cuisineFocus,
      excludeIds: [],
      proteinDensityTarget,
    });
    batchLunchByMember[member.id] = recipe;
  }

  for (const member of members) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      if (!lunchEnabledFor(member, dayIndex)) continue;
      const shares = computeMealShares(dayConfigFor(member, dayIndex), snacksPerDayFor(member));
      const strategy = lunchStrategyFor(member, dayIndex);
      if (strategy === 'batch') {
        const recipe = batchLunchByMember[member.id];
        if (!recipe) {
          meals.push({ dayIndex, mealSlot: 'lunch', profileId: member.id, recipeId: null, recipe: null, label: null, servings: 1 });
          continue;
        }
        const cappedLunchTarget = applyMealCap(member.targetCalories * shares.lunch, 'lunch', mealCaps, member.targetCalories);
        const personalized =
          ingredientsByName &&
          (() => {
            try {
              return personalizeRecipe(recipe, ingredientsByName, {
                targetCalories: cappedLunchTarget,
                targetProtein: member.targetProteinG != null ? member.targetProteinG * shares.lunch : null,
                targetCarbs: member.targetCarbsG != null ? member.targetCarbsG * shares.lunch : null,
              });
            } catch {
              return null;
            }
          })();
        const servings = personalized ? 1 : servingsForTarget(recipe.macros_per_serving, cappedLunchTarget);
        meals.push({
          dayIndex,
          mealSlot: 'lunch',
          profileId: member.id,
          recipeId: recipe.id,
          recipe,
          label: null,
          servings,
          computedMacros: personalized?.macros ?? null,
          ingredientsOverride: personalized?.ingredients ?? null,
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
            proteinDensityTarget,
            ingredientsByName,
            mealCaps,
          })
        );
      }
    }
  }

  // 3. Snacks — independently picked per day, per member, per slot. Each
  // member has their own snack count and their own share reflecting their
  // own lunch/meal-day schedule for that day.
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    for (const member of members) {
      const memberSnacksPerDay = snacksPerDayFor(member);
      if (memberSnacksPerDay <= 0) continue;
      const shares = computeMealShares(dayConfigFor(member, dayIndex), memberSnacksPerDay);
      const perSnackShare = shares.snack / memberSnacksPerDay;
      const usedTodayForMember = [];
      for (let i = 0; i < memberSnacksPerDay; i++) {
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
          proteinDensityTarget,
          ingredientsByName,
          mealCaps,
        });
        if (meal.recipeId) usedTodayForMember.push(meal.recipeId);
        meals.push(meal);
      }
    }
  }

  return meals;
}

/**
 * Regenerate a single meal slot — a shared dinner/breakfast row (main or
 * side), or one person's lunch/snack. calorieShare should be computed by
 * the caller via computeMealShares so a swap stays consistent with however
 * the rest of that day was built.
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
  ingredientsByName = null,
  mealCaps = null,
}) {
  const proteinDensityTarget = averageProteinDensity(members);

  if (!profileId) {
    return sharedMealRow({
      recipePool,
      dayIndex,
      mealType,
      filterCourse,
      filterCourseIn,
      storeCourse: course,
      calorieShare: calorieShare ?? BASE_SHARE[mealType],
      proteinDensityTarget: course === 'side' ? null : proteinDensityTarget,
      members,
      blockedTags,
      cuisine,
      excludeIds: excludeId ? [excludeId] : [],
      ingredientsByName,
      mealCaps,
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
    proteinDensityTarget,
    ingredientsByName,
    mealCaps,
  });
}
