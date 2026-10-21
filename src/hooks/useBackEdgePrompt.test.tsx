import { useEffect } from 'react';
import { render } from '@testing-library/react-native';
import { PanResponder, Platform, View } from 'react-native';
import { useBackEdgePrompt } from './useBackEdgePrompt';

type Config = Parameters<typeof PanResponder.create>[0];
let config: Config | null = null;
const out: { handlers: object } = { handlers: {} };
const onPrompt = jest.fn();
const enabled = { current: true };

function Host() {
  const handlers = useBackEdgePrompt(enabled, onPrompt);
  useEffect(() => {
    out.handlers = handlers;
  });
  return <View />;
}

const setOS = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};
const originalOS = Platform.OS;

beforeEach(() => {
  config = null;
  out.handlers = {};
  enabled.current = true;
  onPrompt.mockReset();
  const create = PanResponder.create.bind(PanResponder);
  jest.spyOn(PanResponder, 'create').mockImplementation((c) => {
    config = c;
    return create(c);
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  setOS(originalOS as 'ios');
});

const g = (x0: number, dx: number, dy = 0, vx = 0) => ({ x0, dx, dy, vx }) as never;
const release = (dx: number, vx = 0) =>
  config?.onPanResponderRelease?.({} as never, g(0, dx, 0, vx));

describe('useBackEdgePrompt', () => {
  it('on Android attaches no responder at all', async () => {
    setOS('android');
    await render(<Host />);
    expect(config).toBeNull();
    expect(out.handlers).toEqual({});
  });

  it('on iOS attaches the pan handlers', async () => {
    setOS('ios');
    await render(<Host />);
    expect(Object.keys(out.handlers).length).toBeGreaterThan(0);
  });

  it('opens the prompt on release past the distance, or fast enough; an early lift does nothing', async () => {
    setOS('ios');
    await render(<Host />);
    release(41);
    expect(onPrompt).toHaveBeenCalledTimes(1);
    release(12, 0.6);
    expect(onPrompt).toHaveBeenCalledTimes(2);
    release(20, 0.1);
    expect(onPrompt).toHaveBeenCalledTimes(2);
  });
});

// The same hook driven through the real PanResponder handlers (not the config), the way the
// responder system calls them: x0 is still 0 when the capture decision is made, so the start has to
// come from the touch itself.
describe('useBackEdgePrompt with the real responder handlers', () => {
  type H = Record<string, (e: unknown) => boolean | void>;
  const bank = (startX: number, x: number, t: number) => ({
    touchActive: true,
    startPageX: startX,
    startPageY: 100,
    startTimeStamp: 0,
    currentPageX: x,
    currentPageY: 100,
    currentTimeStamp: t,
    previousPageX: startX,
    previousPageY: 100,
    previousTimeStamp: 0,
  });
  const event = (startX: number, x: number, t: number) => ({
    nativeEvent: { touches: [{}], pageX: x },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: t,
      touchBank: [bank(startX, x, t)],
    },
  });
  // Press at startX, move to startX + dx; returns whether the move was captured.
  const drag = (h: H, startX: number, dx: number, t = 100) => {
    h.onStartShouldSetResponderCapture(event(startX, startX, 0));
    const captured = h.onMoveShouldSetResponderCapture(event(startX, startX + dx, t));
    if (captured) h.onResponderGrant(event(startX, startX + dx, t));
    return captured;
  };

  it('does not capture a drag that starts mid-page, and opens no prompt on release', async () => {
    setOS('ios');
    await render(<Host />);
    const h = out.handlers as H;
    expect(drag(h, 200, 40)).toBe(false);
    // Never granted the responder, so there is no release for it to act on.
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it('captures a drag that starts at the edge and opens the prompt on release', async () => {
    setOS('ios');
    await render(<Host />);
    const h = out.handlers as H;
    expect(drag(h, 5, 60)).toBe(true);
    h.onResponderRelease(event(5, 65, 100));
    expect(onPrompt).toHaveBeenCalledTimes(1);
  });

  it('a later touch is judged by its own start', async () => {
    setOS('ios');
    await render(<Host />);
    const h = out.handlers as H;
    expect(drag(h, 5, 60)).toBe(true);
    h.onResponderRelease(event(5, 65, 100));
    expect(drag(h, 200, 60, 300)).toBe(false);
  });

  it('keeps the responder once captured (it does not give it up to a child)', async () => {
    setOS('ios');
    await render(<Host />);
    const h = out.handlers as H;
    drag(h, 5, 60);
    expect(h.onResponderTerminationRequest(event(5, 65, 100))).toBe(false);
  });

  it('is inert while disabled (a clean page): no capture, no prompt', async () => {
    setOS('ios');
    enabled.current = false;
    await render(<Host />);
    const h = out.handlers as H;
    expect(drag(h, 5, 60)).toBe(false);
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it('ignores a vertical drag from the edge', async () => {
    setOS('ios');
    await render(<Host />);
    const h = out.handlers as H;
    h.onStartShouldSetResponderCapture(event(5, 5, 0));
    const e = event(5, 25, 100);
    e.touchHistory.touchBank[0].currentPageY = 200;
    expect(h.onMoveShouldSetResponderCapture(e)).toBe(false);
  });
});
