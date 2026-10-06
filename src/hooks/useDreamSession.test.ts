import { act, renderHook } from '@testing-library/react-native';
import { Dream } from '../types/dream';
import { Session, sessionFromDraft, sessionReducer, useDreamSession } from './useDreamSession';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const recording = { uri: 'file:///cache/r.m4a', durationMs: 5000 };

const fresh = (): Session =>
  sessionReducer(null, { type: 'startFromRecording', recording, transcript: 'hello' })!;

describe('sessionReducer', () => {
  it('startFromRecording makes a capture session with cache audio and the live text', () => {
    expect(fresh()).toEqual({
      origin: 'capture',
      audio: { uri: recording.uri, durationMs: 5000, persisted: false },
      transcript: 'hello',
      title: '',
      emotion: '',
      tags: [],
      tagDraft: '',
      passedThroughReadItBack: false,
    });
  });

  it('startFromRecording replaces a previous session', () => {
    const next = sessionReducer(
      { ...fresh(), title: 'old' },
      { type: 'startFromRecording', recording, transcript: '' },
    );
    expect(next?.title).toBe('');
    expect(next?.transcript).toBe('');
  });

  it('startWriting makes an empty session with no audio', () => {
    const s = sessionReducer(fresh(), { type: 'startWriting' });
    expect(s).toEqual({
      origin: 'write',
      transcript: '',
      title: '',
      emotion: '',
      tags: [],
      tagDraft: '',
      passedThroughReadItBack: false,
    });
    expect(s?.audio).toBeUndefined();
  });

  it('openDraft installs the given session', () => {
    const draft: Session = { ...fresh(), origin: 'draft', id: '7', createdAt: 'x' };
    expect(sessionReducer(null, { type: 'openDraft', session: draft })).toBe(draft);
  });

  it('sets transcript, title, emotion and tags without touching the rest', () => {
    let s: Session | null = fresh();
    s = sessionReducer(s, { type: 'setTranscript', value: 'new text' });
    s = sessionReducer(s, { type: 'setTitle', value: 'T' });
    s = sessionReducer(s, { type: 'setEmotion', value: 'calm' });
    s = sessionReducer(s, { type: 'setTags', value: ['a', 'b'] });
    expect(s).toMatchObject({
      transcript: 'new text',
      title: 'T',
      emotion: 'calm',
      tags: ['a', 'b'],
      origin: 'capture',
      audio: { uri: recording.uri },
    });
  });

  it('setTagDraft keeps pending tag text in the session', () => {
    const s = sessionReducer(fresh(), { type: 'setTagDraft', value: 'fall' });
    expect(s?.tagDraft).toBe('fall');
    expect(sessionReducer(null, { type: 'setTagDraft', value: 'x' })).toBeNull();
  });

  it('markSaved records the new id and moves a cache recording to its permanent file', () => {
    const s = sessionReducer(fresh(), {
      type: 'markSaved',
      id: '9',
      createdAt: 'c',
      audioUri: 'file:///docs/dreams/9.m4a',
    });
    expect(s).toMatchObject({
      id: '9',
      createdAt: 'c',
      audio: { uri: 'file:///docs/dreams/9.m4a', durationMs: 5000, persisted: true },
    });
  });

  it('markSaved leaves a written dream without audio', () => {
    const written = sessionReducer(null, { type: 'startWriting' });
    const s = sessionReducer(written, {
      type: 'markSaved',
      id: '9',
      createdAt: 'c',
      audioUri: null,
    });
    expect(s?.id).toBe('9');
    expect(s?.audio).toBeUndefined();
  });

  it('markPassedThroughReadItBack sets the flag', () => {
    const s = sessionReducer(fresh(), { type: 'markPassedThroughReadItBack' });
    expect(s?.passedThroughReadItBack).toBe(true);
  });

  it('clear resets to no session', () => {
    expect(sessionReducer(fresh(), { type: 'clear' })).toBeNull();
  });

  it('ignores setters and the flag when there is no session', () => {
    expect(sessionReducer(null, { type: 'setTitle', value: 'x' })).toBeNull();
    expect(sessionReducer(null, { type: 'setTranscript', value: 'x' })).toBeNull();
    expect(sessionReducer(null, { type: 'markPassedThroughReadItBack' })).toBeNull();
  });
});

describe('sessionFromDraft', () => {
  const dream: Dream = {
    id: '42',
    createdAt: '2026-10-05T08:00:00.000Z',
    durationMs: 9000,
    audioFileName: '42.m4a',
    title: 'Flooded hall',
    emotion: 'uneasy',
    tags: ['water'],
    transcript: 'it filled up',
    status: 'draft',
  };

  it('carries fields over and marks the audio as persisted', () => {
    const s = sessionFromDraft(dream);
    expect(s).toMatchObject({
      origin: 'draft',
      id: '42',
      createdAt: dream.createdAt,
      transcript: 'it filled up',
      title: 'Flooded hall',
      emotion: 'uneasy',
      tags: ['water'],
      tagDraft: '',
      passedThroughReadItBack: true,
    });
    expect(s.audio?.persisted).toBe(true);
    expect(s.audio?.durationMs).toBe(9000);
    expect(s.audio?.uri).toContain('42.m4a');
  });

  it('has no audio for a written draft and defaults missing fields', () => {
    const s = sessionFromDraft({ id: '1', createdAt: 'c', durationMs: 0, title: '', tags: [] });
    expect(s.audio).toBeUndefined();
    expect(s.transcript).toBe('');
    expect(s.emotion).toBe('');
  });
});

describe('useDreamSession', () => {
  it('starts with no session and runs the actions', async () => {
    const { result } = await renderHook(() => useDreamSession());
    expect(result.current.session).toBeNull();
    await act(async () => result.current.startWriting());
    expect(result.current.session?.origin).toBe('write');
    await act(async () => result.current.clear());
    expect(result.current.session).toBeNull();
  });

  it('keeps title, emotion, tags and text across Review -> Edit -> Review', async () => {
    const { result } = await renderHook(() => useDreamSession());
    await act(async () => result.current.startFromRecording(recording, 'first'));
    await act(async () => result.current.markPassedThroughReadItBack());
    await act(async () => {
      result.current.setTitle('Title');
      result.current.setEmotion('calm');
      result.current.setTags(['x']);
    });
    // Edit: the user changes the text on Read it back, then comes back to Review.
    await act(async () => result.current.setTranscript('first, edited'));
    expect(result.current.session).toMatchObject({
      transcript: 'first, edited',
      title: 'Title',
      emotion: 'calm',
      tags: ['x'],
      passedThroughReadItBack: true,
      audio: { uri: recording.uri, persisted: false },
    });
  });

  it('openDraft builds the session from a stored dream', async () => {
    const { result } = await renderHook(() => useDreamSession());
    await act(async () =>
      result.current.openDraft({
        id: '5',
        createdAt: 'c',
        durationMs: 0,
        title: 't',
        tags: [],
        status: 'draft',
      }),
    );
    expect(result.current.session).toMatchObject({ origin: 'draft', id: '5', title: 't' });
  });
});
