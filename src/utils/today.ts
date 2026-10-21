/**
 * Local-day helpers: the local date key, and the time left until the next local midnight (used by
 * useToday, noteViews and AppFlowProvider).
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local YYYY-MM-DD. Never use toISOString here: that is UTC and shifts the day near midnight. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Milliseconds from `now` to the next local midnight. Built from date parts so DST days are right. */
export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
