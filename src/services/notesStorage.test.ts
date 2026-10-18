import * as fakeFs from '../test/fakeFileSystem';
import {
  Note,
  NOTE_IN_TRASH,
  NOTE_NOT_FOUND,
  appendImported,
  getIndexStatus,
  listNotes,
  newNoteId,
  resetCorruptCopyGuard,
  restoreNote,
  saveNote,
  setPinned,
  softDeleteNote,
} from './notesStorage';

// Node's fs, for the source audit below (the project has no Node type definitions).
const nodeFs = jest.requireActual('fs') as { readFileSync(path: string, encoding: 'utf8'): string };

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const INDEX = 'file:///document/notes.json';
const TMP = 'file:///document/notes.json.tmp';
const RECORDING = 'file:///cache/recording.m4a';
const isTmp = (uri: string) => uri === TMP;

const stored = (): { version: number; notes: Note[] } => JSON.parse(__fs.read(INDEX) as string);
const note = (extra: Record<string, unknown> = {}): Note =>
  ({
    id: '1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    body: 'old',
    ...extra,
  }) as Note;
/** Puts a ready-made index on the fake disk. */
const putIndex = (...notes: unknown[]) => __fs.put(INDEX, JSON.stringify({ version: 1, notes }));
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return 'did not throw';
};

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  jest.useFakeTimers().setSystemTime(new Date('2026-10-04T08:00:00Z'));
});

afterEach(() => jest.useRealTimers());

describe('saveNote', () => {
  it('creates a note in a versioned index and leaves no temp file behind', async () => {
    const { note: saved, added } = await saveNote({ id: '10', body: 'First thought' });

    expect(saved).toEqual({
      id: '10',
      createdAt: '2026-10-04T08:00:00.000Z',
      updatedAt: '2026-10-04T08:00:00.000Z',
      body: 'First thought',
    });
    expect(added).toEqual([]);
    expect(stored()).toEqual({ version: 1, notes: [saved] });
    expect(__fs.has(TMP)).toBe(false);
    expect(await listNotes()).toEqual([saved]);
  });

  it('stores the body exactly as given (no trimming)', async () => {
    await saveNote({ id: '10', body: '  # Title \n\ntext  \n' });
    expect(stored().notes[0].body).toBe('  # Title \n\ntext  \n');
  });

  it('updates by id: new body and updatedAt, same createdAt, one record', async () => {
    await saveNote({ id: '10', body: 'one' });
    jest.setSystemTime(new Date('2026-10-04T09:00:00Z'));
    const { note: saved } = await saveNote({ id: '10', body: 'two' });

    expect(saved).toMatchObject({
      createdAt: '2026-10-04T08:00:00.000Z',
      updatedAt: '2026-10-04T09:00:00.000Z',
      body: 'two',
    });
    expect(stored().notes).toHaveLength(1);
  });

  it('writes nothing for an equal body: no write, no updatedAt bump', async () => {
    await saveNote({ id: '10', body: 'same' });
    const before = __fs.read(INDEX);
    // Any further write would now fail, so a pass proves there was none.
    __fs.failWhen('write', () => true);
    jest.setSystemTime(new Date('2026-10-04T09:00:00Z'));

    const { note: again, added } = await saveNote({ id: '10', body: 'same' });

    expect(again?.updatedAt).toBe('2026-10-04T08:00:00.000Z');
    expect(added).toEqual([]);
    expect(__fs.read(INDEX)).toBe(before);
    // Control: a changed body does hit the write that is failing.
    await expect(saveNote({ id: '10', body: 'different' })).rejects.toThrow('write failed');
  });

  it.each(['', '../x', 'a/b', 'a b', 'a.b', 'é'])(
    'refuses the id %j before writing',
    async (id) => {
      await expect(saveNote({ id, body: 'text' })).rejects.toThrow('Invalid note id');
      expect(__fs.list()).toEqual([]);
    },
  );

  it('refuses a body that is not text', async () => {
    await expect(saveNote({ id: '1', body: undefined as unknown as string })).rejects.toThrow(
      'must be text',
    );
    expect(__fs.list()).toEqual([]);
  });

  it('keeps unknown fields of the note and the other records through an update', async () => {
    const odd = { weird: true }; // no id: kept raw
    putIndex(note({ id: '5', futureField: { a: 1 }, pinned: true }), odd, 'junk', null);

    await saveNote({ id: '5', body: 'changed' });

    const { notes } = stored();
    expect(notes[0]).toMatchObject({
      id: '5',
      body: 'changed',
      futureField: { a: 1 },
      pinned: true,
    });
    expect(notes.slice(1)).toEqual([odd, 'junk', null]);
  });

  it('adds new notes after the stored ones, keeping the order of the index', async () => {
    await saveNote({ id: '1', body: 'a' });
    await saveNote({ id: '2', body: 'b' });
    await saveNote({ id: '1', body: 'a2' });
    expect(stored().notes.map((n) => n.id)).toEqual(['1', '2']);
  });

  describe('empty rule', () => {
    it.each(['', '   \n\t '])(
      'a new note with body %j is not created and nothing is written',
      async (body) => {
        expect(await saveNote({ id: '9', body })).toEqual({ note: null, added: [] });
        expect(__fs.list()).toEqual([]);
      },
    );

    it('a new empty save does not touch an existing index either', async () => {
      await saveNote({ id: '1', body: 'a' });
      const before = __fs.read(INDEX);
      __fs.failWhen('write', () => true);
      expect(await saveNote({ id: '9', body: '' })).toEqual({ note: null, added: [] });
      expect(__fs.read(INDEX)).toBe(before);
    });

    it('emptying an existing note moves it to Recently Deleted and keeps its text', async () => {
      await saveNote({ id: '1', body: 'precious words' });
      jest.setSystemTime(new Date('2026-10-04T09:00:00Z'));

      const { note: trashed } = await saveNote({ id: '1', body: '  ' });

      expect(trashed).toMatchObject({ id: '1', body: 'precious words' });
      expect(trashed?.deletedAt).toBe('2026-10-04T09:00:00.000Z');
      expect(await listNotes()).toEqual([]);
      expect(await listNotes({ includeDeleted: true })).toEqual([trashed]);
      // And Restore brings it back with the words.
      expect((await restoreNote('1')).body).toBe('precious words');
    });

    it('an existing note emptied while it has a stored voice note is not trashed', async () => {
      __fs.put(RECORDING, 'bytes');
      await saveNote({
        id: '1',
        body: 'words',
        addRecordings: [{ uri: RECORDING, durationMs: 5 }],
      });

      const { note: kept } = await saveNote({ id: '1', body: '' });

      expect(kept?.deletedAt).toBeUndefined();
      expect(kept?.body).toBe('');
      expect(kept?.recordings).toHaveLength(1);
      expect(await listNotes()).toHaveLength(1);
    });

    it('a note with only a held voice note is not empty', async () => {
      putIndex(
        note({
          id: '1',
          body: 'x',
          recordings: [{ fileName: '1.m4a', durationMs: 1, heldAt: 'h' }],
        }),
      );
      const { note: kept } = await saveNote({ id: '1', body: '' });
      expect(kept?.deletedAt).toBeUndefined();
      expect(await listNotes()).toHaveLength(1);
    });

    it('a new note with no text but a recording is created', async () => {
      __fs.put(RECORDING, 'bytes');
      const { note: created } = await saveNote({
        id: '3',
        body: '',
        addRecordings: [{ uri: RECORDING, durationMs: 7 }],
      });
      expect(created?.recordings).toHaveLength(1);
      expect(stored().notes).toHaveLength(1);
    });

    it('an existing empty note that is saved empty again is left alone', async () => {
      putIndex(note({ id: '1', body: '' }));
      const before = __fs.read(INDEX);
      __fs.failWhen('write', () => true);
      const { note: same } = await saveNote({ id: '1', body: '' });
      expect(same?.deletedAt).toBeUndefined();
      expect(__fs.read(INDEX)).toBe(before);
    });
  });

  describe('Recently Deleted', () => {
    it('throws NOTE_IN_TRASH for a trashed note and writes nothing', async () => {
      await saveNote({ id: '1', body: 'a' });
      await softDeleteNote('1');
      const before = __fs.read(INDEX);
      __fs.put(RECORDING, 'bytes');

      expect(await codeOf(saveNote({ id: '1', body: 'late autosave' }))).toBe(NOTE_IN_TRASH);
      expect(
        await codeOf(
          saveNote({ id: '1', body: 'a', addRecordings: [{ uri: RECORDING, durationMs: 1 }] }),
        ),
      ).toBe(NOTE_IN_TRASH);

      expect(__fs.read(INDEX)).toBe(before);
      expect(__fs.has(RECORDING)).toBe(true);
      expect(__fs.list().some((u) => u.includes('/notes/'))).toBe(false);
    });
  });

  describe('concurrency', () => {
    it('two saves of one note both apply, in call order', async () => {
      await saveNote({ id: '1', body: 'start' });
      await Promise.all([
        saveNote({ id: '1', body: 'first' }),
        saveNote({ id: '1', body: 'second' }),
      ]);
      expect(stored().notes).toHaveLength(1);
      expect(stored().notes[0].body).toBe('second');
    });

    it('saves of different notes started together lose nothing', async () => {
      await Promise.all(
        ['1', '2', '3', '4', '5', '6'].map((id) => saveNote({ id, body: `note ${id}` })),
      );
      expect(
        stored()
          .notes.map((n) => n.id)
          .sort(),
      ).toEqual(['1', '2', '3', '4', '5', '6']);
    });

    it('a save and a pin and a soft delete started together all land', async () => {
      await saveNote({ id: '1', body: 'a' });
      await saveNote({ id: '2', body: 'b' });
      await saveNote({ id: '3', body: 'c' });
      await Promise.all([
        saveNote({ id: '1', body: 'a edited' }),
        setPinned('2', true),
        softDeleteNote('3'),
        saveNote({ id: '4', body: 'd' }),
      ]);
      const byId = Object.fromEntries(stored().notes.map((n) => [n.id, n]));
      expect(byId['1'].body).toBe('a edited');
      expect(byId['2'].pinned).toBe(true);
      expect(byId['3'].deletedAt).toBeDefined();
      expect(byId['4'].body).toBe('d');
    });

    it('a failed save does not stop the queue', async () => {
      await saveNote({ id: '1', body: 'a' });
      __fs.failNext('write', new Error('disk full'));
      const results = await Promise.allSettled([
        saveNote({ id: '1', body: 'fails' }),
        saveNote({ id: '2', body: 'works' }),
      ]);
      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('fulfilled');
      expect(stored().notes.map((n) => [n.id, n.body])).toEqual([
        ['1', 'a'],
        ['2', 'works'],
      ]);
    });
  });
});

describe('listNotes', () => {
  it('lists newest updatedAt first and hides Recently Deleted by default', async () => {
    putIndex(
      note({ id: 'a', updatedAt: '2026-10-01T00:00:00.000Z' }),
      note({ id: 'b', updatedAt: '2026-10-03T00:00:00.000Z' }),
      note({
        id: 'c',
        updatedAt: '2026-10-02T00:00:00.000Z',
        deletedAt: '2026-10-03T00:00:00.000Z',
      }),
    );
    expect((await listNotes()).map((n) => n.id)).toEqual(['b', 'a']);
    expect((await listNotes({ includeDeleted: true })).map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('is empty without an index and writes nothing', async () => {
    expect(await listNotes()).toEqual([]);
    expect(__fs.list()).toEqual([]);
  });

  it('hides records without a string id but keeps them in the file', async () => {
    putIndex(note({ id: 'a' }), { body: 'no id' }, { id: 7 }, 'junk', null);
    expect((await listNotes({ includeDeleted: true })).map((n) => n.id)).toEqual(['a']);
    await saveNote({ id: 'a', body: 'changed' });
    expect(stored().notes).toHaveLength(5);
  });

  it('shows a missing body as empty and drops an unusable waveform, without changing the file', async () => {
    putIndex(
      note({
        id: 'a',
        body: undefined,
        recordings: [
          { fileName: 'a.m4a', durationMs: 1, waveform: [5] },
          { fileName: 'b.m4a', durationMs: 1, waveform: [0.5] },
        ],
      }),
    );
    const before = __fs.read(INDEX);
    const [shown] = await listNotes();
    expect(shown.body).toBe('');
    expect(shown.recordings).toEqual([
      { fileName: 'a.m4a', durationMs: 1 },
      { fileName: 'b.m4a', durationMs: 1, waveform: [0.5] },
    ]);
    expect(__fs.read(INDEX)).toBe(before);
  });
});

describe('softDeleteNote, restoreNote, setPinned', () => {
  beforeEach(async () => {
    await saveNote({ id: '1', body: 'a' });
    jest.setSystemTime(new Date('2026-10-04T09:00:00Z'));
  });

  it('soft delete sets deletedAt only and returns the note; updatedAt is not touched', async () => {
    const trashed = await softDeleteNote('1');
    expect(trashed.deletedAt).toBe('2026-10-04T09:00:00.000Z');
    expect(trashed.updatedAt).toBe('2026-10-04T08:00:00.000Z');
    expect(stored().notes[0]).toEqual(trashed);
  });

  it('soft delete keeps every file, audio included', async () => {
    __fs.put(RECORDING, 'bytes');
    await saveNote({ id: '2', body: 'v', addRecordings: [{ uri: RECORDING, durationMs: 1 }] });
    const files = __fs.list();
    __fs.failWhen('delete', () => true); // any delete attempt would throw and fail the call
    await softDeleteNote('2');
    expect(__fs.has('file:///document/notes/2.m4a')).toBe(true);
    for (const uri of files) expect(__fs.has(uri)).toBe(true);
  });

  it('soft delete twice keeps the first deletedAt and does not write the second time', async () => {
    await softDeleteNote('1');
    jest.setSystemTime(new Date('2026-10-04T10:00:00Z'));
    __fs.failWhen('write', () => true);
    const again = await softDeleteNote('1');
    expect(again.deletedAt).toBe('2026-10-04T09:00:00.000Z');
  });

  it('restore clears deletedAt and the note is listed again', async () => {
    await softDeleteNote('1');
    const restored = await restoreNote('1');
    expect('deletedAt' in restored).toBe(false);
    expect((await listNotes()).map((n) => n.id)).toEqual(['1']);
    // Saving works again.
    expect((await saveNote({ id: '1', body: 'b' })).note?.body).toBe('b');
  });

  it('restore of a note that is not in Recently Deleted changes nothing', async () => {
    const before = __fs.read(INDEX);
    __fs.failWhen('write', () => true);
    expect((await restoreNote('1')).body).toBe('a');
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('pin and unpin do not change updatedAt', async () => {
    const pinned = await setPinned('1', true);
    expect(pinned.pinned).toBe(true);
    expect(pinned.updatedAt).toBe('2026-10-04T08:00:00.000Z');
    const unpinned = await setPinned('1', false);
    expect('pinned' in unpinned).toBe(false);
    expect(unpinned.updatedAt).toBe('2026-10-04T08:00:00.000Z');
  });

  it('pinning to the current value writes nothing', async () => {
    await setPinned('1', true);
    __fs.failWhen('write', () => true);
    expect((await setPinned('1', true)).pinned).toBe(true);
    await expect(setPinned('1', false)).rejects.toThrow('write failed');
  });

  it('a trashed note keeps its pin through delete and restore, and can be pinned in the trash', async () => {
    await setPinned('1', true);
    const trashed = await softDeleteNote('1');
    expect(trashed.pinned).toBe(true);
    expect((await restoreNote('1')).pinned).toBe(true);
    await softDeleteNote('1');
    expect((await setPinned('1', false)).deletedAt).toBeDefined();
  });

  it.each([
    ['softDeleteNote', () => softDeleteNote('nope')],
    ['restoreNote', () => restoreNote('nope')],
    ['setPinned', () => setPinned('nope', true)],
  ])('%s throws NOTE_NOT_FOUND for an unknown id and writes nothing', async (_name, run) => {
    const before = __fs.read(INDEX);
    __fs.failWhen('write', () => true);
    expect(await codeOf(run())).toBe(NOTE_NOT_FOUND);
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('keeps unknown fields and other records through each of them', async () => {
    putIndex(note({ id: '1', extra: 1 }), { raw: true });
    await setPinned('1', true);
    await softDeleteNote('1');
    await restoreNote('1');
    expect(stored().notes).toEqual([note({ id: '1', extra: 1, pinned: true }), { raw: true }]);
  });
});

describe('appendImported', () => {
  const imported = (id: string, extra: Record<string, unknown> = {}) =>
    note({
      id,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
      body: `imported ${id}`,
      ...extra,
    });

  it('adds the records with their own timestamps in one write', async () => {
    await saveNote({ id: '1', body: 'mine' });
    __fs.clearFailures();
    // Exactly one tmp write for the whole batch.
    __fs.failNth('write', 2);

    expect(await appendImported([imported('100'), imported('101')])).toEqual({ added: 2 });

    const notes = stored().notes;
    expect(notes.map((n) => n.id)).toEqual(['1', '100', '101']);
    expect(notes[1]).toEqual(imported('100'));
    expect(notes[1].updatedAt).toBe('2020-01-02T00:00:00.000Z');
  });

  it('is idempotent: a second run adds nothing and writes nothing', async () => {
    await appendImported([imported('100')]);
    const before = __fs.read(INDEX);
    __fs.failWhen('write', () => true);
    expect(await appendImported([imported('100')])).toEqual({ added: 0 });
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('skips ids already stored without overwriting them, and repeated ids in the batch', async () => {
    await saveNote({ id: '100', body: 'mine' });
    expect(
      await appendImported([imported('100'), imported('7'), imported('7', { body: 'dup' })]),
    ).toEqual({
      added: 1,
    });
    const byId = Object.fromEntries(stored().notes.map((n) => [n.id, n]));
    expect(byId['100'].body).toBe('mine');
    expect(byId['7'].body).toBe('imported 7');
  });

  it('keeps legacy recordings and unknown fields as given', async () => {
    const legacy = imported('9', {
      recordings: [{ fileName: 'd.m4a', durationMs: 3, origin: 'legacy' }],
      whatever: 'kept',
    });
    await appendImported([legacy]);
    expect(stored().notes[0]).toEqual(legacy);
  });

  it('an empty batch writes nothing', async () => {
    expect(await appendImported([])).toEqual({ added: 0 });
    expect(__fs.list()).toEqual([]);
  });

  it('refuses an invalid id before writing anything', async () => {
    await expect(appendImported([imported('1'), imported('../2')])).rejects.toThrow(
      'Invalid note id',
    );
    await expect(appendImported([{ body: 'no id' } as unknown as Note])).rejects.toThrow('Invalid');
    expect(__fs.list()).toEqual([]);
  });

  it('a failed write leaves the previous list', async () => {
    await saveNote({ id: '1', body: 'a' });
    __fs.failWhen('write', isTmp);
    await expect(appendImported([imported('100')])).rejects.toThrow('write failed');
    expect(stored().notes.map((n) => n.id)).toEqual(['1']);
  });
});

describe('newNoteId and getIndexStatus', () => {
  it('returns plain, unique ids even within one millisecond', () => {
    const ids = Array.from({ length: 50 }, () => newNoteId());
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('reports ok for a missing or good index and unreadable for a damaged one, writing nothing', async () => {
    expect(await getIndexStatus()).toBe('ok');
    putIndex(note());
    expect(await getIndexStatus()).toBe('ok');
    __fs.put(INDEX, '{"version":1,"notes":[');
    expect(await getIndexStatus()).toBe('unreadable');
    expect(__fs.list()).toEqual([INDEX]);
  });
});

describe('delete audit', () => {
  // The safety rules allow exactly two deleting calls in this module (see CLAUDE.md): this save's
  // own copies on a failed commit, and a cache source after a successful commit.
  it('has exactly two delete calls and no other way to remove files', () => {
    const source = nodeFs.readFileSync(`${process.cwd()}/src/services/notesStorage.ts`, 'utf8');
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(code.match(/\.delete\(/g)).toHaveLength(2);
    expect(code).not.toMatch(/\.remove\(|unlink|deleteAsync|rmdir|\.rm\(/);
  });
});
