import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addJournal, loadJournals, removeJournal, renameJournal } from '../services/journalStorage';
import { BUILT_IN_JOURNALS, Journal } from '../utils/journals';

/**
 * Every journal: the built-in ones, then the user's own in creation order. `loaded` turns true
 * after the first read (also when it fails, which reads as no custom journals). `add`, `rename`
 * and `remove` update state only after the file write succeeds, so the UI never shows a journal
 * that was not saved; a failure rejects and leaves state as it was. A read that finishes after a
 * change never overwrites it, and nothing updates after unmount.
 */
export function useJournals() {
  const [loaded, setLoaded] = useState(false);
  const [custom, setCustom] = useState<Journal[]>([]);
  const changed = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    loadJournals()
      .catch(() => [] as Journal[])
      .then((list) => {
        if (!mounted.current) return;
        if (!changed.current) setCustom(list);
        setLoaded(true);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const apply = useCallback((list: Journal[]) => {
    changed.current = true;
    if (mounted.current) setCustom(list);
  }, []);

  const add = useCallback(
    async (name: string): Promise<Journal> => {
      const { journal, journals } = await addJournal(name);
      apply(journals);
      return journal;
    },
    [apply],
  );

  const rename = useCallback(
    async (id: string, name: string): Promise<Journal> => {
      const { journal, journals } = await renameJournal(id, name);
      apply(journals);
      return journal;
    },
    [apply],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      apply((await removeJournal(id)).journals);
    },
    [apply],
  );

  const journals = useMemo(() => [...BUILT_IN_JOURNALS, ...custom], [custom]);

  return { journals, custom, loaded, add, rename, remove };
}
