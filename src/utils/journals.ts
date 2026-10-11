import { DREAMS_JOURNAL, EntryType, JournalId, LIFE_JOURNAL } from '../types/entry';

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

export type Journal = { id: JournalId; name: string; kind: EntryType };

/** The journals the app ships with, in display order. */
export const BUILT_IN_JOURNALS: readonly Journal[] = [
  { id: DREAMS_JOURNAL, name: 'Dreams', kind: 'dream' },
  { id: LIFE_JOURNAL, name: 'Life', kind: 'journal' },
];

/** Whether the id is one of the journals the app ships with (as opposed to a user-created one). */
export function isBuiltInJournal(id: JournalId): boolean {
  return BUILT_IN_JOURNALS.some((j) => j.id === id);
}

/** The journal with this id in the given registry; undefined when the registry does not know it. */
export function journalById(journals: readonly Journal[], id: JournalId): Journal | undefined {
  return journals.find((j) => j.id === id);
}

/** The journal with this id, or Dreams (the same fallback kindOf uses) for an id the registry does not know. */
export function journalOrDefault(journals: readonly Journal[], id: JournalId): Journal {
  return journalById(journals, id) ?? BUILT_IN_JOURNALS[0];
}

/**
 * The kind of a journal. An id the registry does not know falls back to 'dream', which keeps
 * today's strict behavior (a title is required) for entries it cannot classify.
 */
export function kindOf(journals: readonly Journal[], id: JournalId): EntryType {
  return journalById(journals, id)?.kind ?? 'dream';
}

/** Whether finishing an entry of this kind needs a title. */
export const titleRequired = (kind: EntryType): boolean => kind === 'dream';

/** Whether entries of this kind have the optional Emotion field. */
export const showsEmotion = (_kind: EntryType): boolean => true;

/** Every user-facing noun or phrase that differs by kind. Dream values are the strings in use today. */
export type JournalCopy = {
  saveButton: string;
  newButton: string;
  logHeader: string;
  searchLabel: string;
  emptyTitle: string;
  emptyBody: string;
  noMatchTitle: string;
  unreadableLog: string;
  discardChangesMessage: string;
  deleteTitle: string;
  deleteBodyWithAudio: string;
  deleteBodyNoAudio: string;
  deleteFailureTitle: string;
  deleteFailureUnreadable: string;
  deleteFailureSafetyCopy: string;
  saveFailureTitle: string;
  saveFailureMessage: string;
  saveFailureUnreadable: string;
  /** Prefix of the date line, e.g. "Dream · Oct 6" or "Life · Oct 6". */
  datePrefix: string;
  /** The date line when there is no date, e.g. "Dream" or "Life". */
  dateFallback: string;
  untitled: string;
  editLabel: string;
  deleteLabel: string;
  deleteRowLabel: (title: string) => string;
  microphoneMessage: string;
};

const DREAM_COPY: JournalCopy = {
  saveButton: 'Save dream',
  newButton: 'New dream',
  logHeader: 'Dreams',
  searchLabel: 'Search dreams',
  emptyTitle: 'No dreams yet.',
  emptyBody: 'Tap New dream to record one.',
  noMatchTitle: 'No dreams match',
  unreadableLog: 'Your saved dreams could not be read. Your recordings are safe.',
  discardChangesMessage: 'Your changes to this dream will be lost.',
  deleteTitle: 'Delete this dream?',
  deleteBodyWithAudio: "The recording and text will be permanently deleted. This can't be undone.",
  deleteBodyNoAudio: "The text will be permanently deleted. This can't be undone.",
  deleteFailureTitle: 'Could not delete dream',
  deleteFailureUnreadable: 'Your saved dreams could not be read. Nothing was deleted.',
  deleteFailureSafetyCopy:
    'A saved copy of your dreams is damaged, so this dream was not deleted. Nothing was changed.',
  saveFailureTitle: 'Could not save your dream',
  saveFailureMessage: 'Please try again.',
  saveFailureUnreadable:
    'Your saved dreams could not be read, so this dream was not saved. Your recording is still here.',
  datePrefix: 'Dream · ',
  dateFallback: 'Dream',
  untitled: 'Untitled dream',
  editLabel: 'Edit dream',
  deleteLabel: 'Delete dream',
  deleteRowLabel: (title) => `Delete dream: ${title}`,
  microphoneMessage:
    'Lucid needs the microphone to record your dream. You can allow it in Settings.',
};

const JOURNAL_COPY: JournalCopy = {
  saveButton: 'Save entry',
  newButton: 'New entry',
  logHeader: 'Life',
  searchLabel: 'Search entries',
  emptyTitle: 'No entries yet.',
  emptyBody: 'Tap New entry to record one.',
  noMatchTitle: 'No entries match',
  unreadableLog: 'Your saved entries could not be read. Your recordings are safe.',
  discardChangesMessage: 'Your changes to this entry will be lost.',
  deleteTitle: 'Delete this entry?',
  deleteBodyWithAudio: "The recording and text will be permanently deleted. This can't be undone.",
  deleteBodyNoAudio: "The text will be permanently deleted. This can't be undone.",
  deleteFailureTitle: 'Could not delete entry',
  deleteFailureUnreadable: 'Your saved entries could not be read. Nothing was deleted.',
  deleteFailureSafetyCopy:
    'A saved copy of your entries is damaged, so this entry was not deleted. Nothing was changed.',
  saveFailureTitle: 'Could not save your entry',
  saveFailureMessage: 'Please try again.',
  saveFailureUnreadable:
    'Your saved entries could not be read, so this entry was not saved. Your recording is still here.',
  datePrefix: 'Life · ',
  dateFallback: 'Life',
  untitled: 'Untitled entry',
  editLabel: 'Edit entry',
  deleteLabel: 'Delete entry',
  deleteRowLabel: (title) => `Delete entry: ${title}`,
  microphoneMessage:
    'Lucid needs the microphone to record your entry. You can allow it in Settings.',
};

/** The copy shared by every journal of a kind (names are not filled in). */
export const kindCopy = (kind: EntryType): JournalCopy =>
  kind === 'dream' ? DREAM_COPY : JOURNAL_COPY;

// Name-filled copy of user-created journals, kept per journal object so memoized rows see a stable value.
const customCopy = new WeakMap<Journal, JournalCopy>();

/**
 * The copy for one journal: the kind's copy with the name-bearing fields (log header, date line,
 * search label, empty state) filled from the journal's name. The built-in Dreams and Life keep
 * their hand-written strings exactly; a user-created journal gets the name-filled versions.
 */
export function journalCopy(journal: Journal): JournalCopy {
  const base = kindCopy(journal.kind);
  if (isBuiltInJournal(journal.id)) return base;
  const cached = customCopy.get(journal);
  if (cached) return cached;
  const { name } = journal;
  const copy: JournalCopy = {
    ...base,
    logHeader: name,
    datePrefix: `${name} · `,
    dateFallback: name,
    searchLabel: `Search ${name}`,
    emptyTitle: `No ${name} entries yet.`,
    emptyBody: `Tap ${base.newButton} to record one.`,
  };
  customCopy.set(journal, copy);
  return copy;
}

/** Singular noun for one entry of this kind, e.g. "Dream" or "Life". Keyed by kind so a new kind is a type error. */
const ENTRY_NOUNS: Record<EntryType, string> = { dream: 'Dream', journal: 'Life' };

/** The word for one entry of this journal in labels, e.g. the Today row label: "Dream", "Life", or a custom journal's name. */
export const entryNoun = (journal: Journal): string =>
  isBuiltInJournal(journal.id) ? ENTRY_NOUNS[journal.kind] : journal.name;
