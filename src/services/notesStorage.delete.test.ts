import * as fakeFs from '../test/fakeFileSystem';
import {
  Note,
  NOTE_NOT_IN_TRASH,
  deletableAudioFiles,
  deleteNoteForever,
  discardHeld,
  emptyRecentlyDeleted,
  listNotes,
  resetCorruptCopyGuard,
} from './notesStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const INDEX = 'file:///document/notes.json';
const TMP = 'file:///document/notes.json.tmp';
const BAK = 'file:///document/notes.json.bak';
const audio = (name: string) => `file:///document/notes/${name}`;
const legacyAudio = (name: string) => `file:///document/dreams/${name}`;
const HELD = '2026-10-04T09:00:00.000Z';
const TRASHED = '2026-10-05T09:00:00.000Z';

const rec = (fileName: string, extra: Record<string, unknown> = {}) => ({
  fileName,
  durationMs: 1,
  ...extra,
});
const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  body: `body ${id}`,
  ...extra,
});

/** Stores the index and an audio file for every non-legacy recording named in it. */
function setup(notes: Note[]) {
  __fs.put(INDEX, JSON.stringify({ version: 1, notes }));
  for (const n of notes) {
    for (const r of n.recordings ?? []) {
      if (r.origin === 'legacy') __fs.put(legacyAudio(r.fileName), 'legacy-bytes');
      else __fs.put(audio(r.fileName), `bytes-${r.fileName}`);
    }
  }
}
const stored = async () => (await listNotes({ includeDeleted: true })) as Note[];
const find = async (id: string) => (await stored()).find((n) => n.id === id);
const names = async (id: string) => (await find(id))?.recordings?.map((r) => r.fileName);
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    return (e as { code?: string }).code ?? 'threw';
  }
  return 'did not throw';
};

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
});

describe('deletableAudioFiles', () => {
  it('lists files of every recording, held ones included, once per name', () => {
    const n = note('1', {
      recordings: [rec('a.m4a'), rec('b.m4a', { heldAt: HELD }), rec('a.m4a')],
    });
    expect(deletableAudioFiles(n, [n]).map((f) => f.uri)).toEqual([audio('a.m4a'), audio('b.m4a')]);
  });

  it('skips shared (also in a trashed note), legacy, unsafe and junk records', () => {
    const n = note('1', {
      recordings: [
        rec('shared.m4a'),
        rec('old.m4a', { origin: 'legacy' }),
        rec('../x.m4a'),
        rec('sub/x.m4a'),
        rec(''),
        'junk' as never,
        rec('own.m4a'),
      ],
    });
    const other = note('2', { deletedAt: TRASHED, recordings: [rec('shared.m4a')] });
    expect(deletableAudioFiles(n, [n, other]).map((f) => f.uri)).toEqual([audio('own.m4a')]);
  });
});

describe('discardHeld', () => {
  const three = () =>
    note('1', {
      recordings: [
        rec('a.m4a', { heldAt: HELD }),
        rec('b.m4a', { heldAt: HELD }),
        rec('c.m4a', { heldAt: HELD }),
        rec('keep.m4a'),
      ],
    });

  it('deletes held audio and drops the records, keeps the others', async () => {
    setup([three()]);
    expect(await discardHeld('1')).toEqual({ removed: 3 });
    expect(await names('1')).toEqual(['keep.m4a']);
    expect(__fs.has(audio('a.m4a'))).toBe(false);
    expect(__fs.has(audio('c.m4a'))).toBe(false);
    expect(__fs.has(audio('keep.m4a'))).toBe(true);
  });

  it('does nothing for an unknown id', async () => {
    setup([three()]);
    __fs.failWhen('delete', () => true);
    __fs.failWhen('write', () => true);
    expect(await discardHeld('nope')).toEqual({ removed: 0 });
    expect(__fs.has(audio('a.m4a'))).toBe(true);
  });

  it('does nothing for a note in Recently Deleted', async () => {
    const n = { ...three(), deletedAt: TRASHED };
    setup([n]);
    expect(await discardHeld('1')).toEqual({ removed: 0 });
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect((await names('1'))?.length).toBe(4);
  });

  it('does nothing and writes nothing when nothing is held', async () => {
    setup([note('1', { recordings: [rec('a.m4a')] })]);
    const before = __fs.read(INDEX);
    __fs.failWhen('write', () => true);
    __fs.failWhen('move', () => true);
    expect(await discardHeld('1')).toEqual({ removed: 0 });
    expect(__fs.read(INDEX)).toBe(before);
    expect(__fs.has(TMP)).toBe(false);
    expect(__fs.has(BAK)).toBe(false);
  });

  it('commits the progress made, rethrows, and a rerun finishes (crash after the 2nd delete)', async () => {
    setup([three()]);
    __fs.failNth('delete', 2, new Error('disk'));
    await expect(discardHeld('1')).rejects.toThrow('disk');
    expect(__fs.has(audio('a.m4a'))).toBe(false);
    expect(__fs.has(audio('b.m4a'))).toBe(true);
    expect(await names('1')).toEqual(['b.m4a', 'c.m4a', 'keep.m4a']);
    expect(await discardHeld('1')).toEqual({ removed: 2 });
    expect(await names('1')).toEqual(['keep.m4a']);
    expect(__fs.has(audio('b.m4a'))).toBe(false);
    expect(__fs.has(audio('c.m4a'))).toBe(false);
  });

  it('writes no index change when the first delete fails', async () => {
    setup([three()]);
    const before = __fs.read(INDEX);
    __fs.failNth('delete', 1, new Error('disk'));
    await expect(discardHeld('1')).rejects.toThrow('disk');
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('after an index write failure the files are gone, records still held, and a rerun is idempotent', async () => {
    setup([three()]);
    __fs.failWhen('move', (uri) => uri === TMP, new Error('move failed'));
    await expect(discardHeld('1')).rejects.toThrow('move failed');
    __fs.clearFailures();
    for (const f of ['a', 'b', 'c']) expect(__fs.has(audio(`${f}.m4a`))).toBe(false);
    expect((await names('1'))?.length).toBe(4); // still listed

    __fs.failWhen('delete', () => true); // nothing left to delete: a delete attempt would throw
    expect(await discardHeld('1')).toEqual({ removed: 3 });
    expect(await names('1')).toEqual(['keep.m4a']);
    expect(__fs.has(audio('keep.m4a'))).toBe(true);
  });

  it('counts a file that is already missing as deleted', async () => {
    setup([three()]);
    new fakeFs.File(audio('b.m4a')).delete();
    expect(await discardHeld('1')).toEqual({ removed: 3 });
    expect(await names('1')).toEqual(['keep.m4a']);
  });

  it("keeps a file another note uses (even a trashed one) but drops this note's reference", async () => {
    setup([
      note('1', { recordings: [rec('a.m4a', { heldAt: HELD }), rec('b.m4a', { heldAt: HELD })] }),
      note('2', { deletedAt: TRASHED, recordings: [rec('a.m4a')] }),
    ]);
    expect(await discardHeld('1')).toEqual({ removed: 2 });
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect(__fs.has(audio('b.m4a'))).toBe(false);
    expect(await names('1')).toEqual([]);
    expect(await names('2')).toEqual(['a.m4a']);
  });

  it('keeps a file a surviving (not held) recording of the same note uses', async () => {
    setup([note('1', { recordings: [rec('a.m4a', { heldAt: HELD }), rec('a.m4a')] })]);
    expect(await discardHeld('1')).toEqual({ removed: 1 });
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect(await names('1')).toEqual(['a.m4a']);
  });

  it('leaves legacy recordings held and their files alone', async () => {
    setup([
      note('1', {
        recordings: [
          rec('old.m4a', { heldAt: HELD, origin: 'legacy' }),
          rec('a.m4a', { heldAt: HELD }),
        ],
      }),
    ]);
    expect(await discardHeld('1')).toEqual({ removed: 1 });
    expect(__fs.has(legacyAudio('old.m4a'))).toBe(true);
    expect(await names('1')).toEqual(['old.m4a']);
    expect((await find('1'))?.recordings?.[0]).toMatchObject({ heldAt: HELD, origin: 'legacy' });
  });

  it('with only a legacy recording held it writes nothing', async () => {
    setup([note('1', { recordings: [rec('old.m4a', { heldAt: HELD, origin: 'legacy' })] })]);
    const before = __fs.read(INDEX);
    __fs.failWhen('write', () => true);
    expect(await discardHeld('1')).toEqual({ removed: 0 });
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('never deletes a file for an unsafe name; drops only the reference', async () => {
    __fs.put('file:///document/outside.m4a', 'precious');
    setup([
      note('1', {
        recordings: [
          rec('../outside.m4a', { heldAt: HELD }),
          rec('sub/x.m4a', { heldAt: HELD }),
          rec('a.m4a', { heldAt: HELD }),
        ],
      }),
    ]);
    __fs.put('file:///document/notes/sub/x.m4a', 'nested');
    expect(await discardHeld('1')).toEqual({ removed: 3 });
    expect(__fs.read('file:///document/outside.m4a')).toBe('precious');
    expect(__fs.read('file:///document/notes/sub/x.m4a')).toBe('nested');
    expect(__fs.has(audio('a.m4a'))).toBe(false);
  });

  it('does not change updatedAt or other fields', async () => {
    setup([{ ...three(), pinned: true, extra: 1 } as Note]);
    await discardHeld('1');
    expect(await find('1')).toMatchObject({
      pinned: true,
      extra: 1,
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
  });
});

describe('deleteNoteForever', () => {
  const trashed = (id = '1', extra: Partial<Note> = {}) =>
    note(id, {
      deletedAt: TRASHED,
      body: 'SECRET words',
      recordings: [rec('a.m4a'), rec('b.m4a', { heldAt: HELD })],
      ...extra,
    });

  it('removes audio (held too) and then the note, keeping the others', async () => {
    setup([trashed(), note('2', { recordings: [rec('z.m4a')] })]);
    await deleteNoteForever('1');
    expect(await find('1')).toBeUndefined();
    expect(await find('2')).toBeDefined();
    expect(__fs.has(audio('a.m4a'))).toBe(false);
    expect(__fs.has(audio('b.m4a'))).toBe(false);
    expect(__fs.has(audio('z.m4a'))).toBe(true);
  });

  it('is a no-op for an unknown id', async () => {
    setup([trashed()]);
    __fs.failWhen('delete', () => true);
    await deleteNoteForever('nope');
    expect(await find('1')).toBeDefined();
  });

  it('refuses a note that is not in Recently Deleted and touches nothing', async () => {
    const { deletedAt: _unused, ...live } = trashed();
    setup([live]);
    expect(await codeOf(deleteNoteForever('1'))).toBe(NOTE_NOT_IN_TRASH);
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect(await find('1')).toBeDefined();
  });

  it('audio first, index last: a failed audio delete leaves the note listed; a rerun finishes', async () => {
    setup([trashed()]);
    __fs.failNth('delete', 2, new Error('disk'));
    await expect(deleteNoteForever('1')).rejects.toThrow('disk');
    expect(__fs.has(audio('a.m4a'))).toBe(false);
    expect(__fs.has(audio('b.m4a'))).toBe(true);
    expect(await find('1')).toBeDefined();
    await deleteNoteForever('1');
    expect(await find('1')).toBeUndefined();
    expect(__fs.has(audio('b.m4a'))).toBe(false);
  });

  it('first delete failing leaves everything in place', async () => {
    setup([trashed()]);
    __fs.failNth('delete', 1, new Error('disk'));
    await expect(deleteNoteForever('1')).rejects.toThrow('disk');
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect(__fs.has(audio('b.m4a'))).toBe(true);
    expect(await find('1')).toBeDefined();
  });

  it('a failed index write after the audio is gone keeps the note listed; a rerun finishes', async () => {
    setup([trashed()]);
    __fs.failWhen('move', (uri) => uri === TMP, new Error('move failed'));
    await expect(deleteNoteForever('1')).rejects.toThrow('move failed');
    __fs.clearFailures();
    expect(__fs.has(audio('a.m4a'))).toBe(false);
    expect(await find('1')).toBeDefined();
    await deleteNoteForever('1');
    expect(await find('1')).toBeUndefined();
  });

  it('keeps a file another note uses, including a note in Recently Deleted', async () => {
    setup([
      trashed('1', { recordings: [rec('a.m4a'), rec('b.m4a')] }),
      trashed('2', { recordings: [rec('a.m4a')] }),
    ]);
    await deleteNoteForever('1');
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect(__fs.has(audio('b.m4a'))).toBe(false);
    await deleteNoteForever('2');
    expect(__fs.has(audio('a.m4a'))).toBe(false);
  });

  it('never deletes legacy files or files with unsafe names', async () => {
    __fs.put('file:///document/outside.m4a', 'precious');
    setup([
      trashed('1', {
        recordings: [rec('old.m4a', { origin: 'legacy' }), rec('../outside.m4a'), rec('c.m4a')],
      }),
    ]);
    await deleteNoteForever('1');
    expect(__fs.has(legacyAudio('old.m4a'))).toBe(true);
    expect(__fs.read('file:///document/outside.m4a')).toBe('precious');
    expect(__fs.has(audio('c.m4a'))).toBe(false);
    expect(await find('1')).toBeUndefined();
  });

  describe('.bak and .tmp scrub', () => {
    const textFiles = () => __fs.list().filter((u) => (__fs.read(u) ?? '').includes('SECRET'));

    it('leaves no copy of the deleted text in the index, .bak or .tmp', async () => {
      setup([trashed(), note('2')]);
      __fs.put(BAK, __fs.read(INDEX) as string);
      __fs.put(TMP, __fs.read(INDEX) as string);
      await deleteNoteForever('1');
      expect(textFiles()).toEqual([]);
      expect(__fs.read(INDEX)).toContain('body 2');
    });

    it('does not let the commit copy the old index into .bak', async () => {
      setup([trashed(), note('2')]);
      // No backup yet: the commit would normally create one from the current index.
      await deleteNoteForever('1');
      expect(textFiles()).toEqual([]);
    });

    it('removes a backup it cannot overwrite', async () => {
      setup([trashed()]);
      __fs.put(BAK, __fs.read(INDEX) as string);
      __fs.failWhen('write', (uri) => uri === BAK);
      await deleteNoteForever('1');
      expect(textFiles()).toEqual([]);
    });

    it('stops with everything in place when the backup can be neither overwritten nor removed', async () => {
      setup([trashed()]);
      __fs.put(BAK, __fs.read(INDEX) as string);
      __fs.failWhen('write', (uri) => uri === BAK);
      __fs.failWhen('delete', (uri) => uri === BAK);
      await expect(deleteNoteForever('1')).rejects.toThrow();
      expect(__fs.has(audio('a.m4a'))).toBe(true);
      expect(await find('1')).toBeDefined();
    });
  });
});

describe('emptyRecentlyDeleted', () => {
  const trashed = (id: string, files: string[]) =>
    note(id, {
      deletedAt: TRASHED,
      body: `SECRET ${id}`,
      recordings: files.map((f) => rec(f)),
    });

  it('deletes only notes in Recently Deleted, audio and text included', async () => {
    setup([
      trashed('1', ['a.m4a']),
      trashed('2', ['b.m4a']),
      note('3', { recordings: [rec('c.m4a')] }),
    ]);
    __fs.put(BAK, __fs.read(INDEX) as string);
    expect(await emptyRecentlyDeleted()).toEqual({ deleted: 2 });
    expect((await stored()).map((n) => n.id)).toEqual(['3']);
    expect(__fs.has(audio('a.m4a'))).toBe(false);
    expect(__fs.has(audio('b.m4a'))).toBe(false);
    expect(__fs.has(audio('c.m4a'))).toBe(true);
    expect(__fs.list().some((u) => (__fs.read(u) ?? '').includes('SECRET'))).toBe(false);
  });

  it('reports 0 when nothing is deleted', async () => {
    setup([note('1')]);
    expect(await emptyRecentlyDeleted()).toEqual({ deleted: 0 });
  });

  it('stops at the first failure, keeps earlier deletions, and a rerun finishes', async () => {
    setup([trashed('1', ['a.m4a']), trashed('2', ['b.m4a']), trashed('3', ['c.m4a'])]);
    __fs.failNth('delete', 2, new Error('disk'));
    expect(await emptyRecentlyDeleted()).toEqual({ deleted: 1, failedId: '2' });
    expect((await stored()).map((n) => n.id)).toEqual(['2', '3']);
    expect(__fs.has(audio('c.m4a'))).toBe(true); // third never started
    expect(await emptyRecentlyDeleted()).toEqual({ deleted: 2 });
    expect(await stored()).toEqual([]);
  });

  it('keeps a file shared with a note that stays, and a legacy file', async () => {
    setup([
      trashed('1', ['a.m4a']),
      note('2', { recordings: [rec('a.m4a')] }),
      { ...trashed('3', []), recordings: [rec('old.m4a', { origin: 'legacy' })] },
    ]);
    expect(await emptyRecentlyDeleted()).toEqual({ deleted: 2 });
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect(__fs.has(legacyAudio('old.m4a'))).toBe(true);
    expect((await stored()).map((n) => n.id)).toEqual(['2']);
  });
});
