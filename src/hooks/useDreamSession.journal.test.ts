import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { saveDream } from '../services/dreamStorage';
import { Dream } from '../types/dream';
import {
  sessionFromDraft,
  sessionFromDream,
  sessionReducer,
  useDreamSession,
} from './useDreamSession';

jest.mock('../services/dreamStorage', () => ({
  saveDream: jest.fn(),
  dreamAudioUri: jest.fn((d: { audioFileName?: string }) =>
    d.audioFileName ? `file:///docs/dreams/${d.audioFileName}` : null,
  ),
  isIndexUnreadableError: (e: { code?: string } | null) => e?.code === 'INDEX_UNREADABLE',
}));

const save = saveDream as jest.Mock;
const recording = { uri: 'file:///cache/r.m4a', durationMs: 5000 };
const stored = (extra: object = {}): Dream =>
  ({ id: '7', createdAt: 'c', durationMs: 0, title: 'T', tags: [], ...extra }) as Dream;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  save.mockResolvedValue({ id: '9', createdAt: 'c' });
});
afterEach(() => jest.restoreAllMocks());

describe('session journalId', () => {
  it('starts in Dreams by default and in the given journal otherwise', () => {
    const s = (a: Parameters<typeof sessionReducer>[1]) => sessionReducer(null, a)?.journalId;
    expect(s({ type: 'startFromRecording', recording, transcript: '' })).toBe('dreams');
    expect(s({ type: 'startWriting' })).toBe('dreams');
    expect(s({ type: 'startFromRecording', recording, transcript: '', journalId: 'life' })).toBe(
      'life',
    );
    expect(s({ type: 'startWriting', transcript: 'x', journalId: 'life' })).toBe('life');
  });

  it('the hook start actions take an optional journal id', async () => {
    const { result } = await renderHook(() => useDreamSession());
    await act(async () => result.current.startFromRecording(recording, 't'));
    expect(result.current.session?.journalId).toBe('dreams');
    await act(async () => result.current.startFromRecording(recording, 't', 'life'));
    expect(result.current.session?.journalId).toBe('life');
    await act(async () => result.current.startWriting('', 'life'));
    expect(result.current.session?.journalId).toBe('life');
    await act(async () => result.current.startWriting());
    expect(result.current.session?.journalId).toBe('dreams');
  });

  it('seeds from the record via journalOf: legacy is Dreams, life stays life, unknown is kept', async () => {
    expect(sessionFromDream(stored(), 'edit').journalId).toBe('dreams');
    expect(sessionFromDraft(stored()).journalId).toBe('dreams');
    expect(sessionFromDream(stored({ journalId: 'life' }), 'edit').journalId).toBe('life');
    expect(sessionFromDraft(stored({ journalId: 'life', status: 'draft' })).journalId).toBe('life');
    expect(sessionFromDraft(stored({ journalId: 'future' })).journalId).toBe('future');
    const { result } = await renderHook(() => useDreamSession());
    await act(async () => result.current.openDream(stored({ journalId: 'life' })));
    expect(result.current.session?.journalId).toBe('life');
    await act(async () => result.current.openDraft(stored({ status: 'draft' })));
    expect(result.current.session?.journalId).toBe('dreams');
  });
});

describe('save passes the journal', () => {
  it('a Dreams session saves with journalId dreams and requireTitle true', async () => {
    const { result } = await renderHook(() => useDreamSession());
    await act(async () => result.current.startWriting('t'));
    await act(async () => result.current.setTitle('A'));
    await act(async () => {
      await result.current.save('saved');
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ journalId: 'dreams', requireTitle: true, status: 'saved' }),
    );
  });

  it('a Dreams session without a title still does not finish', async () => {
    const { result } = await renderHook(() => useDreamSession());
    await act(async () => result.current.startWriting('t'));
    let ok = true;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('a Life session finishes untitled with journalId life and requireTitle false', async () => {
    const { result } = await renderHook(() => useDreamSession());
    await act(async () => result.current.startWriting('today', 'life'));
    let ok = false;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        journalId: 'life',
        requireTitle: false,
        status: 'saved',
        details: expect.objectContaining({ title: '' }),
      }),
    );
  });

  it('a Life draft carries the journal too', async () => {
    const { result } = await renderHook(() => useDreamSession());
    await act(async () => result.current.startWriting('today', 'life'));
    await act(async () => {
      await result.current.save('draft');
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ journalId: 'life', requireTitle: false, status: 'draft' }),
    );
  });

  it('failure alerts take the noun from the journal', async () => {
    save.mockRejectedValue(new Error('x'));
    const { result } = await renderHook(() => useDreamSession());
    await act(async () => result.current.startWriting('today', 'life'));
    await act(async () => {
      await result.current.save('saved');
    });
    expect(Alert.alert).toHaveBeenLastCalledWith('Could not save your entry', 'Please try again.');
    save.mockRejectedValue({ code: 'INDEX_UNREADABLE' });
    await act(async () => {
      await result.current.save('saved');
    });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Could not save your entry',
      'Your saved entries could not be read, so this entry was not saved. Your recording is still here.',
    );
  });
});
