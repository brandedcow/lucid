import { Note } from '../services/notesStorage';
import { inlineTags } from './inlineTags';
import { hasTodo } from './noteTodo';
import { localDateKey } from './today';

/**
 * Pure views over the list of notes. The input is every note including Recently Deleted ones,
 * newest `updatedAt` first (as `listNotes({ includeDeleted: true })` returns it). Nothing here
 * mutates the input or reads storage; order is kept except for `trash` (newest deletion first).
 */
export type NoteView =
  | { kind: 'all' }
  | { kind: 'today' }
  | { kind: 'todo' }
  | { kind: 'untagged' }
  | { kind: 'pinned' }
  /** `tag` is already normalised (lowercase, no "#"). */
  | { kind: 'tag'; tag: string }
  | { kind: 'trash' };

export type TagCount = { tag: string; count: number };

/** True for a note that is not in Recently Deleted. */
export const isLive = (n: Note): boolean => typeof n.deletedAt !== 'string';

/** Local day key of a note's createdAt; null when it is missing or not a valid date. */
function createdDay(note: Note): string | null {
  if (typeof note.createdAt !== 'string') return null;
  const date = new Date(note.createdAt);
  return Number.isNaN(date.getTime()) ? null : localDateKey(date);
}

/** Local day key of a note's updatedAt; null when it is missing or not a valid date. */
function updatedDay(note: Note): string | null {
  if (typeof note.updatedAt !== 'string') return null;
  const date = new Date(note.updatedAt);
  return Number.isNaN(date.getTime()) ? null : localDateKey(date);
}

const stamp = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The notes of one view. `todayKey` is the local YYYY-MM-DD used by the Today view. */
export function selectNotes(all: Note[], view: NoteView, todayKey: string): Note[] {
  switch (view.kind) {
    case 'trash':
      return all
        .filter((n) => !isLive(n))
        .sort((a, b) => stamp(b.deletedAt).localeCompare(stamp(a.deletedAt)));
    case 'all':
      return all.filter(isLive);
    case 'today':
      // Touched today: updated or created on the local day (the created clause covers a missing or
      // older-than-created updatedAt). Differs on purpose from `dayDone`, which counts created only.
      return all.filter(
        (n) => isLive(n) && (updatedDay(n) === todayKey || createdDay(n) === todayKey),
      );
    case 'todo':
      return all.filter((n) => isLive(n) && hasTodo(n.body));
    case 'untagged':
      return all.filter((n) => isLive(n) && inlineTags(n.body).length === 0);
    case 'pinned':
      return all.filter((n) => isLive(n) && n.pinned === true);
    case 'tag':
      return all.filter((n) => isLive(n) && inlineTags(n.body).includes(view.tag));
  }
}

/**
 * Search across all live notes (never Recently Deleted, whatever the current view). The query is
 * trimmed, lowercased and split on whitespace; every term must appear in the lowercased body.
 * A blank query returns [] (callers show the view instead).
 */
export function searchNotes(all: Note[], query: string): Note[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return all.filter((n) => {
    if (!isLive(n)) return false;
    const body = n.body.toLowerCase();
    return terms.every((t) => body.includes(t));
  });
}

/** Live notes per tag (a note counts once per tag), alphabetical. */
export function tagCounts(all: Note[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const n of all) {
    if (!isLive(n)) continue;
    for (const tag of inlineTags(n.body)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

/**
 * Whether today is already settled: the day marker is today, or any note (Recently Deleted ones
 * included) was created today. Deliberately "created", not "updated" (unlike the Today view):
 * editing an older note must not suppress the daily new note. Deleting today's only note therefore does not reopen the launch note.
 */
export function dayDone(all: Note[], markerDate: string | null, todayKey: string): boolean {
  return markerDate === todayKey || all.some((n) => createdDay(n) === todayKey);
}
