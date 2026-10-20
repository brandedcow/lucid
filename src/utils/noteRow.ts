import { Note } from '../services/notesStorage';
import { inlineTags } from './inlineTags';
import { highlightParts, highlightRanges, TextPart } from './noteHighlight';
import { matchSnippet, notePreview } from './notePreview';
import { ParsedQuery } from './noteSearch';
import { noteTitle } from './noteTitle';
import { relativeTime } from './relativeTime';

/** Most tags a list row shows; the rest collapse into "+N". */
export const MAX_ROW_TAGS = 3;

export type NoteRowData = {
  id: string;
  title: string;
  /** The text after the title; for a note with only voice notes, "1 voice note" / "N voice notes". */
  preview: string;
  /** Every inline tag of the body, without "#". */
  tags: string[];
  /** The tags line: at most MAX_ROW_TAGS as "#tag", then "+N" for the rest. '' when no tags. */
  tagLine: string;
  /** Voice notes that are shown (held ones, closed by the user, are not counted). */
  voiceCount: number;
  pinned: boolean;
  /** Relative time of the last edit ("2 hours ago", "Oct 3"). */
  time: string;
  a11yLabel: string;
  /**
   * Only when `noteRow` got a non-empty parsed query: the title, the text under it (a snippet
   * around the first match when that is beyond the preview) and the tags line, split into plain
   * and matched parts. `preview` and `a11yLabel` stay the plain values.
   */
  titleParts?: TextPart[];
  previewParts?: TextPart[];
  tagParts?: TextPart[];
};

function voiceText(count: number): string {
  return count === 1 ? '1 voice note' : `${count} voice notes`;
}

/** The tags line for a row: "#a #b #c +2". */
export function tagLineOf(tags: readonly string[]): string {
  const shown = tags.slice(0, MAX_ROW_TAGS).map((t) => `#${t}`);
  const more = tags.length - shown.length;
  return more > 0 ? [...shown, `+${more}`].join(' ') : shown.join(' ');
}

/**
 * Tags line and its parts for a search row: tags that match the query come first (so a hit is not
 * hidden in "+N"), each "#tag" entry is highlighted on its own, "+N" never is.
 */
function searchTagLine(tags: readonly string[], parsed: ParsedQuery) {
  const entries = tags.map((t) => `#${t}`);
  const hit = entries.filter((e) => highlightRanges(e, parsed).length > 0);
  const ordered = [...hit, ...entries.filter((e) => !hit.includes(e))];
  const shown = ordered.slice(0, MAX_ROW_TAGS);
  const parts: TextPart[] = [];
  shown.forEach((entry, i) => {
    if (i > 0) parts.push({ text: ' ', match: false });
    parts.push(...highlightParts(entry, parsed));
  });
  const more = ordered.length - shown.length;
  if (more > 0) parts.push({ text: `${shown.length > 0 ? ' ' : ''}+${more}`, match: false });
  return { line: parts.map((p) => p.text).join(''), parts };
}

/**
 * What the note list shows for one note. Pure; `now` is injected. With a non-empty `parsed` query
 * (Search) the row also carries highlight parts and the tags line puts matched tags first; without
 * it the result is exactly the plain row.
 */
export function noteRow(note: Note, now: Date | number, parsed?: ParsedQuery): NoteRowData {
  const title = noteTitle(note.body);
  const tags = inlineTags(note.body);
  const voiceCount = (note.recordings ?? []).filter((r) => r.heldAt === undefined).length;
  const text = notePreview(note.body);
  const preview = text === '' && voiceCount > 0 ? voiceText(voiceCount) : text;
  const time = relativeTime(note.updatedAt, now);
  const pinned = note.pinned === true;
  const parts = [
    title,
    preview,
    tags.length > 0 ? `Tags: ${tags.join(', ')}` : '',
    time,
    pinned ? 'Pinned' : '',
  ].filter((p) => p !== '');
  const searching = parsed !== undefined && (parsed.words.length > 0 || parsed.tagTerms.length > 0);
  const search =
    searching && parsed
      ? (() => {
          const snippet = text === '' ? preview : matchSnippet(note.body, parsed);
          const tagsView = searchTagLine(tags, parsed);
          return {
            tagLine: tagsView.line,
            titleParts: highlightParts(title, parsed),
            previewParts: highlightParts(snippet, parsed),
            tagParts: tagsView.parts,
          };
        })()
      : null;
  return {
    id: note.id,
    title,
    preview,
    tags,
    tagLine: tagLineOf(tags),
    ...search,
    voiceCount,
    pinned,
    time,
    a11yLabel: `${parts.join('. ')}.`,
  };
}
