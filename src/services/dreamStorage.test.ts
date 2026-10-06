import * as fakeFs from '../test/fakeFileSystem';
import { discardRecording, dreamAudioUri, listDreams, listTags, saveDream } from './dreamStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const RECORDING = 'file:///cache/recording.m4a';
const INDEX = 'file:///document/dreams.json';

beforeEach(() => {
  __fs.reset();
  __fs.put(RECORDING, 'audio-bytes');
  jest.useFakeTimers().setSystemTime(new Date('2026-10-04T08:00:00Z'));
});

afterEach(() => jest.useRealTimers());

describe('saveDream', () => {
  it('moves the recording into the dreams directory and indexes it', async () => {
    const dream = await saveDream(RECORDING, 42_000, { title: 'Flooded hallway', tags: ['water'] });

    expect(__fs.has(RECORDING)).toBe(false);
    expect(__fs.read(dreamAudioUri(dream))).toBe('audio-bytes');
    expect(dream).toMatchObject({
      title: 'Flooded hallway',
      durationMs: 42_000,
      tags: ['water'],
      createdAt: '2026-10-04T08:00:00.000Z',
    });
    expect(await listDreams()).toEqual([dream]);
  });

  it('trims the title and emotion, and omits a blank emotion', async () => {
    const withEmotion = await saveDream(RECORDING, 1000, {
      title: '  Hallway ',
      emotion: ' uneasy ',
      tags: [],
    });
    expect(withEmotion.title).toBe('Hallway');
    expect(withEmotion.emotion).toBe('uneasy');

    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-04T09:00:00Z'));
    const blankEmotion = await saveDream(RECORDING, 1000, {
      title: 'Second',
      emotion: '   ',
      tags: [],
    });
    expect(blankEmotion).not.toHaveProperty('emotion');
  });

  it('rejects an empty title and leaves the recording untouched', async () => {
    await expect(saveDream(RECORDING, 1000, { title: '   ', tags: [] })).rejects.toThrow(
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
    await saveDream(RECORDING, 1000, { title: 'Older', tags: [] });
    __fs.put(RECORDING, 'audio-bytes');
    jest.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    await saveDream(RECORDING, 1000, { title: 'Newer', tags: [] });

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

  it('treats a corrupt index as empty', async () => {
    __fs.put(INDEX, '{not json');
    expect(await listDreams()).toEqual([]);
  });
});

describe('listTags', () => {
  it('orders tags by use, then alphabetically', async () => {
    const save = async (title: string, tags: string[], at: string) => {
      __fs.put(RECORDING, 'audio-bytes');
      jest.setSystemTime(new Date(at));
      await saveDream(RECORDING, 1000, { title, tags });
    };
    await save('One', ['water', 'falling'], '2026-10-01T00:00:00Z');
    await save('Two', ['water', 'house'], '2026-10-02T00:00:00Z');
    await save('Three', ['water'], '2026-10-03T00:00:00Z');

    expect(await listTags()).toEqual(['water', 'falling', 'house']);
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
