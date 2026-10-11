/** Longest allowed journal name, in characters. */
export const JOURNAL_NAME_MAX = 24;

export type JournalNameProblem = 'empty' | 'too-long' | 'duplicate';

export type JournalNameResult =
  { ok: true; name: string } | { ok: false; reason: JournalNameProblem };

/** Trims the ends and collapses every run of whitespace inside the name to one space. */
export const normalizeJournalName = (raw: string): string => raw.trim().replace(/\s+/g, ' ');

const fold = (name: string) => name.toLowerCase();

/**
 * Checks a journal name. `existing` must list ALL journals, built-in ones included, so "dreams"
 * and "Life" count as taken. `excludeId` skips one journal (the one being renamed). Returns the
 * normalized name or a reason code; no UI copy.
 */
export function validateJournalName(
  raw: string,
  existing: readonly { id: string; name: string }[],
  excludeId?: string,
): JournalNameResult {
  const name = normalizeJournalName(raw);
  if (name.length === 0) return { ok: false, reason: 'empty' };
  if (Array.from(name).length > JOURNAL_NAME_MAX) return { ok: false, reason: 'too-long' };
  const key = fold(name);
  if (existing.some((j) => j.id !== excludeId && fold(j.name) === key)) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: true, name };
}
