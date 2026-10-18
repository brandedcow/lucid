import { Note } from '../services/notesStorage';
import { inlineTags } from './inlineTags';
import { notePreview } from './notePreview';
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

/** What the note list shows for one note. Pure; `now` is injected. */
export function noteRow(note: Note, now: Date | number): NoteRowData {
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
  return {
    id: note.id,
    title,
    preview,
    tags,
    tagLine: tagLineOf(tags),
    voiceCount,
    pinned,
    time,
    a11yLabel: `${parts.join('. ')}.`,
  };
}
