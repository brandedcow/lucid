import { formatShortDate, formatTimeOfDay } from './format';

export type TimeTick = { seconds: number; label: string };

const TICK_STEPS = [5, 10, 15, 30];

/** "0:05", "1:30". Whole seconds; anything not a finite number counts as 0. */
function tickLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/**
 * Time marks for a voice note's waveform: one every 5, 10, 15 or 30 seconds (the smallest step
 * that gives at most about 5 marks), starting at 0:00 and never past the length. Empty for a
 * length that is not a positive finite number.
 */
export function timeTicks(durationSec: number): TimeTick[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const step = TICK_STEPS.find((s) => durationSec / s <= 5) ?? 30;
  const ticks: TimeTick[] = [];
  for (let t = 0; t <= durationSec; t += step) ticks.push({ seconds: t, label: tickLabel(t) });
  return ticks;
}

/** "mm:ss.cc" with centiseconds, truncated: 1.7 gives "00:01.70". Not finite or negative gives "00:00.00". */
export function formatClock(seconds: number): string {
  const cs = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds * 100 + 1e-6) : 0;
  const c = cs % 100;
  const total = Math.floor(cs / 100);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}.${pad(c)}`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * When a voice note was recorded: "Today, 6:42 PM", "Yesterday, 6:42 PM", else a short date
 * ("Sep 23", with the year when not the current one), en-US. Empty for an invalid date. A date
 * in the future (clock change) is shown as a short date.
 */
export function formatRecordedAt(date: Date, now: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0 || days === 1) {
    return `${days === 0 ? 'Today' : 'Yesterday'}, ${formatTimeOfDay(date)}`;
  }
  return formatShortDate(date, now);
}
