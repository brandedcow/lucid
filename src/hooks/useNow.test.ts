import { act, renderHook } from '@testing-library/react-native';
import { AppState, AppStateStatus } from 'react-native';
import { NOW_INTERVAL_MS, useNow } from './useNow';

let handler: ((s: AppStateStatus) => void) | null;
const remove = jest.fn();
let current: AppStateStatus;
const live = new Set<unknown>();
const intervals = () => live.size;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 18, 12, 0, 0));
  handler = null;
  live.clear();
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  jest.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
    const id = realSet(fn, ms);
    live.add(id);
    return id;
  }) as never);
  jest.spyOn(globalThis, 'clearInterval').mockImplementation(((id: never) => {
    live.delete(id);
    realClear(id);
  }) as never);
  current = 'active';
  remove.mockReset();
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => current });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: never) => {
    handler = h;
    return { remove };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('useNow', () => {
  it('defaults to a 30 second interval', async () => {
    expect(NOW_INTERVAL_MS).toBe(30000);
    const { result } = await renderHook(() => useNow());
    const first = result.current.getTime();
    await act(async () => {
      jest.advanceTimersByTime(29999);
    });
    expect(result.current.getTime()).toBe(first);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.getTime()).toBe(first + 30000);
  });

  it('starts at the current time and ticks every interval', async () => {
    const { result } = await renderHook(() => useNow(30000));
    const first = result.current.getTime();
    await act(async () => {
      jest.advanceTimersByTime(29999);
    });
    expect(result.current.getTime()).toBe(first);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.getTime()).toBe(first + 30000);
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(result.current.getTime()).toBe(first + 60000);
  });

  it('uses one interval and no other timer', async () => {
    await renderHook(() => useNow(30000));
    expect(intervals()).toBe(1);
  });

  it('stops while the app is inactive and refreshes at once on return', async () => {
    const { result } = await renderHook(() => useNow(30000));
    const first = result.current.getTime();
    await act(async () => handler?.('background'));
    expect(intervals()).toBe(0);
    await act(async () => {
      jest.advanceTimersByTime(120000);
    });
    expect(result.current.getTime()).toBe(first);
    await act(async () => handler?.('active'));
    expect(result.current.getTime()).toBe(first + 120000);
    expect(intervals()).toBe(1);
  });

  it('does not start a timer when the app starts inactive', async () => {
    current = 'background';
    await renderHook(() => useNow(30000));
    expect(intervals()).toBe(0);
  });

  it('clears the timer and the listener on unmount', async () => {
    const { unmount } = await renderHook(() => useNow(30000));
    await unmount();
    expect(intervals()).toBe(0);
    expect(remove).toHaveBeenCalled();
  });
});
