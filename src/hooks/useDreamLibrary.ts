import { useCallback, useEffect, useRef, useState } from 'react';
import { getIndexStatus, listDreams } from '../services/dreamStorage';
import { Dream } from '../types/dream';

export type IndexStatus = 'ok' | 'unreadable';

/**
 * The stored dreams (newest first, drafts included) and whether the index can be read.
 * `dreams` is null until the first load finishes. `refresh()` reloads both together; the returned
 * promise resolves once the state is updated, so a caller can await it before switching screens.
 * Only the newest request may update state, so a slow earlier response cannot overwrite a fresher
 * one, and nothing updates after unmount. If a load fails the previous data is kept; if nothing
 * ever loaded, `dreams` becomes [] (status unchanged, 'ok') so the screen is not blank forever.
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

  useEffect(() => {
    mounted.current = true;
    // Initial load; refresh only sets state after its awaits, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return { dreams, indexStatus, refresh };
}
