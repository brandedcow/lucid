import { useCallback, useEffect, useReducer, useRef } from 'react';
import { Keyboard } from 'react-native';

/**
 * PROVISIONAL timings, to be confirmed or changed by the device spike (6c-2). Do not treat them as
 * tuned values.
 * - HIDE_DEBOUNCE_MS: a keyboard hide ends editing only if no show or focus follows within this.
 * - FOCUS_GRACE_MS: after entering by tap or initially, editing falls back to reading if
 *   the input has not received focus within this.
 * - REMOUNT_GRACE_MS: after the input remounts (an undo or toolbar edit), hide events are ignored
 *   for this long, because the remount briefly drops the keyboard.
 * - SWAP_GRACE_MS: after the list panel opens or closes, keyboard hide events are ignored for
 *   this long (the keyboard to panel swap and back emit hides that must not end editing).
 */
export const HIDE_DEBOUNCE_MS = 150;
export const FOCUS_GRACE_MS = 800;
export const REMOUNT_GRACE_MS = 400;
export const SWAP_GRACE_MS = 600;

export type NoteMode = 'reading' | 'editing';

export type NoteModeState = {
  mode: NoteMode;
  /** Entered without the input having reported focus yet; cleared by focus or a keyboard show. */
  focusPending: boolean;
  /** A keyboard hide was seen and is waiting out the debounce. */
  hidePending: boolean;
  /** Hide events with a timestamp before this are ignored (the remount grace). */
  graceUntil: number;
  /** The list panel (instead of the system keyboard) is showing; keyboard hides are ignored. */
  panel: boolean;
  /** Hide events with a timestamp before this are ignored (the panel swap grace). */
  swapUntil: number;
};

export type NoteModeAction =
  | { type: 'enter'; locked: boolean; recording: boolean }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'done' }
  | { type: 'keyboardShow'; height: number }
  | { type: 'panelOpen'; at: number }
  | { type: 'panelClose'; at: number }
  | { type: 'keyboardHide'; at: number }
  | { type: 'remount'; at: number }
  | { type: 'hideTimeout' }
  | { type: 'focusTimeout' };

export const initialNoteModeState = (initial: NoteMode): NoteModeState => ({
  mode: initial,
  focusPending: initial === 'editing',
  hidePending: false,
  graceUntil: 0,
  panel: false,
  swapUntil: 0,
});

const READING: NoteModeState = {
  mode: 'reading',
  focusPending: false,
  hidePending: false,
  graceUntil: 0,
  panel: false,
  swapUntil: 0,
};

/**
 * Pure reducer of the note's reading/editing mode. Timers live in `useNoteMode`; it dispatches
 * `hideTimeout` and `focusTimeout` when they fire. `blur` changes nothing on its own: a blur
 * without a keyboard hide (a hardware keyboard) must not leave editing.
 */
export function noteModeReducer(state: NoteModeState, action: NoteModeAction): NoteModeState {
  switch (action.type) {
    case 'enter':
      if (action.locked || action.recording) return state;
      if (state.mode === 'editing') return state;
      return { ...state, mode: 'editing', focusPending: true, hidePending: false };
    case 'focus':
      return { ...state, mode: 'editing', focusPending: false, hidePending: false };
    case 'blur':
      return state;
    case 'done':
      return READING;
    case 'keyboardShow':
      if (state.mode !== 'editing') return state;
      if (state.panel) {
        // A zero height is a spurious show (seen on iOS); only a real keyboard closes the panel.
        if (action.height <= 0) return state;
        return { ...state, focusPending: false, hidePending: false, panel: false, swapUntil: 0 };
      }
      return { ...state, focusPending: false, hidePending: false };
    case 'panelOpen':
      if (state.mode !== 'editing') return state;
      return {
        ...state,
        panel: true,
        swapUntil: action.at + SWAP_GRACE_MS,
        hidePending: false,
        focusPending: false,
      };
    case 'panelClose':
      if (state.mode !== 'editing') return state;
      return { ...state, panel: false, swapUntil: action.at + SWAP_GRACE_MS, hidePending: false };
    case 'keyboardHide':
      if (
        state.mode !== 'editing' ||
        state.panel ||
        action.at < state.graceUntil ||
        action.at < state.swapUntil
      ) {
        return state;
      }
      return { ...state, hidePending: true };
    case 'remount':
      return { ...state, graceUntil: action.at + REMOUNT_GRACE_MS };
    case 'hideTimeout':
      return state.hidePending ? READING : state;
    case 'focusTimeout':
      return state.focusPending && state.mode === 'editing' ? READING : state;
  }
}

export type NoteModeControl = {
  mode: NoteMode;
  /** A reading-view tap. Ignored when locked, or while the recording panel is open. */
  enterEditing(): void;
  /** The Hide keyboard button. */
  done(): void;
  notifyFocus(): void;
  notifyBlur(): void;
  /** The body input remounted (NoteBodyInput `onRemount`). */
  notifyRemount(): void;
  /** The list panel is showing in place of the system keyboard. */
  panelOpen: boolean;
  openPanel(): void;
  closePanel(): void;
};

/**
 * Drives the note screen's two modes: a styled editing field while the keyboard is open, the
 * rendered reading view otherwise. `initial` is read once (a new session remounts the page).
 * Never leaves on scroll. With no keyboard events at all (hardware keyboard) it stays editing
 * until `done()`.
 */
export function useNoteMode(args: {
  initial: NoteMode;
  locked: boolean;
  recording: boolean;
  now?: () => number;
}): NoteModeControl {
  const { locked, recording, now = Date.now } = args;
  const [state, dispatch] = useReducer(noteModeReducer, args.initial, initialNoteModeState);
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  }, [now]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      dispatch({ type: 'keyboardShow', height: e?.endCoordinates?.height ?? 0 }),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      dispatch({ type: 'keyboardHide', at: nowRef.current() }),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Each effect's cleanup cancels its timer when the state changes (leaving) or on unmount.
  useEffect(() => {
    if (!state.hidePending) return;
    const t = setTimeout(() => dispatch({ type: 'hideTimeout' }), HIDE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state.hidePending]);

  useEffect(() => {
    if (state.mode !== 'editing' || !state.focusPending) return;
    const t = setTimeout(() => dispatch({ type: 'focusTimeout' }), FOCUS_GRACE_MS);
    return () => clearTimeout(t);
  }, [state.mode, state.focusPending]);

  const enterEditing = useCallback(
    () => dispatch({ type: 'enter', locked, recording }),
    [locked, recording],
  );
  const done = useCallback(() => dispatch({ type: 'done' }), []);
  const notifyFocus = useCallback(() => dispatch({ type: 'focus' }), []);
  const notifyBlur = useCallback(() => dispatch({ type: 'blur' }), []);
  const notifyRemount = useCallback(() => dispatch({ type: 'remount', at: nowRef.current() }), []);

  const openPanel = useCallback(() => dispatch({ type: 'panelOpen', at: nowRef.current() }), []);
  const closePanel = useCallback(() => dispatch({ type: 'panelClose', at: nowRef.current() }), []);

  return {
    mode: state.mode,
    enterEditing,
    done,
    notifyFocus,
    notifyBlur,
    notifyRemount,
    panelOpen: state.panel,
    openPanel,
    closePanel,
  };
}
