export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The app is English only (docs/product.md), so dates are always formatted for en-US. */
export const LOCALE = 'en-US';

/** "Sunday, October 4 · 6:42 AM". Never throws; an invalid date gives an empty string. */
export function formatEntryDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
  const time = date.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** "Sep 23", plus the year ("Sep 23, 2025") when it is not the current year. Empty for an invalid date. */
export function formatShortDate(date: Date, now: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return '';
  const withYear = date.getFullYear() !== now.getFullYear();
  return date.toLocaleDateString(LOCALE, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' as const } : {}),
  });
}
