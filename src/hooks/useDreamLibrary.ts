import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteDream, getIndexStatus, listDreams } from '../services/dreamStorage';
import { Dream } from '../types/dream';

export type IndexStatus = 'ok' | 'unreadable';

/**
 * The stored dreams (newest first, drafts included) and whether the index can be read.
 * `dreams` is null until the first load finishes. `refresh()` reloads both together; the returned
 * promise resolves once the state is updated, so a caller can await it before switching screens.
 * Only the newest request may update state, so a slow earlier response cannot overwrite a fresher
 * one, and nothing updates after unmount. If a load fails the previous data is kept; if nothing
 * ever loaded, `dreams` becomes [] (status unchanged, 'ok') so the screen is not blank forever.
 * `remove(id)` deletes a dream from storage. On success the dream leaves state at once, then a
 * refresh syncs with disk (a failed refresh cannot bring it back, and does not make remove reject).
 * On failure state is left alone, a best-effort refresh runs (a rare repair path may have removed
 * the dream anyway), and the original error is rethrown for the caller to report.
 */
export function useDreamLibrary() {
  const [dreams, setDreams] = useState<Dream[] | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus>('ok');
  const requestId = useRef(0);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const [list, status] = await Promise.all([listDreams(), getIndexStatus()]);
      if (!mounted.current || id !== requestId.current) return;
      setDreams(list);
      setIndexStatus(status);
    } catch {
      if (!mounted.current || id !== requestId.current) return;
      setDreams((previous) => previous ?? []);
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteDream(id);
      } catch (error) {
        try {
          await refresh();
        } catch {
          // Best effort only; the delete error is what the caller needs.
        }
        throw error;
      }
      // Filter now; refresh() below bumps the request id synchronously, so an older in-flight
      // load that still contains this dream can no longer apply.
      if (mounted.current) {
        setDreams((previous) => previous?.filter((d) => d.id !== id) ?? previous);
      }
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    mounted.current = true;
    // Initial load; refresh only sets state after its awaits, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return { dreams, indexStatus, refresh, remove };
}
