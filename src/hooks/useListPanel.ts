import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Platform } from 'react-native';
import type { NoteModeControl } from './useNoteMode';

/**
 * PROVISIONAL timings and platform choice for the keyboard/list-panel swap; not tuned on a device
 * and NOT verified by Jest (Jest cannot show real keyboard behaviour).
 * - PANEL_REFOCUS_DELAY_MS: wait after dismissing/flipping before the input is focused again.
 * - CARET_HIDE_MS: how long after the refocus the caret stays hidden (hides the one-frame flash).
 * - PANEL_BLUR_BEFORE_FOCUS: UNVERIFIED on Android: blur-then-focus copied from the spike; iOS
 *   device log shows focus-only is right.
 */
export const PANEL_REFOCUS_DELAY_MS = 50;
export const CARET_HIDE_MS = 150;
export const PANEL_BLUR_BEFORE_FOCUS = Platform.OS === 'android';

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
};

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export type ListPanelControl = {
  panelOpen: boolean;
  /** Hide the caret while the keyboard/panel swap refocuses the input. */
  caretHidden: boolean;
  showPanel(): void;
  showKeyboard(): void;
  togglePanel(): void;
};

/**
 * Choreographs swapping the system keyboard for the list controls panel and back. The mode guard
 * (`panelOpen` state in `useNoteMode`) is set FIRST so the keyboard hide this causes does not end
 * editing. Tapping text while the panel is open leaves it open (nothing here closes on focus).
 * Android Back while the panel is open closes it and shows the keyboard (user decision).
 */
export function useListPanel(args: {
  noteMode: Pick<NoteModeControl, 'panelOpen' | 'openPanel' | 'closePanel'>;
  focus: () => void;
  blur: () => void;
  /** When false, showPanel does nothing. Defaults to true. */
  isEditing?: boolean;
  /** While true (a leave or delete in flight) Back only closes the panel; it never refocuses. */
  locked?: boolean;
  blurBeforeFocus?: boolean;
  timers?: Timers;
  keyboard?: { dismiss: () => void };
}): ListPanelControl {
  const { noteMode, isEditing = true } = args;
  const [caretHidden, setCaretHidden] = useState(false);
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  });
  const pending = useRef<unknown[]>([]);

  const cancel = useCallback(() => {
    const t = argsRef.current.timers ?? realTimers;
    pending.current.forEach((id) => t.clear(id));
    pending.current = [];
  }, []);

  useEffect(() => cancel, [cancel]);

  const showPanel = useCallback(() => {
    const a = argsRef.current;
    if (a.isEditing === false) return;
    const t = a.timers ?? realTimers;
    cancel();
    a.noteMode.openPanel();
    setCaretHidden(true);
    (a.keyboard ?? Keyboard).dismiss();
    pending.current.push(
      t.set(() => {
        argsRef.current.focus();
        pending.current.push(t.set(() => setCaretHidden(false), CARET_HIDE_MS));
      }, PANEL_REFOCUS_DELAY_MS),
    );
  }, [cancel]);

  const showKeyboard = useCallback(() => {
    const a = argsRef.current;
    const t = a.timers ?? realTimers;
    cancel();
    setCaretHidden(false);
    a.noteMode.closePanel();
    pending.current.push(
      t.set(() => {
        const cur = argsRef.current;
        if (cur.blurBeforeFocus ?? PANEL_BLUR_BEFORE_FOCUS) cur.blur();
        cur.focus();
      }, PANEL_REFOCUS_DELAY_MS),
    );
  }, [cancel]);

  const togglePanel = useCallback(() => {
    if (argsRef.current.noteMode.panelOpen) showKeyboard();
    else showPanel();
  }, [showKeyboard, showPanel]);

  const panelOpen = noteMode.panelOpen;
  useEffect(() => {
    if (!panelOpen || !isEditing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (argsRef.current.locked) {
        cancel();
        setCaretHidden(false);
        argsRef.current.noteMode.closePanel();
        return true;
      }
      showKeyboard();
      return true;
    });
    return () => sub.remove();
  }, [panelOpen, isEditing, showKeyboard, cancel]);

  return { panelOpen, caretHidden, showPanel, showKeyboard, togglePanel };
}
