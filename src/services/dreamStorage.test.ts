import * as fakeFs from '../test/fakeFileSystem';
import { hasAudio, isDraft } from '../types/dream';
import {
  discardRecording,
  dreamAudioUri,
  listDreams,
  listEmotions,
  listTags,
  saveDream,
} from './dreamStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const RECORDING = 'file:///cache/recording.m4a';
const INDEX = 'file:///document/dreams.json';

type Details = { title: string; emotion?: string; tags: string[]; transcript?: string };
/** Finish a recording (the common case in these tests). */
const save = (uri: string, durationMs: number, details: Details) =>
  saveDream({ recordingUri: uri, durationMs, details, status: 'saved' });

beforeEach(() => {
  __fs.reset();
  __fs.put(RECORDING, 'audio-bytes');
  jest.useFakeTimers().setSystemTime(new Date('2026-10-04T08:00:00Z'));
});

afterEach(() => jest.useRealTimers());

describe('saveDream', () => {
  it('moves the recording into the dreams directory and indexes it', async () => {
    const dream = await save(RECORDING, 42_000, { title: 'Flooded hallway', tags: ['water'] });

    expect(__fs.has(RECORDING)).toBe(false);
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

describe('listTags', () => {
  it('orders tags by use, then alphabetically', async () => {
    const saveAt = async (title: string, tags: string[], at: string) => {
      __fs.put(RECORDING, 'audio-bytes');
      jest.setSystemTime(new Date(at));
      await save(RECORDING, 1000, { title, tags });
    };
    await saveAt('One', ['water', 'falling'], '2026-10-01T00:00:00Z');
    await saveAt('Two', ['water', 'house'], '2026-10-02T00:00:00Z');
    await saveAt('Three', ['water'], '2026-10-03T00:00:00Z');

    expect(await listTags()).toEqual(['water', 'falling', 'house']);
  });
});

describe('saveDream as an upsert', () => {
  const blank = { title: '', tags: [] as string[] };

  it('creates a draft with a blank title and moves the recording', async () => {
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
    // A stray recordingUri on a dream that already has audio must not move anything again.
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

  it('puts the recording back if the index cannot be written', async () => {
    const write = jest.spyOn(fakeFs.File.prototype, 'write').mockImplementation(() => {
      throw new Error('disk full');
    });
    await expect(save(RECORDING, 1000, { title: 'Hallway', tags: [] })).rejects.toThrow(
      'disk full',
    );
    write.mockRestore();

    expect(__fs.read(RECORDING)).toBe('audio-bytes');
    expect(await listDreams()).toEqual([]);
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
  it('refuses to save, keeps a copy, and leaves the original and recording alone', async () => {
    __fs.put(INDEX, '{not json');
    await expect(save(RECORDING, 1000, { title: 'Hallway', tags: [] })).rejects.toThrow(
      'could not be read',
    );

    expect(__fs.read(INDEX)).toBe('{not json');
    expect(__fs.read(`file:///document/dreams.corrupt-${Date.now()}.json`)).toBe('{not json');
    expect(__fs.read(RECORDING)).toBe('audio-bytes');
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

describe('discardRecording', () => {
  it('deletes an unsaved recording', () => {
    discardRecording(RECORDING);
    expect(__fs.has(RECORDING)).toBe(false);
  });

  it('does nothing if the file is already gone', () => {
    discardRecording('file:///cache/missing.m4a');
  });
});
