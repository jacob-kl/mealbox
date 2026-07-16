// lib/roleLabels.js
// Display names for household_role values. The underlying database values
// (head_of_kitchen, kitchen, member) stay exactly as they are - renaming
// those would mean another migration and touching every RLS policy and
// permission check that references them, for zero functional benefit since
// nobody but the app ever sees the raw value. This is a display-only
// relabeling: Head Chef, Sous Chef, Household member.
export const ROLE_LABELS = {
  head_of_kitchen: 'Head Chef',
  kitchen: 'Sous Chef',
  member: 'Household member',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}
