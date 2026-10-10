import { DREAMS_JOURNAL, JournalId } from '../types/entry';

/**
 * Read a record's journal ONLY via journalOf; never read record.journalId directly (legacy records have none).
 */
export function journalOf(record: { journalId?: JournalId }): JournalId {
  return record.journalId ?? DREAMS_JOURNAL;
}

/** The entries of one journal. A record with no journalId counts as Dreams; other records are untouched. */
export function entriesFor<T extends { journalId?: JournalId }>(
  records: T[],
  journalId: JournalId,
): T[] {
  return records.filter((r) => journalOf(r) === journalId);
}
