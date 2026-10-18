import { act, renderHook, waitFor } from '@testing-library/react-native';
import { readNoDreamDate, writeNoDreamDate } from '../services/dayMarker';
import { useDayMarker } from './useDayMarker';

jest.mock('../services/dayMarker', () => ({
  readNoDreamDate: jest.fn(),
  writeNoDreamDate: jest.fn(),
}));

const mockRead = readNoDreamDate as jest.Mock;
const mockWrite = writeNoDreamDate as jest.Mock;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockRead.mockReset().mockResolvedValue(null);
  mockWrite.mockReset().mockResolvedValue(undefined);
});

describe('useDayMarker', () => {
  it('is not loaded until the read finishes, then exposes the stored date', async () => {
    const load = deferred<string | null>();
    mockRead.mockReturnValue(load.promise);
    const { result } = await renderHook(() => useDayMarker());
    expect(result.current.loaded).toBe(false);
    expect(result.current.noDreamDate).toBeNull();
    await act(async () => {
      load.resolve('2026-10-09');
      await load.promise;
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.noDreamDate).toBe('2026-10-09');
  });

  it('is loaded with no date when the read fails', async () => {
    mockRead.mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useDayMarker());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.noDreamDate).toBeNull();
  });

  it('markNoDream sets state at once, then writes', async () => {
    const { result } = await renderHook(() => useDayMarker());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const write = deferred<void>();
    mockWrite.mockReturnValue(write.promise);
    await act(async () => {
      result.current.markNoDream('2026-10-10');
    });
    expect(result.current.noDreamDate).toBe('2026-10-10');
    expect(mockWrite).toHaveBeenCalledWith('2026-10-10');
  });

  it('keeps the value when the write fails, without throwing', async () => {
    mockWrite.mockRejectedValue(new Error('disk full'));
    const { result } = await renderHook(() => useDayMarker());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      result.current.markNoDream('2026-10-10');
    });
    expect(result.current.noDreamDate).toBe('2026-10-10');
  });

  it('a read that finishes after markNoDream does not overwrite it', async () => {
    const load = deferred<string | null>();
    mockRead.mockReturnValue(load.promise);
    const { result } = await renderHook(() => useDayMarker());
    await act(async () => {
      result.current.markNoDream('2026-10-10');
    });
    await act(async () => {
      load.resolve('2026-10-01');
      await load.promise;
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.noDreamDate).toBe('2026-10-10');
  });

  it('does not update state after unmount', async () => {
    const load = deferred<string | null>();
    mockRead.mockReturnValue(load.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = await renderHook(() => useDayMarker());
    await unmount();
    load.resolve('2026-10-09');
    await act(async () => {
      await load.promise;
    });
    expect(result.current.loaded).toBe(false);
    expect(result.current.noDreamDate).toBeNull();
    result.current.markNoDream('2026-10-10');
    expect(result.current.noDreamDate).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('useDayMarker aliases', () => {
  it('doneDate mirrors noDreamDate once loaded', async () => {
    mockRead.mockResolvedValue('2026-10-09');
    const { result } = await renderHook(() => useDayMarker());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.doneDate).toBe('2026-10-09');
    expect(result.current.doneDate).toBe(result.current.noDreamDate);
  });

  it('markDayDone updates both names and writes the marker', async () => {
    const { result } = await renderHook(() => useDayMarker());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      result.current.markDayDone('2026-10-18');
    });
    expect(result.current.doneDate).toBe('2026-10-18');
    expect(result.current.noDreamDate).toBe('2026-10-18');
    expect(mockWrite).toHaveBeenCalledWith('2026-10-18');
  });

  it('markDayDone is the same function as markNoDream', async () => {
    const { result } = await renderHook(() => useDayMarker());
    expect(result.current.markDayDone).toBe(result.current.markNoDream);
  });
});
