import { renderHook } from '@testing-library/react-native';
import { PanResponder } from 'react-native';
import { useDrawerEdgeSwipe } from './useDrawerEdgeSwipe';

type Config = {
  onMoveShouldSetPanResponderCapture: (
    e: unknown,
    g: { x0: number; dx: number; dy: number },
  ) => boolean;
  onPanResponderRelease: (e: unknown, g: { dx: number }) => void;
};

let config: Config;

beforeEach(() => {
  const real = PanResponder.create.bind(PanResponder);
  jest.spyOn(PanResponder, 'create').mockImplementation(((c: Config) => {
    config = c;
    return real(c as never);
  }) as never);
});

afterEach(() => jest.restoreAllMocks());

describe('useDrawerEdgeSwipe', () => {
  it('captures a touch that starts within 20 points of the left edge, moving right', async () => {
    await renderHook(() => useDrawerEdgeSwipe(jest.fn()));
    const capture = config.onMoveShouldSetPanResponderCapture;
    expect(capture({}, { x0: 20, dx: 12, dy: 0 })).toBe(true);
    expect(capture({}, { x0: 21, dx: 12, dy: 0 })).toBe(false);
    expect(capture({}, { x0: 5, dx: 12, dy: 7 })).toBe(false);
  });

  it('opens on release at 40 points and not at 39', async () => {
    const onOpen = jest.fn();
    await renderHook(() => useDrawerEdgeSwipe(onOpen));
    config.onPanResponderRelease({}, { dx: 39 });
    expect(onOpen).not.toHaveBeenCalled();
    config.onPanResponderRelease({}, { dx: 40 });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', async () => {
    const onOpen = jest.fn();
    await renderHook(() => useDrawerEdgeSwipe(onOpen, true));
    expect(config.onMoveShouldSetPanResponderCapture({}, { x0: 5, dx: 30, dy: 0 })).toBe(false);
    config.onPanResponderRelease({}, { dx: 100 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('calls the latest onOpen', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await renderHook(({ cb }: { cb: () => void }) => useDrawerEdgeSwipe(cb), {
      initialProps: { cb: first },
    });
    await rerender({ cb: second });
    config.onPanResponderRelease({}, { dx: 60 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
