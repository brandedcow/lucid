import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { localDateKey, msUntilNextDay } from '../utils/today';

/** Slack after local midnight so the timer never fires a moment before the day changes. */
const MIDNIGHT_SLACK_MS = 1000;

/**
 * The current local day key, kept fresh. While the app is in the foreground a single timeout to
 * the next local midnight (+1 s) recomputes it and re-arms itself; the timer is cleared when the
 * app leaves the foreground and on unmount. Returning to the foreground recomputes too. No polling.
 *
 * `resumeNewDayToken` starts at 0 and increases by one each time the app returns to the foreground
 * on a different day than the one shown when it left (an absence of several days counts once; a
 * same-day return, a redundant active event and a foreground midnight timer fire never bump it).
 * The hook only exposes state; it never navigates.
 */
export function useToday(now: () => Date = () => new Date()): {
  todayKey: string;
  resumeNewDayToken: number;
} {
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });
  const [todayKey, setTodayKey] = useState(() => localDateKey(now()));
  const [resumeNewDayToken, setResumeNewDayToken] = useState(0);

  useEffect(() => {
    const now = () => nowRef.current();
    let active = AppState.currentState === 'active';
    let away = !active;
    let shown = localDateKey(now());
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const update = () => {
      const key = localDateKey(now());
      const changed = key !== shown;
      shown = key;
      setTodayKey(key);
      return changed;
    };
    const arm = () => {
      clear();
      timer = setTimeout(
        () => {
          timer = null;
          update();
          arm();
        },
        msUntilNextDay(now()) + MIDNIGHT_SLACK_MS,
      );
    };

    // The key may have moved between the first render and this effect.
    update();
    if (active) arm();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        active = true;
        const changed = update();
        if (away && changed) setResumeNewDayToken((n) => n + 1);
        away = false;
        arm();
      } else {
        active = false;
        away = true;
        clear();
      }
    });

    return () => {
      clear();
      sub.remove();
    };
  }, []);

  return { todayKey, resumeNewDayToken };
}
