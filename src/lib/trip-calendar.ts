/** Calendar arithmetic uses date-only UTC values, avoiding DST and UTC/local date drift. */
export function localDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function tripDayDate(startDate: string | null, day: number, today: string) {
  const date = new Date(`${startDate ?? today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}
export function nearestTripDay(startDate: string | null, days: number[], today: string) {
  if (!days.length) return null;
  const current = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate ?? today}T00:00:00Z`)) / 86400000 + 1;
  return days.reduce((best, day) => Math.abs(day - current) < Math.abs(best - current) ? day : best);
}
export function adjacentTripDay(days: number[], activeDay: number | null, direction: 1 | -1) {
  if (activeDay === null) return direction === 1 ? days[0] : days.at(-1);
  const index = days.indexOf(activeDay);
  return index < 0 ? undefined : days[index + direction];
}
