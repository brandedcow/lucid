import { renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';
import {
  DRAWER_COMMIT_VELOCITY,
  DRAWER_EDGE_STRIP,
  dragProgress,
  drawerGestureEnabled,
  settlesOpen,
  useDrawerGesture,
} from './useDrawerGesture';

type Handlers = {
  onBegin: (e: unknown) => void;
  onStart: (e: unknown) => void;
  onUpdate: (e: { translationX: number }) => void;
  onEnd: (e: { translationX: number; velocityX: number }) => void;
  onFinalize: (e: unknown, success: boolean) => void;
};
type Config = {
  enabled?: boolean;
  hitSlop?: { left?: number; width?: number };
  activeOffsetXStart?: number;
  activeOffsetXEnd?: number;
  failOffsetXStart?: number;
  failOffsetXEnd?: number;
};
type Built = { handlers: Handlers; config: Config };

const W = 300;

async function setup(opts: { open?: boolean; enabled?: boolean } = {}) {
  const progress = new Animated.Value(opts.open ? 1 : 0);
  const onSettle = jest.fn();
  const setValue = jest.spyOn(progress, 'setValue');
  const stop = jest.spyOn(progress, 'stopAnimation');
  const hook = await renderHook(
    (p: { open: boolean; enabled: boolean }) =>
      useDrawerGesture({ progress, width: W, open: p.open, enabled: p.enabled, onSettle }),
    { initialProps: { open: opts.open ?? false, enabled: opts.enabled ?? true } },
  );
  const built = () => hook.result.current as unknown as Built;
  return { progress, onSettle, setValue, stop, hook, built };
}

describe('drag maths', () => {
  it('follows the finger and clamps to 0..1', () => {
    expect(dragProgress(false, 150, W)).toBe(0.5);
    expect(dragProgress(false, -40, W)).toBe(0);
    expect(dragProgress(false, 900, W)).toBe(1);
    expect(dragProgress(true, -150, W)).toBe(0.5);
    expect(dragProgress(true, 80, W)).toBe(1);
  });

  it('opens by distance (30 percent) or by speed, otherwise snaps back', () => {
    expect(settlesOpen(false, 0.3, 0)).toBe(true);
    expect(settlesOpen(false, 0.29, 0)).toBe(false);
    expect(settlesOpen(false, 0.05, DRAWER_COMMIT_VELOCITY + 1)).toBe(true);
    expect(settlesOpen(false, 0.05, DRAWER_COMMIT_VELOCITY)).toBe(false);
  });

  it('closes by distance (30 percent) or by speed, otherwise stays open', () => {
    expect(settlesOpen(true, 0.7, 0)).toBe(false);
    expect(settlesOpen(true, 0.71, 0)).toBe(true);
    expect(settlesOpen(true, 0.95, -(DRAWER_COMMIT_VELOCITY + 1))).toBe(false);
    expect(settlesOpen(true, 0.95, -DRAWER_COMMIT_VELOCITY)).toBe(true);
  });
});

describe('drawerGestureEnabled', () => {
  const base = { open: false, rowOpen: false };
  it('is on for a closed drawer with nothing in the way', () => {
    expect(drawerGestureEnabled(base)).toBe(true);
  });
  it.each([
    ['a row is open', { rowOpen: true }],
    ['searching', { searching: true }],
    ['the rows are locked', { swipeDisabled: true }],
  ])('is off while %s', (_n, patch) => {
    expect(drawerGestureEnabled({ ...base, ...patch })).toBe(false);
  });
  it('an open drawer can always be dragged closed', () => {
    expect(
      drawerGestureEnabled({ open: true, rowOpen: true, searching: true, swipeDisabled: true }),
    ).toBe(true);
  });
});

describe('useDrawerGesture', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('closed: starts only in a 40 point strip, active after 4 right, failing left', async () => {
    const { built } = await setup();
    expect(built().config.hitSlop).toEqual({ left: 0, width: DRAWER_EDGE_STRIP });
    expect(DRAWER_EDGE_STRIP).toBe(40);
    expect(built().config.activeOffsetXStart).toBeUndefined();
    expect(built().config.activeOffsetXEnd).toBe(4);
    expect(built().config.failOffsetXStart).toBe(-4);
    expect(built().config.enabled).toBe(true);
  });

  it('open: no strip, a leftward drag closes it', async () => {
    const { built } = await setup({ open: true });
    expect(built().config.hitSlop).toBeUndefined();
    expect(built().config.activeOffsetXStart).toBe(-10);
    expect(built().config.activeOffsetXEnd).toBeUndefined();
  });

  it('is disabled when told so', async () => {
    const { built } = await setup({ enabled: false });
    expect(built().config.enabled).toBe(false);
  });

  it('sets progress while dragging, clamped', async () => {
    const { built, setValue, stop } = await setup();
    built().handlers.onStart({ x: 5, state: 4 });
    expect(stop).toHaveBeenCalled();
    built().handlers.onUpdate({ translationX: 90 });
    expect(setValue).toHaveBeenLastCalledWith(0.3);
    built().handlers.onUpdate({ translationX: 999 });
    expect(setValue).toHaveBeenLastCalledWith(1);
    built().handlers.onUpdate({ translationX: -20 });
    expect(setValue).toHaveBeenLastCalledWith(0);
  });

  it('commits open by distance, by velocity, and cancels a short slow drag', async () => {
    const { built, onSettle } = await setup();
    built().handlers.onEnd({ translationX: 90, velocityX: 0 });
    expect(onSettle).toHaveBeenLastCalledWith(true);
    built().handlers.onEnd({ translationX: 20, velocityX: 800 });
    expect(onSettle).toHaveBeenLastCalledWith(true);
    built().handlers.onEnd({ translationX: 20, velocityX: 100 });
    expect(onSettle).toHaveBeenLastCalledWith(false);
  });

  it('an open drawer closes by distance or velocity and otherwise stays open', async () => {
    const { built, onSettle } = await setup({ open: true });
    built().handlers.onEnd({ translationX: -100, velocityX: 0 });
    expect(onSettle).toHaveBeenLastCalledWith(false);
    built().handlers.onEnd({ translationX: -10, velocityX: -900 });
    expect(onSettle).toHaveBeenLastCalledWith(false);
    built().handlers.onEnd({ translationX: -30, velocityX: -50 });
    expect(onSettle).toHaveBeenLastCalledWith(true);
  });

  it('a drag taken from us after it started goes back to where it began', async () => {
    const { built, onSettle } = await setup();
    built().handlers.onStart({});
    built().handlers.onFinalize({}, false);
    expect(onSettle).toHaveBeenCalledWith(false);
  });

  it('a touch that never started settles nothing', async () => {
    const { built, onSettle } = await setup();
    built().handlers.onBegin({});
    built().handlers.onFinalize({}, false);
    expect(onSettle).not.toHaveBeenCalled();
  });

  it('logs begin, start and finalize in development builds', async () => {
    const log = console.log as jest.Mock;
    const { built } = await setup();
    built().handlers.onBegin({ x: 3, state: 2 });
    built().handlers.onStart({ x: 3, state: 4 });
    built().handlers.onFinalize({ x: 40, state: 5 }, true);
    expect(log.mock.calls.map((c) => c[0])).toEqual([
      '[drawer-gesture] begin',
      '[drawer-gesture] start',
      '[drawer-gesture] finalize',
    ]);
  });
});
