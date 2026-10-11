import { act, renderHook } from '@testing-library/react-native';
import { useState } from 'react';
import {
  HISTORY_CAP,
  HistoryStacks,
  TYPING_DEBOUNCE_MS,
  dropAudioSteps,
  emptyHistory,
  popRedo,
  popUndo,
  pushHistory,
  useEntryHistory,
} from './useEntryHistory';

describe('history stacks', () => {
  const body = (from: string, to: string) => ({ kind: 'body', from, to }) as const;

  it('push adds to undo and clears redo', () => {
    const start: HistoryStacks = { undo: [], redo: [{ kind: 'audio' }] };
    expect(pushHistory(start, body('', 'a'))).toEqual({ undo: [body('', 'a')], redo: [] });
  });

  it('caps the undo stack, dropping the oldest', () => {
    let s = emptyHistory;
    for (let i = 0; i < HISTORY_CAP + 5; i++) s = pushHistory(s, body(`${i}`, `${i + 1}`));
    expect(s.undo).toHaveLength(HISTORY_CAP);
    expect(s.undo[0]).toEqual(body('5', '6'));
    expect(s.undo.at(-1)).toEqual(body(`${HISTORY_CAP + 4}`, `${HISTORY_CAP + 5}`));
  });

  it('undo and redo move the latest step between the stacks', () => {
    let s = pushHistory(pushHistory(emptyHistory, body('', 'a')), { kind: 'audio' });
    const u = popUndo(s);
    expect(u.item).toEqual({ kind: 'audio' });
    s = u.stacks;
    expect(s).toEqual({ undo: [body('', 'a')], redo: [{ kind: 'audio' }] });
    const r = popRedo(s);
    expect(r.item).toEqual({ kind: 'audio' });
    expect(r.stacks.redo).toEqual([]);
    expect(popUndo(emptyHistory).item).toBeUndefined();
    expect(popRedo(emptyHistory).item).toBeUndefined();
  });

  it('dropAudioSteps keeps only body steps', () => {
    const s = {
      undo: [body('', 'a'), { kind: 'audio' } as const],
      redo: [{ kind: 'audio' } as const],
    };
    expect(dropAudioSteps(s)).toEqual({ undo: [body('', 'a')], redo: [] });
  });
});

describe('useEntryHistory', () => {
  const removeAudio = jest.fn();
  const restoreAudio = jest.fn();
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  const setup = (initial = '') =>
    renderHook(() => {
      const [body, setBody] = useState(initial);
      const history = useEntryHistory({ body, setBody, removeAudio, restoreAudio });
      return { body, ...history };
    });
  const type = (h: Awaited<ReturnType<typeof setup>>, text: string) =>
    act(() => h.result.current.onBodyChange(text));
  const wait = (ms = TYPING_DEBOUNCE_MS) => act(() => void jest.advanceTimersByTime(ms));

  it('starts with nothing to undo or redo', async () => {
    const h = await setup('hello');
    expect(h.result.current.canUndo).toBe(false);
    expect(h.result.current.canRedo).toBe(false);
  });

  it('groups typing within the debounce window into one step', async () => {
    const h = await setup();
    await type(h, 'a');
    await wait(200);
    await type(h, 'ab');
    await wait(200);
    await type(h, 'abc');
    expect(h.result.current.canUndo).toBe(true);
    await wait();
    await act(() => h.result.current.undo());
    expect(h.result.current.body).toBe('');
    expect(h.result.current.canUndo).toBe(false);
    expect(h.result.current.canRedo).toBe(true);
  });

  it('undo right after typing (before the pause) still reverts the typed run', async () => {
    const h = await setup('x');
    await type(h, 'xy');
    await act(() => h.result.current.undo());
    expect(h.result.current.body).toBe('x');
  });

  it('separate pauses make separate steps; redo replays them', async () => {
    const h = await setup();
    await type(h, 'one');
    await wait();
    await type(h, 'one two');
    await wait();
    await act(() => h.result.current.undo());
    expect(h.result.current.body).toBe('one');
    await act(() => h.result.current.undo());
    expect(h.result.current.body).toBe('');
    await act(() => h.result.current.redo());
    expect(h.result.current.body).toBe('one');
    await act(() => h.result.current.redo());
    expect(h.result.current.body).toBe('one two');
    expect(h.result.current.canRedo).toBe(false);
  });

  it('typing back to the starting text leaves nothing to undo', async () => {
    const h = await setup('a');
    await type(h, 'ab');
    await type(h, 'a');
    await wait();
    expect(h.result.current.canUndo).toBe(false);
  });

  it('a new edit clears redo at once', async () => {
    const h = await setup();
    await type(h, 'one');
    await wait();
    await act(() => h.result.current.undo());
    expect(h.result.current.canRedo).toBe(true);
    await type(h, 'two');
    expect(h.result.current.canRedo).toBe(false);
  });

  it('blur ends the typing step without waiting', async () => {
    const h = await setup();
    await type(h, 'a');
    await act(() => h.result.current.onBodyBlur());
    await type(h, 'ab');
    await act(() => h.result.current.onBodyBlur());
    await act(() => h.result.current.undo());
    expect(h.result.current.body).toBe('a');
  });

  it('caps the stack at the limit', async () => {
    const h = await setup();
    for (let i = 1; i <= HISTORY_CAP + 3; i++) {
      await type(h, 'x'.repeat(i));
      await wait();
    }
    for (let i = 0; i < HISTORY_CAP; i++) await act(() => h.result.current.undo());
    expect(h.result.current.canUndo).toBe(false);
    expect(h.result.current.body).toBe('x'.repeat(3));
  });

  it('voice note removal shares the stack in order', async () => {
    const h = await setup();
    await type(h, 'hi');
    await act(() => h.result.current.onRemoveAudio());
    expect(removeAudio).toHaveBeenCalledTimes(1);
    await act(() => h.result.current.undo());
    expect(restoreAudio).toHaveBeenCalledTimes(1);
    expect(h.result.current.body).toBe('hi');
    await act(() => h.result.current.undo());
    expect(h.result.current.body).toBe('');
    await act(() => h.result.current.redo());
    expect(h.result.current.body).toBe('hi');
    await act(() => h.result.current.redo());
    expect(removeAudio).toHaveBeenCalledTimes(2);
  });

  it('a new recording drops the voice note steps but keeps typing steps', async () => {
    const h = await setup();
    await type(h, 'hi');
    await act(() => h.result.current.onRemoveAudio());
    await act(() => h.result.current.onRecordingAttached());
    await act(() => h.result.current.undo());
    expect(restoreAudio).not.toHaveBeenCalled();
    expect(h.result.current.body).toBe('');
  });

  it('reset clears both stacks and any pending typing', async () => {
    const h = await setup();
    await type(h, 'hi');
    await act(() => h.result.current.onRemoveAudio());
    await act(() => h.result.current.reset());
    expect(h.result.current.canUndo).toBe(false);
    expect(h.result.current.canRedo).toBe(false);
  });
});
