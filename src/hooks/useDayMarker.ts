import { useCallback, useEffect, useRef, useState } from 'react';
import { readNoDreamDate, writeNoDreamDate } from '../services/dayMarker';

/**
 * The latest day the user marked "No dream". `loaded` turns true once the first read finishes
 * (also when it fails, which reads as no marker). `markNoDream` updates state first, then writes
 * in the background; a failed write keeps the value for the session and shows nothing. A read that
 * finishes after `markNoDream` never overwrites the newer value, and nothing updates after unmount.
 */
export function useDayMarker() {
  const [loaded, setLoaded] = useState(false);
  const [noDreamDate, setNoDreamDate] = useState<string | null>(null);
  const marked = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    readNoDreamDate()
      .catch(() => null)
      .then((date) => {
        if (!mounted.current) return;
        if (!marked.current) setNoDreamDate(date);
        setLoaded(true);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const markNoDream = useCallback((dateKey: string) => {
    marked.current = true;
    if (mounted.current) setNoDreamDate(dateKey);
    writeNoDreamDate(dateKey).catch(() => {});
  }, []);

  return { loaded, noDreamDate, markNoDream };
}
