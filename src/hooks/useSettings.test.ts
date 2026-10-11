import { act, renderHook, waitFor } from '@testing-library/react-native';
import { readSettings, writeSettings } from '../services/settingsStorage';
import { useSettings } from './useSettings';

jest.mock('../services/settingsStorage', () => ({
  DEFAULT_SETTINGS: { autoOpenDreamCapture: true },
  readSettings: jest.fn(),
  writeSettings: jest.fn(),
}));

const mockRead = readSettings as jest.Mock;
const mockWrite = writeSettings as jest.Mock;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockRead.mockReset().mockResolvedValue({ autoOpenDreamCapture: true });
  mockWrite.mockReset().mockResolvedValue(undefined);
});

it('starts unloaded with the default, then loads the stored value', async () => {
  const read = deferred<{ autoOpenDreamCapture: boolean }>();
  mockRead.mockReturnValue(read.promise);
  const { result } = await renderHook(() => useSettings());
  expect(result.current).toMatchObject({ loaded: false, autoOpenDreamCapture: true });
  await act(async () => read.resolve({ autoOpenDreamCapture: false }));
  expect(result.current.loaded).toBe(true);
  expect(result.current.autoOpenDreamCapture).toBe(false);
});

it('is loaded with the default when the read fails', async () => {
  mockRead.mockRejectedValue(new Error('boom'));
  const { result } = await renderHook(() => useSettings());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.autoOpenDreamCapture).toBe(true);
});

it('updates state at once and writes in the background', async () => {
  const { result } = await renderHook(() => useSettings());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await act(async () => result.current.setAutoOpenDreamCapture(false));
  expect(result.current.autoOpenDreamCapture).toBe(false);
  expect(mockWrite).toHaveBeenCalledWith({ autoOpenDreamCapture: false });
});

it('keeps the in-memory value when the write rejects', async () => {
  mockWrite.mockRejectedValue(new Error('disk full'));
  const { result } = await renderHook(() => useSettings());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await act(async () => result.current.setAutoOpenDreamCapture(false));
  expect(result.current.autoOpenDreamCapture).toBe(false);
});

it('a read that finishes after a setter call does not overwrite the newer value', async () => {
  const read = deferred<{ autoOpenDreamCapture: boolean }>();
  mockRead.mockReturnValue(read.promise);
  const { result } = await renderHook(() => useSettings());
  await act(async () => result.current.setAutoOpenDreamCapture(false));
  await act(async () => read.resolve({ autoOpenDreamCapture: true }));
  expect(result.current.loaded).toBe(true);
  expect(result.current.autoOpenDreamCapture).toBe(false);
});

it('does not update after unmount', async () => {
  const read = deferred<{ autoOpenDreamCapture: boolean }>();
  mockRead.mockReturnValue(read.promise);
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const { unmount } = await renderHook(() => useSettings());
  await unmount();
  await act(async () => read.resolve({ autoOpenDreamCapture: false }));
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});
