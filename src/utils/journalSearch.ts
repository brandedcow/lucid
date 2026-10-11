import { JournalId } from '../types/entry';
import { Entry, isDraft } from '../types/dream';
import { buildSearchIndex, SearchEntry } from './dreamLog';
import { Journal, journalById, journalCopy, journalOf, journalOrDefault } from './journals';

const isKnownJournal = (journals: readonly Journal[], record: Entry): boolean =>
  journals.some((j) => j.id === journalOf(record));

// Same rule as listDreams (newest first by createdAt). A missing or non-string createdAt counts as
// '' and so sorts last; the sort is stable, so ties keep input order.
const createdAtOf = (r: Entry): string => (typeof r.createdAt === 'string' ? r.createdAt : '');

/**
 * The entries cross-journal search covers: finished entries of journals in the given registry only (drafts and
 * entries of an unregistered journalId are left out), newest first. Does not mutate the input.
 */
export function searchableEntries(journals: readonly Journal[], records: Entry[]): Entry[] {
  return records
    .filter((r) => !isDraft(r) && isKnownJournal(journals, r))
    .sort((a, b) => createdAtOf(b).localeCompare(createdAtOf(a)));
}

/** The display name of the record's journal ("Dreams", "Life"); '' for an unknown journal. */
export function journalLabel(journals: readonly Journal[], record: Entry): string {
  return journalById(journals, journalOf(record))?.name ?? '';
}

/** "Untitled dream" / "Untitled entry": the fallback title for the record's journal. */
export function untitledLabelOf(journals: readonly Journal[], record: Entry): string {
  return journalCopy(journalOrDefault(journals, journalOf(record))).untitled;
}

/** The combined searchable list plus its search index, ready for `filterDreams` / `buildTagChips`. */
export function searchModel(
  journals: readonly Journal[],
  records: Entry[],
): { entries: Entry[]; searchIndex: SearchEntry[] } {
  const entries = searchableEntries(journals, records);
  return { entries, searchIndex: buildSearchIndex(entries) };
}

/**
 * Finished entries per journal of the given registry, for the Journals home. Drafts and entries of
 * an unregistered journalId are not counted; a record with no journalId counts as Dreams. Every
 * registered journal has a key (0 when empty).
 */
export function journalCounts(
  journals: readonly Journal[],
  records: Entry[],
): Record<JournalId, number> {
  const counts: Record<JournalId, number> = {};
  for (const j of journals) counts[j.id] = 0;
  for (const r of records) {
    if (isDraft(r)) continue;
    const id = journalOf(r);
    // hasOwn, not `in`: an id like "toString" or "__proto__" must not match the prototype chain.
    if (Object.hasOwn(counts, id)) counts[id] += 1;
  }
  return counts;
}
