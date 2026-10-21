import { useMemo } from 'react';
import type { Animated } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

/** Lets tests find the drag with `getByGestureTestId`. */
export const DRAWER_GESTURE_TEST_ID = 'drawer-pan';
/** Width (points) of the strip at the left edge where a drag may start the drawer. */
export const DRAWER_EDGE_STRIP = 40;
/** Fraction of the drawer width a drag must cover to commit. */
export const DRAWER_COMMIT_FRACTION = 0.3;
/** Release speed (points per second) that commits on its own. */
export const DRAWER_COMMIT_VELOCITY = 500;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Progress (0..1) for a drag of `translationX` that started from open or closed. */
export function dragProgress(startOpen: boolean, translationX: number, width: number): number {
  return clamp01((startOpen ? 1 : 0) + translationX / width);
}

/** Where a released drag settles: true is open. Distance or speed commits; otherwise it snaps back. */
export function settlesOpen(startOpen: boolean, progress: number, velocityX: number): boolean {
  if (startOpen)
    return !(progress <= 1 - DRAWER_COMMIT_FRACTION || velocityX < -DRAWER_COMMIT_VELOCITY);
  return progress >= DRAWER_COMMIT_FRACTION || velocityX > DRAWER_COMMIT_VELOCITY;
}

/**
 * Whether the drawer drag is on. An open drawer can always be dragged closed; a closed one cannot
 * be opened while a row is open, while searching, or while the rows are locked (`swipeDisabled`).
 */
export function drawerGestureEnabled(s: {
  open: boolean;
  rowOpen: boolean;
  searching?: boolean;
  swipeDisabled?: boolean;
}): boolean {
  if (s.open) return true;
  return !s.rowOpen && !s.searching && !s.swipeDisabled;
}

type Options = {
  progress: Animated.Value;
  width: number;
  /** Whether the drawer is open now (the caller's state). */
  open: boolean;
  enabled: boolean;
  /** Called when a drag is released: true to open, false to close. The caller animates. */
  onSettle: (open: boolean) => void;
};

/**
 * The drawer drag, built on react-native-gesture-handler's `Gesture.Pan` (no Reanimated). Wrap the
 * route's root view in a `GestureDetector` with the result.
 * - Closed: only a touch that starts in the 40-point strip at the left edge begins it (`hitSlop`),
 *   active after 4 points to the right, so it beats a note row's own pan (10 points).
 * - Open: a leftward drag from anywhere closes it (10 points, so a slightly slanted scroll of the
 *   drawer's tag list does not).
 * The drag sets `progress` directly; release commits by distance or speed.
 */
export function useDrawerGesture({ progress, width, open, enabled, onSettle }: Options) {
  return useMemo(() => {
    const startOpen = open;
    let started = false;
    const pan = Gesture.Pan()
      .withTestId(DRAWER_GESTURE_TEST_ID)
      .enabled(enabled)
      .failOffsetY([-12, 12])
      .onStart(() => {
        started = true;
        progress.stopAnimation();
      })
      .onUpdate((e) => {
        progress.setValue(dragProgress(startOpen, e.translationX, width));
      })
      .onEnd((e, success) => {
        // A cancelled or failed drag is handled by onFinalize alone (it returns to the start).
        if (!success) return;
        const p = dragProgress(startOpen, e.translationX, width);
        onSettle(settlesOpen(startOpen, p, e.velocityX));
      })
      .onFinalize((_e, success) => {
        // Taken from us (cancelled) after it had started: go back to where the drag started.
        if (started && !success) onSettle(startOpen);
        started = false;
      });
    if (open) return pan.activeOffsetX(-10).failOffsetX(10);
    return pan.hitSlop({ left: 0, width: DRAWER_EDGE_STRIP }).activeOffsetX(4).failOffsetX(-4);
  }, [progress, width, open, enabled, onSettle]);
}
