import { Note } from '../services/notesStorage';
import { LOCALE, plainSpaces } from './format';
import { inlineTags } from './inlineTags';
import { isLive, TagCount } from './noteViews';

/** Most tag chips Search shows besides the selected ones. */
export const MAX_SEARCH_CHIPS = 20;
export const EARLIER_LABEL = 'EARLIER';

export type ParsedQuery = {
  /** Plain words, lowercased (not accent-folded). Each must appear in the note. */
  words: string[];
  /** Normalised tags (lowercase, no "#"). Each must be a prefix of one of the note's tags. */
  tagTerms: string[];
};

/**
 * Splits a query: trimmed, lowercased, split on whitespace. A term the real tag scanner reads as a
 * tag ("#word") is a tag term; everything else (including a lone "#" and digits-only "#123") is a
 * word.
 */
export function parseQuery(query: string): ParsedQuery {
  const words: string[] = [];
  const tagTerms: string[] = [];
  for (const term of query.trim().toLowerCase().split(/\s+/)) {
    if (term === '') continue;
    const tags = inlineTags(term);
    if (tags.length > 0) tagTerms.push(tags[0]);
    else words.push(term);
  }
  return { words, tagTerms };
}

/**
 * Lowercase plus diacritics removed ("Café" -> "cafe"). `String.prototype.normalize` may be
 * missing on an engine, so it is feature-guarded; without it only lowercasing applies.
 */
export function fold(text: string): string {
  const lower = text.toLowerCase();
  if (typeof String.prototype.normalize !== 'function') return lower;
  return lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Notes matching a query and the selected chip tags. Live notes only (never Recently Deleted).
 * Every word must be a substring of the folded body; every tag term must be a prefix of one of the
 * note's tags (compared folded); every chip tag must equal one of the note's tags. A blank query
 * with no chips returns []. Input order is kept; the input is not mutated.
 */
export function searchResults(
  all: readonly Note[],
  query: string,
  chipTags: readonly string[] = [],
): Note[] {
  const { words, tagTerms } = parseQuery(query);
  if (words.length === 0 && tagTerms.length === 0 && chipTags.length === 0) return [];
  const foldedWords = words.map(fold);
  const foldedTerms = tagTerms.map(fold);
  return all.filter((n) => {
    if (!isLive(n)) return false;
    const tags = inlineTags(n.body);
    if (!chipTags.every((c) => tags.includes(c))) return false;
    if (foldedTerms.length > 0) {
      const foldedTags = tags.map(fold);
      if (!foldedTerms.every((t) => foldedTags.some((tag) => tag.startsWith(t)))) return false;
    }
    if (foldedWords.length > 0) {
      const body = fold(n.body);
      if (!foldedWords.every((w) => body.includes(w))) return false;
    }
    return true;
  });
}

export type MonthSection = { key: string; title: string; data: Note[] };

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Groups consecutive notes by the local month of `updatedAt` ("OCTOBER", with the year when it is
 * not `now`'s year: "OCTOBER 2025"). A missing or invalid date goes under "EARLIER", last. Input
 * order is kept inside a section; section keys are unique.
 */
export function monthSections(notes: readonly Note[], now: Date): MonthSection[] {
  const sections: MonthSection[] = [];
  const earlier: Note[] = [];
  const used = new Map<string, number>();
  let currentMonth: string | null = null;
  for (const note of notes) {
    const date = typeof note.updatedAt === 'string' ? new Date(note.updatedAt) : null;
    if (!date || Number.isNaN(date.getTime())) {
      earlier.push(note);
      continue;
    }
    const month = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    if (month === currentMonth) {
      sections[sections.length - 1].data.push(note);
      continue;
    }
    currentMonth = month;
    const seen = used.get(month) ?? 0;
    used.set(month, seen + 1);
    const name = plainSpaces(
      new Date(date.getFullYear(), date.getMonth(), 1).toLocaleDateString(LOCALE, {
        month: 'long',
      }),
    ).toUpperCase();
    sections.push({
      key: seen === 0 ? month : `${month}#${seen}`,
      title: date.getFullYear() === now.getFullYear() ? name : `${name} ${date.getFullYear()}`,
      data: [note],
    });
  }
  if (earlier.length > 0) sections.push({ key: 'earlier', title: EARLIER_LABEL, data: earlier });
  return sections;
}

/**
 * The chips Search shows: the `limit` most-used tags (count descending, then alphabetical) plus
 * every selected tag, selected ones first (in selection order). A selected tag no note has any
 * more still shows, with count 0.
 */
export function searchChips(
  tags: readonly TagCount[],
  selected: readonly string[],
  limit: number = MAX_SEARCH_CHIPS,
): TagCount[] {
  const picked = [...tags]
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
    .slice(0, Math.max(0, limit));
  const chosen = [...new Set(selected)];
  const head = chosen.map((tag) => tags.find((t) => t.tag === tag) ?? { tag, count: 0 });
  return [...head, ...picked.filter((t) => !chosen.includes(t.tag))];
}
