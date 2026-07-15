// lib/permissions.js
// Server-side role check for meal-plan editing endpoints. "member" can view
// but not edit the shared plan; "kitchen" and "head_of_kitchen" can.

export function canEditMealPlan(householdRole) {
  return householdRole === 'head_of_kitchen' || householdRole === 'kitchen';
}
