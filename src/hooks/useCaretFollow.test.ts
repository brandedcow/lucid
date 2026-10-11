import { renderHook } from '@testing-library/react-native';
import type { ScrollView } from 'react-native';
import { useCaretFollow, type CaretFollowOptions } from './useCaretFollow';

function setup(over: Partial<CaretFollowOptions> = {}) {
  const scrollTo = jest.fn();
  const scrollRef = { current: { scrollTo } as unknown as ScrollView };
  const props: CaretFollowOptions = {
    scrollRef,
    bodyLayout: { y: 100, height: 600 },
    text: 'hello',
    selection: { start: 5, end: 5 },
    focused: true,
    viewportHeight: 400,
    keyboardHeight: 300,
    ...over,
  };
  return { scrollTo, props };
}

// body bottom 700, last line top 674, +26 line +26 margin = 726; minus 400 viewport = 326
const EXPECTED = 326;

describe('useCaretFollow', () => {
  it('scrolls to the body end when focused with the cursor at the end', async () => {
    const { scrollTo, props } = setup();
    await renderHook((p: CaretFollowOptions) => useCaretFollow(p), { initialProps: props });
    expect(scrollTo).toHaveBeenCalledWith({ y: EXPECTED, animated: false });
  });

  it('does nothing when not focused, mid-text, or a range is selected', async () => {
    for (const over of [
      { focused: false },
      { selection: { start: 2, end: 2 } },
      { selection: { start: 0, end: 5 } },
    ]) {
      const { scrollTo, props } = setup(over);
      await renderHook((p: CaretFollowOptions) => useCaretFollow(p), { initialProps: props });
      expect(scrollTo).not.toHaveBeenCalled();
    }
  });

  it('does nothing before the body or viewport is measured', async () => {
    for (const over of [{ bodyLayout: null }, { viewportHeight: 0 }]) {
      const { scrollTo, props } = setup(over);
      await renderHook((p: CaretFollowOptions) => useCaretFollow(p), { initialProps: props });
      expect(scrollTo).not.toHaveBeenCalled();
    }
  });

  it('follows text growth and body growth', async () => {
    const { scrollTo, props } = setup();
    const { rerender } = await renderHook((p: CaretFollowOptions) => useCaretFollow(p), {
      initialProps: props,
    });
    scrollTo.mockClear();
    await rerender({
      ...props,
      text: 'hello\nthere',
      selection: { start: 11, end: 11 },
      bodyLayout: { y: 100, height: 626 },
    });
    expect(scrollTo).toHaveBeenCalledWith({ y: EXPECTED + 26, animated: false });
  });

  it('re-runs when the keyboard opens and the viewport shrinks', async () => {
    const { scrollTo, props } = setup({ viewportHeight: 800, keyboardHeight: 0 });
    const { rerender } = await renderHook((p: CaretFollowOptions) => useCaretFollow(p), {
      initialProps: props,
    });
    expect(scrollTo).not.toHaveBeenCalled(); // 726 <= 800
    await rerender({ ...props, viewportHeight: 400, keyboardHeight: 300 });
    expect(scrollTo).toHaveBeenCalledWith({ y: EXPECTED, animated: false });
  });

  it('does not scroll again when already in view, and uses the offset reported by onScroll', async () => {
    const { scrollTo, props } = setup();
    const { result, rerender } = await renderHook((p: CaretFollowOptions) => useCaretFollow(p), {
      initialProps: props,
    });
    scrollTo.mockClear();
    await rerender({ ...props, keyboardHeight: 301 });
    expect(scrollTo).not.toHaveBeenCalled();
    // the user scrolled far down; the caret is now above the band
    result.current.onScroll({ nativeEvent: { contentOffset: { y: 900 } } } as never);
    await rerender({ ...props, keyboardHeight: 302 });
    expect(scrollTo).toHaveBeenCalledWith({ y: 648, animated: false });
  });

  it('tolerates a missing ref', async () => {
    const { props } = setup({ scrollRef: { current: null } });
    await renderHook((p: CaretFollowOptions) => useCaretFollow(p), { initialProps: props });
  });
});
