// lib/dates.js
//
// IMPORTANT: every function here works in LOCAL calendar time, never UTC.
// Two classic JS date traps caused real bugs here before:
//   1. `date.toISOString()` converts to UTC — in a timezone behind UTC,
//      that can silently roll the date to the next day.
//   2. `new Date('2026-07-13')` (no time part) is parsed as UTC midnight,
//      while `new Date('2026-07-13T00:00:00')` is parsed as LOCAL midnight.
//      Mixing the two forms across files caused "today" and "this week" to
//      disagree near timezone boundaries.
// Every date-to-string conversion below uses local getFullYear/getMonth/
// getDate, and every string-to-date conversion goes through parseDate(),
// which always includes the local-time suffix.

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Formats a Date as YYYY-MM-DD using local calendar components. */
export function isoDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses a YYYY-MM-DD string as local midnight (never UTC). */
export function parseDate(isoDateStr) {
  return new Date(isoDateStr + 'T00:00:00');
}

/** Returns the ISO date (YYYY-MM-DD) of the Monday on/before the given date. */
export function currentWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return isoDate(d);
}

export function dayLabel(weekStart, dayIndex) {
  const d = parseDate(weekStart);
  d.setDate(d.getDate() + dayIndex);
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${DAY_NAMES[dayIndex]} ${month} ${d.getDate()}`;
}

export function dayIndexForDate(date = new Date()) {
  const day = date.getDay(); // 0 = Sunday
  return day === 0 ? 6 : day - 1;
}

export function addDays(isoDateStr, days) {
  const d = parseDate(isoDateStr);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function friendlyDate(isoDateStr) {
  const d = parseDate(isoDateStr);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export { DAY_NAMES };
