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

export function journalById(id: JournalId): Journal | undefined {
  return BUILT_IN_JOURNALS.find((j) => j.id === id);
}

/**
 * The kind of a journal. An id this version does not know falls back to 'dream', which keeps
 * today's strict behavior (a title is required) for entries it cannot classify.
 */
export function kindOf(id: JournalId): EntryType {
  return journalById(id)?.kind ?? 'dream';
}

/** Whether finishing an entry of this kind needs a title. */
export const titleRequired = (kind: EntryType): boolean => kind === 'dream';

/** Whether entries of this kind have the optional Emotion field. */
export const showsEmotion = (_kind: EntryType): boolean => true;

/** Every user-facing noun or phrase that differs by kind. Dream values are the strings in use today. */
export type JournalCopy = {
  captureHeadline: string;
  tips: readonly string[];
  /** The "No dream" button on capture; null when the kind has none. */
  skipLabel: string | null;
  saveButton: string;
  newButton: string;
  logHeader: string;
  searchLabel: string;
  emptyTitle: string;
  emptyBody: string;
  noMatchTitle: string;
  unreadableLog: string;
  discardTitle: string;
  discardBody: string;
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
  titlePlaceholder: string;
  readItBackTextLabel: string;
  untitled: string;
  editLabel: string;
  deleteLabel: string;
  deleteRowLabel: (title: string) => string;
  microphoneMessage: string;
};

const DREAM_COPY: JournalCopy = {
  captureHeadline: 'What happened in my dream?',
  tips: ['Stay still', 'Work backwards', 'Record the emotion', 'Think in the present tense'],
  skipLabel: 'No dream',
  saveButton: 'Save dream',
  newButton: 'New dream',
  logHeader: 'Dreams',
  searchLabel: 'Search dreams',
  emptyTitle: 'No dreams yet.',
  emptyBody: 'Tap New dream to record one.',
  noMatchTitle: 'No dreams match',
  unreadableLog: 'Your saved dreams could not be read. Your recordings are safe.',
  discardTitle: 'Discard this dream?',
  discardBody: 'Your recording and text will be deleted.',
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
  titlePlaceholder: 'Name this dream',
  readItBackTextLabel: 'Dream text',
  untitled: 'Untitled dream',
  editLabel: 'Edit dream',
  deleteLabel: 'Delete dream',
  deleteRowLabel: (title) => `Delete dream: ${title}`,
  microphoneMessage:
    'Lucid needs the microphone to record your dream. You can allow it in Settings.',
};

const JOURNAL_COPY: JournalCopy = {
  captureHeadline: 'What happened today?',
  tips: ['Start anywhere', 'Say it as it comes', 'Note how you felt', 'Keep it short or long'],
  skipLabel: null,
  saveButton: 'Save entry',
  newButton: 'New entry',
  logHeader: 'Life',
  searchLabel: 'Search entries',
  emptyTitle: 'No entries yet.',
  emptyBody: 'Tap New entry to record one.',
  noMatchTitle: 'No entries match',
  unreadableLog: 'Your saved entries could not be read. Your recordings are safe.',
  discardTitle: 'Discard this entry?',
  discardBody: 'Your recording and text will be deleted.',
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
  titlePlaceholder: 'Title (optional)',
  readItBackTextLabel: 'Entry text',
  untitled: 'Untitled entry',
  editLabel: 'Edit entry',
  deleteLabel: 'Delete entry',
  deleteRowLabel: (title) => `Delete entry: ${title}`,
  microphoneMessage:
    'Lucid needs the microphone to record your entry. You can allow it in Settings.',
};

export const journalCopy = (kind: EntryType): JournalCopy =>
  kind === 'dream' ? DREAM_COPY : JOURNAL_COPY;
