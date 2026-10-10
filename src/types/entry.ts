export type EntryType = 'journal' | 'dream';

/** Which journal an entry belongs to. Open string: unknown (future) ids are kept in storage. */
export type JournalId = string;

/** The built-in Dreams journal. A stored record with no `journalId` belongs here. */
export const DREAMS_JOURNAL: JournalId = 'dreams';
/** The built-in Life journal. */
export const LIFE_JOURNAL: JournalId = 'life';
