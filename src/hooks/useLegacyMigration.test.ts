import { act, renderHook, waitFor } from '@testing-library/react-native';
import { migrateLegacyDreams, type MigrationResult } from '../services/legacyImport';
import { useLegacyMigration } from './useLegacyMigration';

jest.mock('../services/legacyImport', () => ({ migrateLegacyDreams: jest.fn() }));

const mockMigrate = migrateLegacyDreams as jest.Mock;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const imported = (added: number): MigrationResult => ({
  status: 'imported',
  read: added,
  added,
  alreadyPresent: 0,
  skipped: [],
  droppedRecordings: [],
  usedBackup: false,
  markerWritten: true,
});

beforeEach(() => {
  mockMigrate.mockReset().mockResolvedValue({ status: 'already-done' });
});

describe('useLegacyMigration', () => {
  it('runs once on mount and is unsettled until the run finishes', async () => {
    const run = deferred<MigrationResult>();
    mockMigrate.mockReturnValue(run.promise);
    const { result } = await renderHook(() => useLegacyMigration());
    expect(result.current.settled).toBe(false);
    expect(result.current.result).toBeNull();
    await act(async () => {
      run.resolve({ status: 'no-source' });
      await run.promise;
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.result).toEqual({ status: 'no-source' });
    expect(mockMigrate).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ status: 'already-done' }],
    [{ status: 'no-source' }],
    [{ status: 'source-unreadable' }],
    [{ status: 'notes-unreadable' }],
    [{ status: 'failed' }],
    [imported(2)],
  ] as [MigrationResult][])('settles with status %j', async (outcome) => {
    mockMigrate.mockResolvedValue(outcome);
    const { result } = await renderHook(() => useLegacyMigration());
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.result).toEqual(outcome);
  });

  it('settles as failed when the service rejects', async () => {
    mockMigrate.mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useLegacyMigration());
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.result).toEqual({ status: 'failed' });
  });

  it('settles as failed when the service throws synchronously', async () => {
    mockMigrate.mockImplementation(() => {
      throw new Error('boom');
    });
    const { result } = await renderHook(() => useLegacyMigration());
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.result).toEqual({ status: 'failed' });
  });

  it('calls onImported only when notes were added', async () => {
    const onImported = jest.fn();
    mockMigrate.mockResolvedValue(imported(3));
    await renderHook(() => useLegacyMigration(onImported));
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));

    const none = jest.fn();
    mockMigrate.mockResolvedValue(imported(0));
    const { result } = await renderHook(() => useLegacyMigration(none));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(none).not.toHaveBeenCalled();

    for (const status of ['already-done', 'no-source', 'failed'] as const) {
      const cb = jest.fn();
      mockMigrate.mockResolvedValue({ status });
      const r = await renderHook(() => useLegacyMigration(cb));
      await waitFor(() => expect(r.result.current.settled).toBe(true));
      expect(cb).not.toHaveBeenCalled();
    }
  });

  it('does not break when onImported throws', async () => {
    mockMigrate.mockResolvedValue(imported(1));
    const { result } = await renderHook(() =>
      useLegacyMigration(() => {
        throw new Error('cb');
      }),
    );
    await waitFor(() => expect(result.current.settled).toBe(true));
  });

  it('retry runs again, goes unsettled meanwhile, and reports the new result', async () => {
    mockMigrate.mockResolvedValueOnce({ status: 'failed' });
    const { result } = await renderHook(() => useLegacyMigration());
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.result).toEqual({ status: 'failed' });

    const second = deferred<MigrationResult>();
    mockMigrate.mockReturnValueOnce(second.promise);
    await act(async () => {
      result.current.retry();
    });
    expect(result.current.settled).toBe(false);
    expect(result.current.result).toBeNull();
    await act(async () => {
      second.resolve(imported(1));
      await second.promise;
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.result).toMatchObject({ status: 'imported', added: 1 });
    expect(mockMigrate).toHaveBeenCalledTimes(2);
  });

  it('an older run does not overwrite a newer one', async () => {
    const first = deferred<MigrationResult>();
    const second = deferred<MigrationResult>();
    mockMigrate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = await renderHook(() => useLegacyMigration());
    await act(async () => {
      result.current.retry();
    });
    await act(async () => {
      second.resolve({ status: 'no-source' });
      await second.promise;
    });
    await waitFor(() => expect(result.current.settled).toBe(true));
    await act(async () => {
      first.resolve({ status: 'failed' });
      await first.promise;
    });
    expect(result.current.result).toEqual({ status: 'no-source' });
  });

  it('does not update or call back after unmount', async () => {
    const run = deferred<MigrationResult>();
    mockMigrate.mockReturnValue(run.promise);
    const onImported = jest.fn();
    const { unmount } = await renderHook(() => useLegacyMigration(onImported));
    unmount();
    await act(async () => {
      run.resolve(imported(2));
      await run.promise;
    });
    expect(onImported).not.toHaveBeenCalled();
  });
});
