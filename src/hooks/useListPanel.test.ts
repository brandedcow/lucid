import { act, renderHook } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import {
  CARET_HIDE_MS,
  PANEL_REFOCUS_DELAY_MS,
  useListPanel,
  type ListPanelControl,
} from './useListPanel';

// Jest cannot show real keyboard behaviour: these tests pin call order and timers only.
describe('useListPanel', () => {
  let calls: string[];
  let handler: (() => boolean) | undefined;
  let removeBack: jest.Mock;
  const mk = async (
    panelOpen = false,
    extra: { blurBeforeFocus?: boolean; isEditing?: boolean; locked?: boolean } = {},
  ) => {
    const noteMode = {
      panelOpen,
      openPanel: jest.fn(() => calls.push('openPanel')),
      closePanel: jest.fn(() => calls.push('closePanel')),
    };
    const focus = jest.fn(() => calls.push('focus'));
    const blur = jest.fn(() => calls.push('blur'));
    const keyboard = { dismiss: jest.fn(() => calls.push('dismiss')) };
    const v = await renderHook(
      (p: { open: boolean }) =>
        useListPanel({
          noteMode: { ...noteMode, panelOpen: p.open },
          focus,
          blur,
          keyboard,
          ...extra,
        }),
      { initialProps: { open: panelOpen } },
    );
    return { v, noteMode, focus, blur, keyboard };
  };
  const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

  beforeEach(() => {
    calls = [];
    handler = undefined;
    removeBack = jest.fn();
    jest.useFakeTimers();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((
      _e: string,
      fn: () => boolean,
    ) => {
      handler = fn;
      return { remove: removeBack };
    }) as never);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('showPanel: openPanel before dismiss, then focus after the delay, caret hidden meanwhile', async () => {
    const { v, focus } = await mk();
    await act(() => v.result.current.showPanel());
    expect(calls).toEqual(['openPanel', 'dismiss']);
    expect(v.result.current.caretHidden).toBe(true);
    await advance(PANEL_REFOCUS_DELAY_MS - 1);
    expect(focus).not.toHaveBeenCalled();
    await advance(1);
    expect(calls).toEqual(['openPanel', 'dismiss', 'focus']);
    expect(v.result.current.caretHidden).toBe(true);
    await advance(CARET_HIDE_MS);
    expect(v.result.current.caretHidden).toBe(false);
  });

  it('showPanel does nothing when isEditing is false', async () => {
    const { v, noteMode } = await mk(false, { isEditing: false });
    await act(() => v.result.current.showPanel());
    expect(noteMode.openPanel).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('showKeyboard on iOS: closePanel then focus only', async () => {
    const { v, blur } = await mk(true, { blurBeforeFocus: false });
    await act(() => v.result.current.showKeyboard());
    expect(calls).toEqual(['closePanel']);
    await advance(PANEL_REFOCUS_DELAY_MS);
    expect(calls).toEqual(['closePanel', 'focus']);
    expect(blur).not.toHaveBeenCalled();
  });

  it('showKeyboard on Android: blur then focus in the same callback', async () => {
    const { v } = await mk(true, { blurBeforeFocus: true });
    await act(() => v.result.current.showKeyboard());
    await advance(PANEL_REFOCUS_DELAY_MS);
    expect(calls).toEqual(['closePanel', 'blur', 'focus']);
  });

  it('togglePanel opens when closed and closes when open', async () => {
    const closed = await mk(false);
    await act(() => closed.v.result.current.togglePanel());
    expect(closed.noteMode.openPanel).toHaveBeenCalledTimes(1);
    const open = await mk(true, { blurBeforeFocus: false });
    await act(() => open.v.result.current.togglePanel());
    expect(open.noteMode.closePanel).toHaveBeenCalledTimes(1);
  });

  it('a second call cancels the pending timer', async () => {
    const { v, focus } = await mk(false, { blurBeforeFocus: false });
    await act(() => v.result.current.showPanel());
    await advance(PANEL_REFOCUS_DELAY_MS - 10);
    await act(() => v.result.current.showKeyboard());
    await advance(PANEL_REFOCUS_DELAY_MS * 4);
    expect(focus).toHaveBeenCalledTimes(1); // only the showKeyboard focus
    expect(calls).toEqual(['openPanel', 'dismiss', 'closePanel', 'focus']);
    expect(v.result.current.caretHidden).toBe(false);
  });

  it('BackHandler is registered only while open and calls showKeyboard', async () => {
    const { v, noteMode } = await mk(false, { blurBeforeFocus: false });
    expect(BackHandler.addEventListener).not.toHaveBeenCalled();
    await v.rerender({ open: true });
    expect(BackHandler.addEventListener).toHaveBeenCalledTimes(1);
    let handled: boolean | undefined;
    await act(() => {
      handled = handler?.();
    });
    expect(handled).toBe(true);
    expect(noteMode.closePanel).toHaveBeenCalledTimes(1);
    await v.rerender({ open: false });
    expect(removeBack).toHaveBeenCalledTimes(1);
  });

  it('Back while locked only closes the panel: no focus, blur or keyboard', async () => {
    const { v, noteMode, focus, blur } = await mk(true, { blurBeforeFocus: true, locked: true });
    let handled: boolean | undefined;
    await act(() => {
      handled = handler?.();
    });
    await advance(PANEL_REFOCUS_DELAY_MS * 4);
    expect(handled).toBe(true);
    expect(noteMode.closePanel).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
    expect(v.result.current.caretHidden).toBe(false);
  });

  it('unmount clears timers and unregisters Back', async () => {
    const live = new Set<unknown>();
    let n = 0;
    const timers = {
      set: (fn: () => void, ms: number) => {
        const id = setTimeout(fn, ms);
        live.add(id);
        n++;
        return id;
      },
      clear: (id: unknown) => {
        live.delete(id);
        clearTimeout(id as ReturnType<typeof setTimeout>);
      },
    };
    const noteMode = { panelOpen: false, openPanel: jest.fn(), closePanel: jest.fn() };
    const focus = jest.fn();
    const v = await renderHook(
      (p: { open: boolean }) =>
        useListPanel({
          noteMode: { ...noteMode, panelOpen: p.open },
          focus,
          blur: jest.fn(),
          keyboard: { dismiss: jest.fn() },
          timers,
        }),
      { initialProps: { open: false } },
    );
    await act(() => v.result.current.showPanel());
    expect(n).toBe(1);
    expect(live.size).toBe(1);
    await v.rerender({ open: true });
    await v.unmount();
    expect(live.size).toBe(0);
    await advance(1000);
    expect(focus).not.toHaveBeenCalled();
    expect(removeBack).toHaveBeenCalled();
  });

  it('exposes panelOpen from noteMode', async () => {
    const { v } = await mk(true);
    const c: ListPanelControl = v.result.current;
    expect(c.panelOpen).toBe(true);
  });
});
