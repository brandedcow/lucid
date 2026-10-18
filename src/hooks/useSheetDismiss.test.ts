import { AccessibilityInfo, Animated, PanResponder } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { DISMISS_DISTANCE, DISMISS_VELOCITY, useSheetDismiss } from './useSheetDismiss';

type Config = Parameters<typeof PanResponder.create>[0];
let config: Config;
let timing: jest.SpyInstance;
let spring: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  timing = jest.spyOn(Animated, 'timing');
  spring = jest.spyOn(Animated, 'spring');
  const create = PanResponder.create.bind(PanResponder);
  jest.spyOn(PanResponder, 'create').mockImplementation((c) => {
    config = c;
    return create(c);
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const g = (dy: number, dx = 0, vy = 0) => ({ dx, dy, vy }) as never;
const claims = (dy: number, dx = 0) =>
  !!config.onMoveShouldSetPanResponder?.({} as never, g(dy, dx));
const value = (dragY: unknown) => (dragY as { __getValue(): number }).__getValue();
const run = () => act(() => jest.advanceTimersByTime(600));

async function setup(options: { enabled?: boolean; height?: number } = {}) {
  const onDismiss = jest.fn();
  const hook = await renderHook(() =>
    useSheetDismiss({
      onDismiss,
      enabled: options.enabled,
      getHeight: () => options.height ?? 300,
    }),
  );
  return { onDismiss, hook };
}
const drag = (dy: number, vy = 0) => {
  config.onPanResponderGrant?.({} as never, g(0));
  config.onPanResponderMove?.({} as never, g(dy));
  config.onPanResponderRelease?.({} as never, g(dy, 0, vy));
};

describe('useSheetDismiss', () => {
  it('claims only a mostly vertical downward drag past 10 px', async () => {
    await setup();
    expect(claims(10)).toBe(false);
    expect(claims(11)).toBe(true);
    expect(claims(-40)).toBe(false);
    expect(claims(31, 20)).toBe(true);
    expect(claims(30, 20)).toBe(false);
    expect(claims(30, 60)).toBe(false);
    expect(config.onStartShouldSetPanResponder?.({} as never, g(0))).toBe(false);
  });

  it('does not use the capture phase, so inner touches win', async () => {
    await setup();
    expect(config.onMoveShouldSetPanResponderCapture).toBeUndefined();
    expect(config.onStartShouldSetPanResponderCapture).toBeUndefined();
  });

  it('is inert when enabled is false', async () => {
    await setup({ enabled: false });
    expect(claims(200)).toBe(false);
  });

  it('follows the finger downward and never goes above rest', async () => {
    const { hook } = await setup();
    config.onPanResponderGrant?.({} as never, g(0));
    config.onPanResponderMove?.({} as never, g(35));
    expect(value(hook.result.current.dragY)).toBe(35);
    config.onPanResponderMove?.({} as never, g(-20));
    expect(value(hook.result.current.dragY)).toBe(0);
  });

  it('dismisses at the distance threshold, after sliding the sheet away', async () => {
    const { onDismiss, hook } = await setup({ height: 300 });
    await act(async () => drag(DISMISS_DISTANCE));
    expect(onDismiss).not.toHaveBeenCalled();
    await run();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(timing).toHaveBeenCalledWith(
      hook.result.current.dragY,
      expect.objectContaining({ toValue: 300 }),
    );
  });

  it('dismisses on a fast fling even for a short drag', async () => {
    const { onDismiss } = await setup();
    await act(async () => drag(20, DISMISS_VELOCITY));
    await run();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('springs back below both thresholds', async () => {
    const { onDismiss, hook } = await setup();
    await act(async () => drag(DISMISS_DISTANCE - 1, DISMISS_VELOCITY - 0.01));
    await run();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
    expect(spring).toHaveBeenCalledWith(
      hook.result.current.dragY,
      expect.objectContaining({ toValue: 0 }),
    );
  });

  it('springs back when the gesture is terminated', async () => {
    const { onDismiss, hook } = await setup();
    config.onPanResponderGrant?.({} as never, g(0));
    config.onPanResponderMove?.({} as never, g(60));
    await act(async () => config.onPanResponderTerminate?.({} as never, g(60)));
    await run();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(spring).toHaveBeenCalledWith(
      hook.result.current.dragY,
      expect.objectContaining({ toValue: 0 }),
    );
  });

  it('with Reduce Motion it dismisses on release without sliding', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const { onDismiss, hook } = await setup();
    await act(async () => drag(120));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(value(hook.result.current.dragY)).toBe(120);
  });

  it('calls the latest onDismiss', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const hook = await renderHook(
      (props: { cb: () => void }) => useSheetDismiss({ onDismiss: props.cb }),
      { initialProps: { cb: first } },
    );
    await hook.rerender({ cb: second });
    await act(async () => drag(120));
    await run();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  // Last: stopAnimation on a native-driven value leaves jest's animated mock unable to finish
  // later timings in the same file.
  it('reset() and the next gesture return dragY to zero after a dismiss', async () => {
    const { hook } = await setup();
    await act(async () => drag(120));
    await run();
    config.onPanResponderMove?.({} as never, g(300));
    expect(value(hook.result.current.dragY)).toBe(300);
    act(() => hook.result.current.reset());
    expect(value(hook.result.current.dragY)).toBe(0);
    // The next gesture also starts from zero.
    config.onPanResponderMove?.({} as never, g(50));
    config.onPanResponderGrant?.({} as never, g(0));
    expect(value(hook.result.current.dragY)).toBe(0);
  });
});
