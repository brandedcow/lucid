import { Dream, hasAudio, isDraft } from '../types/dream';
import { capitalizeFirst } from './capitalizeFirst';
import { splitEmotions } from './emotions';
import { formatDuration, formatShortDate, LOCALE, plainSpaces } from './format';

export const PREVIEW_CHARS = 160;
export const MAX_TAG_CHIPS = 20;
export const MAX_ROW_CHIPS = 4;
export const MAX_ROW_EMOTIONS = 2;
export const EARLIER_LABEL = 'EARLIER';
const DRAFT_LABEL = 'Draft';

// Stored dreams can predate fields (title, tags, transcript, status...), so every read is defensive.
const tagsOf = (d: Dream): string[] =>
  Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string' && t !== '') : [];
const textOf = (v: unknown): string => (typeof v === 'string' ? v : '');
const dateOf = (d: Dream): Date | null => {
  if (typeof d.createdAt !== 'string' || d.createdAt === '') return null;
  const date = new Date(d.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
};

// ---------- Month grouping ----------

export type LogItem =
  { type: 'header'; key: string; label: string } | { type: 'dream'; dream: Dream };

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Flattens dreams into header and dream items for the Dream log. Dreams (drafts included, not
 * pinned) are grouped by local month. Input order is kept, so pass newest first (as `listDreams`
 * does); months appear in order of first appearance and dreams with a missing or invalid date go
 * last under "EARLIER". Header: the month in capitals, with the year when not `now`'s year.
 */
export function buildLogItems(dreams: Dream[], now: Date = new Date()): LogItem[] {
  const groups = new Map<string, { label: string; dreams: Dream[] }>();
  const earlier: Dream[] = [];
  for (const dream of dreams) {
    const date = dateOf(dream);
    if (!date) {
      earlier.push(dream);
      continue;
    }
    const key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    let group = groups.get(key);
    if (!group) {
      const month = plainSpaces(
        new Date(date.getFullYear(), date.getMonth(), 1).toLocaleDateString(LOCALE, {
          month: 'long',
        }),
      ).toUpperCase();
      group = {
        label: date.getFullYear() === now.getFullYear() ? month : `${month} ${date.getFullYear()}`,
        dreams: [],
      };
      groups.set(key, group);
    }
    group.dreams.push(dream);
  }
  const items: LogItem[] = [];
  for (const [key, group] of groups) {
    items.push({ type: 'header', key, label: group.label });
    for (const dream of group.dreams) items.push({ type: 'dream', dream });
  }
  if (earlier.length > 0) {
    items.push({ type: 'header', key: 'earlier', label: EARLIER_LABEL });
    for (const dream of earlier) items.push({ type: 'dream', dream });
  }
  return items;
}

// ---------- Tag chips ----------

export type TagChip = { tag: string; count: number; selected: boolean };

/**
 * Chips for the tag row. Counts cover every dream including drafts (a tag counts once per dream).
 * Ranked by count (most first), then alphabetical; tags are compared exactly as stored. At most
 * `max` chips, except that every selected tag is always shown (even with count 0). `all` is the
 * number of dreams, drafts included.
 */
export function buildTagChips(
  dreams: Dream[],
  selected: string[],
  max: number = MAX_TAG_CHIPS,
): { all: number; chips: TagChip[] } {
  const counts = new Map<string, number>();
  for (const dream of dreams) {
    for (const tag of new Set(tagsOf(dream))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  for (const tag of selected) if (!counts.has(tag)) counts.set(tag, 0);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const chosen = new Set(selected);
  const chips = ranked
    .filter(([tag], i) => i < max || chosen.has(tag))
    .map(([tag, count]) => ({ tag, count, selected: chosen.has(tag) }));
  return { all: dreams.length, chips };
}

/** "water · 6" (middle dot). */
export function tagChipLabel(tag: string, count: number): string {
  return `${tag} · ${count}`;
}

/** Adds the tag to the selection, or removes it if present. The rest keep their order. */
export function toggleTag(selected: string[], tag: string): string[] {
  return selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag];
}

// ---------- Search and filter ----------

export type SearchEntry = { dream: Dream; haystack: string };

/** Lowercases and, where the engine supports it, strips accents ("café" matches "cafe"). */
function fold(text: string): string {
  const lower = text.toLowerCase();
  try {
    if (typeof lower.normalize === 'function') {
      return lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
  } catch {
    // normalize unavailable or failing in this engine: plain lowercase still works.
  }
  return lower;
}

/** Local search text per dream: title, transcript, emotion and tags, lowercased, one per line. */
export function buildSearchIndex(dreams: Dream[]): SearchEntry[] {
  return dreams.map((dream) => ({
    dream,
    haystack: fold(
      [textOf(dream.title), textOf(dream.transcript), textOf(dream.emotion), ...tagsOf(dream)].join(
        '\n',
      ),
    ),
  }));
}

/**
 * Keeps dreams that match BOTH the query and the tags. Query: split on whitespace, every word must
 * appear somewhere in the dream's text (so "wat" finds "water"); case and accents are ignored
 * where supported. Tags: the dream must have EVERY selected tag, compared exactly as stored.
 * Empty query / no tags filter nothing. Drafts are included.
 */
export function filterDreams(
  index: SearchEntry[],
  filter: { tags: string[]; query: string },
): Dream[] {
  const tokens = fold(filter.query).split(/\s+/).filter(Boolean);
  const out: Dream[] = [];
  for (const { dream, haystack } of index) {
    if (filter.tags.length > 0) {
      const own = tagsOf(dream);
      if (!filter.tags.every((t) => own.includes(t))) continue;
    }
    if (!tokens.every((t) => haystack.includes(t))) continue;
    out.push(dream);
  }
  return out;
}

// ---------- Row model ----------

/** Collapses whitespace and cuts to `max` characters (by code point) with an ellipsis. Empty when no text. */
export function transcriptPreview(text: string | undefined, max: number = PREVIEW_CHARS): string {
  // Bound the work on huge transcripts: a code point is at most 2 UTF-16 units, so `max * 4` units
  // is plenty. Drop a trailing lone high surrogate so a cut never leaves half an emoji.
  const head = textOf(text)
    .slice(0, max * 4)
    .replace(/[\uD800-\uDBFF]$/, '');
  const flat = head.replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : flat;
}

export type RowChip = { kind: 'emotion' | 'tag'; label: string };

/**
 * Chips to show in a row: emotions first (at most `maxEmotions`), then tags, up to `max` in all.
 * `overflow` is how many more exist (shown as "+N").
 */
export function limitChips(
  chips: { emotions: string[]; tags: string[] },
  max: number = MAX_ROW_CHIPS,
  maxEmotions: number = MAX_ROW_EMOTIONS,
): { visible: RowChip[]; overflow: number } {
  const all: RowChip[] = [
    ...chips.emotions.slice(0, maxEmotions).map((label) => ({ kind: 'emotion' as const, label })),
    ...chips.tags.map((label) => ({ kind: 'tag' as const, label })),
  ];
  const visible = all.slice(0, max);
  return { visible, overflow: chips.emotions.length + chips.tags.length - visible.length };
}

export type DreamRow = {
  id: string;
  /** The title, or "Sep 23" (finished, untitled) or "Untitled dream" (draft, or no usable date). */
  title: string;
  /** The entry's own title, trimmed; "" when it has none (whatever `title` falls back to). */
  ownTitle: string;
  isDraft: boolean;
  hasAudio: boolean;
  /** " · 0:34" for a draft with audio, else "". Shown after the title. */
  draftSuffix: string;
  /** "TUE", "" when the date is missing or invalid. */
  weekday: string;
  /** Day of month, or null when the date is missing or invalid. */
  day: number | null;
  /** "Sep 23" (with year when not current), "" when the date is invalid. */
  dateLabel: string;
  /** Up to 160 characters of transcript; "" for drafts and dreams without a transcript. */
  preview: string;
  /** "Draft" for drafts (the UI colors it with `colors.draft`), else "". */
  draftLabel: string;
  /** The short date ("Oct 6", with the year when not current) for drafts (muted text after the label); "" when the date is invalid or the dream is finished. */
  draftDate: string;
  /** The full sub-line, "Draft · Oct 6", for drafts ("Draft" alone without a valid date), else "". */
  subline: string;
  /** Capitalized emotions and tags as stored. Use `limitChips` for rows. */
  chips: { emotions: string[]; tags: string[] };
};

export function dreamRow(
  dream: Dream,
  now: Date = new Date(),
  untitledLabel: string = 'Untitled dream',
): DreamRow {
  const draft = isDraft(dream);
  const audio = hasAudio(dream);
  const date = dateOf(dream);
  const dateLabel = date ? formatShortDate(date, now) : '';
  const own = textOf(dream.title).trim();
  const seconds = Number.isFinite(dream.durationMs) ? Math.round(dream.durationMs / 1000) : 0;
  const untitled = draft ? untitledLabel : dateLabel || untitledLabel;
  return {
    id: dream.id,
    title: own || untitled,
    ownTitle: own,
    isDraft: draft,
    hasAudio: audio,
    draftSuffix: draft && audio ? ` · ${formatDuration(Math.max(0, seconds))}` : '',
    weekday: date
      ? plainSpaces(date.toLocaleDateString(LOCALE, { weekday: 'short' })).toUpperCase()
      : '',
    day: date ? date.getDate() : null,
    dateLabel,
    preview: draft ? '' : transcriptPreview(dream.transcript),
    draftLabel: draft ? DRAFT_LABEL : '',
    draftDate: draft ? dateLabel : '',
    subline: draft ? (dateLabel ? `${DRAFT_LABEL} · ${dateLabel}` : DRAFT_LABEL) : '',
    chips: {
      emotions: splitEmotions(textOf(dream.emotion)).map(capitalizeFirst),
      tags: tagsOf(dream),
    },
  };
}
