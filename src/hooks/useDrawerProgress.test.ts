import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';
import { DRAWER_ANIMATION_MS, drawerWidthFor, useDrawerProgress } from './useDrawerProgress';

let reduceSpy: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  reduceSpy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const value = (p: Animated.Value) => (p as unknown as { __getValue: () => number }).__getValue();

describe('drawerWidthFor', () => {
  it('is 84 percent of the screen, capped at 360', () => {
    expect(drawerWidthFor(300)).toBeCloseTo(252);
    expect(drawerWidthFor(390)).toBeCloseTo(327.6);
    expect(drawerWidthFor(900)).toBe(360);
  });
});

describe('useDrawerProgress', () => {
  it('starts closed', async () => {
    const { result } = await renderHook(() => useDrawerProgress());
    expect(value(result.current.progress)).toBe(0);
  });

  it('animates natively and from where the value is now', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const { result } = await renderHook(() => useDrawerProgress());
    await act(async () => result.current.animateTo(1));
    expect(timing).toHaveBeenCalledWith(
      result.current.progress,
      expect.objectContaining({
        toValue: 1,
        duration: DRAWER_ANIMATION_MS,
        useNativeDriver: true,
      }),
    );
  });

  it('with Reduce Motion on it jumps at once', async () => {
    reduceSpy.mockResolvedValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    const { result } = await renderHook(() => useDrawerProgress());
    await act(async () => {});
    await act(async () => result.current.animateTo(1));
    expect(value(result.current.progress)).toBe(1);
    expect(timing).not.toHaveBeenCalled();
    await act(async () => result.current.animateTo(0));
    expect(value(result.current.progress)).toBe(0);
  });
});
