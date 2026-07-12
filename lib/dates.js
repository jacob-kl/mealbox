// lib/dates.js
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Returns the ISO date (YYYY-MM-DD) of the Monday on/before the given date. */
export function currentWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

export function dayLabel(weekStart, dayIndex) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${DAY_NAMES[dayIndex]} ${month} ${d.getDate()}`;
}

export { DAY_NAMES };
