import { act, renderHook, waitFor } from '@testing-library/react-native';
import { deleteDream, getIndexStatus, listDreams } from '../services/dreamStorage';
import { Dream } from '../types/dream';
import { useDreamLibrary } from './useDreamLibrary';

jest.mock('../services/dreamStorage', () => ({
  listDreams: jest.fn(),
  getIndexStatus: jest.fn(),
  deleteDream: jest.fn(),
}));

const mockList = listDreams as jest.Mock;
const mockStatus = getIndexStatus as jest.Mock;
const mockDelete = deleteDream as jest.Mock;

const dream = (id: string) => ({ id, createdAt: '2026-10-01T00:00:00.000Z' }) as Dream;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([]);
  mockStatus.mockReset().mockResolvedValue('ok');
  mockDelete.mockReset().mockResolvedValue(undefined);
});

describe('useDreamLibrary', () => {
  it('is null while loading, then the stored dreams', async () => {
    const load = deferred<Dream[]>();
    mockList.mockReturnValue(load.promise);
    const { result } = await renderHook(() => useDreamLibrary());
    expect(result.current.dreams).toBeNull();
    await act(async () => {
      load.resolve([dream('a')]);
      await load.promise;
    });
    await waitFor(() => expect(result.current.dreams).toEqual([dream('a')]));
    expect(result.current.indexStatus).toBe('ok');
  });

  it('refresh reloads and updates', async () => {
    mockList.mockResolvedValueOnce([dream('a')]);
    const { result } = await renderHook(() => useDreamLibrary());
    await waitFor(() => expect(result.current.dreams).toHaveLength(1));
    mockList.mockResolvedValueOnce([dream('b'), dream('a')]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.dreams?.map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('reports an unreadable index', async () => {
    mockStatus.mockResolvedValue('unreadable');
    const { result } = await renderHook(() => useDreamLibrary());
    await waitFor(() => expect(result.current.indexStatus).toBe('unreadable'));
    expect(result.current.dreams).toEqual([]);
  });

  it('keeps refresh stable across renders', async () => {
    const { result, rerender } = await renderHook(() => useDreamLibrary());
    const first = result.current.refresh;
    await rerender({});
    expect(result.current.refresh).toBe(first);
  });

  it('ignores a stale response that arrives after a newer one', async () => {
    const slow = deferred<Dream[]>();
    mockList.mockReturnValueOnce(slow.promise);
    const { result } = await renderHook(() => useDreamLibrary()); // request 1 (slow)
    mockList.mockResolvedValueOnce([dream('new')]);
    await act(async () => {
      await result.current.refresh(); // request 2
    });
    expect(result.current.dreams?.map((d) => d.id)).toEqual(['new']);
    await act(async () => {
      slow.resolve([dream('old')]);
      await slow.promise;
    });
    expect(result.current.dreams?.map((d) => d.id)).toEqual(['new']);
  });

  it('two overlapping refreshes: the later call wins even if it finishes first', async () => {
    const { result } = await renderHook(() => useDreamLibrary());
    await waitFor(() => expect(result.current.dreams).toEqual([]));
    const first = deferred<Dream[]>();
    const second = deferred<Dream[]>();
    mockList.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await act(async () => {
      const p1 = result.current.refresh();
      const p2 = result.current.refresh();
      second.resolve([dream('second')]);
      await p2;
      first.resolve([dream('first')]);
      await p1;
    });
    expect(result.current.dreams?.map((d) => d.id)).toEqual(['second']);
  });

  it('does not update after unmount', async () => {
    const slow = deferred<Dream[]>();
    mockList.mockReturnValueOnce(slow.promise);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = await renderHook(() => useDreamLibrary());
    await unmount();
    await act(async () => {
      slow.resolve([dream('late')]);
      await slow.promise;
    });
    expect(result.current.dreams).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('keeps the previous data when a refresh fails', async () => {
    mockList.mockResolvedValueOnce([dream('a')]);
    const { result } = await renderHook(() => useDreamLibrary());
    await waitFor(() => expect(result.current.dreams).toHaveLength(1));
    mockList.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.dreams?.map((d) => d.id)).toEqual(['a']);
  });

  it('falls back to an empty list when the first load fails', async () => {
    mockList.mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useDreamLibrary());
    await waitFor(() => expect(result.current.dreams).toEqual([]));
    expect(result.current.indexStatus).toBe('ok');
  });

  describe('remove', () => {
    async function loaded(ids: string[]) {
      mockList.mockResolvedValueOnce(ids.map(dream));
      const view = await renderHook(() => useDreamLibrary());
      await waitFor(() => expect(view.result.current.dreams).toHaveLength(ids.length));
      return view;
    }

    it('drops the dream immediately, then refreshes', async () => {
      const { result } = await loaded(['a', 'b']);
      const reload = deferred<Dream[]>();
      mockList.mockReturnValueOnce(reload.promise);
      let done!: Promise<void>;
      await act(async () => {
        done = result.current.remove('a');
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockDelete).toHaveBeenCalledWith('a');
      expect(result.current.dreams?.map((d) => d.id)).toEqual(['b']);
      expect(mockList).toHaveBeenCalledTimes(2);
      await act(async () => {
        reload.resolve([dream('b')]);
        await done;
      });
      expect(result.current.dreams?.map((d) => d.id)).toEqual(['b']);
    });

    it('keeps the dream gone and resolves when the refresh fails', async () => {
      const { result } = await loaded(['a', 'b']);
      mockList.mockRejectedValueOnce(new Error('boom'));
      await act(async () => {
        await expect(result.current.remove('a')).resolves.toBeUndefined();
      });
      expect(result.current.dreams?.map((d) => d.id)).toEqual(['b']);
    });

    it('rethrows a storage error, keeps the list and tries a refresh', async () => {
      const { result } = await loaded(['a']);
      const failure = new Error('INDEX_UNREADABLE');
      mockDelete.mockRejectedValueOnce(failure);
      mockList.mockResolvedValueOnce([dream('a')]);
      let caught: unknown;
      await act(async () => {
        await result.current.remove('a').catch((e) => {
          caught = e;
        });
      });
      expect(caught).toBe(failure);
      expect(mockList).toHaveBeenCalledTimes(2);
      expect(result.current.dreams?.map((d) => d.id)).toEqual(['a']);
    });

    it('still throws the original error when the best-effort refresh fails too', async () => {
      const { result } = await loaded(['a']);
      const failure = new Error('original');
      mockDelete.mockRejectedValueOnce(failure);
      mockList.mockRejectedValueOnce(new Error('refresh boom'));
      let caught: unknown;
      await act(async () => {
        await result.current.remove('a').catch((e) => {
          caught = e;
        });
      });
      expect(caught).toBe(failure);
      expect(result.current.dreams?.map((d) => d.id)).toEqual(['a']);
    });

    it('a refresh started before remove cannot bring the dream back', async () => {
      const { result } = await loaded(['a', 'b']);
      const stale = deferred<Dream[]>();
      mockList.mockReturnValueOnce(stale.promise);
      let pending!: Promise<void>;
      await act(async () => {
        pending = result.current.refresh();
      });
      await act(async () => {
        await result.current.remove('a'); // its own refresh uses the default mock ([])
      });
      await act(async () => {
        stale.resolve([dream('a'), dream('b')]);
        await pending;
      });
      expect(result.current.dreams?.map((d) => d.id)).not.toContain('a');
    });

    it('does not update state after unmount', async () => {
      const { result, unmount } = await loaded(['a']);
      const gate = deferred<void>();
      mockDelete.mockReturnValueOnce(gate.promise);
      const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
      let done!: Promise<void>;
      await act(async () => {
        done = result.current.remove('a');
      });
      await unmount();
      await act(async () => {
        gate.resolve();
        await done;
      });
      expect(result.current.dreams?.map((d) => d.id)).toEqual(['a']);
      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
    });
  });
});
