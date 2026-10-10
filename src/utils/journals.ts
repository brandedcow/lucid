import { DREAMS_JOURNAL, JournalId } from '../types/entry';

/** The entries of one journal. A record with no journalId counts as Dreams; other records are untouched. */
export function entriesFor<T extends { journalId?: JournalId }>(
  records: T[],
  journalId: JournalId,
): T[] {
  return records.filter((r) => (r.journalId ?? DREAMS_JOURNAL) === journalId);
}
