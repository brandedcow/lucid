import * as fakeFs from '../test/fakeFileSystem';
import {
  INDEX_UNREADABLE,
  Note,
  appendImported,
  getIndexStatus,
  holdRecording,
  isIndexUnreadableError,
  listNotes,
  releaseRecording,
  resetCorruptCopyGuard,
  restoreNote,
  saveNote,
  setPinned,
  softDeleteNote,
} from './notesStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

// The module keeps no copy of the index (only the corrupt-copy guard and the write queue), so a
// plain read after a failure is what a restarted app would see; the tests do not reload modules.

const { __fs, File } = fakeFs;
const INDEX = 'file:///document/notes.json';
const TMP = 'file:///document/notes.json.tmp';
const BAK = 'file:///document/notes.json.bak';
const RECORDING = 'file:///cache/recording.m4a';
const isTmp = (uri: string) => uri === TMP;
const isIndex = (uri: string) => uri === INDEX;
const corruptCopies = () => __fs.list().filter((u) => /\/notes\.corrupt-\d+\.json$/.test(u));

const body = (text: string) => JSON.stringify({ version: 1, notes: [note(text)] });
const note = (text: string, id = '1'): Note => ({
  id,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  body: text,
});
const idsOf = async () => (await listNotes({ includeDeleted: true })).map((n) => n.id);
const bodiesOf = async () => (await listNotes({ includeDeleted: true })).map((n) => n.body);

/** Two saves, so the index holds notes 1 and 2 and the backup holds the index before note 2. */
async function seed() {
  await saveNote({ id: '1', body: 'one' });
  await saveNote({ id: '2', body: 'two' });
}

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  jest.useFakeTimers().setSystemTime(new Date('2026-10-04T08:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('commit order', () => {
  it('keeps the previous index in the backup and replaces the index by moving the temp file', async () => {
    await seed();
    expect(JSON.parse(__fs.read(BAK) as string).notes.map((n: Note) => n.id)).toEqual(['1']);
    expect(JSON.parse(__fs.read(INDEX) as string).notes.map((n: Note) => n.id)).toEqual(['1', '2']);
    expect(__fs.has(TMP)).toBe(false);
  });

  it('does not copy a zero-length or damaged index over the backup', async () => {
    await seed();
    const backup = __fs.read(BAK);
    __fs.put(INDEX, ''); // reads as missing; the backup is the base
    await saveNote({ id: '3', body: 'three' });
    expect(__fs.read(BAK)).toBe(backup);
  });
});

describe('temp file write fails', () => {
  it.each([
    ['throws', undefined],
    ['leaves a partial file', 'partial' as const],
    ['leaves an empty file', 'empty' as const],
  ])(
    '%s: index and backup untouched, save throws, copies rolled back, retry works',
    async (_n, leave) => {
      await seed();
      const index = __fs.read(INDEX);
      const backup = __fs.read(BAK);
      __fs.put(RECORDING, 'audio');
      __fs.failWhen('write', isTmp, new Error('disk full'), { leave });

      await expect(
        saveNote({ id: '3', body: 'three', addRecordings: [{ uri: RECORDING, durationMs: 1 }] }),
      ).rejects.toThrow('disk full');

      expect(__fs.read(INDEX)).toBe(index);
      expect(__fs.read(BAK)).toBe(backup);
      expect(__fs.has('file:///document/notes/3.m4a')).toBe(false); // this save's copy is gone
      expect(__fs.has(RECORDING)).toBe(true); // the cache source stays for the retry
      expect((await idsOf()).sort()).toEqual(['1', '2']);

      __fs.clearFailures();
      const { added } = await saveNote({
        id: '3',
        body: 'three',
        addRecordings: [{ uri: RECORDING, durationMs: 1 }],
      });
      expect(added.map((r) => r.fileName)).toEqual(['3.m4a']);
      expect((await idsOf()).sort()).toEqual(['1', '2', '3']);
    },
  );
});

describe('temp file read-back fails', () => {
  it('a read-back that cannot be parsed aborts before the index or backup change', async () => {
    await seed();
    const index = __fs.read(INDEX);
    const backup = __fs.read(BAK);
    __fs.failWhen('json', isTmp, new Error('bad parse'));

    await expect(saveNote({ id: '3', body: 'x' })).rejects.toThrow('could not be written');

    expect(__fs.read(INDEX)).toBe(index);
    expect(__fs.read(BAK)).toBe(backup);
    expect(__fs.has(TMP)).toBe(true); // left in place: never deleted, overwritten by the next save
    expect(await idsOf()).toHaveLength(2);
  });

  it('a read-back with a different note count aborts the same way', async () => {
    await seed();
    const index = __fs.read(INDEX);
    const realJson = File.prototype.json;
    jest.spyOn(File.prototype, 'json').mockImplementation(async function (this: fakeFs.File) {
      return this.uri === TMP ? { version: 1, notes: [] } : realJson.call(this);
    });

    await expect(saveNote({ id: '3', body: 'x' })).rejects.toThrow('could not be written');

    expect(__fs.read(INDEX)).toBe(index);
  });

  it('a temp file that read back fine is not left behind as the base after a later good save', async () => {
    await seed();
    __fs.failWhen('json', isTmp);
    await expect(saveNote({ id: '3', body: 'x' })).rejects.toThrow();
    __fs.clearFailures();
    await saveNote({ id: '4', body: 'y' });
    expect(__fs.has(TMP)).toBe(false);
    expect((await idsOf()).sort()).toEqual(['1', '2', '4']);
  });
});

describe('backup copy fails', () => {
  it('a failing copy does not block the save; the old backup is kept', async () => {
    await seed();
    const backup = __fs.read(BAK);
    __fs.failWhen('copy', isIndex, new Error('copy failed'));

    await saveNote({ id: '3', body: 'three' });

    expect((await idsOf()).sort()).toEqual(['1', '2', '3']);
    expect(__fs.read(BAK)).toBe(backup);
  });

  it('a copy that deletes the backup (remove-then-copy) does not block the save either', async () => {
    await seed();
    __fs.failWhen('copy', isIndex, new Error('copy failed'), { leave: 'missing' });

    await saveNote({ id: '3', body: 'three' });

    expect(__fs.has(BAK)).toBe(false);
    expect((await idsOf()).sort()).toEqual(['1', '2', '3']);
  });
});

describe('temp move fails', () => {
  /** Makes the next move of the temp file fail after doing `damage` to the destination. */
  function failMoveAfter(damage: (destination: fakeFs.File) => void, times = 1) {
    const realMove = File.prototype.move;
    let calls = 0;
    jest.spyOn(File.prototype, 'move').mockImplementation(async function (
      this: fakeFs.File,
      destination: fakeFs.File,
      opts?: { overwrite?: boolean },
    ) {
      calls += 1;
      if (calls > times) return realMove.call(this, destination, opts);
      damage(destination);
      throw new Error('move failed');
    });
  }

  it('fails leaving the old index: the save throws and nothing changes', async () => {
    await seed();
    const index = __fs.read(INDEX);
    __fs.failNext('move');

    await expect(saveNote({ id: '3', body: 'three' })).rejects.toThrow('move failed');

    expect(__fs.read(INDEX)).toBe(index);
    expect((await idsOf()).sort()).toEqual(['1', '2']);
    // The next save goes through.
    await saveNote({ id: '3', body: 'three' });
    expect((await idsOf()).sort()).toEqual(['1', '2', '3']);
  });

  it('fails leaving the index missing: the previous list is put back, the failed save is not applied', async () => {
    await seed();
    failMoveAfter((destination) => destination.delete());

    await expect(saveNote({ id: '3', body: 'three' })).rejects.toThrow('move failed');

    expect(__fs.has(INDEX)).toBe(true); // second move succeeded
    expect((await idsOf()).sort()).toEqual(['1', '2']);
  });

  it('fails leaving the index zero-length: the previous list is put back', async () => {
    await seed();
    failMoveAfter((destination) => __fs.put(destination.uri, ''));

    await expect(saveNote({ id: '3', body: 'three' })).rejects.toThrow('move failed');

    expect((await idsOf()).sort()).toEqual(['1', '2']);
    expect(__fs.read(INDEX)).not.toBe('');
  });

  it('when the move keeps failing, a read recovers the previous list from the temp file', async () => {
    await seed();
    failMoveAfter((destination) => {
      if (destination.exists) destination.delete();
    }, 5);

    await expect(saveNote({ id: '3', body: 'three' })).rejects.toThrow('move failed');

    expect(__fs.has(INDEX)).toBe(false);
    expect((await idsOf()).sort()).toEqual(['1', '2']);
    // Nothing was written by reading.
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('when even the put-back fails, the backup is the base: still the previous list', async () => {
    await seed();
    failMoveAfter((destination) => {
      if (destination.exists) destination.delete();
    }, 5);
    // Second temp write (the put-back) fails and leaves a partial file.
    __fs.failNth('write', 2, new Error('disk full'), { leave: 'partial' });

    await expect(saveNote({ id: '3', body: 'three' })).rejects.toThrow('move failed');

    expect(__fs.has(INDEX)).toBe(false);
    expect((await idsOf()).sort()).toEqual(['1', '2']); // the backup copied before the move
  });

  it('rolls this save back: its copies are deleted, its cache source stays', async () => {
    await seed();
    __fs.put(RECORDING, 'audio');
    failMoveAfter((destination) => destination.delete());

    await expect(
      saveNote({ id: '3', body: 'three', addRecordings: [{ uri: RECORDING, durationMs: 1 }] }),
    ).rejects.toThrow('move failed');

    expect(__fs.has('file:///document/notes/3.m4a')).toBe(false);
    expect(__fs.has(RECORDING)).toBe(true);
  });
});

describe('crash between steps: the next read gives the right list', () => {
  it('after the temp write (the read-back never ran)', async () => {
    await seed();
    __fs.failWhen('json', isTmp);
    await expect(saveNote({ id: '3', body: 'x' })).rejects.toThrow();
    expect(__fs.has(TMP)).toBe(true);
    __fs.clearFailures();
    expect((await idsOf()).sort()).toEqual(['1', '2']);
  });

  it('after the backup copy (the move never ran)', async () => {
    await seed();
    __fs.failNext('move');
    await expect(saveNote({ id: '3', body: 'x' })).rejects.toThrow();
    expect(JSON.parse(__fs.read(BAK) as string).notes).toHaveLength(2);
    expect((await idsOf()).sort()).toEqual(['1', '2']);
  });

  it('after the move', async () => {
    await seed();
    await saveNote({ id: '3', body: 'x' });
    expect((await idsOf()).sort()).toEqual(['1', '2', '3']);
  });

  it('a raw crash state: the index missing, the temp file complete, the backup older', () => {
    __fs.put(BAK, body('old'));
    __fs.put(TMP, body('newest'));
    return expect(bodiesOf()).resolves.toEqual(['newest']);
  });
});

describe('reading when notes.json is missing or zero-length', () => {
  it('uses a readable temp file first, then the backup, then nothing', async () => {
    __fs.put(BAK, body('from backup'));
    expect(await bodiesOf()).toEqual(['from backup']);
    __fs.put(TMP, body('from temp'));
    expect(await bodiesOf()).toEqual(['from temp']);
    __fs.put(INDEX, ''); // zero-length counts as missing
    expect(await bodiesOf()).toEqual(['from temp']);
    __fs.put(TMP, '{"version":1,"no'); // cut off: the backup is next
    expect(await bodiesOf()).toEqual(['from backup']);
    __fs.put(TMP, JSON.stringify({ version: 1, notes: [] })); // nothing in it: not a base
    expect(await bodiesOf()).toEqual(['from backup']);
    __fs.put(BAK, '');
    expect(await bodiesOf()).toEqual([]);
  });

  it('writes nothing when reading', async () => {
    __fs.put(BAK, body('from backup'));
    const files = __fs.list();
    await listNotes();
    await getIndexStatus();
    expect(__fs.list()).toEqual(files);
  });

  it('a save on top of a backup base keeps the backup notes and does not copy a missing index', async () => {
    __fs.put(BAK, body('from backup'));
    await saveNote({ id: '2', body: 'new' });
    expect((await idsOf()).sort()).toEqual(['1', '2']);
    expect(JSON.parse(__fs.read(BAK) as string).notes).toHaveLength(1);
  });
});

describe('unreadable index', () => {
  const damaged = '{"version":1,"notes":[{"id":"1","body":"cut off';

  beforeEach(() => __fs.put(INDEX, damaged));

  it('shows an empty list and an unreadable status, and touches nothing', async () => {
    expect(await listNotes()).toEqual([]);
    expect(await getIndexStatus()).toBe('unreadable');
    expect(__fs.read(INDEX)).toBe(damaged);
    expect(corruptCopies()).toEqual([]);
  });

  it.each([
    ['saveNote', () => saveNote({ id: '1', body: 'x' })],
    ['softDeleteNote', () => softDeleteNote('1')],
    ['restoreNote', () => restoreNote('1')],
    ['setPinned', () => setPinned('1', true)],
    ['holdRecording', () => holdRecording('1', 'a.m4a')],
    ['releaseRecording', () => releaseRecording('1', 'a.m4a')],
    ['appendImported', () => appendImported([note('x')])],
  ])('%s refuses with INDEX_UNREADABLE and leaves the file alone', async (_name, run) => {
    let error: unknown;
    try {
      await run();
    } catch (e) {
      error = e;
    }
    expect(isIndexUnreadableError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(INDEX_UNREADABLE);
    expect(__fs.read(INDEX)).toBe(damaged);
    expect(__fs.has(TMP)).toBe(false);
  });

  it('refuses a save with audio before copying anything', async () => {
    __fs.put(RECORDING, 'audio');
    await expect(
      saveNote({ id: '1', body: 'x', addRecordings: [{ uri: RECORDING, durationMs: 1 }] }),
    ).rejects.toMatchObject({ code: INDEX_UNREADABLE });
    expect(__fs.list().filter((u) => u.includes('/notes/'))).toEqual([]);
    expect(__fs.has(RECORDING)).toBe(true);
  });

  it('keeps a copy of the damaged index once per session, and a good read re-arms it', async () => {
    await expect(saveNote({ id: '1', body: 'x' })).rejects.toBeDefined();
    expect(corruptCopies()).toHaveLength(1);
    expect(__fs.read(corruptCopies()[0])).toBe(damaged);

    jest.setSystemTime(new Date('2026-10-04T08:00:05Z'));
    await expect(saveNote({ id: '1', body: 'y' })).rejects.toBeDefined();
    expect(corruptCopies()).toHaveLength(1); // not again

    __fs.put(INDEX, body('fine')); // the file is good again
    await listNotes();
    __fs.put(INDEX, damaged); // damaged again later
    jest.setSystemTime(new Date('2026-10-04T08:01:00Z'));
    await expect(saveNote({ id: '1', body: 'z' })).rejects.toBeDefined();
    expect(corruptCopies()).toHaveLength(2);
  });

  it('a failing corrupt copy does not change the refusal', async () => {
    __fs.failWhen('copy', isIndex);
    await expect(saveNote({ id: '1', body: 'x' })).rejects.toMatchObject({
      code: INDEX_UNREADABLE,
    });
    expect(corruptCopies()).toEqual([]);
    expect(__fs.read(INDEX)).toBe(damaged);
  });

  it.each([
    ['a bare list (the old dream layout)', '[]'],
    ['an unknown version', JSON.stringify({ version: 2, notes: [] })],
    ['no notes list', JSON.stringify({ version: 1 })],
    ['text that is not JSON', 'not json'],
  ])('%s is unreadable too', async (_name, content) => {
    __fs.put(INDEX, content);
    expect(await getIndexStatus()).toBe('unreadable');
    await expect(saveNote({ id: '1', body: 'x' })).rejects.toMatchObject({
      code: INDEX_UNREADABLE,
    });
    expect(__fs.read(INDEX)).toBe(content);
  });

  it('a read error on an intact file is reported as unreadable, not as an empty list', async () => {
    __fs.put(INDEX, body('fine'));
    __fs.failNext('json', new Error('io error'));
    await expect(saveNote({ id: '2', body: 'x' })).rejects.toMatchObject({
      code: INDEX_UNREADABLE,
    });
    expect(__fs.read(INDEX)).toBe(body('fine'));
  });
});

describe('a commit failure leaves the previous state', () => {
  const trashed = { ...note('t', '3'), deletedAt: '2026-10-02T00:00:00.000Z' };
  const withRec = {
    ...note('r', '4'),
    recordings: [{ fileName: '4.m4a', durationMs: 1, heldAt: '2026-10-02T00:00:00.000Z' }],
  };
  const live = { ...note('live', '5'), recordings: [{ fileName: '5.m4a', durationMs: 1 }] };

  it.each([
    ['softDeleteNote', () => softDeleteNote('1')],
    ['restoreNote', () => restoreNote('3')],
    ['setPinned', () => setPinned('1', true)],
    ['holdRecording', () => holdRecording('5', '5.m4a')],
    ['releaseRecording', () => releaseRecording('4', '4.m4a')],
    ['appendImported', () => appendImported([note('i', '9')])],
    ['saveNote', () => saveNote({ id: '1', body: 'changed' })],
    ['saveNote (emptying)', () => saveNote({ id: '1', body: '' })],
  ])('%s', async (_name, run) => {
    __fs.put(
      INDEX,
      JSON.stringify({ version: 1, notes: [note('a', '1'), trashed, withRec, live] }),
    );
    const index = __fs.read(INDEX);
    __fs.failWhen('write', isTmp, new Error('disk full'));

    await expect(run()).rejects.toThrow('disk full');

    expect(__fs.read(INDEX)).toBe(index);
    __fs.clearFailures();
    await run(); // and it works once the disk does
    expect(__fs.read(INDEX)).not.toBe(index);
  });
});
