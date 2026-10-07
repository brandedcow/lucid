import { act, renderHook } from '@testing-library/react-native';
import { dreamAudioUri, listDreams } from '../services/dreamStorage';
import { __fs } from '../test/fakeFileSystem';
import { Dream, hasAudio } from '../types/dream';
import { useDreamSession } from './useDreamSession';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const INDEX = 'file:///document/dreams.json';
const AUDIO = 'file:///document/dreams/7.m4a';

beforeEach(() => {
  __fs.reset();
  __fs.put(AUDIO, 'audio-bytes');
});

const finished = {
  id: '7',
  createdAt: '2026-10-01T08:00:00.000Z',
  durationMs: 12_000,
  audioFileName: '7.m4a',
  title: 'Old title',
  emotion: 'uneasy',
  tags: ['water'],
  transcript: 'old text',
  futureField: { keep: true },
};

/** Seeds the index (the entry may carry fields this app version does not know) and opens it. */
async function open(dream: object) {
  __fs.put(INDEX, JSON.stringify([dream]));
  const hook = await renderHook(() => useDreamSession());
  await act(async () => hook.result.current.openDream(dream as Dream));
  return hook;
}

describe('saving an edited dream (real saveDream, fake file system)', () => {
  it('keeps id, createdAt, audio and duration, deletes no audio, keeps unknown fields', async () => {
    const { result } = await open(finished);
    await act(async () => {
      result.current.setTitle('New title');
      result.current.setTags(['water', 'hall']);
      result.current.setTranscript('new text');
    });
    let ok = false;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(true);
    const [dream] = (await listDreams()) as (Dream & { futureField?: unknown })[];
    expect(dream).toMatchObject({
      id: '7',
      createdAt: finished.createdAt,
      audioFileName: '7.m4a',
      durationMs: 12_000,
      title: 'New title',
      emotion: 'uneasy',
      tags: ['water', 'hall'],
      transcript: 'new text',
      futureField: { keep: true },
    });
    expect(dream.status).toBeUndefined();
    expect(__fs.read(AUDIO)).toBe('audio-bytes');
    expect(__fs.list().filter((u) => u.endsWith('.m4a'))).toEqual([AUDIO]);
    // The session still points at the same permanent audio.
    expect(result.current.session?.audio).toMatchObject({
      uri: dreamAudioUri(dream),
      durationMs: 12_000,
      persisted: true,
    });
  });

  it('clears emotion and transcript with empty strings', async () => {
    const { result } = await open(finished);
    await act(async () => {
      result.current.setEmotion('');
      result.current.setTranscript('');
    });
    await act(async () => {
      await result.current.save('saved');
    });
    const [dream] = await listDreams();
    expect(dream).not.toHaveProperty('emotion');
    expect(dream).not.toHaveProperty('transcript');
    expect(dream.title).toBe('Old title');
    expect(hasAudio(dream)).toBe(true);
  });

  it('edits a dream with no audio (duration stays 0, no audio file created)', async () => {
    const written = {
      id: '8',
      createdAt: '2026-10-02T08:00:00.000Z',
      durationMs: 0,
      title: 'Written',
      tags: [],
      transcript: 'typed',
    };
    const { result } = await open(written);
    await act(async () => result.current.setTitle('Written, renamed'));
    await act(async () => {
      await result.current.save('saved');
    });
    const [dream] = await listDreams();
    expect(dream).toMatchObject({ id: '8', title: 'Written, renamed', durationMs: 0 });
    expect(hasAudio(dream)).toBe(false);
    expect(__fs.list().filter((u) => u.endsWith('.m4a'))).toEqual([AUDIO]);
  });

  it('confirms a pending tag into the saved tags', async () => {
    const { result } = await open(finished);
    await act(async () => result.current.setTagDraft('Hall'));
    await act(async () => {
      await result.current.save('saved');
    });
    expect((await listDreams())[0].tags).toEqual(['water', 'hall']);
  });

  it('confirms a pending emotion into the saved emotion, lowercase and joined', async () => {
    const { result } = await open(finished);
    await act(async () => result.current.setEmotionDraft('Calm'));
    await act(async () => {
      await result.current.save('saved');
    });
    expect((await listDreams())[0].emotion).toBe('uneasy, calm');
  });

  it('leaves an old free-text emotion as it was when nothing is pending', async () => {
    const { result } = await open({ ...finished, emotion: 'A bit uneasy;Calm' });
    await act(async () => {
      await result.current.save('saved');
    });
    expect((await listDreams())[0].emotion).toBe('A bit uneasy;Calm');
  });
});
