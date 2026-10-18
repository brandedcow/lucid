import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder } from 'react-native';

/** A drag must travel this far down (px) to dismiss on release... */
export const DISMISS_DISTANCE = 80;
/** ...or be released at least this fast (px/ms). */
export const DISMISS_VELOCITY = 0.8;
/** Downward travel before the gesture is claimed, and how vertical it must be. */
const CLAIM_DISTANCE = 10;
const CLAIM_RATIO = 1.5;
const EXIT_MS = 180;
/** Slide distance used until the caller can report a measured height. */
const FALLBACK_HEIGHT = 400;

type Options = {
  /** Called when a swipe down dismisses the sheet; it should run the sheet's normal close path. */
  onDismiss: () => void;
  /** When false the handlers claim nothing. */
  enabled?: boolean;
  /** The sheet's measured height: how far a dismissed sheet slides before onDismiss runs. */
  getHeight?: () => number;
};

/**
 * Swipe-down-to-dismiss for a bottom sheet.
 *
 * Spread `panHandlers` on the part of the sheet that should respond and add `dragY` to the sheet's
 * translateY (`Animated.add`). The gesture is claimed only on a mostly-vertical downward drag (a
 * non-capture PanResponder, so inner Pressables and scroll views keep their own touches). The
 * sheet follows the finger downward only; on release a drag of DISMISS_DISTANCE or a fling of
 * DISMISS_VELOCITY slides it away and calls onDismiss, anything less springs back.
 *
 * `dragY` is NOT reset after a dismiss: the caller's own close animation is usually still
 * running, and a reset would pop the sheet back. Call `reset()` once the sheet is gone (the next
 * gesture also starts from zero). With Reduce Motion on, onDismiss runs at once, without sliding.
 */
export function useSheetDismiss({ onDismiss, enabled = true, getHeight }: Options) {
  const [dragY] = useState(() => new Animated.Value(0));
  const latest = useRef({ onDismiss, enabled, getHeight });
  useEffect(() => {
    latest.current = { onDismiss, enabled, getHeight };
  });
  const reduceMotion = useRef(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduceMotion.current = on;
    });
    return () => {
      alive = false;
    };
  }, []);

  const reset = useCallback(() => {
    dragY.stopAnimation();
    dragY.setValue(0);
  }, [dragY]);

  const panHandlers = useMemo(() => {
    const springBack = () => Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
    const dismiss = () => {
      if (reduceMotion.current) {
        latest.current.onDismiss();
        return;
      }
      const height = latest.current.getHeight?.() || FALLBACK_HEIGHT;
      Animated.timing(dragY, {
        toValue: height,
        duration: EXIT_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) latest.current.onDismiss();
      });
    };
    // The handlers read only `latest`, inside events, never during render.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) =>
        latest.current.enabled && g.dy > CLAIM_DISTANCE && g.dy > CLAIM_RATIO * Math.abs(g.dx),
      onPanResponderGrant: reset,
      onPanResponderMove: (_e, g) => dragY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy >= DISMISS_DISTANCE || g.vy >= DISMISS_VELOCITY) dismiss();
        else springBack();
      },
      onPanResponderTerminate: springBack,
    }).panHandlers;
  }, [dragY, reset]);

  return { panHandlers, dragY, reset };
}
