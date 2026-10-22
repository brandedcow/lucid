import { useMemo } from 'react';
import type { Note } from '../services/notesStorage';
import { buildTitleIndex, resolveWikilink, type TitleIndex } from '../utils/noteLinks';
import { noteTitle } from '../utils/noteTitle';

/**
 * The title index of the live notes with the open note as the editor holds it, or null when not
 * `enabled`. Rebuilt only when the notes, the open note's id, its Title or `enabled` change, so
 * edits below the first line do not rebuild it.
 */
export function useTitleIndex(
  notes: readonly Note[],
  current: { id: string; body: string },
  enabled: boolean,
): TitleIndex | null {
  const { id, body } = current;
  const title = noteTitle(body);
  return useMemo(
    () => (enabled ? buildTitleIndex(notes, { id, body }) : null),
    // `body` is left out on purpose: only the Title of the open note matters to the index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, id, title, enabled],
  );
}

export type NoteLinkState = 'exists' | 'missing' | 'invalid';

/** How a wiki link target resolves. A null index (not enabled) gives 'invalid'. */
export function noteLinkState(
  index: TitleIndex | null,
  target: string,
  currentId?: string,
): NoteLinkState {
  if (!index) return 'invalid';
  const r = resolveWikilink(index, target, currentId);
  if (r.kind === 'existing') return 'exists';
  return r.kind === 'missing' ? 'missing' : 'invalid';
}
