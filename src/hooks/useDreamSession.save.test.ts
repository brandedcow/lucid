import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { INDEX_UNREADABLE, saveDream } from '../services/dreamStorage';
import { useDreamSession } from './useDreamSession';

jest.mock('../services/dreamStorage', () => ({
  INDEX_UNREADABLE: 'INDEX_UNREADABLE',
  saveDream: jest.fn(),
  dreamAudioUri: jest.fn((d: { audioFileName?: string }) =>
    d.audioFileName ? `file:///docs/dreams/${d.audioFileName}` : null,
  ),
  isIndexUnreadableError: (e: { code?: string } | null) => e?.code === 'INDEX_UNREADABLE',
}));

const save = saveDream as jest.Mock;
const recording = { uri: 'file:///cache/r.m4a', durationMs: 5000 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  save.mockResolvedValue({ id: '9', createdAt: 'c', audioFileName: '9.m4a' });
});
afterEach(() => jest.restoreAllMocks());

async function started() {
  const hook = await renderHook(() => useDreamSession());
  await act(async () => hook.result.current.startFromRecording(recording, 'text'));
  return hook;
}

describe('useDreamSession save', () => {
  it('saves a new recording with full details, then holds the new id and permanent audio', async () => {
    const { result } = await started();
    await act(async () => {
      result.current.setTitle('T');
      result.current.setEmotion('calm');
      result.current.setTagDraft('Falling');
    });
    let ok = false;
    await act(async () => {
      ok = await result.current.save('draft');
    });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledWith({
      recordingUri: recording.uri,
      durationMs: 5000,
      details: { title: 'T', emotion: 'calm', tags: ['falling'], transcript: 'text' },
      status: 'draft',
    });
    expect(result.current.session).toMatchObject({
      id: '9',
      audio: { uri: 'file:///docs/dreams/9.m4a', persisted: true },
    });
    // A second save updates the same dream and never re-sends the recording.
    await act(async () => {
      await result.current.save('saved');
    });
    const second = save.mock.calls[1][0];
    expect(second.id).toBe('9');
    expect(second).not.toHaveProperty('recordingUri');
  });

  it('saves an edit with its id and full details, never a recordingUri, and keeps its audio', async () => {
    const hook = await renderHook(() => useDreamSession());
    const dream = {
      id: '4',
      createdAt: 'c0',
      durationMs: 8000,
      audioFileName: '4.m4a',
      title: 'Old',
      emotion: 'calm',
      tags: ['a'],
      transcript: 'old text',
    };
    await act(async () => hook.result.current.openDream(dream));
    await act(async () => {
      hook.result.current.setEmotion('');
      hook.result.current.setTranscript('');
    });
    save.mockResolvedValue({ ...dream, emotion: undefined, transcript: undefined });
    await act(async () => {
      await hook.result.current.save('saved');
    });
    expect(save).toHaveBeenCalledWith({
      id: '4',
      durationMs: 8000,
      details: { title: 'Old', emotion: '', tags: ['a'], transcript: '' },
      status: 'saved',
    });
    expect(hook.result.current.session?.audio).toEqual({
      uri: 'file:///docs/dreams/4.m4a',
      durationMs: 8000,
      persisted: true,
    });
  });

  it('saves an edit of a dream with no audio with durationMs 0', async () => {
    const hook = await renderHook(() => useDreamSession());
    await act(async () =>
      hook.result.current.openDream({
        id: '5',
        createdAt: 'c0',
        durationMs: 0,
        title: 'Typed',
        tags: [],
      }),
    );
    save.mockResolvedValue({ id: '5', createdAt: 'c0', durationMs: 0, title: 'Typed', tags: [] });
    await act(async () => {
      await hook.result.current.save('saved');
    });
    expect(save.mock.calls[0][0]).toMatchObject({ id: '5', durationMs: 0, status: 'saved' });
    expect(save.mock.calls[0][0]).not.toHaveProperty('recordingUri');
    expect(hook.result.current.session?.audio).toBeUndefined();
  });

  it('does not save as finished without a title', async () => {
    const { result } = await started();
    let ok = true;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('creates no empty draft when there is nothing to keep, but still reports success', async () => {
    const hook = await renderHook(() => useDreamSession());
    await act(async () => hook.result.current.startWriting());
    let ok = false;
    await act(async () => {
      ok = await hook.result.current.save('draft');
    });
    expect(ok).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('runs one save for two calls in the same frame', async () => {
    const { result } = await started();
    let resolve: (v: unknown) => void = () => {};
    save.mockReturnValue(new Promise((r) => (resolve = r)));
    let results: boolean[] = [];
    await act(async () => {
      const both = Promise.all([result.current.save('draft'), result.current.save('draft')]);
      expect(result.current.isSaving()).toBe(true);
      resolve({ id: '9', createdAt: 'c' });
      results = await both;
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(results).toEqual([true, false]);
    expect(result.current.isSaving()).toBe(false);
  });

  it('keeps the session and shows the generic Alert when saving fails', async () => {
    const { result } = await started();
    save.mockRejectedValue(new Error('boom'));
    let ok = true;
    await act(async () => {
      ok = await result.current.save('draft');
    });
    expect(ok).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('Could not save your dream', 'Please try again.');
    expect(result.current.session?.audio?.persisted).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it('shows the specific Alert when the index is unreadable', async () => {
    const { result } = await started();
    save.mockRejectedValue(Object.assign(new Error('x'), { code: INDEX_UNREADABLE }));
    await act(async () => {
      await result.current.save('draft');
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not save your dream',
      'Your saved dreams could not be read, so this dream was not saved. Your recording is still here.',
    );
  });
});
