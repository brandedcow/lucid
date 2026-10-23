import { act, renderHook } from '@testing-library/react-native';
import { fakeKeyboard } from '../test/fakeKeyboard';
import {
  FOCUS_GRACE_MS,
  HIDE_DEBOUNCE_MS,
  REMOUNT_GRACE_MS,
  SWAP_GRACE_MS,
  initialNoteModeState,
  noteModeReducer,
  useNoteMode,
  type NoteMode,
} from './useNoteMode';

describe('noteModeReducer', () => {
  const editing = { ...initialNoteModeState('editing'), focusPending: false };
  it('starts per the initial mode; a new note awaits focus', () => {
    expect(initialNoteModeState('reading').mode).toBe('reading');
    expect(initialNoteModeState('editing')).toMatchObject({ mode: 'editing', focusPending: true });
  });
  it('enter is ignored when locked or recording', () => {
    const r = initialNoteModeState('reading');
    expect(noteModeReducer(r, { type: 'enter', locked: true, recording: false })).toBe(r);
    expect(noteModeReducer(r, { type: 'enter', locked: false, recording: true })).toBe(r);
    expect(noteModeReducer(r, { type: 'enter', locked: false, recording: false }).mode).toBe(
      'editing',
    );
  });
  it('hide inside the remount grace is ignored; after it, pending', () => {
    const s = noteModeReducer(editing, { type: 'remount', at: 1000 });
    expect(noteModeReducer(s, { type: 'keyboardHide', at: 1000 + REMOUNT_GRACE_MS - 1 })).toBe(s);
    expect(
      noteModeReducer(s, { type: 'keyboardHide', at: 1000 + REMOUNT_GRACE_MS }).hidePending,
    ).toBe(true);
  });
  it('hide in reading changes nothing; blur changes nothing', () => {
    const r = initialNoteModeState('reading');
    expect(noteModeReducer(r, { type: 'keyboardHide', at: 5 })).toBe(r);
    expect(noteModeReducer(editing, { type: 'blur' })).toBe(editing);
  });
  it('timeouts without a pending cause do nothing', () => {
    expect(noteModeReducer(editing, { type: 'hideTimeout' })).toBe(editing);
    expect(noteModeReducer(editing, { type: 'focusTimeout' })).toBe(editing);
  });
});

describe('noteModeReducer panel', () => {
  const editing = { ...initialNoteModeState('editing'), focusPending: false };
  const open = noteModeReducer(editing, { type: 'panelOpen', at: 1000 });
  it('panelOpen sets the guard and clears pending flags', () => {
    const s = noteModeReducer(initialNoteModeState('editing'), { type: 'panelOpen', at: 1000 });
    expect(s).toMatchObject({ panel: true, swapUntil: 1000 + SWAP_GRACE_MS, hidePending: false });
    expect(s.focusPending).toBe(false);
  });
  it('panelOpen while reading is ignored', () => {
    const r = initialNoteModeState('reading');
    expect(noteModeReducer(r, { type: 'panelOpen', at: 1 })).toBe(r);
  });
  it('a hide with the panel open keeps editing and is not pending', () => {
    const s = noteModeReducer(open, { type: 'keyboardHide', at: 99999 });
    expect(s).toBe(open);
    expect(s.mode).toBe('editing');
    expect(s.hidePending).toBe(false);
    expect(noteModeReducer(s, { type: 'hideTimeout' })).toBe(s);
  });
  it('keyboardShow with height > 0 closes the panel; height 0 is ignored', () => {
    expect(noteModeReducer(open, { type: 'keyboardShow', height: 0 })).toBe(open);
    expect(noteModeReducer(open, { type: 'keyboardShow', height: 328 })).toMatchObject({
      panel: false,
      swapUntil: 0,
    });
  });
  it('panelClose: a hide within SWAP_GRACE_MS is ignored, after it starts the pending hide', () => {
    const s = noteModeReducer(open, { type: 'panelClose', at: 2000 });
    expect(s).toMatchObject({ mode: 'editing', panel: false });
    expect(noteModeReducer(s, { type: 'keyboardHide', at: 2000 + SWAP_GRACE_MS - 1 })).toBe(s);
    expect(noteModeReducer(s, { type: 'keyboardHide', at: 2000 + SWAP_GRACE_MS }).hidePending).toBe(
      true,
    );
  });
  it('done resets the panel', () => {
    expect(noteModeReducer(open, { type: 'done' })).toMatchObject({
      mode: 'reading',
      panel: false,
      swapUntil: 0,
    });
  });
  it('focusTimeout cannot return to reading after panelOpen', () => {
    const entered = noteModeReducer(initialNoteModeState('reading'), {
      type: 'enter',
      locked: false,
      recording: false,
    });
    const s = noteModeReducer(entered, { type: 'panelOpen', at: 5 });
    expect(noteModeReducer(s, { type: 'focusTimeout' }).mode).toBe('editing');
  });
  it('remount combined with the panel: both guards hold independently', () => {
    const s = noteModeReducer(open, { type: 'remount', at: 1000 });
    expect(noteModeReducer(s, { type: 'keyboardHide', at: 1000 + REMOUNT_GRACE_MS + 1 })).toBe(s);
    const closed = noteModeReducer(s, { type: 'panelClose', at: 1100 });
    expect(noteModeReducer(closed, { type: 'keyboardHide', at: 1000 + REMOUNT_GRACE_MS - 1 })).toBe(
      closed,
    );
    expect(
      noteModeReducer(closed, { type: 'keyboardHide', at: 1100 + SWAP_GRACE_MS }).hidePending,
    ).toBe(true);
  });
});

describe('useNoteMode', () => {
  let kb: ReturnType<typeof fakeKeyboard>;
  beforeEach(() => {
    jest.useFakeTimers();
    kb = fakeKeyboard();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const setup = (initial: NoteMode, locked = false, recording = false) =>
    renderHook((p: { locked: boolean; recording: boolean }) => useNoteMode({ initial, ...p }), {
      initialProps: { locked, recording },
    });
  const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

  it('a stored note starts reading, a new note starts editing', async () => {
    expect((await setup('reading')).result.current.mode).toBe('reading');
    expect((await setup('editing')).result.current.mode).toBe('editing');
  });

  it('a hide alone exits after the debounce', async () => {
    const v = await setup('reading');
    await act(() => v.result.current.enterEditing());
    await act(() => v.result.current.notifyFocus());
    await kb.emit('keyboardDidShow', 300);
    await kb.emit('keyboardDidHide');
    await advance(HIDE_DEBOUNCE_MS - 1);
    expect(v.result.current.mode).toBe('editing');
    await advance(1);
    expect(v.result.current.mode).toBe('reading');
  });

  it('a show within the window keeps editing', async () => {
    const v = await setup('editing');
    await act(() => v.result.current.notifyFocus());
    await kb.emit('keyboardDidHide');
    await advance(HIDE_DEBOUNCE_MS - 50);
    await kb.emit('keyboardDidShow', 300);
    await advance(1000);
    expect(v.result.current.mode).toBe('editing');
  });

  it('a focus cancels a pending exit', async () => {
    const v = await setup('editing');
    await act(() => v.result.current.notifyFocus());
    await kb.emit('keyboardDidHide');
    await advance(HIDE_DEBOUNCE_MS - 50);
    await act(() => v.result.current.notifyFocus());
    await advance(1000);
    expect(v.result.current.mode).toBe('editing');
  });

  it('the remount grace suppresses a hide, and a hide after it still exits', async () => {
    const v = await setup('editing');
    await act(() => v.result.current.notifyFocus());
    await act(() => v.result.current.notifyRemount());
    await advance(REMOUNT_GRACE_MS - 100);
    await kb.emit('keyboardDidHide');
    await advance(1000);
    expect(v.result.current.mode).toBe('editing');
    await advance(200);
    await kb.emit('keyboardDidHide');
    await advance(HIDE_DEBOUNCE_MS);
    expect(v.result.current.mode).toBe('reading');
  });

  it('with no keyboard events it stays editing until Done', async () => {
    const v = await setup('reading');
    await act(() => v.result.current.enterEditing());
    await act(() => v.result.current.notifyFocus());
    await advance(60_000);
    expect(v.result.current.mode).toBe('editing');
    await act(() => v.result.current.done());
    expect(v.result.current.mode).toBe('reading');
  });

  it('returns to reading when no focus arrives within the grace', async () => {
    const v = await setup('reading');
    await act(() => v.result.current.enterEditing());
    await advance(FOCUS_GRACE_MS - 1);
    expect(v.result.current.mode).toBe('editing');
    await advance(1);
    expect(v.result.current.mode).toBe('reading');
  });

  it('a new note with no focus falls back to reading; focus keeps it', async () => {
    const lost = await setup('editing');
    await advance(FOCUS_GRACE_MS);
    expect(lost.result.current.mode).toBe('reading');
    const ok = await setup('editing');
    await act(() => ok.result.current.notifyFocus());
    await advance(FOCUS_GRACE_MS * 2);
    expect(ok.result.current.mode).toBe('editing');
  });

  it('a keyboard show also satisfies the focus grace', async () => {
    const v = await setup('reading');
    await act(() => v.result.current.enterEditing());
    await kb.emit('keyboardDidShow', 300);
    await advance(FOCUS_GRACE_MS * 2);
    expect(v.result.current.mode).toBe('editing');
  });

  it('locked ignores enterEditing; recording blocks it until the panel closes', async () => {
    const locked = await setup('reading', true);
    await act(() => locked.result.current.enterEditing());
    expect(locked.result.current.mode).toBe('reading');

    const rec = await setup('reading', false, true);
    await act(() => rec.result.current.enterEditing());
    expect(rec.result.current.mode).toBe('reading');
    await rec.rerender({ locked: false, recording: false });
    await act(() => rec.result.current.enterEditing());
    expect(rec.result.current.mode).toBe('editing');
  });

  it('a hide while reading does nothing', async () => {
    const v = await setup('reading');
    await kb.emit('keyboardDidHide');
    await advance(1000);
    expect(v.result.current.mode).toBe('reading');
  });

  // Spies on the mode timers only (other code also uses timers), returning the ids still live.
  const trackModeTimers = () => {
    const live = new Set<unknown>();
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      const id = realSet(fn, ms);
      if (ms === HIDE_DEBOUNCE_MS || ms === FOCUS_GRACE_MS) live.add(id);
      return id;
    }) as never);
    jest.spyOn(globalThis, 'clearTimeout').mockImplementation(((id: never) => {
      live.delete(id);
      realClear(id);
    }) as never);
    return live;
  };

  it('leaving cancels the timers', async () => {
    const live = trackModeTimers();
    const v = await setup('reading');
    await act(() => v.result.current.enterEditing());
    await act(() => v.result.current.notifyFocus());
    await kb.emit('keyboardDidHide');
    expect(live.size).toBe(1); // the hide debounce
    await act(() => v.result.current.done());
    expect(live.size).toBe(0);
  });

  it('unmount clears timers and listeners', async () => {
    const live = trackModeTimers();
    const v = await setup('editing'); // focus-grace timer running
    await kb.emit('keyboardDidHide');
    expect(live.size).toBe(2);
    await v.unmount();
    expect(live.size).toBe(0);
    expect(kb.remove).toHaveBeenCalledTimes(2);
  });

  it('notifyBlur alone does not leave editing', async () => {
    const v = await setup('editing');
    await act(() => v.result.current.notifyFocus());
    await act(() => v.result.current.notifyBlur());
    await advance(5000);
    expect(v.result.current.mode).toBe('editing');
  });

  it('openPanel keeps editing through the swap hide; a real keyboard show closes the panel', async () => {
    const v = await setup('editing');
    await act(() => v.result.current.notifyFocus());
    await act(() => v.result.current.openPanel());
    expect(v.result.current.panelOpen).toBe(true);
    await kb.emit('keyboardDidHide');
    await advance(5000);
    expect(v.result.current.mode).toBe('editing');
    await kb.emit('keyboardDidShow', 0);
    expect(v.result.current.panelOpen).toBe(true);
    await kb.emit('keyboardDidShow', 328);
    expect(v.result.current.panelOpen).toBe(false);
    await act(() => v.result.current.openPanel());
    await act(() => v.result.current.closePanel());
    expect(v.result.current.panelOpen).toBe(false);
    expect(v.result.current.mode).toBe('editing');
  });
});
