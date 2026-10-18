import * as fakeFs from '../test/fakeFileSystem';
import {
  Note,
  appendImported,
  isPlainFileName,
  listNotes,
  resetCorruptCopyGuard,
  saveNote,
} from './notesStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const INDEX = 'file:///document/notes.json';
const TMP = 'file:///document/notes.json.tmp';
const CACHE_FILE = 'file:///cache/a.m4a';

const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  body: `body ${id}`,
  ...extra,
});
const putIndex = (...notes: unknown[]) => __fs.put(INDEX, JSON.stringify({ version: 1, notes }));
const storedIds = () => JSON.parse(__fs.read(INDEX) as string).notes.map((n: Note) => n.id);

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  jest.useFakeTimers().setSystemTime(new Date('2026-10-04T08:00:00Z'));
});

afterEach(() => jest.useRealTimers());

describe('a failed commit does not leave its list in the temp file', () => {
  it('puts the previous list back when the move fails and the index is still readable', async () => {
    putIndex(note('1'), note('2'));
    __fs.failNext('move');

    await expect(saveNote({ id: '3', body: 'three' })).rejects.toThrow('move failed');

    expect(storedIds()).toEqual(['1', '2']);
    expect(JSON.parse(__fs.read(TMP) as string).notes.map((n: Note) => n.id)).toEqual(['1', '2']);
  });

  it('puts the previous list back when the read-back check fails', async () => {
    putIndex(note('1'));
    __fs.failWhen('json', (uri) => uri === TMP);

    await expect(saveNote({ id: '2', body: 'two' })).rejects.toThrow();

    expect(JSON.parse(__fs.read(TMP) as string).notes.map((n: Note) => n.id)).toEqual(['1']);
  });

  it('still rethrows the original error when the put-back write fails', async () => {
    putIndex(note('1'));
    __fs.failNext('move', new Error('move failed'));
    __fs.failNth('write', 2, new Error('disk full')); // the put-back is the second temp write

    await expect(saveNote({ id: '2', body: 'two' })).rejects.toThrow('move failed');
    expect(storedIds()).toEqual(['1']);
  });

  it('a later restart does not resurrect the failed save from the temp file', async () => {
    putIndex(note('1'));
    __fs.failNext('move');
    await expect(saveNote({ id: '2', body: 'two' })).rejects.toThrow();
    // Index goes missing later (for example a failed move of a following save).
    __fs.failNext('move');
    await expect(saveNote({ id: '3', body: 'three' })).rejects.toThrow();
    __fs.put(INDEX, '');
    expect((await listNotes({ includeDeleted: true })).map((n) => n.id)).toEqual(['1']);
  });
});

describe('cache source allow-list', () => {
  const rejected: [string, string][] = [
    ['outside the cache', 'file:///elsewhere/a.m4a'],
    ['a sibling directory sharing the cache prefix', 'file:///cachefoo/a.m4a'],
    ['the document directory', 'file:///document/notes.json'],
    ['a ".." segment', 'file:///cache/../document/notes.json'],
    ['an encoded ".." segment', 'file:///cache/%2e%2e/document/notes.json'],
    ['an encoded slash with ".."', 'file:///cache/sub%2F..%2F..%2Fdocument/notes.json'],
    ['a malformed escape', 'file:///cache/%E0%A4%A.m4a'],
    ['the cache directory itself', 'file:///cache/'],
    ['a directory', 'file:///cache/folder'],
    ['not a file URI', '/cache/a.m4a'],
  ];

  it.each(rejected)('rejects %s before any copy', async (_name, uri) => {
    __fs.put('file:///cache/folder/inside.m4a', 'x');
    __fs.put('file:///document/notes.json.keep', 'x');
    __fs.put(CACHE_FILE, 'bytes');

    await expect(
      saveNote({
        id: '10',
        body: 'x',
        addRecordings: [
          { uri: CACHE_FILE, durationMs: 1 },
          { uri, durationMs: 1 },
        ],
      }),
    ).rejects.toThrow('cannot be added');

    expect(__fs.copies()).toEqual([]);
    expect(__fs.has(CACHE_FILE)).toBe(true);
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('accepts a file in a subfolder of the cache (where the recorder writes)', async () => {
    const uri = 'file:///cache/Audio/recording-1.m4a';
    __fs.put(uri, 'bytes');

    const { added } = await saveNote({
      id: '10',
      body: 'x',
      addRecordings: [{ uri, durationMs: 5 }],
    });

    expect(added).toHaveLength(1);
    expect(__fs.has(uri)).toBe(false);
  });

  it('keeps rejecting stored recordings in notes/ and dreams/', async () => {
    for (const uri of ['file:///document/notes/9.m4a', 'file:///document/dreams/9.m4a']) {
      __fs.put(uri, 'precious');
      await expect(
        saveNote({ id: '10', body: 'x', addRecordings: [{ uri, durationMs: 1 }] }),
      ).rejects.toThrow('cannot be added');
      expect(__fs.has(uri)).toBe(true);
    }
  });
});

describe('isPlainFileName', () => {
  it.each(['a.m4a', '10-1.m4a', 'A_b-c.9', '1'])('accepts %s', (name) => {
    expect(isPlainFileName(name)).toBe(true);
  });
  it.each([
    '',
    '.hidden',
    '-x',
    '../a.m4a',
    'a/b.m4a',
    'a\\b.m4a',
    'a..b.m4a',
    'a b.m4a',
    'a%2e.m4a',
    'file:///x',
  ])('rejects %j', (name) => {
    expect(isPlainFileName(name)).toBe(false);
  });
  it.each([undefined, null, 5, {}, ['a.m4a']])('rejects a non-string %j', (value) => {
    expect(isPlainFileName(value)).toBe(false);
  });
});

describe('appendImported validates the whole batch before writing', () => {
  const rec = (fileName: unknown) => ({ fileName, durationMs: 1 });
  const bad: [string, unknown][] = [
    ['recordings that are not a list', note('9', { recordings: 'x' as never })],
    ['recordings that are null', note('9', { recordings: null as never })],
    ['a recording that is not an object', note('9', { recordings: ['a.m4a'] as never })],
    ['a recording without a file name', note('9', { recordings: [rec(undefined)] as never })],
    ['a path as file name', note('9', { recordings: [rec('../x.m4a')] as never })],
    ['a nested path as file name', note('9', { recordings: [rec('a/b.m4a')] as never })],
    ['a non-string file name', note('9', { recordings: [rec(7)] as never })],
    ['a non-string body', { ...note('9'), body: 5 }],
    ['a missing createdAt', { ...note('9'), createdAt: undefined }],
    ['a non-string updatedAt', { ...note('9'), updatedAt: 3 }],
  ];

  it.each(bad)('rejects %s and writes nothing, not even the good records', async (_n, record) => {
    putIndex(note('1'));
    const before = __fs.read(INDEX);

    await expect(appendImported([note('8'), record as Note])).rejects.toThrow();

    expect(__fs.read(INDEX)).toBe(before);
    expect(__fs.has(TMP)).toBe(false);
  });

  it('accepts plain recording names and notes without recordings', async () => {
    putIndex(note('1'));
    const result = await appendImported([
      note('8'),
      note('9', { recordings: [rec('9.m4a')] as never }),
    ]);
    expect(result).toEqual({ added: 2 });
    expect(storedIds()).toEqual(['1', '8', '9']);
  });
});

describe('a stored note whose recordings is not a list', () => {
  const odd = () => putIndex(note('1', { body: 'keep', recordings: 'junk' as never }));
  const stored = () => JSON.parse(__fs.read(INDEX) as string).notes[0];

  it('is never moved to Recently Deleted by an empty body', async () => {
    odd();
    const { note: saved } = await saveNote({ id: '1', body: '   ' });
    expect(saved?.deletedAt).toBeUndefined();
    expect(stored().deletedAt).toBeUndefined();
    expect(stored().recordings).toBe('junk');
  });

  it('refuses an addition before any copy and leaves the stored value alone', async () => {
    odd();
    const before = __fs.read(INDEX);
    __fs.put(CACHE_FILE, 'bytes');

    await expect(
      saveNote({ id: '1', body: 'new', addRecordings: [{ uri: CACHE_FILE, durationMs: 1 }] }),
    ).rejects.toThrow();

    expect(__fs.copies()).toEqual([]);
    expect(__fs.has(CACHE_FILE)).toBe(true);
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('still saves a plain body edit and keeps the odd value', async () => {
    odd();
    await saveNote({ id: '1', body: 'edited' });
    expect(stored().body).toBe('edited');
    expect(stored().recordings).toBe('junk');
  });
});
