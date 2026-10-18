import { act, renderHook } from '@testing-library/react-native';
import { AppState, AppStateStatus } from 'react-native';
import * as storage from '../services/notesStorage';
import {
  INDEX_UNREADABLE,
  NOTE_IN_TRASH,
  Note,
  listNotes,
  resetCorruptCopyGuard,
  saveNote,
  softDeleteNote,
} from '../services/notesStorage';
import { __fs } from '../test/fakeFileSystem';
import { useNoteSession } from './useNoteSession';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const INDEX = 'file:///document/notes.json';
const CACHE_A = 'file:///cache/a.m4a';
const CACHE_B = 'file:///cache/b.m4a';
const audio = (name: string) => `file:///document/notes/${name}`;
const legacyAudio = (name: string) => `file:///document/dreams/${name}`;
const stored = (): Note[] => JSON.parse(__fs.read(INDEX) as string).notes;
const storedNote = (id: string) => stored().find((n) => n.id === id);

let appStateHandler: ((s: AppStateStatus) => void) | null;
const removeListener = jest.fn();

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-18T10:00:00Z'));
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
  __fs.put(CACHE_A, 'bytes-a');
  __fs.put(CACHE_B, 'bytes-b');
  appStateHandler = null;
  removeListener.mockReset();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: never) => {
    appStateHandler = h;
    return { remove: removeListener };
  }) as never);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Pending timeouts of 1 s or more: the hook's debounce and max-wait timers (React Native and the
// test library keep shorter ones of their own).
const pending = new Set<unknown>();
const ownTimers = () => pending.size;

const flushMicrotasks = async () => {
  for (let i = 0; i < 200; i += 1) await Promise.resolve();
};
const settle = () => act(flushMicrotasks);
const tick = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
    await flushMicrotasks();
  });

type Opts = Parameters<typeof useNoteSession>[0];
const setup = async (opts?: Opts) => {
  const onCreated = jest.fn();
  const onChange = jest.fn();
  const hook = await renderHook(() => useNoteSession({ onCreated, onChange, ...opts }));
  return { ...hook, onCreated, onChange };
};
type Hook = Awaited<ReturnType<typeof setup>>;
const api = (h: Hook) => h.result.current;

/** Stores an index directly (with audio files), as an earlier version of the app would leave it. */
function putIndex(notes: Note[], files: string[] = []) {
  __fs.put(INDEX, JSON.stringify({ version: 1, notes }));
  for (const f of files) __fs.put(f, 'audio');
}
const base = (id: string, extra: Partial<Note> = {}): Note => ({
  id,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  body: 'text',
  ...extra,
});

/** Makes the next saveNote wait for `release()` before doing its work. */
function gateNextSave() {
  const real = storage.saveNote;
  let release!: () => void;
  const gate = new Promise<void>((res) => {
    release = res;
  });
  const spy = jest.spyOn(storage, 'saveNote').mockImplementationOnce(async (input) => {
    await gate;
    return real(input);
  });
  return { release, spy };
}

describe('autosave timing', () => {
  it('creates the note once, after typing stops for the debounce time and not before', async () => {
    const spy = jest.spyOn(storage, 'saveNote');
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('hello'));
    await tick(999);
    expect(spy).not.toHaveBeenCalled();
    await tick(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(stored()).toHaveLength(1);
    expect(stored()[0].body).toBe('hello');
    expect(api(h).session).toMatchObject({ stored: true, saveState: 'idle' });
    expect(h.onChange).toHaveBeenCalled();
  });

  it('restarts the debounce on every keystroke', async () => {
    const spy = jest.spyOn(storage, 'saveNote');
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('a'));
    await tick(800);
    await act(async () => api(h).setBody('ab'));
    await tick(800);
    await act(async () => api(h).setBody('abc'));
    await tick(999);
    expect(spy).not.toHaveBeenCalled();
    await tick(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(stored()[0].body).toBe('abc');
  });

  it('max wait forces a save during continuous typing', async () => {
    const spy = jest.spyOn(storage, 'saveNote');
    const h = await setup();
    await act(async () => api(h).openNew());
    for (let i = 1; i <= 19; i += 1) {
      await act(async () => api(h).setBody(`t${i}`));
      await tick(500);
    }
    expect(spy).not.toHaveBeenCalled();
    await act(async () => api(h).setBody('t20'));
    await tick(500);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(stored()[0].body).toBe('t20');
  });

  it('honours custom debounce and max wait', async () => {
    const spy = jest.spyOn(storage, 'saveNote');
    const h = await setup({ debounceMs: 50, maxWaitMs: 500 });
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('x'));
    await tick(49);
    expect(spy).not.toHaveBeenCalled();
    await tick(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('calls newNoteId once per openNew', async () => {
    const spy = jest.spyOn(storage, 'newNoteId');
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('a'));
    await tick(1000);
    await act(async () => api(h).setBody('ab'));
    await tick(1000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(stored()).toHaveLength(1);
  });
});

describe('empty notes', () => {
  it('writes nothing for an empty new note; leave says not kept', async () => {
    const spy = jest.spyOn(storage, 'saveNote');
    const h = await setup();
    await act(async () => api(h).openNew());
    let result: { kept: boolean } | undefined;
    await act(async () => {
      result = await api(h).leave();
    });
    expect(result).toEqual({ kept: false });
    expect(spy).not.toHaveBeenCalled();
    expect(__fs.has(INDEX)).toBe(false);
    expect(h.onCreated).not.toHaveBeenCalled();
    expect(api(h).session).toBeNull();
  });

  it('typing then deleting everything before the debounce writes nothing', async () => {
    const spy = jest.spyOn(storage, 'saveNote');
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('a'));
    await act(async () => api(h).setBody(''));
    await tick(5000);
    expect(spy).not.toHaveBeenCalled();
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('a stored note emptied while open is not trashed until leave; typing again saves normally', async () => {
    putIndex([base('5')]);
    const spy = jest.spyOn(storage, 'saveNote');
    const h = await setup();
    await act(async () => void api(h).open(base('5')));
    await act(async () => api(h).setBody(''));
    await tick(2000);
    expect(spy).not.toHaveBeenCalled();
    expect(storedNote('5')?.deletedAt).toBeUndefined();

    await act(async () => api(h).setBody('again'));
    await tick(1000);
    expect(storedNote('5')?.body).toBe('again');
    expect(api(h).session?.saveState).toBe('idle');

    await act(async () => api(h).setBody(''));
    let result: { kept: boolean } | undefined;
    await act(async () => {
      result = await api(h).leave();
    });
    expect(result?.kept).toBe(false);
    expect(storedNote('5')?.deletedAt).toEqual(expect.any(String));
    expect(storedNote('5')?.body).toBe('again');
  });
});

describe('onCreated', () => {
  it('fires once at the first non-empty save, not on later saves', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('one'));
    await tick(1000);
    expect(h.onCreated).toHaveBeenCalledTimes(1);
    expect(h.onCreated.mock.calls[0][0]).toMatchObject({ body: 'one' });
    await act(async () => api(h).setBody('two'));
    await tick(1000);
    expect(h.onCreated).toHaveBeenCalledTimes(1);
  });

  it('never fires for an opened note', async () => {
    putIndex([base('5')]);
    const h = await setup();
    await act(async () => void api(h).open(base('5')));
    await act(async () => api(h).setBody('changed'));
    await tick(1000);
    expect(storedNote('5')?.body).toBe('changed');
    expect(h.onCreated).not.toHaveBeenCalled();
  });

  it('open refuses a note in Recently Deleted', async () => {
    const h = await setup();
    let ok: boolean | undefined;
    await act(async () => {
      ok = api(h).open(base('5', { deletedAt: '2026-10-02T00:00:00.000Z' }));
    });
    expect(ok).toBe(false);
    expect(api(h).session).toBeNull();
  });
});

describe('single flight', () => {
  it('edits during an in-flight save give exactly one follow-up save and lose nothing', async () => {
    const { release, spy } = gateNextSave();
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('a'));
    await tick(1000); // save 1 starts and waits at the gate
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => api(h).setBody('ab'));
    await act(async () => api(h).setBody('abc'));
    await tick(1000); // debounce fires while save 1 is still in flight
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await flushMicrotasks();
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(stored()[0].body).toBe('abc');
    await tick(5000);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(api(h).session?.saveState).toBe('idle');
  });
});

describe('leave', () => {
  it('flushes the latest text; a second call returns the same promise', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('pending text'));
    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    await act(async () => {
      p1 = api(h).leave();
      p2 = api(h).leave();
      expect(p1).toBe(p2);
      await p1;
    });
    expect(stored()[0].body).toBe('pending text');
    expect(await p1).toEqual({ kept: true });
    expect(ownTimers()).toBe(0);
  });

  it('setters are no-ops while leaving', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('first'));
    await act(async () => {
      const p = api(h).leave();
      api(h).setBody('too late');
      await p;
    });
    expect(stored()[0].body).toBe('first');
  });
});

describe('unmount and background', () => {
  it('unmount flushes pending text without a state-update warning', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('typed just before leaving'));
    await h.unmount();
    await settle();
    expect(stored()[0].body).toBe('typed just before leaving');
    expect(errors).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalled();
    expect(ownTimers()).toBe(0);
  });

  it('going to the background saves immediately and does not leave', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('bg'));
    await act(async () => {
      appStateHandler?.('background');
      await flushMicrotasks();
    });
    expect(stored()[0].body).toBe('bg');
    expect(api(h).session).not.toBeNull();
    expect(ownTimers()).toBe(0);
  });

  it('inactive saves too', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('inactive'));
    await act(async () => {
      appStateHandler?.('inactive');
      await flushMicrotasks();
    });
    expect(stored()[0].body).toBe('inactive');
  });
});

describe('recordings', () => {
  it('attach saves at once, copies into notes/, becomes persisted and removes the cache file', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    let local = '';
    await act(async () => {
      local = api(h).attachRecording({ uri: CACHE_A, durationMs: 1200, waveform: [0.5, 1] });
      await flushMicrotasks();
    });
    const id = api(h).session!.id;
    expect(local).not.toBe('');
    expect(storedNote(id)?.recordings).toEqual([
      { fileName: `${id}.m4a`, durationMs: 1200, waveform: [0.5, 1] },
    ]);
    expect(__fs.read(audio(`${id}.m4a`))).toBe('bytes-a');
    expect(__fs.has(CACHE_A)).toBe(false);
    expect(api(h).session?.recordings[0]).toMatchObject({
      id: local,
      persisted: true,
      fileName: `${id}.m4a`,
      uri: audio(`${id}.m4a`),
    });
    expect(h.onCreated).toHaveBeenCalledTimes(1);
  });

  it('two recordings keep their order', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => {
      api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
      api(h).attachRecording({ uri: CACHE_B, durationMs: 2 });
      await flushMicrotasks();
    });
    const id = api(h).session!.id;
    expect(storedNote(id)?.recordings?.map((r) => r.durationMs)).toEqual([1, 2]);
    expect(api(h).session?.recordings.map((r) => r.durationMs)).toEqual([1, 2]);
    expect(__fs.read(audio(`${id}.m4a`))).toBe('bytes-a');
    expect(__fs.read(audio(`${id}-1.m4a`))).toBe('bytes-b');
  });

  describe('close and restore', () => {
    const withVoice = async () => {
      const h = await setup();
      await act(async () => api(h).openNew());
      await act(async () => {
        api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
        await flushMicrotasks();
      });
      return h;
    };

    it('closing holds in the index and keeps the file; restoring clears it', async () => {
      const h = await withVoice();
      const id = api(h).session!.id;
      const rec = api(h).session!.recordings[0].id;
      await act(async () => {
        api(h).closeRecording(rec);
        await flushMicrotasks();
      });
      expect(storedNote(id)?.recordings?.[0].heldAt).toEqual(expect.any(String));
      expect(__fs.has(audio(`${id}.m4a`))).toBe(true);
      await act(async () => {
        api(h).restoreRecording(rec);
        await flushMicrotasks();
      });
      expect(storedNote(id)?.recordings?.[0].heldAt).toBeUndefined();
    });

    it('rapid close, restore, close ends held with only the necessary calls', async () => {
      const h = await withVoice();
      const id = api(h).session!.id;
      const rec = api(h).session!.recordings[0].id;
      const hold = jest.spyOn(storage, 'holdRecording');
      const release = jest.spyOn(storage, 'releaseRecording');
      await act(async () => {
        api(h).closeRecording(rec);
        api(h).restoreRecording(rec);
        api(h).closeRecording(rec);
        await flushMicrotasks();
      });
      expect(storedNote(id)?.recordings?.[0].heldAt).toEqual(expect.any(String));
      expect(hold).toHaveBeenCalledTimes(1);
      expect(release).not.toHaveBeenCalled();
    });

    it('closing during the first save ends held after that save', async () => {
      const { release } = gateNextSave();
      const h = await setup();
      await act(async () => api(h).openNew());
      let rec = '';
      await act(async () => {
        rec = api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
        await flushMicrotasks();
      });
      await act(async () => api(h).closeRecording(rec));
      await act(async () => {
        release();
        await flushMicrotasks();
      });
      const id = api(h).session!.id;
      expect(storedNote(id)?.recordings?.[0].heldAt).toEqual(expect.any(String));
      expect(api(h).session?.recordings[0]).toMatchObject({ persisted: true, removed: true });
    });

    it('a failed hold shows the voice note again and reports the error', async () => {
      const h = await withVoice();
      const rec = api(h).session!.recordings[0].id;
      __fs.failNext('write');
      await act(async () => {
        api(h).closeRecording(rec);
        await flushMicrotasks();
      });
      expect(api(h).session?.recordings[0].removed).toBe(false);
      expect(api(h).session?.saveState).toBe('error');
    });
  });
});

describe('leave deletes closed voice notes', () => {
  it('deletes a held audio file and its record at leave', async () => {
    putIndex([base('7', { recordings: [{ fileName: 'v.m4a', durationMs: 5 }] })], [audio('v.m4a')]);
    const h = await setup();
    await act(async () => void api(h).open((await listNotes())[0]));
    await act(async () => {
      api(h).closeRecording(api(h).session!.recordings[0].id);
      await flushMicrotasks();
    });
    expect(__fs.has(audio('v.m4a'))).toBe(true);
    await act(async () => void (await api(h).leave()));
    expect(__fs.has(audio('v.m4a'))).toBe(false);
    expect(storedNote('7')?.recordings).toEqual([]);
    expect(storedNote('7')?.deletedAt).toBeUndefined();
  });

  it('keeps a file another note still references', async () => {
    putIndex(
      [
        base('7', { recordings: [{ fileName: 'shared.m4a', durationMs: 5 }] }),
        base('8', { recordings: [{ fileName: 'shared.m4a', durationMs: 5 }] }),
      ],
      [audio('shared.m4a')],
    );
    const h = await setup();
    await act(async () => void api(h).open(storedNote('7')!));
    await act(async () => {
      api(h).closeRecording(api(h).session!.recordings[0].id);
      await flushMicrotasks();
    });
    await act(async () => void (await api(h).leave()));
    expect(__fs.has(audio('shared.m4a'))).toBe(true);
    expect(storedNote('7')?.recordings).toEqual([]);
  });

  it('a legacy-origin voice note stays held and its file stays', async () => {
    putIndex(
      [base('7', { recordings: [{ fileName: 'old.m4a', durationMs: 5, origin: 'legacy' }] })],
      [legacyAudio('old.m4a')],
    );
    const h = await setup();
    await act(async () => void api(h).open(storedNote('7')!));
    await act(async () => {
      api(h).closeRecording(api(h).session!.recordings[0].id);
      await flushMicrotasks();
    });
    await act(async () => void (await api(h).leave()));
    expect(__fs.has(legacyAudio('old.m4a'))).toBe(true);
    expect(storedNote('7')?.recordings?.[0].heldAt).toEqual(expect.any(String));
  });

  it('a note whose only voice note was closed and whose body is blank goes to Recently Deleted', async () => {
    putIndex(
      [base('7', { body: '', recordings: [{ fileName: 'v.m4a', durationMs: 5 }] })],
      [audio('v.m4a')],
    );
    const h = await setup();
    await act(async () => void api(h).open(storedNote('7')!));
    await act(async () => {
      api(h).closeRecording(api(h).session!.recordings[0].id);
      await flushMicrotasks();
    });
    let result: { kept: boolean } | undefined;
    await act(async () => {
      result = await api(h).leave();
    });
    expect(result?.kept).toBe(false);
    expect(__fs.has(audio('v.m4a'))).toBe(false);
    expect(storedNote('7')?.deletedAt).toEqual(expect.any(String));
  });
});

describe('unsaved cache files at leave', () => {
  it('a closed never-saved recording: file kept until leave ends, deleted then', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    __fs.failNext('write');
    let rec = '';
    await act(async () => {
      rec = api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
      await flushMicrotasks();
    });
    expect(api(h).session?.saveState).toBe('error');
    expect(api(h).session?.recordings[0].persisted).toBe(false);
    await act(async () => api(h).closeRecording(rec));
    expect(__fs.has(CACHE_A)).toBe(true);
    let result: { kept: boolean } | undefined;
    await act(async () => {
      result = await api(h).leave();
    });
    expect(result?.kept).toBe(false);
    expect(__fs.has(CACHE_A)).toBe(false);
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('a failed save at leave deletes nothing and keeps the session open; leaving again succeeds', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    __fs.failNext('write');
    let rec = '';
    await act(async () => {
      rec = api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
      await flushMicrotasks();
    });
    await act(async () => api(h).closeRecording(rec));
    await act(async () => api(h).setBody('keep me'));
    __fs.failNext('write');
    let result: { kept: boolean; error?: unknown } | undefined;
    await act(async () => {
      result = await api(h).leave();
    });
    expect(result?.kept).toBe(true);
    expect(result?.error).toBeDefined();
    expect(api(h).session).not.toBeNull();
    expect(api(h).session?.saveState).toBe('error');
    expect(api(h).session?.body).toBe('keep me');
    expect(__fs.has(CACHE_A)).toBe(true);

    await act(async () => {
      result = await api(h).leave();
    });
    expect(result).toEqual({ kept: true });
    expect(api(h).session).toBeNull();
    expect(__fs.has(CACHE_A)).toBe(false);
    expect(stored()[0].body).toBe('keep me');
    expect(ownTimers()).toBe(0);
  });

  it('leave with discardUnsaved just clears and leaves cache files alone', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    __fs.failNext('write');
    await act(async () => {
      api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
      await flushMicrotasks();
    });
    let result: { kept: boolean } | undefined;
    await act(async () => {
      result = await api(h).leave({ discardUnsaved: true });
    });
    expect(result).toEqual({ kept: false });
    expect(api(h).session).toBeNull();
    expect(__fs.has(CACHE_A)).toBe(true);
  });
});

describe('failures', () => {
  it('an index write failure during autosave sets error, keeps the text, and the next edit saves', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('a'));
    __fs.failNext('write');
    await tick(1000);
    expect(api(h).session).toMatchObject({ saveState: 'error', body: 'a', stored: false });
    expect(__fs.has(INDEX)).toBe(false);
    await act(async () => api(h).setBody('ab'));
    await tick(1000);
    expect(stored()[0].body).toBe('ab');
    expect(api(h).session?.saveState).toBe('idle');
    expect(h.onCreated).toHaveBeenCalledTimes(1);
  });

  it('a copy failing at the 2nd of 2 recordings rolls back, stays unpersisted, and a retry works', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    // The second copy fails every time (the second queued save request retries once).
    __fs.failWhen('copy', (uri) => uri === CACHE_B);
    await act(async () => {
      api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
      api(h).attachRecording({ uri: CACHE_B, durationMs: 2 });
      await flushMicrotasks();
    });
    expect(api(h).session?.saveState).toBe('error');
    expect(api(h).session?.recordings.every((r) => !r.persisted)).toBe(true);
    expect(__fs.has(CACHE_A)).toBe(true);
    expect(__fs.has(CACHE_B)).toBe(true);
    expect(__fs.list().filter((u) => u.startsWith('file:///document/notes/'))).toEqual([]);

    __fs.clearFailures();
    await act(async () => api(h).setBody('retry'));
    await tick(1000);
    expect(api(h).session?.recordings.every((r) => r.persisted)).toBe(true);
    expect(stored()[0].recordings).toHaveLength(2);
    expect(__fs.has(CACHE_A)).toBe(false);
  });

  it('an unreadable index gives an error with its code and writes nothing', async () => {
    __fs.put(INDEX, '{broken');
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('text'));
    await tick(1000);
    expect(api(h).session?.saveState).toBe('error');
    expect(api(h).session?.error?.code).toBe(INDEX_UNREADABLE);
    expect(__fs.read(INDEX)).toBe('{broken');
    expect(api(h).session?.body).toBe('text');
  });

  it('a note trashed from elsewhere while open: no retry loop, leave says not kept', async () => {
    putIndex([base('5')]);
    const h = await setup();
    await act(async () => void api(h).open(storedNote('5')!));
    await softDeleteNote('5');
    const spy = jest.spyOn(storage, 'saveNote');
    await act(async () => api(h).setBody('edit'));
    await tick(1000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(api(h).session?.saveState).toBe('error');
    expect(api(h).session?.error?.code).toBe(NOTE_IN_TRASH);
    await act(async () => api(h).setBody('edit more'));
    await tick(20000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(api(h).session?.saveState).toBe('error');
    let result: { kept: boolean } | undefined;
    await act(async () => {
      result = await api(h).leave();
    });
    expect(result?.kept).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(storedNote('5')?.body).toBe('text');
    expect(ownTimers()).toBe(0);
  });
});

describe('voice transcript text', () => {
  const attached = async (extra: { voiceTranscript?: string } = {}) => {
    const h = await setup();
    await act(async () => api(h).openNew());
    let rec = '';
    await act(async () => {
      rec = api(h).attachRecording({ uri: CACHE_A, durationMs: 1, ...extra });
      await flushMicrotasks();
    });
    return { h, rec };
  };

  it('text arriving after persist is saved as a metadata update only', async () => {
    const { h, rec } = await attached();
    const spy = jest.spyOn(storage, 'saveNote');
    await act(async () => api(h).setRecordingText(rec, 'hello there'));
    await tick(1000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({
      addRecordings: [],
      recordingTexts: [{ fileName: expect.stringMatching(/\.m4a$/), text: 'hello there' }],
    });
    expect(storedNote(api(h).session!.id)?.recordings?.[0].voiceTranscript).toBe('hello there');
  });

  it('text arriving mid-save is re-sent by a follow-up save', async () => {
    const { release } = gateNextSave();
    const h = await setup();
    await act(async () => api(h).openNew());
    let rec = '';
    await act(async () => {
      rec = api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
      await flushMicrotasks();
    });
    await act(async () => api(h).setRecordingText(rec, 'late words'));
    await act(async () => {
      release();
      await flushMicrotasks();
    });
    expect(storedNote(api(h).session!.id)?.recordings?.[0].voiceTranscript).toBeUndefined();
    await tick(1000);
    expect(storedNote(api(h).session!.id)?.recordings?.[0].voiceTranscript).toBe('late words');
  });

  it('text given with the recording is not re-sent', async () => {
    const { h } = await attached({ voiceTranscript: 'given' });
    expect(storedNote(api(h).session!.id)?.recordings?.[0].voiceTranscript).toBe('given');
    const spy = jest.spyOn(storage, 'saveNote');
    await act(async () => api(h).setBody('more'));
    await tick(1000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].recordingTexts).toEqual([]);
  });

  it('an unchanged transcript triggers no save', async () => {
    const { h, rec } = await attached({ voiceTranscript: 'same' });
    const spy = jest.spyOn(storage, 'saveNote');
    await act(async () => api(h).setRecordingText(rec, 'same'));
    await tick(5000);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('trash', () => {
  it('saves pending text, moves the note to Recently Deleted, keeps held files, clears', async () => {
    putIndex(
      [
        base('7', {
          recordings: [
            { fileName: 'a.m4a', durationMs: 1 },
            { fileName: 'b.m4a', durationMs: 1 },
          ],
        }),
      ],
      [audio('a.m4a'), audio('b.m4a')],
    );
    const h = await setup();
    await act(async () => void api(h).open(storedNote('7')!));
    await act(async () => api(h).setBody('pending'));
    await act(async () => api(h).closeRecording(api(h).session!.recordings[0].id));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await api(h).trash();
    });
    expect(ok).toBe(true);
    expect(storedNote('7')).toMatchObject({ body: 'pending', deletedAt: expect.any(String) });
    expect(storedNote('7')?.recordings?.[0].heldAt).toEqual(expect.any(String));
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect(__fs.has(audio('b.m4a'))).toBe(true);
    expect(api(h).session).toBeNull();
    expect(ownTimers()).toBe(0);
  });

  it('a never-stored note is simply cleared; its cache files go', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    __fs.failNext('write');
    let rec = '';
    await act(async () => {
      rec = api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
      await flushMicrotasks();
    });
    await act(async () => api(h).closeRecording(rec));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await api(h).trash();
    });
    expect(ok).toBe(true);
    expect(api(h).session).toBeNull();
    expect(__fs.has(INDEX)).toBe(false);
    expect(__fs.has(CACHE_A)).toBe(false);
  });
});

describe('pin', () => {
  it('pins a stored note at once', async () => {
    putIndex([base('5')]);
    const h = await setup();
    await act(async () => void api(h).open(storedNote('5')!));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await api(h).setPinned(true);
    });
    expect(ok).toBe(true);
    expect(storedNote('5')?.pinned).toBe(true);
    expect(api(h).session?.pinned).toBe(true);
  });

  it('a not-yet-stored note is pinned right after its first save', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => void (await api(h).setPinned(true)));
    expect(api(h).session?.pinned).toBe(true);
    expect(__fs.has(INDEX)).toBe(false);
    await act(async () => api(h).setBody('hello'));
    await tick(1000);
    expect(stored()[0]).toMatchObject({ body: 'hello', pinned: true });
  });

  describe('a failed pin and the save-error state', () => {
    const openStored = async () => {
      putIndex([base('5')]);
      const h = await setup();
      await act(async () => void api(h).open(storedNote('5')!));
      return h;
    };
    const failPinOnce = () =>
      jest.spyOn(storage, 'setPinned').mockRejectedValueOnce(new Error('pin failed'));
    const pin = async (h: Hook) => {
      let ok: boolean | undefined;
      await act(async () => {
        ok = await api(h).setPinned(true);
      });
      return ok;
    };

    it('a pin that fails and then succeeds on retry leaves the state idle', async () => {
      const h = await openStored();
      failPinOnce();
      expect(await pin(h)).toBe(false);
      expect(api(h).session?.saveState).toBe('error');
      expect(await pin(h)).toBe(true);
      expect(api(h).session?.saveState).toBe('idle');
      expect(storedNote('5')?.pinned).toBe(true);
    });

    it('keeps the error when a body save failed after the pin failure', async () => {
      const h = await openStored();
      failPinOnce();
      await pin(h);
      jest.spyOn(storage, 'saveNote').mockRejectedValueOnce(new Error('disk full'));
      await act(async () => api(h).setBody('unsaved edit'));
      await tick(1000);
      expect(api(h).session?.saveState).toBe('error');
      expect(await pin(h)).toBe(true);
      expect(api(h).session?.saveState).toBe('error');
    });

    it('keeps the error when the note was trashed elsewhere', async () => {
      const h = await openStored();
      failPinOnce();
      await pin(h);
      await softDeleteNote('5');
      await act(async () => api(h).setBody('edited after trash'));
      await tick(1000);
      expect(api(h).session?.error?.code).toBe(NOTE_IN_TRASH);
      jest.spyOn(storage, 'setPinned').mockResolvedValueOnce(undefined as never);
      expect(await pin(h)).toBe(true);
      expect(api(h).session?.saveState).toBe('error');
      expect(api(h).session?.error?.code).toBe(NOTE_IN_TRASH);
    });

    it('keeps the error when a recording is still waiting to be saved', async () => {
      const h = await openStored();
      failPinOnce();
      await pin(h);
      jest.spyOn(storage, 'saveNote').mockRejectedValueOnce(new Error('disk full'));
      await act(async () => {
        api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
        await flushMicrotasks();
      });
      await tick(1000);
      expect(api(h).session?.saveState).toBe('error');
      expect(await pin(h)).toBe(true);
      expect(api(h).session?.saveState).toBe('error');
    });

    it('a pin failure followed by a good flush does not taint a later unrelated error', async () => {
      const h = await openStored();
      failPinOnce();
      await pin(h);
      await act(async () => api(h).setBody('edit one'));
      await act(async () => void (await api(h).flush()));
      expect(api(h).session?.saveState).toBe('idle');
      jest.spyOn(storage, 'saveNote').mockRejectedValueOnce(new Error('disk full'));
      await act(async () => api(h).setBody('edit two'));
      await tick(1000);
      expect(api(h).session?.saveState).toBe('error');
      expect(await pin(h)).toBe(true);
      expect(api(h).session?.saveState).toBe('error');
    });
  });
});

describe('timers', () => {
  it('no timers are left after leave', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    for (let i = 0; i < 5; i += 1) await act(async () => api(h).setBody(`x${i}`));
    await act(async () => void (await api(h).leave()));
    expect(ownTimers()).toBe(0);
  });

  it('a note created by this session is readable from storage after everything', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    await act(async () => api(h).setBody('final'));
    await act(async () => void (await api(h).leave()));
    expect((await saveNote({ id: 'zz', body: 'x' })).note).not.toBeNull();
    expect((await listNotes()).map((n) => n.body).sort()).toEqual(['final', 'x']);
  });
});

// Intended difference (architect ruling for chunk 7a-1, point 5): `trash()` is the user choosing to
// delete the note, so cache recordings that nothing can reference any more are discarded; `leave()`
// on a note trashed elsewhere is not that choice, and the cache files may be the only copy.
describe('cache files: trash() clears them, leave() keeps them (intended)', () => {
  /** A stored note trashed elsewhere, then edited with an unsaved cache recording attached. */
  async function trashedElsewhereWithCacheRecording() {
    putIndex([base('5')]);
    const h = await setup();
    await act(async () => void api(h).open(storedNote('5')!));
    await softDeleteNote('5');
    await act(async () => {
      api(h).setBody('edited after the note was trashed');
      api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
      await flushMicrotasks();
    });
    expect(api(h).session?.saveState).toBe('error');
    expect(api(h).session?.error?.code).toBe(NOTE_IN_TRASH);
    expect(__fs.has(CACHE_A)).toBe(true);
    return h;
  }

  it('trash() after NOTE_IN_TRASH discards the cache files (the user chose to delete)', async () => {
    const h = await trashedElsewhereWithCacheRecording();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await api(h).trash();
    });
    expect(ok).toBe(true);
    expect(api(h).session).toBeNull();
    expect(__fs.has(CACHE_A)).toBe(false);
  });

  it('leave() after NOTE_IN_TRASH keeps the cache files (they may be the only copy)', async () => {
    const h = await trashedElsewhereWithCacheRecording();
    let result: { kept: boolean } | undefined;
    await act(async () => {
      result = await api(h).leave();
    });
    expect(result).toEqual({ kept: false });
    expect(api(h).session).toBeNull();
    expect(__fs.has(CACHE_A)).toBe(true);
  });

  it('trash() whose own save fails (note not in the trash) leaves the cache file and the session', async () => {
    const h = await setup();
    await act(async () => api(h).openNew());
    __fs.failNext('write');
    await act(async () => {
      api(h).attachRecording({ uri: CACHE_A, durationMs: 1 });
      await flushMicrotasks();
    });
    expect(api(h).session?.saveState).toBe('error');
    __fs.failNext('write');
    let ok: boolean | undefined;
    await act(async () => {
      ok = await api(h).trash();
    });
    expect(ok).toBe(false);
    expect(api(h).session).not.toBeNull();
    expect(__fs.has(CACHE_A)).toBe(true);
  });
});
