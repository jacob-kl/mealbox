// lib/macros.js
// Macro calculation engine. Pure functions — no I/O — so they can be called
// from the API route (onboarding) and from the weight-triggered recalculation
// with identical logic.

export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2, // little/no exercise
  light: 1.375, // light exercise 1-3 days/week
  moderate: 1.55, // moderate exercise 3-5 days/week
  active: 1.725, // hard exercise 6-7 days/week
  very_active: 1.9, // very hard exercise + physical job
};

export const GOAL_CALORIE_ADJUSTMENT = {
  cut: -500, // ~1 lb/week deficit
  maintain: 0,
  bulk: 300,
};

// grams of protein per kg bodyweight, by goal — higher in a cut to preserve
// lean mass, still generous at maintenance/bulk.
export const GOAL_PROTEIN_PER_KG = {
  cut: 2.2,
  maintain: 1.8,
  bulk: 1.8,
};

const FAT_PERCENT_OF_CALORIES = 0.28;

export function lbToKg(lb) {
  return lb * 0.453592;
}

export function kgToLb(kg) {
  return kg / 0.453592;
}

export function cmFromFeetInches(feet, inches) {
  return (feet * 12 + inches) * 2.54;
}

/**
 * Mifflin-St Jeor BMR.
 */
export function calculateBMR({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

/**
 * Full target-macro calculation. Returns rounded, ready-to-store values.
 *
 * @param {Object} params
 * @param {'male'|'female'} params.sex
 * @param {number} params.age
 * @param {number} params.heightCm
 * @param {number} params.weightLb - current weight, used as the calculation baseline
 * @param {'sedentary'|'light'|'moderate'|'active'|'very_active'} params.activityLevel
 * @param {'cut'|'maintain'|'bulk'} params.goal
 */
export function calculateTargets({ sex, age, heightCm, weightLb, activityLevel, goal }) {
  const weightKg = lbToKg(weightLb);
  const bmr = calculateBMR({ sex, weightKg, heightCm, age });
  const tdee = bmr * (ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.375);
  const calories = Math.max(1200, tdee + (GOAL_CALORIE_ADJUSTMENT[goal] ?? 0));

  const proteinG = (GOAL_PROTEIN_PER_KG[goal] ?? 1.8) * weightKg;
  const fatCalories = calories * FAT_PERCENT_OF_CALORIES;
  const fatG = fatCalories / 9;
  const proteinCalories = proteinG * 4;
  const carbsCalories = Math.max(0, calories - proteinCalories - fatCalories);
  const carbsG = carbsCalories / 4;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories: Math.round(calories),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
  };
}

/**
 * Weight-tracker trigger: a household member should be prompted to
 * recalculate their macros once their weight has moved 5 lb (in either
 * direction) from the weight their current targets were calculated against.
 */
export function shouldRecalculate(baselineWeightLb, currentWeightLb, thresholdLb = 5) {
  if (baselineWeightLb == null) return false;
  return Math.abs(currentWeightLb - baselineWeightLb) >= thresholdLb;
}
