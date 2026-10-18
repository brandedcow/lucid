import { formatShortDate } from './format';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** From this many days on, a date is shown instead of "N days ago". */
const MAX_RELATIVE_DAYS = 7;

function unit(n: number, name: string): string {
  return `${n} ${name}${n === 1 ? '' : 's'} ago`;
}

/**
 * Bear-style label for when a note changed: "2 seconds ago", "37 minutes ago", "3 hours ago",
 * "2 days ago", then a short date ("Sep 23", with the year when it is not `now`'s year) from 7
 * days on. Under one second, and for a time in the future (clock skew), "Just now". `now` is
 * injected. Never throws; an invalid timestamp gives an empty string.
 */
export function relativeTime(timestamp: Date | number | string, now: Date | number): string {
  const date = new Date(timestamp);
  const nowDate = new Date(now);
  if (Number.isNaN(date.getTime()) || Number.isNaN(nowDate.getTime())) return '';
  const diff = nowDate.getTime() - date.getTime();
  if (diff < SECOND) return 'Just now';
  if (diff < MINUTE) return unit(Math.floor(diff / SECOND), 'second');
  if (diff < HOUR) return unit(Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return unit(Math.floor(diff / HOUR), 'hour');
  if (diff < MAX_RELATIVE_DAYS * DAY) return unit(Math.floor(diff / DAY), 'day');
  return formatShortDate(date, nowDate);
}
