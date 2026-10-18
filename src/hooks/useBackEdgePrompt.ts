import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { PanResponder, Platform, type GestureResponderHandlers } from 'react-native';
import { completesBackEdgeSwipe, startsBackEdgeSwipe } from '../utils/sessionNavigation';

/**
 * The iOS stand-in for the swipe back on a page that would ask before leaving: the native swipe is
 * off there (it would play the whole pop and snap back), so a swipe from the left edge only calls
 * `onPrompt` on release. Nothing follows the finger. Spread the result on a wrapper View; on other
 * platforms it is empty (Android has no swipe; hardware back goes through the JS handler).
 * `enabledRef` is read live, so the responder is created once.
 */
export function useBackEdgePrompt(
  enabledRef: MutableRefObject<boolean>,
  onPrompt: () => void,
): GestureResponderHandlers {
  const promptRef = useRef(onPrompt);
  useEffect(() => {
    promptRef.current = onPrompt;
  });
  // Where the current touch began. A PanResponder's `x0` is only set once it is granted the
  // responder, which is after this capture decision, so the start is read from the touch itself.
  const startX = useRef(Infinity);
  const ios = Platform.OS === 'ios';
  return useMemo(
    () =>
      ios
        ? // eslint-disable-next-line react-hooks/refs
          PanResponder.create({
            onStartShouldSetPanResponderCapture: (e) => {
              startX.current = e.nativeEvent.pageX;
              return false;
            },
            // Capture, so an edge swipe is not taken by a child.
            onMoveShouldSetPanResponderCapture: (_e, g) =>
              enabledRef.current && startsBackEdgeSwipe({ ...g, x0: startX.current }),
            onPanResponderTerminationRequest: () => false,
            onPanResponderRelease: (_e, g) => {
              if (enabledRef.current && completesBackEdgeSwipe(g)) promptRef.current();
            },
          }).panHandlers
        : {},
    [ios, enabledRef, startX],
  );
}
