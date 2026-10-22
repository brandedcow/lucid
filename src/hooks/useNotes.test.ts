import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as storage from '../services/notesStorage';
import { Note, resetCorruptCopyGuard, saveNote } from '../services/notesStorage';
import { __fs } from '../test/fakeFileSystem';
import { NoteView } from '../utils/noteViews';
import { useNotes } from './useNotes';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const INDEX = 'file:///document/notes.json';
const TODAY = '2026-10-18';
const ALL: NoteView = { kind: 'all' };

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
});
afterEach(() => jest.restoreAllMocks());

const seed = async () => {
  await saveNote({ id: '1', body: 'first #alpha' });
  await saveNote({ id: '2', body: '- [ ] second #beta' });
  await saveNote({ id: '3', body: 'third' });
};

const setup = async (view: NoteView = ALL, query?: string) => {
  const hook = await renderHook(
    (props: { view: NoteView; query?: string }) =>
      useNotes({ view: props.view, query: props.query, todayKey: TODAY }),
    { initialProps: { view, query } },
  );
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  return hook;
};
const ids = (list: Note[]) => list.map((n) => n.id).sort();

describe('useNotes', () => {
  it('loads once with trashed notes included and derives the views', async () => {
    await seed();
    await storage.softDeleteNote('3');
    const { result } = await setup();
    expect(ids(result.current.all)).toEqual(['1', '2', '3']);
    expect(ids(result.current.visible)).toEqual(['1', '2']);
    expect(ids(result.current.trashed)).toEqual(['3']);
    expect(result.current.tags).toEqual([
      { tag: 'alpha', count: 1 },
      { tag: 'beta', count: 1 },
    ]);
    expect(result.current.indexStatus).toBe('ok');
    expect(result.current.error).toBeNull();
  });

  it('is empty but loaded when there are no notes', async () => {
    const { result } = await setup();
    expect(result.current.all).toEqual([]);
    expect(result.current.visible).toEqual([]);
  });

  it('changing the view or the query needs no storage read', async () => {
    await seed();
    const spy = jest.spyOn(storage, 'listNotes');
    const { result, rerender } = await setup();
    const calls = spy.mock.calls.length;
    await rerender({ view: { kind: 'todo' }, query: undefined });
    expect(ids(result.current.visible)).toEqual(['2']);
    await rerender({ view: { kind: 'todo' }, query: 'first' });
    expect(ids(result.current.visible)).toEqual(['1']);
    await rerender({ view: { kind: 'tag', tag: 'beta' }, query: '  ' });
    expect(ids(result.current.visible)).toEqual(['2']);
    expect(spy.mock.calls.length).toBe(calls);
  });

  it('pin, trash, restore, deleteForever and emptyTrash update the derived lists', async () => {
    await seed();
    const { result } = await setup();

    await act(async () => {
      expect(await result.current.pin('1', true)).toBe(true);
    });
    expect(result.current.all.find((n) => n.id === '1')?.pinned).toBe(true);

    await act(async () => {
      expect(await result.current.trash('2')).toBe(true);
    });
    expect(ids(result.current.trashed)).toEqual(['2']);
    expect(result.current.tags).toEqual([{ tag: 'alpha', count: 1 }]);
    expect(ids(result.current.visible)).toEqual(['1', '3']);

    await act(async () => {
      expect(await result.current.restore('2')).toBe(true);
    });
    expect(result.current.trashed).toEqual([]);

    await act(async () => {
      await result.current.trash('2');
      expect(await result.current.deleteForever('2')).toBe(true);
    });
    expect(ids(result.current.all)).toEqual(['1', '3']);

    await act(async () => {
      await result.current.trash('3');
    });
    await act(async () => {
      expect(await result.current.emptyTrash()).toEqual({ deleted: 1 });
    });
    expect(ids(result.current.all)).toEqual(['1']);
    expect(result.current.error).toBeNull();
  });

  it('an action that fails returns false, sets error and keeps the data', async () => {
    await seed();
    const { result } = await setup();
    __fs.failNext('write');
    await act(async () => {
      expect(await result.current.trash('1')).toBe(false);
    });
    expect(result.current.error?.action).toBe('trash');
    expect(ids(result.current.visible)).toEqual(['1', '2', '3']);
    await act(async () => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('deleteForever of a live note fails with NOTE_NOT_IN_TRASH and returns false', async () => {
    await seed();
    const { result } = await setup();
    await act(async () => {
      expect(await result.current.deleteForever('1')).toBe(false);
    });
    expect(result.current.error).toMatchObject({
      action: 'deleteForever',
      code: storage.NOTE_NOT_IN_TRASH,
    });
    expect(ids(result.current.all)).toEqual(['1', '2', '3']);
  });

  it('an unknown id on pin counts as nothing to do', async () => {
    await seed();
    const { result } = await setup();
    await act(async () => {
      expect(await result.current.pin('999', true)).toBe(true);
    });
    expect(result.current.error).toBeNull();
  });

  it('emptyTrash reports a partial failure with failedId and sets error', async () => {
    await seed();
    await storage.softDeleteNote('1');
    await storage.softDeleteNote('2');
    const { result } = await setup();
    jest
      .spyOn(storage, 'emptyRecentlyDeleted')
      .mockResolvedValueOnce({ deleted: 1, failedId: '2' });
    await act(async () => {
      expect(await result.current.emptyTrash()).toEqual({ deleted: 1, failedId: '2' });
    });
    expect(result.current.error).toMatchObject({ action: 'emptyTrash', cause: '2' });
  });

  it('an unreadable index reports unreadable, shows no notes and writes nothing', async () => {
    __fs.put(INDEX, '{not json');
    const before = __fs.read(INDEX);
    const { result } = await setup();
    expect(result.current.indexStatus).toBe('unreadable');
    expect(result.current.all).toEqual([]);
    expect(__fs.read(INDEX)).toBe(before);
    expect(__fs.list().filter((u) => u.includes('corrupt'))).toEqual([]);
  });

  it('a failed first load leaves all empty and loaded, with an error', async () => {
    jest.spyOn(storage, 'listNotes').mockRejectedValueOnce(new Error('boom'));
    const { result } = await setup();
    expect(result.current.all).toEqual([]);
    expect(result.current.error?.action).toBe('load');
  });

  it('a failed refresh keeps the previous data', async () => {
    await seed();
    const { result } = await setup();
    jest.spyOn(storage, 'listNotes').mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.all).toHaveLength(3);
    expect(result.current.error?.action).toBe('load');
  });

  it('refresh resolves with the loaded notes, trashed ones included', async () => {
    await seed();
    await storage.softDeleteNote('3');
    const { result } = await setup();
    let loaded: Note[] | null = null;
    await act(async () => {
      loaded = await result.current.refresh();
    });
    expect(ids(loaded as unknown as Note[])).toEqual(['1', '2', '3']);
  });

  it('refresh resolves null when the load failed', async () => {
    await seed();
    const { result } = await setup();
    jest.spyOn(storage, 'listNotes').mockRejectedValueOnce(new Error('boom'));
    let loaded: Note[] | null = [];
    await act(async () => {
      loaded = await result.current.refresh();
    });
    expect(loaded).toBeNull();
  });

  it('refresh resolves null when a newer load superseded it', async () => {
    await seed();
    const { result } = await setup();
    let release!: (list: Note[]) => void;
    const slow = new Promise<Note[]>((res) => {
      release = res;
    });
    const real = storage.listNotes;
    jest.spyOn(storage, 'listNotes').mockReturnValueOnce(slow).mockImplementation(real);
    let first!: Promise<Note[] | null>;
    let second: Note[] | null = null;
    await act(async () => {
      first = result.current.refresh();
      second = await result.current.refresh();
    });
    release([]);
    expect(await first).toBeNull();
    expect(second).not.toBeNull();
  });

  it('ignores a stale slow first load that resolves after a newer refresh', async () => {
    await seed();
    let release!: (list: Note[]) => void;
    const slow = new Promise<Note[]>((res) => {
      release = res;
    });
    const real = storage.listNotes;
    jest.spyOn(storage, 'listNotes').mockReturnValueOnce(slow).mockImplementation(real);
    const { result } = await renderHook(() => useNotes({ view: ALL, todayKey: TODAY }));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.all).toHaveLength(3);
    await act(async () => {
      release([]);
      await slow;
    });
    expect(result.current.all).toHaveLength(3);
  });

  it('does not update state after unmount', async () => {
    await seed();
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    let release!: (list: Note[]) => void;
    const slow = new Promise<Note[]>((res) => {
      release = res;
    });
    jest.spyOn(storage, 'listNotes').mockReturnValueOnce(slow);
    const { result, unmount } = await renderHook(() => useNotes({ view: ALL, todayKey: TODAY }));
    await unmount();
    await act(async () => {
      release([]);
      await slow;
    });
    expect(result.current.loaded).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  });
});
