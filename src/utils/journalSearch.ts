import { Entry, isDraft } from '../types/dream';
import { buildSearchIndex, SearchEntry } from './dreamLog';
import { BUILT_IN_JOURNALS, journalById, journalCopy, journalOf, kindOf } from './journals';

const isKnownJournal = (record: Entry): boolean =>
  BUILT_IN_JOURNALS.some((j) => j.id === journalOf(record));

// Same rule as listDreams (newest first by createdAt). A missing or non-string createdAt counts as
// '' and so sorts last; the sort is stable, so ties keep input order.
const createdAtOf = (r: Entry): string => (typeof r.createdAt === 'string' ? r.createdAt : '');

/**
 * The entries cross-journal search covers: finished entries of known journals only (drafts and
 * entries of an unknown journalId are left out), newest first. Does not mutate the input.
 */
export function searchableEntries(records: Entry[]): Entry[] {
  return records
    .filter((r) => !isDraft(r) && isKnownJournal(r))
    .sort((a, b) => createdAtOf(b).localeCompare(createdAtOf(a)));
}

/** The display name of the record's journal ("Dreams", "Life"); '' for an unknown journal. */
export function journalLabel(record: Entry): string {
  return journalById(journalOf(record))?.name ?? '';
}

/** "Untitled dream" / "Untitled entry": the fallback title for the record's journal. */
export function untitledLabelOf(record: Entry): string {
  return journalCopy(kindOf(journalOf(record))).untitled;
}

/** The combined searchable list plus its search index, ready for `filterDreams` / `buildTagChips`. */
export function searchModel(records: Entry[]): { entries: Entry[]; searchIndex: SearchEntry[] } {
  const entries = searchableEntries(records);
  return { entries, searchIndex: buildSearchIndex(entries) };
}
