import { Entry, isDraft } from '../types/dream';
import { Journal, journalById, journalOf } from './journals';

/**
 * Which day an entry belongs to is decided by its createdAt, the time it was first stored (a draft
 * counts), in the device's local time. A dream started at 23:58 and finished at 00:05 therefore
 * belongs to the earlier day, the same as its row in the Dream log.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local YYYY-MM-DD. Never use toISOString here: that is UTC and shifts the day near midnight. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local day key of a record's createdAt; null when it is missing or not a valid date. */
function dayKeyOf(record: Entry): string | null {
  if (typeof record.createdAt !== 'string') return null;
  const date = new Date(record.createdAt);
  return Number.isNaN(date.getTime()) ? null : localDateKey(date);
}

/**
 * The entries created on the given local day, newest first (flat, across journals). Drafts are
 * included. Entries of a journal missing from the given registry are left out; an entry with no
 * journalId counts as Dreams. Does not mutate the input.
 */
export function entriesToday(
  journals: readonly Journal[],
  records: Entry[],
  todayKey: string,
): Entry[] {
  return records
    .filter((r) => dayKeyOf(r) === todayKey && journalById(journals, journalOf(r)) !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Whether today already has a finished Dream, and whether the user chose "No dream" today.
 * Drafts and Life entries do not count as a dream; a skip date from another day is stale.
 */
export function dayStatus(
  records: Entry[],
  noDreamDate: string | null,
  todayKey: string,
): { dreamToday: boolean; skippedToday: boolean } {
  return {
    dreamToday: records.some(
      (r) => !isDraft(r) && journalOf(r) === 'dreams' && dayKeyOf(r) === todayKey,
    ),
    skippedToday: noDreamDate === todayKey,
  };
}

/** Where the app opens: the Dreams add-entry page only when auto-open is on and today is not yet settled. */
export function launchScreen({
  dreamToday,
  skippedToday,
  autoOpen,
}: {
  dreamToday: boolean;
  skippedToday: boolean;
  autoOpen: boolean;
}): 'today' | 'add' {
  return autoOpen && !dreamToday && !skippedToday ? 'add' : 'today';
}

/** Milliseconds from `now` to the next local midnight. Built from date parts so DST days are right. */
export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}
