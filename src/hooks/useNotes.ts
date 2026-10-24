import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Note,
  NOTE_NOT_FOUND,
  deleteNoteForever,
  emptyRecentlyDeleted,
  getIndexStatus,
  listNotes,
  restoreNote,
  setPinned,
  softDeleteNote,
} from '../services/notesStorage';
import { NoteView, TagCount, searchNotes, selectNotes, tagCounts } from '../utils/noteViews';

export type NotesError = {
  action: 'load' | 'pin' | 'trash' | 'restore' | 'deleteForever' | 'emptyTrash';
  code?: string;
  cause: unknown;
};

const codeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
};

const TRASH: NoteView = { kind: 'trash' };

/**
 * Every stored note (Recently Deleted ones included, newest edit first) and the views derived from
 * them: `visible` (the search results when `query` is not blank, else the chosen `view`),
 * `trashed` and the tag counts. Changing the view or the query needs no storage read.
 * The first load runs on mount; `refresh()` reloads notes and index status together and resolves
 * once state is updated, with the loaded notes (Recently Deleted ones included) or `null` when the
 * load failed or a newer one superseded it (safe to call from `useNoteSession`'s `onChange`). Only the newest load
 * may update state, so a slow earlier one cannot overwrite a fresher one, and nothing updates
 * after unmount. A failed load keeps the previous data and sets `error`; if nothing ever loaded,
 * `all` is [] and `loaded` still becomes true.
 * The actions never throw. On success they patch state at once from the stored result, then
 * refresh; on failure they set `error`, refresh best-effort and return false. An unknown note id
 * (NOTE_NOT_FOUND) on pin/trash/restore counts as nothing to do (refresh, true). They take no lock
 * of their own (storage serialises writes); the UI should disable repeat taps.
 */
export function useNotes(args: { view: NoteView; query?: string; todayKey: string }): {
  loaded: boolean;
  indexStatus: 'ok' | 'unreadable';
  error: NotesError | null;
  clearError(): void;
  all: Note[];
  visible: Note[];
  trashed: Note[];
  tags: TagCount[];
  refresh(): Promise<Note[] | null>;
  pin(id: string, pinned: boolean): Promise<boolean>;
  trash(id: string): Promise<boolean>;
  restore(id: string): Promise<boolean>;
  deleteForever(id: string): Promise<boolean>;
  emptyTrash(): Promise<{ deleted: number; failedId?: string }>;
} {
  const { view, query, todayKey } = args;
  const [all, setAll] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [indexStatus, setIndexStatus] = useState<'ok' | 'unreadable'>('ok');
  const [error, setError] = useState<NotesError | null>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);

  const refresh = useCallback(async (): Promise<Note[] | null> => {
    const id = ++requestId.current;
    try {
      const [list, status] = await Promise.all([
        listNotes({ includeDeleted: true }),
        getIndexStatus(),
      ]);
      if (!mounted.current || id !== requestId.current) return null;
      setAll(list);
      setIndexStatus(status);
      setLoaded(true);
      return list;
    } catch (cause) {
      if (!mounted.current || id !== requestId.current) return null;
      setError({ action: 'load', code: codeOf(cause), cause });
      setLoaded(true);
      return null;
    }
  }, []);

  const fail = useCallback((action: NotesError['action'], cause: unknown) => {
    if (mounted.current) setError({ action, code: codeOf(cause), cause });
  }, []);

  const patch = useCallback((note: Note) => {
    if (mounted.current) setAll((prev) => prev.map((n) => (n.id === note.id ? note : n)));
  }, []);

  /** Runs one single-note write; `apply` patches state from its result. */
  const act = useCallback(
    async (
      action: NotesError['action'],
      write: () => Promise<Note | void>,
      apply: (result: Note | void) => void,
    ): Promise<boolean> => {
      let ok = true;
      try {
        const result = await write();
        // Bump the request id first (refresh does it synchronously) so an older load cannot
        // resurrect the previous state after the patch.
        requestId.current += 1;
        apply(result);
      } catch (cause) {
        if (codeOf(cause) !== NOTE_NOT_FOUND) {
          ok = false;
          fail(action, cause);
        }
      }
      try {
        await refresh();
      } catch {
        // Best effort only.
      }
      return ok;
    },
    [fail, refresh],
  );

  const pin = useCallback(
    (id: string, pinned: boolean) =>
      act(
        'pin',
        () => setPinned(id, pinned),
        (r) => r && patch(r),
      ),
    [act, patch],
  );
  const trash = useCallback(
    (id: string) =>
      act(
        'trash',
        () => softDeleteNote(id),
        (r) => r && patch(r),
      ),
    [act, patch],
  );
  const restore = useCallback(
    (id: string) =>
      act(
        'restore',
        () => restoreNote(id),
        (r) => r && patch(r),
      ),
    [act, patch],
  );
  const deleteForever = useCallback(
    (id: string) =>
      act(
        'deleteForever',
        () => deleteNoteForever(id),
        () => {
          if (mounted.current) setAll((prev) => prev.filter((n) => n.id !== id));
        },
      ),
    [act],
  );

  const emptyTrash = useCallback(async (): Promise<{ deleted: number; failedId?: string }> => {
    let result: { deleted: number; failedId?: string };
    try {
      result = await emptyRecentlyDeleted();
    } catch (cause) {
      fail('emptyTrash', cause);
      try {
        await refresh();
      } catch {
        // Best effort only.
      }
      return { deleted: 0 };
    }
    if (result.failedId !== undefined) fail('emptyTrash', result.failedId);
    try {
      await refresh();
    } catch {
      // Best effort only.
    }
    return result;
  }, [fail, refresh]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    mounted.current = true;
    // Initial load; refresh only sets state after its awaits, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const visible = useMemo(
    () =>
      query !== undefined && query.trim() !== ''
        ? searchNotes(all, query)
        : selectNotes(all, view, todayKey),
    [all, view, query, todayKey],
  );
  const trashed = useMemo(() => selectNotes(all, TRASH, todayKey), [all, todayKey]);
  const tags = useMemo(() => tagCounts(all), [all]);

  return {
    loaded,
    indexStatus,
    error,
    clearError,
    all,
    visible,
    trashed,
    tags,
    refresh,
    pin,
    trash,
    restore,
    deleteForever,
    emptyTrash,
  };
}
