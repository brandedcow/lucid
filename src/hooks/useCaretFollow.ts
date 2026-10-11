import { RefObject, useCallback, useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { caretTopAtBodyEnd, offsetToRevealCaret } from '../utils/caretScroll';

type Selection = { start: number; end: number };

export type CaretFollowOptions = {
  /** The page ScrollView. */
  scrollRef: RefObject<ScrollView | null>;
  /** The body input's frame inside the scroll content (from its onLayout), null until measured. */
  bodyLayout: { y: number; height: number } | null;
  /** The body text. */
  text: string;
  /** The body's selection as the page tracks it. */
  selection: Selection;
  /** The body has focus; nothing is followed otherwise. */
  focused: boolean;
  /** The ScrollView's own measured height (its onLayout), which already excludes the keyboard and dock. */
  viewportHeight: number;
  /** Keyboard height; a change re-runs the follow because the viewport is changing. */
  keyboardHeight: number;
  /** One text line, default 26. */
  lineHeight?: number;
};

/**
 * Phase 1 of the caret follow: while the body is focused and the cursor is at the end of the text,
 * keep the body's last line inside the visible band. Re-runs when the cursor, text, body size,
 * viewport or keyboard height change. Mid-text cursors are not followed (phase 2, needs a device
 * verdict). Wire `onScroll` on the ScrollView (with `scrollEventThrottle`) so the hook knows the offset.
 */
export function useCaretFollow({
  scrollRef,
  bodyLayout,
  text,
  selection,
  focused,
  viewportHeight,
  keyboardHeight,
  lineHeight = 26,
}: CaretFollowOptions): {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
  const scrollY = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  const atEnd = selection.start === selection.end && selection.start >= text.length;
  const bodyY = bodyLayout?.y;
  const bodyHeight = bodyLayout?.height;

  useEffect(() => {
    if (!focused || !atEnd || bodyY === undefined || bodyHeight === undefined) return;
    const target = offsetToRevealCaret({
      caretTop: caretTopAtBodyEnd({ y: bodyY, height: bodyHeight }, lineHeight),
      lineHeight,
      scrollY: scrollY.current,
      viewportHeight,
      margin: lineHeight,
    });
    if (target === null) return;
    scrollY.current = target;
    scrollRef.current?.scrollTo({ y: target, animated: false });
  }, [
    focused,
    atEnd,
    text,
    selection.start,
    bodyY,
    bodyHeight,
    viewportHeight,
    keyboardHeight,
    lineHeight,
    scrollRef,
  ]);

  return { onScroll };
}
