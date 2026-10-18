import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** How often the note list refreshes its relative times. */
export const NOW_INTERVAL_MS = 30000;

/**
 * The current time as a `Date`, refreshed every `intervalMs` while the app is in the foreground
 * and at once when it returns to the foreground. One interval; it is cleared when the app leaves
 * the foreground and on unmount. No per-second timers.
 */
export function useNow(intervalMs: number = NOW_INTERVAL_MS, nowFn: () => Date = () => new Date()) {
  const fnRef = useRef(nowFn);
  useEffect(() => {
    fnRef.current = nowFn;
  });
  const [now, setNow] = useState(() => nowFn());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const clear = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const arm = () => {
      clear();
      timer = setInterval(() => setNow(fnRef.current()), intervalMs);
    };
    if (AppState.currentState === 'active') arm();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(fnRef.current());
        arm();
      } else {
        clear();
      }
    });
    return () => {
      clear();
      sub.remove();
    };
  }, [intervalMs]);

  return now;
}
