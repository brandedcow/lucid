import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

export const DRAWER_ANIMATION_MS = 220;
const MAX_WIDTH = 360;
const WIDTH_FRACTION = 0.84;

/** The drawer's width: most of the screen, capped, so a strip of the page stays visible. */
export function drawerWidthFor(windowWidth: number): number {
  return Math.min(windowWidth * WIDTH_FRACTION, MAX_WIDTH);
}

/**
 * The one visual value behind the drawer: 0 is closed, 1 is open. The page, the dim layer and the
 * drawer's own fade all read it, and it only ever drives `transform` and `opacity` natively.
 * `animateTo` runs the open/close animation from wherever the value is now; with Reduce Motion on
 * it sets the value at once. Whether the drawer is open (accessibility, Back) is the caller's state,
 * not this value.
 */
export function useDrawerProgress() {
  const [progress] = useState(() => new Animated.Value(0));
  const reduceMotion = useRef(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduceMotion.current = on;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotion.current = on;
    });
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  const animateTo = useCallback(
    (to: 0 | 1) => {
      if (reduceMotion.current) {
        progress.stopAnimation();
        progress.setValue(to);
        return;
      }
      Animated.timing(progress, {
        toValue: to,
        duration: DRAWER_ANIMATION_MS,
        useNativeDriver: true,
      }).start();
    },
    [progress],
  );
  return { progress, animateTo };
}
