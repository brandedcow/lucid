import { useCallback, useEffect, useRef, useState } from 'react';
import { readDoneDate, writeDoneDate } from '../services/dayMarker';

/**
 * The latest day the user finished or skipped the launch note. `loaded` turns true once the first read finishes
 * (also when it fails, which reads as no marker). `markDayDone` updates state first, then writes
 * in the background; a failed write keeps the value for the session and shows nothing. A read that
 * finishes after `markDayDone` never overwrites the newer value, and nothing updates after unmount.
 */
export function useDayMarker() {
  const [loaded, setLoaded] = useState(false);
  const [doneDate, setDoneDate] = useState<string | null>(null);
  const marked = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    readDoneDate()
      .catch(() => null)
      .then((date) => {
        if (!mounted.current) return;
        if (!marked.current) setDoneDate(date);
        setLoaded(true);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const markDayDone = useCallback((dateKey: string) => {
    marked.current = true;
    if (mounted.current) setDoneDate(dateKey);
    writeDoneDate(dateKey).catch(() => {});
  }, []);

  return { loaded, doneDate, markDayDone };
}
