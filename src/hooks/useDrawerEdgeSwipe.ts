import { useEffect, useMemo, useRef } from 'react';
import { GestureResponderHandlers, PanResponder } from 'react-native';
import { opensDrawer, startsDrawerEdgeSwipe } from '../utils/edgeSwipe';

/**
 * A swipe from the left edge that calls `onOpen` on release. Spread the result on the screen's
 * root View. It captures the touch, so a row underneath does not take a swipe that starts at the
 * very edge. `disabled` and `onOpen` are read live, so the responder is created once. On Android
 * gesture navigation the system may own this edge; the menu button is the reliable path.
 */
export function useDrawerEdgeSwipe(onOpen: () => void, disabled = false): GestureResponderHandlers {
  const live = useRef({ onOpen, disabled });
  useEffect(() => {
    live.current = { onOpen, disabled };
  });
  return useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          !live.current.disabled && startsDrawerEdgeSwipe(g),
        onPanResponderRelease: (_e, g) => {
          if (!live.current.disabled && opensDrawer(g)) live.current.onOpen();
        },
      }).panHandlers,
    [],
  );
}
