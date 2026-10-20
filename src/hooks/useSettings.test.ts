import { act, renderHook, waitFor } from '@testing-library/react-native';
import { readSettings, writeSettings } from '../services/settingsStorage';
import { useSettings } from './useSettings';

jest.mock('../services/settingsStorage', () => ({
  DEFAULT_SETTINGS: { autoOpenNewNote: true, onlineTranscription: false, tagSort: 'alpha' },
  readSettings: jest.fn(),
  writeSettings: jest.fn(),
}));

type Stored = {
  autoOpenNewNote: boolean;
  onlineTranscription: boolean;
  tagSort: 'alpha' | 'count';
};

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
  mockRead
    .mockReset()
    .mockResolvedValue({ autoOpenNewNote: true, onlineTranscription: false, tagSort: 'alpha' });
  mockWrite.mockReset().mockResolvedValue(undefined);
});

it('starts unloaded with the default, then loads the stored value', async () => {
  const read = deferred<Stored>();
  mockRead.mockReturnValue(read.promise);
  const { result } = await renderHook(() => useSettings());
  expect(result.current).toMatchObject({ loaded: false, autoOpenNewNote: true });
  await act(async () =>
    read.resolve({ autoOpenNewNote: false, onlineTranscription: false, tagSort: 'alpha' }),
  );
  expect(result.current.loaded).toBe(true);
  expect(result.current.autoOpenNewNote).toBe(false);
});

it('is loaded with the default when the read fails', async () => {
  mockRead.mockRejectedValue(new Error('boom'));
  const { result } = await renderHook(() => useSettings());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.autoOpenNewNote).toBe(true);
});

it('updates state at once and writes in the background', async () => {
  const { result } = await renderHook(() => useSettings());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await act(async () => result.current.setAutoOpenNewNote(false));
  expect(result.current.autoOpenNewNote).toBe(false);
  expect(mockWrite).toHaveBeenCalledWith({ autoOpenNewNote: false });
});

it('keeps the in-memory value when the write rejects', async () => {
  mockWrite.mockRejectedValue(new Error('disk full'));
  const { result } = await renderHook(() => useSettings());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await act(async () => result.current.setAutoOpenNewNote(false));
  expect(result.current.autoOpenNewNote).toBe(false);
});

it('a read that finishes after a setter call does not overwrite the newer value', async () => {
  const read = deferred<Stored>();
  mockRead.mockReturnValue(read.promise);
  const { result } = await renderHook(() => useSettings());
  await act(async () => result.current.setAutoOpenNewNote(false));
  await act(async () =>
    read.resolve({ autoOpenNewNote: true, onlineTranscription: false, tagSort: 'alpha' }),
  );
  expect(result.current.loaded).toBe(true);
  expect(result.current.autoOpenNewNote).toBe(false);
});

it('does not update after unmount', async () => {
  const read = deferred<Stored>();
  mockRead.mockReturnValue(read.promise);
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const { unmount } = await renderHook(() => useSettings());
  await unmount();
  await act(async () =>
    read.resolve({ autoOpenNewNote: false, onlineTranscription: false, tagSort: 'alpha' }),
  );
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

describe('onlineTranscription', () => {
  it('is false until loaded, then the stored value', async () => {
    const read = deferred<Stored>();
    mockRead.mockReturnValue(read.promise);
    const { result } = await renderHook(() => useSettings());
    expect(result.current.onlineTranscription).toBe(false);
    await act(async () =>
      read.resolve({ autoOpenNewNote: true, onlineTranscription: true, tagSort: 'alpha' }),
    );
    expect(result.current.onlineTranscription).toBe(true);
  });

  it('is false when the read fails', async () => {
    mockRead.mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.onlineTranscription).toBe(false);
  });

  it('updates at once, writes in the background, and keeps the value when the write rejects', async () => {
    mockWrite.mockRejectedValue(new Error('disk full'));
    const { result } = await renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => result.current.setOnlineTranscription(true));
    expect(result.current.onlineTranscription).toBe(true);
    expect(mockWrite).toHaveBeenCalledWith({ onlineTranscription: true });
  });

  it('a late read does not overwrite a newer choice, and the other key is unaffected', async () => {
    const read = deferred<Stored>();
    mockRead.mockReturnValue(read.promise);
    const { result } = await renderHook(() => useSettings());
    await act(async () => result.current.setOnlineTranscription(true));
    await act(async () =>
      read.resolve({ autoOpenNewNote: false, onlineTranscription: false, tagSort: 'alpha' }),
    );
    expect(result.current.onlineTranscription).toBe(true);
    expect(result.current.autoOpenNewNote).toBe(false);
  });
});

describe('autoOpenNewNote aliases', () => {
  it('mirror the stored value and the old name', async () => {
    mockRead.mockResolvedValue({
      autoOpenNewNote: false,
      onlineTranscription: false,
      tagSort: 'alpha',
    });
    const { result } = await renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.autoOpenNewNote).toBe(false);
    expect(result.current.autoOpenNewNote).toBe(result.current.autoOpenNewNote);
  });

  it('setAutoOpenNewNote updates both names and writes the on-disk key', async () => {
    const { result } = await renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      result.current.setAutoOpenNewNote(false);
    });
    expect(result.current.autoOpenNewNote).toBe(false);
    expect(result.current.autoOpenNewNote).toBe(false);
    expect(mockWrite).toHaveBeenCalledWith({ autoOpenNewNote: false });
  });

  it('the old setter updates the new name too', async () => {
    const { result } = await renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      result.current.setAutoOpenNewNote(false);
    });
    expect(result.current.autoOpenNewNote).toBe(false);
  });
});

describe('tagSort', () => {
  it('is alpha until loaded, then the stored value', async () => {
    const read = deferred<Stored>();
    mockRead.mockReturnValue(read.promise);
    const { result } = await renderHook(() => useSettings());
    expect(result.current.tagSort).toBe('alpha');
    await act(async () =>
      read.resolve({ autoOpenNewNote: true, onlineTranscription: false, tagSort: 'count' }),
    );
    expect(result.current.tagSort).toBe('count');
  });

  it('is alpha when the read fails', async () => {
    mockRead.mockRejectedValue(new Error('boom'));
    const { result } = await renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.tagSort).toBe('alpha');
  });

  it('updates at once, writes only tagSort, and keeps the value when the write rejects', async () => {
    mockWrite.mockRejectedValue(new Error('disk full'));
    const { result } = await renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => result.current.setTagSort('count'));
    expect(result.current.tagSort).toBe('count');
    expect(mockWrite).toHaveBeenCalledWith({ tagSort: 'count' });
  });

  it('a late read does not overwrite a newer choice, and the other keys still load', async () => {
    const read = deferred<Stored>();
    mockRead.mockReturnValue(read.promise);
    const { result } = await renderHook(() => useSettings());
    await act(async () => result.current.setTagSort('count'));
    await act(async () =>
      read.resolve({ autoOpenNewNote: false, onlineTranscription: true, tagSort: 'alpha' }),
    );
    expect(result.current.tagSort).toBe('count');
    expect(result.current.autoOpenNewNote).toBe(false);
    expect(result.current.onlineTranscription).toBe(true);
  });

  it('setting other keys does not stop a late tagSort read from applying', async () => {
    const read = deferred<Stored>();
    mockRead.mockReturnValue(read.promise);
    const { result } = await renderHook(() => useSettings());
    await act(async () => result.current.setOnlineTranscription(true));
    await act(async () =>
      read.resolve({ autoOpenNewNote: true, onlineTranscription: false, tagSort: 'count' }),
    );
    expect(result.current.tagSort).toBe('count');
  });
});
