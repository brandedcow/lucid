import * as fakeFs from '../test/fakeFileSystem';
import { hasAudio, isDraft } from '../types/dream';
import {
  dreamAudioUri,
  getIndexStatus,
  isIndexUnreadableError,
  listDreams,
  listEmotions,
  resetCorruptCopyGuard,
  saveDream,
} from './dreamStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const RECORDING = 'file:///cache/recording.m4a';
const INDEX = 'file:///document/dreams.json';
const BAK = 'file:///document/dreams.json.bak';
const isIndex = (uri: string) => uri === INDEX;
const isDreamAudio = (uri: string) => uri.startsWith('file:///document/dreams/');

type Details = { title: string; emotion?: string; tags: string[]; transcript?: string };
/** Finish a recording (the common case in these tests). */
const save = (uri: string, durationMs: number, details: Details) =>
  saveDream({ recordingUri: uri, durationMs, details, status: 'saved' });

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  __fs.put(RECORDING, 'audio-bytes');
  jest.useFakeTimers().setSystemTime(new Date('2026-10-04T08:00:00Z'));
});

afterEach(() => jest.useRealTimers());

describe('saveDream', () => {
  it('copies the recording into the dreams directory, indexes it and deletes the original', async () => {
    const dream = await save(RECORDING, 42_000, { title: 'Flooded hallway', tags: ['water'] });

    expect(__fs.has(RECORDING)).toBe(false);
    expect(__fs.read(`file:///document/dreams/${dream.id}.m4a`)).toBe('audio-bytes');
    expect(__fs.read(dreamAudioUri(dream)!)).toBe('audio-bytes');
    expect(dream).toMatchObject({
      title: 'Flooded hallway',
      durationMs: 42_000,
      tags: ['water'],
      createdAt: '2026-10-04T08:00:00.000Z',
    });
    expect(await listDreams()).toEqual([dream]);
  });

  it('trims the title and emotion, and omits a blank emotion', async () => {
    const withEmotion = await save(RECORDING, 1000, {
      title: '  Hallway ',
      emotion: ' uneasy ',
      tags: [],
    });
    expect(withEmotion.title).toBe('Hallway');
    expect(withEmotion.emotion).toBe('uneasy');

    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-04T09:00:00Z'));
    const blankEmotion = await save(RECORDING, 1000, {
      title: 'Second',
      emotion: '   ',
      tags: [],
    });
    expect(blankEmotion).not.toHaveProperty('emotion');
  });

  it('rejects an empty title and leaves the recording untouched', async () => {
    await expect(save(RECORDING, 1000, { title: '   ', tags: [] })).rejects.toThrow(
      'A title is required',
    );

    expect(__fs.has(RECORDING)).toBe(true);
    expect(await listDreams()).toEqual([]);
  });
});

describe('listDreams', () => {
  it('returns nothing when no dreams exist', async () => {
    expect(await listDreams()).toEqual([]);
  });

  it('returns newest first', async () => {
    await save(RECORDING, 1000, { title: 'Older', tags: [] });
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    await save(RECORDING, 1000, { title: 'Newer', tags: [] });

    expect((await listDreams()).map((d) => d.title)).toEqual(['Newer', 'Older']);
  });

  it('fills in title and tags for dreams saved before they existed', async () => {
    __fs.put(
      INDEX,
      JSON.stringify([
        {
          id: '1',
          createdAt: '2026-10-01T00:00:00.000Z',
          durationMs: 1000,
          audioFileName: '1.m4a',
        },
      ]),
    );

    expect(await listDreams()).toEqual([expect.objectContaining({ id: '1', title: '', tags: [] })]);
  });

  it('treats a corrupt index as empty for display', async () => {
    __fs.put(INDEX, '{not json');
    expect(await listDreams()).toEqual([]);
  });

  it('loads a current-format dream unchanged', async () => {
    const stored = {
      id: '1',
      createdAt: '2026-10-01T00:00:00.000Z',
      durationMs: 1000,
      audioFileName: '1.m4a',
      title: 'Old',
      tags: ['x'],
    };
    __fs.put(INDEX, JSON.stringify([stored]));
    const [dream] = await listDreams();
    expect(dream).toEqual(stored);
    expect(isDraft(dream)).toBe(false);
    expect(hasAudio(dream)).toBe(true);
  });
});

describe('saveDream as an upsert', () => {
  const blank = { title: '', tags: [] as string[] };

  it('creates a draft with a blank title and copies the recording', async () => {
    const draft = await saveDream({
      recordingUri: RECORDING,
      durationMs: 5000,
      details: blank,
      status: 'draft',
    });
    expect(draft).toMatchObject({ title: '', status: 'draft', durationMs: 5000 });
    expect(isDraft(draft)).toBe(true);
    expect(__fs.has(RECORDING)).toBe(false);
    expect(__fs.read(dreamAudioUri(draft)!)).toBe('audio-bytes');
  });

  it('requires a title to finish, before touching the recording', async () => {
    await expect(
      saveDream({ recordingUri: RECORDING, durationMs: 1, details: blank, status: 'saved' }),
    ).rejects.toThrow('A title is required');
    expect(__fs.has(RECORDING)).toBe(true);
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('keeps id, createdAt and audio on update, and finishing clears the status', async () => {
    const draft = await saveDream({
      recordingUri: RECORDING,
      durationMs: 5000,
      details: blank,
      status: 'draft',
    });
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    // A stray recordingUri on a dream that already has audio must not be copied again.
    __fs.put(RECORDING, 'other-bytes');
    const finished = await saveDream({
      id: draft.id,
      recordingUri: RECORDING,
      details: { title: 'Hallway', tags: ['water'], transcript: '  I was swimming.  ' },
      status: 'saved',
    });

    expect(finished).toMatchObject({
      id: draft.id,
      createdAt: draft.createdAt,
      audioFileName: draft.audioFileName,
      durationMs: 5000,
      title: 'Hallway',
      transcript: 'I was swimming.',
    });
    expect(finished).not.toHaveProperty('status');
    expect(__fs.read(dreamAudioUri(finished)!)).toBe('audio-bytes');
    expect(__fs.read(RECORDING)).toBe('other-bytes');
    expect(await listDreams()).toEqual([finished]);
    expect(__fs.read(INDEX)).not.toContain('saved');
  });

  it('omits a blank transcript', async () => {
    const dream = await save(RECORDING, 1, { title: 'T', tags: [], transcript: '  \n ' });
    expect(dream).not.toHaveProperty('transcript');
  });

  it('saves a dream with no audio', async () => {
    const dream = await saveDream({
      details: { title: 'Written', tags: [], transcript: 'Text only' },
      status: 'saved',
    });
    expect(dream.durationMs).toBe(0);
    expect(dream).not.toHaveProperty('audioFileName');
    expect(dreamAudioUri(dream)).toBeNull();
    expect(hasAudio(dream)).toBe(false);
  });

  it('indexes nothing and leaves nothing behind when the copy fails', async () => {
    __fs.failNext('copy');
    await expect(save(RECORDING, 1000, { title: 'Hallway', tags: [] })).rejects.toThrow(
      'copy failed',
    );

    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    expect(__fs.has(INDEX)).toBe(false);
    expect(__fs.list()).toEqual([RECORDING]);
    expect(await listDreams()).toEqual([]);
  });

  it('deletes the copied audio and keeps the recording when the index cannot be written', async () => {
    __fs.failNext('write', new Error('disk full'));
    await expect(save(RECORDING, 1000, { title: 'Hallway', tags: [] })).rejects.toThrow(
      'disk full',
    );

    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    expect(__fs.list().filter(isDreamAudio)).toEqual([]);
    expect(await listDreams()).toEqual([]);
  });

  it('still throws the original error when removing the copy also fails', async () => {
    __fs.failNext('write', new Error('disk full'));
    __fs.failWhen('delete', isDreamAudio, new Error('cannot delete'));
    await expect(save(RECORDING, 1000, { title: 'Hallway', tags: [] })).rejects.toThrow(
      'disk full',
    );

    expect(__fs.read(RECORDING)).toBe('audio-bytes');
  });

  it('succeeds when deleting the original recording fails', async () => {
    __fs.failWhen('delete', (uri) => uri === RECORDING);
    const dream = await save(RECORDING, 1000, { title: 'Hallway', tags: [] });

    expect(__fs.read(dreamAudioUri(dream)!)).toBe('audio-bytes');
    expect(await listDreams()).toEqual([dream]);
  });

  it('keeps the previous index in dreams.json.bak, but not on the first save', async () => {
    const first = await save(RECORDING, 1, { title: 'A', tags: [] });
    expect(__fs.has(BAK)).toBe(false);

    __fs.put(RECORDING, 'audio-bytes');
    const before = __fs.read(INDEX);
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    await save(RECORDING, 1, { title: 'B', tags: [] });

    expect(__fs.read(BAK)).toBe(before);
    expect(JSON.parse(__fs.read(BAK)!)).toEqual([first]);
    expect(__fs.read(INDEX)).not.toBe(before);
  });

  it('still saves when the backup copy fails', async () => {
    await save(RECORDING, 1, { title: 'A', tags: [] });
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    __fs.failWhen('copy', isIndex);
    await save(RECORDING, 1, { title: 'B', tags: [] });

    expect((await listDreams()).map((d) => d.title)).toEqual(['B', 'A']);
  });

  it('keeps fields it does not know about when updating', async () => {
    __fs.put(
      INDEX,
      JSON.stringify([
        {
          id: '1',
          createdAt: '2026-10-01T00:00:00.000Z',
          durationMs: 1000,
          title: 'Old',
          tags: [],
          futureField: { nested: true },
        },
      ]),
    );
    await saveDream({ id: '1', details: { title: 'New', tags: ['x'] }, status: 'saved' });

    expect(JSON.parse(__fs.read(INDEX)!)).toEqual([
      expect.objectContaining({ id: '1', title: 'New', futureField: { nested: true } }),
    ]);
  });

  it('removes the emotion key when the emotion is cleared', async () => {
    const dream = await saveDream({
      details: { title: 'T', emotion: 'calm', tags: [] },
      status: 'saved',
    });
    await saveDream({
      id: dream.id,
      details: { title: 'T', emotion: '  ', tags: [] },
      status: 'saved',
    });

    expect(JSON.parse(__fs.read(INDEX)!)[0]).not.toHaveProperty('emotion');
  });

  it('throws for an unknown id without touching any file', async () => {
    await expect(
      saveDream({
        id: 'nope',
        recordingUri: RECORDING,
        details: { title: 'T', tags: [] },
        status: 'saved',
      }),
    ).rejects.toThrow('Dream not found');

    expect(__fs.list()).toEqual([RECORDING]);
  });

  it('keeps both dreams when saves run at the same time', async () => {
    const other = 'file:///cache/other.m4a';
    __fs.put(other, 'other-bytes');
    const [a, b] = await Promise.all([
      save(RECORDING, 1, { title: 'A', tags: [] }),
      save(other, 1, { title: 'B', tags: [] }),
    ]);
    expect(a.id).not.toBe(b.id);
    expect((await listDreams()).map((d) => d.title).sort()).toEqual(['A', 'B']);
  });
});

describe('a corrupt index', () => {
  const corruptCopies = () => __fs.list().filter((u) => u.includes('dreams.corrupt-'));

  it('refuses to save, keeps a copy, and leaves the original and recording alone', async () => {
    __fs.put(INDEX, '{not json');
    await expect(save(RECORDING, 1000, { title: 'Hallway', tags: [] })).rejects.toThrow(
      'could not be read',
    );

    expect(__fs.read(INDEX)).toBe('{not json');
    expect(__fs.read(`file:///document/dreams.corrupt-${Date.now()}.json`)).toBe('{not json');
    expect(__fs.read(RECORDING)).toBe('audio-bytes');
  });

  it('copies the corrupt index only once per session across failing saves', async () => {
    __fs.put(INDEX, '{not json');
    await expect(save(RECORDING, 1, { title: 'A', tags: [] })).rejects.toThrow();
    jest.setSystemTime(new Date('2026-10-04T09:00:00Z'));
    await expect(save(RECORDING, 1, { title: 'B', tags: [] })).rejects.toThrow();

    expect(corruptCopies()).toHaveLength(1);
  });

  it('never copies when only displaying', async () => {
    __fs.put(INDEX, '{not json');
    expect(await listDreams()).toEqual([]);
    expect(await listEmotions()).toEqual([]);

    expect(__fs.copies()).toEqual([]);
    expect(corruptCopies()).toEqual([]);
  });

  it('throws the same error when the corrupt copy itself fails', async () => {
    __fs.put(INDEX, '{not json');
    __fs.failNext('copy');
    await expect(save(RECORDING, 1, { title: 'A', tags: [] })).rejects.toThrow(
      'The dream index could not be read',
    );
    expect(__fs.read(INDEX)).toBe('{not json');
  });

  it('copies again after the index has been readable', async () => {
    __fs.put(INDEX, '{not json');
    await expect(save(RECORDING, 1, { title: 'A', tags: [] })).rejects.toThrow();
    __fs.put(INDEX, '[]');
    await save(RECORDING, 1, { title: 'B', tags: [] });
    __fs.put(INDEX, '{broken again');
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-04T09:00:00Z'));
    await expect(save(RECORDING, 1, { title: 'C', tags: [] })).rejects.toThrow();

    expect(corruptCopies()).toHaveLength(2);
  });

  it('still saves normally when the index is merely missing', async () => {
    expect(__fs.has(INDEX)).toBe(false);
    await save(RECORDING, 1000, { title: 'First', tags: [] });
    expect(await listDreams()).toHaveLength(1);
  });

  it('keeps working after a failed save once the index is readable', async () => {
    __fs.put(INDEX, '{not json');
    await expect(save(RECORDING, 1, { title: 'A', tags: [] })).rejects.toThrow();
    __fs.put(INDEX, '[]');
    await save(RECORDING, 1, { title: 'B', tags: [] });
    expect((await listDreams()).map((d) => d.title)).toEqual(['B']);
  });
});

describe('listEmotions', () => {
  it('ranks words by use then alphabetically, drafts included, splitting only on , and ;', async () => {
    const make = (emotion: string, status: 'draft' | 'saved') =>
      saveDream({ details: { title: 'T', emotion, tags: [] }, status });
    await make('Uneasy, calm', 'saved');
    await make('calm; a bit lost', 'draft');
    await make('joy', 'saved');

    expect(await listEmotions()).toEqual(['calm', 'a bit lost', 'joy', 'uneasy']);
  });
});

describe('a failed index write', () => {
  const EMPTY_WRITE = { leave: 'empty' } as const;
  const A = { title: 'A', tags: [] as string[] };

  it('does not lock out a first save: the empty index is removed and the next save works', async () => {
    __fs.failNext('write', new Error('disk full'), EMPTY_WRITE);
    await expect(save(RECORDING, 1000, A)).rejects.toThrow('disk full');

    expect(__fs.has(INDEX)).toBe(false);
    expect(__fs.read(RECORDING)).toBe('audio-bytes');

    await save(RECORDING, 1000, A);
    expect((await listDreams()).map((d) => d.title)).toEqual(['A']);
  });

  it('rewrites an existing index from memory to its pre-save content, keeps the recording and drops the copy', async () => {
    await save(RECORDING, 1, A);
    __fs.put(RECORDING, 'audio-bytes');
    const before = __fs.read(INDEX);
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    __fs.failNext('write', new Error('disk full'), EMPTY_WRITE);
    await expect(save(RECORDING, 1, { title: 'B', tags: [] })).rejects.toThrow('disk full');

    expect(__fs.read(INDEX)).toBe(before);
    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    expect(__fs.list().filter(isDreamAudio)).toHaveLength(1);
    expect((await listDreams()).map((d) => d.title)).toEqual(['A']);
  });

  it('with the backup copy also failing, repairs the index from memory and keeps every dream', async () => {
    const first = await save(RECORDING, 1, A);
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    const second = await save(RECORDING, 1, { title: 'B', tags: [] });
    // The backup now holds exactly [first]; the index holds [first, second].
    const bakBefore = __fs.read(BAK);
    expect(JSON.parse(bakBefore!)).toEqual([first]);

    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-06T08:00:00Z'));
    __fs.failWhen('copy', isIndex);
    __fs.failNext('write', new Error('disk full'), EMPTY_WRITE);
    await expect(save(RECORDING, 1, { title: 'C', tags: [] })).rejects.toThrow('disk full');

    // The index was rewritten from the in-memory list: the stale backup is not the base.
    expect(JSON.parse(__fs.read(INDEX)!)).toEqual([first, second]);
    expect(__fs.read(BAK)).toBe(bakBefore);
    expect((await listDreams()).map((d) => d.title).sort()).toEqual(['A', 'B']);

    __fs.clearFailures();
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-07T08:00:00Z'));
    await save(RECORDING, 1, { title: 'D', tags: [] });
    expect((await listDreams()).map((d) => d.title).sort()).toEqual(['A', 'B', 'D']);
  });

  // Documented residual, not desired behavior: if the write, the rewrite and the backup are all
  // unavailable, the index stays empty: every earlier dream disappears from the list, not only the
  // latest save (the audio files and the recording stay on disk, but nothing indexes them).
  it('residual: write and rewrite both failing with no backup leaves the index empty', async () => {
    await save(RECORDING, 1, A);
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    __fs.failWhen('copy', isIndex);
    __fs.failWhen('write', isIndex, new Error('disk full'), EMPTY_WRITE);
    await expect(save(RECORDING, 1, { title: 'B', tags: [] })).rejects.toThrow('disk full');

    expect(__fs.read(INDEX)).toBe('');
    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    expect(__fs.list().filter(isDreamAudio)).toHaveLength(1);
  });

  it('copies the backup back when the in-memory rewrite also fails, leaving the pre-save index', async () => {
    const first = await save(RECORDING, 1, A);
    __fs.put(RECORDING, 'audio-bytes');
    const before = __fs.read(INDEX);
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    // Every index write fails and empties it, so only the .bak copy-back can repair it.
    __fs.failWhen('write', isIndex, new Error('disk full'), EMPTY_WRITE);
    await expect(save(RECORDING, 1, { title: 'B', tags: [] })).rejects.toThrow('disk full');

    expect(__fs.copies()).toContainEqual({ from: BAK, to: INDEX });
    expect(__fs.read(INDEX)).toBe(before);
    expect(JSON.parse(__fs.read(INDEX)!)).toEqual([first]);
    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    expect(__fs.list().filter(isDreamAudio)).toHaveLength(1);
  });

  it('a failed backup copy that leaves a partial .bak still saves, and the partial backup is never used to repair', async () => {
    const first = await save(RECORDING, 1, A);
    const before = __fs.read(INDEX)!;
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    __fs.failWhen('copy', isIndex, new Error('copy failed'), { leave: 'partial' });
    const second = await save(RECORDING, 1, { title: 'B', tags: [] });

    expect(__fs.read(BAK)).toBe(before.slice(0, Math.floor(before.length / 2)));
    expect(() => JSON.parse(__fs.read(BAK)!)).toThrow();
    expect(await listDreams()).toEqual([second, first]);

    // Same again, but the index write fails too: repaired from memory, not from the partial .bak.
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-06T08:00:00Z'));
    const indexBefore = __fs.read(INDEX);
    __fs.failNext('write', new Error('disk full'), EMPTY_WRITE);
    await expect(save(RECORDING, 1, { title: 'C', tags: [] })).rejects.toThrow('disk full');
    expect(__fs.read(INDEX)).toBe(indexBefore);
    expect(__fs.copies().filter((c) => c.from === BAK)).toEqual([]);
  });

  // Documented consequence, not desired behavior: when there was no content to back up, the failed
  // write leaves a partial index and removing it also fails, the index stays non-empty but
  // unparseable. Reads then report 'unreadable' and every later save is refused with
  // INDEX_UNREADABLE (a lockout) until the file is fixed or removed by hand. The original write
  // error is still the one thrown, and no cleanup step throws anything else.
  it('residual: a leftover partial index that cannot be deleted locks later saves out', async () => {
    __fs.put(INDEX, '');
    __fs.failNext('write', new Error('disk full'), { leave: 'partial' });
    __fs.failWhen('delete', isIndex, new Error('delete failed'));
    await expect(save(RECORDING, 1, A)).rejects.toThrow('disk full');

    expect(__fs.has(INDEX)).toBe(true);
    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    expect(__fs.list().filter(isDreamAudio)).toHaveLength(0);
    expect(await getIndexStatus()).toBe('unreadable');
    await expect(save(RECORDING, 1, A)).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });
  });

  it('a zero-length index with no backup is deleted after a partial failed write, and saving works', async () => {
    __fs.put(INDEX, '');
    __fs.failNext('write', new Error('disk full'), { leave: 'partial' });
    await expect(save(RECORDING, 1, A)).rejects.toThrow('disk full');

    expect(__fs.has(INDEX)).toBe(false);
    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    await save(RECORDING, 1, A);
    expect(await listDreams()).toHaveLength(1);
  });

  it('a zero-length index with a backup is deleted after a partial failed write; the backup dreams show', async () => {
    const old = { id: '1', createdAt: 'x', durationMs: 0, title: 'Old', tags: [] };
    __fs.put(INDEX, '');
    __fs.put(BAK, JSON.stringify([old]));
    __fs.failNext('write', new Error('disk full'), { leave: 'partial' });
    await expect(save(RECORDING, 1, A)).rejects.toThrow('disk full');

    expect(__fs.has(INDEX)).toBe(false);
    expect(await listDreams()).toEqual([old]);
  });

  it('rewrites a parseable index to its pre-save content when the backup copy fails and the write empties it', async () => {
    const first = await save(RECORDING, 1, A);
    const before = __fs.read(INDEX);
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    __fs.failWhen('copy', isIndex, new Error('copy failed'), { leave: 'missing' });
    __fs.failNext('write', new Error('disk full'), EMPTY_WRITE);
    await expect(save(RECORDING, 1, { title: 'B', tags: [] })).rejects.toThrow('disk full');

    expect(__fs.has(BAK)).toBe(false);
    expect(__fs.read(INDEX)).toBe(before);
    expect(await listDreams()).toEqual([first]);
  });

  it('throws the original error and keeps the recording when the rewrite and the restore copy both fail', async () => {
    await save(RECORDING, 1, A);
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    __fs.failWhen('write', isIndex, new Error('disk full'), EMPTY_WRITE);
    __fs.failWhen('copy', (uri) => uri === BAK, new Error('restore failed'), {
      leave: 'missing',
    });
    await expect(save(RECORDING, 1, { title: 'B', tags: [] })).rejects.toThrow('disk full');

    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    expect(__fs.list().filter(isDreamAudio)).toHaveLength(1);
  });

  it('never touches an index that survived the failed write (only the one backup copy happens)', async () => {
    await save(RECORDING, 1, A);
    __fs.put(RECORDING, 'audio-bytes');
    const before = __fs.read(INDEX);
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    __fs.failNext('write', new Error('disk full'));
    await expect(save(RECORDING, 1, { title: 'B', tags: [] })).rejects.toThrow('disk full');

    expect(__fs.read(INDEX)).toBe(before);
    expect(__fs.copies().filter((c) => c.from === INDEX || c.to === INDEX)).toEqual([
      { from: INDEX, to: BAK },
    ]);
  });

  it('rolls back an update of an existing dream without damaging the index', async () => {
    const dream = await save(RECORDING, 1, A);
    const before = __fs.read(INDEX);
    __fs.failNext('write', new Error('disk full'), EMPTY_WRITE);
    await expect(
      saveDream({ id: dream.id, details: { title: 'Renamed', tags: [] }, status: 'saved' }),
    ).rejects.toThrow('disk full');

    expect(__fs.read(INDEX)).toBe(before);
    expect((await listDreams())[0].title).toBe('A');
  });

  it('reads a zero-length index with no backup as empty and can be saved over', async () => {
    __fs.put(INDEX, '');
    expect(await listDreams()).toEqual([]);
    expect(await getIndexStatus()).toBe('ok');

    await save(RECORDING, 1, A);
    expect((await listDreams()).map((d) => d.title)).toEqual(['A']);
    expect(__fs.has(BAK)).toBe(false);
  });
});

describe('an unreadable non-empty index', () => {
  it('is never restored from the backup: save throws a typed error and the file is untouched', async () => {
    __fs.put(INDEX, '{not json');
    __fs.put(
      BAK,
      JSON.stringify([{ id: '1', createdAt: 'x', durationMs: 0, title: 'T', tags: [] }]),
    );

    let caught: unknown;
    try {
      await save(RECORDING, 1, { title: 'A', tags: [] });
    } catch (error) {
      caught = error;
    }
    expect(isIndexUnreadableError(caught)).toBe(true);
    expect((caught as Error).message).toBe('The dream index could not be read');
    expect(isIndexUnreadableError(new Error('other'))).toBe(false);
    expect(isIndexUnreadableError(null)).toBe(false);
    expect(__fs.read(INDEX)).toBe('{not json');
    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    expect(await getIndexStatus()).toBe('unreadable');
    expect(await listDreams()).toEqual([]);
  });

  it('reports ok for a zero-length index with a garbage backup and writes nothing', async () => {
    __fs.put(INDEX, '');
    __fs.put(BAK, '{garbage');
    expect(await getIndexStatus()).toBe('ok');
    expect(__fs.copies()).toEqual([]);
    expect(__fs.read(INDEX)).toBe('');
    expect(__fs.read(BAK)).toBe('{garbage');
  });

  it('reports ok for a readable index without writing anything', async () => {
    __fs.put(INDEX, '[]');
    expect(await getIndexStatus()).toBe('ok');
    expect(__fs.copies()).toEqual([]);
  });
});

describe('a failed audio copy', () => {
  it('removes a partial destination, keeps the recording and rethrows the copy error', async () => {
    __fs.failNext('copy', new Error('copy broke'), { leave: 'partial' });
    await expect(save(RECORDING, 1, { title: 'A', tags: [] })).rejects.toThrow('copy broke');

    expect(__fs.list().filter(isDreamAudio)).toEqual([]);
    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('still throws the copy error when cleanup also fails', async () => {
    __fs.failNext('copy', new Error('copy broke'), { leave: 'partial' });
    __fs.failWhen('delete', isDreamAudio, new Error('cannot delete'));
    await expect(save(RECORDING, 1, { title: 'A', tags: [] })).rejects.toThrow('copy broke');

    expect(__fs.read(RECORDING)).toBe('audio-bytes');
  });
});

describe('audio file names', () => {
  it('never overwrites an orphan with the same name and gives the new dream its own file', async () => {
    const orphan = `file:///document/dreams/${Date.now()}.m4a`;
    __fs.put(orphan, 'orphan-bytes');
    const dream = await save(RECORDING, 1, { title: 'A', tags: [] });

    expect(__fs.read(orphan)).toBe('orphan-bytes');
    expect(dream.audioFileName).toBe(`${Date.now()}-1.m4a`);
    expect(__fs.read(dreamAudioUri(dream)!)).toBe('audio-bytes');
  });

  it('keeps an orphan with the same name when the audio copy fails, and rethrows', async () => {
    const orphan = `file:///document/dreams/${Date.now()}.m4a`;
    __fs.put(orphan, 'orphan-bytes');
    __fs.failNext('copy', new Error('copy broke'), { leave: 'partial' });
    await expect(save(RECORDING, 1, { title: 'A', tags: [] })).rejects.toThrow('copy broke');

    expect(__fs.read(orphan)).toBe('orphan-bytes');
    expect(__fs.list().filter(isDreamAudio)).toEqual([orphan]);
    expect(__fs.read(RECORDING)).toBe('audio-bytes');
  });
});

describe('updating emotion and transcript', () => {
  const create = () =>
    saveDream({
      details: { title: 'T', emotion: 'calm', tags: [], transcript: 'words' },
      status: 'saved',
    });

  it('keeps the stored values when omitted', async () => {
    const dream = await create();
    await saveDream({ id: dream.id, details: { title: 'New', tags: [] }, status: 'saved' });

    expect(JSON.parse(__fs.read(INDEX)!)[0]).toMatchObject({
      title: 'New',
      emotion: 'calm',
      transcript: 'words',
    });
  });

  it("clears them when given ''", async () => {
    const dream = await create();
    await saveDream({
      id: dream.id,
      details: { title: 'T', emotion: '', tags: [], transcript: '' },
      status: 'saved',
    });

    const stored = JSON.parse(__fs.read(INDEX)!)[0];
    expect(stored).not.toHaveProperty('emotion');
    expect(stored).not.toHaveProperty('transcript');
  });
});

describe('the fake file system itself', () => {
  const { File, Directory, Paths } = fakeFs;

  it('throws when deleting a missing path', () => {
    expect(() => new File(Paths.document, 'nope.txt').delete()).toThrow('path does not exist');
  });

  it('refuses to write or copy into a directory that was not created', async () => {
    const target = new File(Paths.document, 'dreams', 'a.m4a');
    expect(() => target.write('x')).toThrow();
    await expect(new File(RECORDING).copy(target)).rejects.toThrow();

    new Directory(Paths.document, 'dreams').create();
    await new File(RECORDING).copy(target);
    expect(__fs.read(target.uri)).toBe('audio-bytes');
  });

  it('refuses to create a directory twice unless idempotent', () => {
    const dir = new Directory(Paths.document, 'dreams');
    dir.create();
    expect(() => dir.create()).toThrow();
    dir.create({ idempotent: true });
  });

  it('a failed copy with leave missing removes an existing destination', async () => {
    const target = new File(Paths.document, 'x.bin');
    __fs.put(target.uri, 'old');
    __fs.failNext('copy', new Error('boom'), { leave: 'missing' });
    await expect(new File(RECORDING).copy(target, { overwrite: true })).rejects.toThrow('boom');
    expect(__fs.has(target.uri)).toBe(false);
    expect(__fs.has(RECORDING)).toBe(true);
  });

  it('a failed copy keeps its other behaviors: none leaves it unchanged, partial leaves half', async () => {
    const target = new File(Paths.document, 'x.bin');
    __fs.put(target.uri, 'old');
    __fs.failNext('copy', new Error('boom'));
    await expect(new File(RECORDING).copy(target, { overwrite: true })).rejects.toThrow('boom');
    expect(__fs.read(target.uri)).toBe('old');

    __fs.failNext('copy', new Error('boom'), { leave: 'partial' });
    await expect(new File(RECORDING).copy(target, { overwrite: true })).rejects.toThrow('boom');
    expect(__fs.read(target.uri)).toBe('audio');
  });

  it('copy without overwrite rejects when the destination exists', async () => {
    const target = new File(Paths.document, 'x.bin');
    __fs.put(target.uri, 'old');
    await expect(new File(RECORDING).copy(target)).rejects.toThrow('DestinationAlreadyExists');
    expect(__fs.read(target.uri)).toBe('old');
  });

  it('creates a missing file on write, and create() fails on an existing one', () => {
    const file = new File(Paths.document, 'x.json');
    expect(file.size).toBeNull();
    file.write('abc');
    expect(file.size).toBe(3);
    expect(() => file.create()).toThrow();
    file.create({ overwrite: true });
    expect(file.size).toBe(0);
  });
});
