import { Note } from '../services/notesStorage';
import { noteRow } from './noteRow';
import { relativeTime } from './relativeTime';

export type DeletedRowData = {
  id: string;
  title: string;
  /** The text after the title; for a note with only voice notes, "1 voice note" / "N voice notes". */
  preview: string;
  /** "Deleted 2 hours ago" / "Deleted just now" / "Deleted Oct 3"; '' when deletedAt is missing or invalid. */
  deleted: string;
  /** True when Delete forever would remove at least one audio file: some recording (held ones too) that is not legacy-origin. */
  hasAudio: boolean;
  a11yLabel: string;
};

/** True when deleting this note forever deletes any audio file (legacy-origin recordings are never deleted). */
export function noteHasDeletableAudio(note: Note): boolean {
  return (note.recordings ?? []).some((r) => r.origin !== 'legacy');
}

/** What Recently Deleted shows for one note. Pure; `now` is injected. */
export function deletedRow(note: Note, now: Date | number): DeletedRowData {
  const base = noteRow(note, now);
  let deleted = '';
  if (note.deletedAt !== undefined) {
    const rel = relativeTime(note.deletedAt, now);
    if (rel !== '') deleted = `Deleted ${rel === 'Just now' ? 'just now' : rel}`;
  }
  const parts = [base.title, base.preview, deleted].filter((p) => p !== '');
  return {
    id: note.id,
    title: base.title,
    preview: base.preview,
    deleted,
    hasAudio: noteHasDeletableAudio(note),
    a11yLabel: `${parts.join('. ')}.`,
  };
}
