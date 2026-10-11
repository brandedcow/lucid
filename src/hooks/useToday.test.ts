import { act, renderHook } from '@testing-library/react-native';
import { AppState, AppStateStatus } from 'react-native';
import { useToday } from './useToday';

let handler: ((s: AppStateStatus) => void) | null;
const remove = jest.fn();
let current: AppStateStatus;
// Pending timeouts of 1 s or more: the hook's midnight timer (React/RN internals use none).
const pending = new Set<unknown>();
const timers = () => pending.size;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllTimers();
  pending.clear();
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
    if (ms === undefined || ms < 1000) return realSet(fn, ms);
    const id: unknown = realSet(() => {
      pending.delete(id);
      fn();
    }, ms);
    pending.add(id);
    return id;
  }) as never);
  jest.spyOn(globalThis, 'clearTimeout').mockImplementation(((id: never) => {
    pending.delete(id);
    realClear(id);
  }) as never);
  jest.setSystemTime(new Date(2026, 9, 10, 23, 59, 0));
  handler = null;
  current = 'active';
  remove.mockReset();
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    get: () => current,
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: never) => {
    handler = h;
    return { remove };
  }) as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const emit = (s: AppStateStatus) => act(() => handler!(s));

describe('useToday', () => {
  it('starts from now() and exposes no change', async () => {
    const { result } = await renderHook(() => useToday());
    expect(result.current).toEqual({ todayKey: '2026-10-10', resumeNewDayToken: 0 });
  });

  it('rolls over at local midnight in the foreground and re-arms, without bumping the token', async () => {
    const { result } = await renderHook(() => useToday());
    await act(async () => {
      jest.advanceTimersByTime(60 * 1000 + 1000);
    });
    expect(result.current.todayKey).toBe('2026-10-11');
    expect(result.current.resumeNewDayToken).toBe(0);
    expect(timers()).toBe(1);
    await act(async () => {
      jest.advanceTimersByTime(24 * 3600 * 1000);
    });
    expect(result.current.todayKey).toBe('2026-10-12');
    expect(timers()).toBe(1);
  });

  it('clears the timer in the background; returning on a new day updates and bumps the token', async () => {
    const { result } = await renderHook(() => useToday());
    await emit('background');
    expect(timers()).toBe(0);
    jest.setSystemTime(new Date(2026, 9, 11, 8, 0, 0));
    await emit('active');
    expect(result.current).toEqual({ todayKey: '2026-10-11', resumeNewDayToken: 1 });
    expect(timers()).toBe(1);
  });

  it('a same-day return does not bump; a second return on the same new day does not bump again', async () => {
    const { result } = await renderHook(() => useToday());
    await emit('background');
    await emit('active');
    expect(result.current.resumeNewDayToken).toBe(0);

    await emit('background');
    jest.setSystemTime(new Date(2026, 9, 11, 8, 0, 0));
    await emit('active');
    expect(result.current.resumeNewDayToken).toBe(1);

    await emit('background');
    await emit('active');
    expect(result.current).toEqual({ todayKey: '2026-10-11', resumeNewDayToken: 1 });
  });

  it('a multi-day absence bumps once; a later foreground midnight does not bump', async () => {
    const { result } = await renderHook(() => useToday());
    await emit('background');
    jest.setSystemTime(new Date(2026, 9, 13, 8, 0, 0));
    await emit('active');
    expect(result.current).toEqual({ todayKey: '2026-10-13', resumeNewDayToken: 1 });
    await act(async () => {
      jest.advanceTimersByTime(16 * 3600 * 1000 + 1000);
    });
    expect(result.current).toEqual({ todayKey: '2026-10-14', resumeNewDayToken: 1 });
  });

  it('inactive counts as away', async () => {
    const { result } = await renderHook(() => useToday());
    await emit('inactive');
    expect(timers()).toBe(0);
    jest.setSystemTime(new Date(2026, 9, 11, 0, 5, 0));
    await emit('active');
    expect(result.current.resumeNewDayToken).toBe(1);
  });

  it('inactive then active on the same day does not bump', async () => {
    const { result } = await renderHook(() => useToday());
    await emit('inactive');
    await emit('active');
    expect(result.current.resumeNewDayToken).toBe(0);
  });

  it('a redundant active event with a new day updates the key but does not bump', async () => {
    const { result } = await renderHook(() => useToday());
    jest.setSystemTime(new Date(2026, 9, 11, 0, 0, 0));
    await emit('active');
    expect(result.current).toEqual({ todayKey: '2026-10-11', resumeNewDayToken: 0 });
    expect(timers()).toBe(1);
  });

  it('does not arm a timer when started in the background, and arms on active', async () => {
    current = 'background';
    await renderHook(() => useToday());
    expect(timers()).toBe(0);
    await emit('active');
    expect(timers()).toBe(1);
  });

  it('uses the injected now and does not re-subscribe on re-render', async () => {
    (AppState.addEventListener as jest.Mock).mockClear();
    const now = () => new Date(2026, 2, 8, 12, 0, 0);
    const { result, rerender } = await renderHook(() => useToday(() => new Date(now())));
    expect(result.current.todayKey).toBe('2026-03-08');
    await rerender({});
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('is DST-safe: the next fire is at local midnight on a 23 hour day', async () => {
    // Use whatever zone the runner has; assert against local midnight directly.
    jest.setSystemTime(new Date(2026, 2, 8, 22, 0, 0));
    const { result } = await renderHook(() => useToday());
    const midnight = new Date(2026, 2, 9).getTime();
    await act(async () => {
      jest.advanceTimersByTime(midnight - Date.now() - 1);
    });
    expect(result.current.todayKey).toBe('2026-03-08');
    await act(async () => {
      jest.advanceTimersByTime(1001);
    });
    expect(result.current.todayKey).toBe('2026-03-09');
  });

  it('unmount clears the timer and the listener', async () => {
    const { unmount } = await renderHook(() => useToday());
    expect(timers()).toBe(1);
    await unmount();
    expect(timers()).toBe(0);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
