import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  NativeSyntheticEvent,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TextInputSelectionChangeEventData,
  TextStyle,
} from 'react-native';
import { continueList, mapCaretThroughEdit, type Sel } from '../utils/markdownEdit';
import {
  DEFAULT_BODY_FONT_SIZE,
  EDIT_MODE,
  LIST_CONTINUE,
  STYLE_LEVEL,
  noteRuns,
  type StyleLevel,
} from './noteRunStyles';

/**
 * Where the cursor belongs after `prev` became `next` by something other than typing: the end of
 * the changed region in `next` (common head and tail are skipped). Always within `next`, never
 * inside a surrogate pair. (Copied from TaggedBodyInput, which chunk 8 deletes.)
 */
export function cursorAfterEdit(prev: string, next: string): number {
  const max = Math.min(prev.length, next.length);
  let head = 0;
  while (head < max && prev[head] === next[head]) head += 1;
  let tail = 0;
  while (tail < max - head && prev[prev.length - 1 - tail] === next[next.length - 1 - tail]) {
    tail += 1;
  }
  let cursor = next.length - tail;
  const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
  const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
  if (
    cursor > 0 &&
    cursor < next.length &&
    isLow(next.charCodeAt(cursor)) &&
    isHigh(next.charCodeAt(cursor - 1))
  ) {
    cursor -= 1;
  }
  return cursor;
}

/**
 * Prop contract (same as TaggedBodyInput, plus markdown):
 * - text / onChangeText(text, source): the body, owned by the parent. `source` is 'typing' for what
 *   the user typed and 'format' for an edit made here (list continuation on Enter), so the parent
 *   can build undo history.
 * - A change of `text` the input did not just report (toolbar edit, undo) is a programmatic edit:
 *   in `editMode` 'remount' the input is remounted (React Native forbids `value` together with
 *   children) and refocused if it had focus; in 'inPlace' only the children change. The cursor is
 *   `selection` if the parent gave one in the same update, else the end of the changed region
 *   (reported once through onSelectionChange). Always clamped into the text.
 * - Enter in a list item (`listContinue`) is detected by diffing the text: the result is applied
 *   as a programmatic edit and reported once, as 'format'. The previous caret goes to continueList
 *   as `caretBefore`. Preferred source: `onKeyPress` fires for Enter before the edit, so the last
 *   known collapsed caret at that moment is the caret before the Enter (used when it explains the
 *   change as one inserted newline). Otherwise (no key press delivered, e.g. paste or some
 *   keyboards) `pickCaretBefore` chooses from the last two selection events (the order of
 *   onChangeText and onSelectionChange is not the same on every platform), or undefined when no
 *   collapsed selection explains the change.
 * - focusSignal: focuses the body each time this number changes (0, the initial value, is ignored).
 * - blurSignal: blurs the body each time this number changes (0 is ignored). Its effect runs before
 *   the focus effect, so when both change in one render the blur happens first, then the focus.
 * - showSoftInputOnFocus (default true) and caretHidden (default false) go to the TextInput and
 *   survive the remount. They support a panel that replaces the keyboard; the choreography lives
 *   with the caller. Real keyboard behaviour is not covered by Jest.
 * - Styling: nested <Text> runs from `noteRuns`; `styleLevel` picks how much is styled and heading
 *   sizes derive from the `style` fontSize so both scale together.
 */
export type NoteBodyInputProps = {
  text: string;
  onChangeText: (text: string, source: 'typing' | 'format') => void;
  onSelectionChange?: (selection: Sel) => void;
  selection?: Sel;
  focusSignal?: number;
  blurSignal?: number;
  showSoftInputOnFocus?: boolean;
  caretHidden?: boolean;
  editable?: boolean;
  placeholder?: string;
  placeholderTextColor?: string;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<TextStyle>;
  onFocus?: () => void;
  onBlur?: () => void;
  styleLevel?: StyleLevel;
  editMode?: 'remount' | 'inPlace';
  listContinue?: boolean;
  /** Called when the input was remounted by a programmatic edit (`epoch` went above 0). */
  onRemount?: () => void;
};

/**
 * Android only (PROVISIONAL, not tuned on a device). Reading -> editing mounts a fresh TextInput and
 * the immediate `focus()` can fail to raise the keyboard on a view that is not laid out yet, so
 * `focus()` is repeated at these delays (ms after the focus signal) until the keyboard is visible.
 */
export const ANDROID_FOCUS_RETRY_MS: readonly number[] = [60, 200, 500];
/**
 * Android only (PROVISIONAL): after a programmatic remount, the delay before the wanted caret is
 * set again with `setSelection`, once the native view has its text.
 */
export const ANDROID_RESELECT_MS = 50;

type Selections = { latest?: Sel; previous?: Sel };

/** Whether `next` is `prev` with exactly one character inserted at `c`. */
function fitsInsert(prev: string, next: string, c: number): boolean {
  return (
    c >= 0 &&
    c <= prev.length &&
    next.length === prev.length + 1 &&
    next.slice(0, c) === prev.slice(0, c) &&
    next.slice(c + 1) === prev.slice(c)
  );
}

const collapsedAt = (s?: Sel) => (s && s.start === s.end ? s.start : undefined);

// Whether onSelectionChange arrives before onChangeText, learned from the key press snapshot or an
// unambiguous change. Module level so a reading -> editing remount does not forget it. undefined
// until learned: then the platform default (Android = selection first, iOS = change first; both
// are guesses, not device-confirmed).
let learnedSelectionFirst: boolean | undefined;
const currentSelectionFirst = () => learnedSelectionFirst ?? Platform.OS === 'android';
/** Forgets the learned event order (for tests). */
export function resetNoteBodyInputOrder(): void {
  learnedSelectionFirst = undefined;
}

// DEV-ONLY diagnostic for the Enter-in-list bug (chunk 1b). Off unless __DEV__ and the bundle was
// started with EXPO_PUBLIC_ENTER_LOG=1; then nothing is logged and nothing renders.
const ENTER_LOG_BUILD = 'android-1';
const ENTER_LOG_CAP = 40;
const readEnterLogFlag = () => __DEV__ && process.env.EXPO_PUBLIC_ENTER_LOG === '1';
// Read once at load. Every log call site and the work only the log needs sit behind this flag, so
// with the log off no string is built and no O(n) work is done.
let enterLogEnabled = readEnterLogFlag();
const enterLogOn = () => enterLogEnabled;
/** Re-reads the log flag from the environment (for tests; the app reads it once at load). */
export function refreshEnterLogFlag(): void {
  enterLogEnabled = readEnterLogFlag();
}
let enterLogLines: string[] = [];
let enterLogSeq = 0;
let enterLogBuildDone = false;
const enterLogListeners = new Set<() => void>();
function enterLog(msg: string): void {
  if (!enterLogOn()) return;
  enterLogSeq += 1;
  enterLogLines.push(`#${enterLogSeq} t=${Date.now()} ${msg}`);
  if (enterLogLines.length > ENTER_LOG_CAP) enterLogLines = enterLogLines.slice(-ENTER_LOG_CAP);
  enterLogListeners.forEach((l) => l());
}
/** The dev Enter log, oldest first (empty unless the log is on). */
export const getEnterLog = (): string[] => enterLogLines;
/** Empties the dev Enter log and its sequence (for tests and the Clear button). */
export function clearEnterLog(): void {
  enterLogLines = [];
  enterLogSeq = 0;
  enterLogBuildDone = false;
  enterLogListeners.forEach((l) => l());
}
/** True when the dev Enter log is on (the bar renders only then). */
export const isEnterLogOn = (): boolean => enterLogOn();
/** Subscribes to log changes; returns the unsubscribe function. */
export function subscribeEnterLog(listener: () => void): () => void {
  enterLogListeners.add(listener);
  return () => {
    enterLogListeners.delete(listener);
  };
}
const fmtSel = (s?: Sel) => (s ? `${s.start}-${s.end}` : 'none');
const commonHead = (a: string, b: string) => {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
};

/**
 * The caret the typed character went in at. Candidates are the last two selection events (latest,
 * previous) that are collapsed and reproduce `next` from `prev` by inserting one character there.
 * In a run of newlines two carets can both fit (inserting "\n" at c or c+1 gives the same text);
 * then `selectionFirst` decides (true: the selection event came before the change, so the earlier
 * one is the caret before; false: the later one). `learned` is the `selectionFirst` value that a
 * single unambiguous survivor showed, if there was one.
 */
export function pickCaretBefore(
  prev: string,
  next: string,
  sels: Selections,
  selectionFirst: boolean,
): { caret?: number; learned?: boolean } {
  const fits = (c: number) => fitsInsert(prev, next, c);
  const latest = collapsedAt(sels.latest);
  const previous = collapsedAt(sels.previous);
  const okLatest = latest !== undefined && fits(latest);
  const okPrevious = previous !== undefined && fits(previous);
  if (okLatest && okPrevious) {
    if (latest === previous) return { caret: latest };
    return { caret: selectionFirst ? previous : latest };
  }
  if (okLatest) return { caret: latest, learned: false };
  if (okPrevious) return { caret: previous, learned: true };
  return {};
}

const clamp = (sel: Sel, len: number): Sel => ({
  start: Math.max(0, Math.min(sel.start, len)),
  end: Math.max(0, Math.min(sel.end, len)),
});

export function NoteBodyInput({
  text,
  onChangeText,
  onSelectionChange,
  selection,
  focusSignal = 0,
  blurSignal = 0,
  showSoftInputOnFocus = true,
  caretHidden = false,
  editable = true,
  placeholder,
  placeholderTextColor,
  accessibilityLabel = 'Note text',
  testID,
  style,
  onFocus,
  onBlur,
  styleLevel = STYLE_LEVEL,
  editMode = EDIT_MODE,
  listContinue = LIST_CONTINUE,
  onRemount,
}: NoteBodyInputProps) {
  const inputRef = useRef<TextInput>(null);
  // The text the input is showing: what it last reported, or what the parent last set.
  const [shown, setShown] = useState(text);
  const [epoch, setEpoch] = useState(0);
  const [pending, setPending] = useState<Sel | undefined>(
    selection ? clamp(selection, text.length) : undefined,
  );
  const [chosen, setChosen] = useState<Sel | null>(null);
  const [refocus, setRefocus] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seenSelection, setSeenSelection] = useState(selection);
  // The last two selections the input knows of (reported by the native input or chosen here).
  // Either may be the caret from before a change, depending on the order of the native events.
  const selections = useRef<Selections>({});
  // The caret known when Enter was pressed (onKeyPress fires before the edit), with the shown
  // length and the two remembered selections at that moment; cleared by any other key and by every
  // change.
  const enterSnap = useRef<{
    caret: number;
    len: number;
    latest: Sel;
    previous?: Sel;
    tracked: boolean;
  }>(undefined);
  const afterChange = useRef(false); // dev log: the next selection event is POSTSEL
  // Commit-scoped guards (chunks 1e, 1f). iOS can deliver several onChangeText calls (and stale
  // selection events) for what the user did before React commits: an autocorrect, then the Enter
  // whose native text already contains the corrected word. `shown` is stale until the commit, so
  // `liveText` is the text as of the last change processed (changes are diffed against it) and
  // `trackedCaret` is the caret carried through those changes (the native caret before the Enter
  // is not reported yet). `handled` holds the native texts processed since the last commit: a later
  // change with one of them is a duplicate. `awaitCommit` is set by a continued (programmatic) edit:
  // until it commits, selection events come from the old native view and must not wipe the pinned
  // caret. A real selection event clears `trackedCaret`; every commit clears all of them.
  const liveText = useRef(text);
  const trackedCaret = useRef<number | undefined>(undefined);
  const handled = useRef<string[]>([]);
  const awaitCommit = useRef(false);
  // Latest props for the Android focus retries (timers must not use stale closures).
  const latestProps = useRef({ showSoftInputOnFocus, editable });
  // Android: the user touched or typed since the last remount (selection events do not count: the
  // native view fires its own on attach, focus and text set).
  const userInputSinceRemount = useRef(false);
  const knowSelection = (sel: Sel) => {
    selections.current = { latest: sel, previous: sel };
  };

  const programmatic = (next: string, sel: Sel) => {
    setShown(next);
    liveText.current = next;
    if (editMode === 'remount') {
      setEpoch(epoch + 1);
      setRefocus(focused);
    }
    const clamped = clamp(sel, next.length);
    setPending(clamped);
    setChosen({ ...clamped });
  };

  // Adjusting state while rendering (React re-renders at once, before anything is committed).
  if (selection !== seenSelection) {
    setSeenSelection(selection);
    if (selection && text === shown) setPending(clamp(selection, text.length));
  }
  if (text !== shown) {
    setShown(text);
    if (editMode === 'remount') {
      setEpoch(epoch + 1);
      setRefocus(focused);
    }
    if (selection) {
      setPending(clamp(selection, text.length));
    } else {
      const c = cursorAfterEdit(shown, text);
      setPending({ start: c, end: c });
      setChosen({ start: c, end: c });
    }
  }

  useEffect(() => {
    // A new object per programmatic edit, so each one is reported once.
    if (chosen) {
      knowSelection(chosen);
      onSelectionChange?.(chosen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  useEffect(() => {
    if (pending) knowSelection(pending);
  }, [pending]);

  useEffect(() => {
    if (epoch > 0) onRemount?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  // Declared before the focus effect: effects run in order, so a blur and a focus requested in the
  // same render blur first.
  useEffect(() => {
    // 0 is the initial value, not a request.
    if (blurSignal > 0) inputRef.current?.blur();
  }, [blurSignal]);

  useEffect(() => {
    latestProps.current = { showSoftInputOnFocus, editable };
  });

  useEffect(() => {
    // 0 is the initial value, not a request.
    if (!(focusSignal > 0)) return;
    if (enterLogOn()) {
      enterLog(`FOCUS req=${focusSignal} attempt=0 kbVisible=${Keyboard.isVisible()}`);
    }
    inputRef.current?.focus();
    if (Platform.OS !== 'android' || !showSoftInputOnFocus || !editable) return;
    // Android: focus() right after the mount may not raise the keyboard; repeat it until it shows.
    const timers: ReturnType<typeof setTimeout>[] = [];
    ANDROID_FOCUS_RETRY_MS.forEach((ms, i) => {
      timers.push(
        setTimeout(() => {
          if (!latestProps.current.showSoftInputOnFocus || !latestProps.current.editable) return;
          const visible = Keyboard.isVisible();
          if (enterLogOn()) {
            enterLog(`FOCUS req=${focusSignal} attempt=${i + 1} kbVisible=${visible}`);
          }
          if (visible) {
            timers.forEach(clearTimeout);
            return;
          }
          inputRef.current?.focus();
        }, ms),
      );
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  useEffect(() => {
    if (!enterLogOn()) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      enterLog(`KB show h=${Math.round(e.endCoordinates?.height ?? 0)}`);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => enterLog('KB hide'));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Android: the one-shot `selection` command can lose to the native text/selection events of a
  // fresh view, so after a programmatic remount the wanted caret is set again once the text is in.
  useEffect(() => {
    if (epoch === 0) return;
    userInputSinceRemount.current = false;
    if (enterLogOn()) enterLog(`REMOUNT epoch=${epoch} pending=${fmtSel(pending)}`);
    if (Platform.OS !== 'android' || !pending) return;
    const want = pending;
    const id = setTimeout(() => {
      if (userInputSinceRemount.current) {
        if (enterLogOn()) enterLog('RESELECT skipped (user input)');
        return;
      }
      if (enterLogOn()) enterLog(`RESELECT want=${fmtSel(want)}`);
      inputRef.current?.setSelection(want.start, want.end);
    }, ANDROID_RESELECT_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  // No deps: runs after every commit, which ends the window the guards above cover.
  useEffect(() => {
    if (enterLogOn() && (handled.current.length > 0 || awaitCommit.current)) {
      enterLog(`COMMIT shownLen=${shown.length}`);
    }
    handled.current = [];
    awaitCommit.current = false;
    trackedCaret.current = undefined;
    liveText.current = shown;
  });

  useEffect(() => {
    if (enterLogOn() && !enterLogBuildDone) {
      enterLogBuildDone = true;
      enterLog(`BUILD ${ENTER_LOG_BUILD} mount=${Date.now()} platform=${Platform.OS}`);
    }
  }, []);

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    userInputSinceRemount.current = true;
    const key = e.nativeEvent.key;
    const { latest, previous } = selections.current;
    const tracked = trackedCaret.current;
    const caret = tracked ?? collapsedAt(latest);
    enterSnap.current =
      key === 'Enter' && latest && caret !== undefined
        ? {
            caret,
            len: liveText.current.length,
            latest,
            previous,
            tracked: tracked !== undefined,
          }
        : undefined;
    // Plain single-character keys are not logged (the cap is nearly filled by them). Never the
    // typed text: only whether it was Enter and how long the key was.
    if (enterLogOn() && (key === 'Enter' || key.length !== 1)) {
      enterLog(
        `KEY key=${key === 'Enter' ? 'Enter' : 'other'} latestSel=${fmtSel(latest)} prevSel=${fmtSel(previous)} shownLen=${shown.length} keyKind=${key === 'Enter' ? 'enter' : 'other'} keyLen=${key.length} liveLen=${liveText.current.length} trackedCaret=${tracked ?? 'undefined'}`,
      );
    }
  };

  const handleSelection = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    if (awaitCommit.current) {
      if (enterLogOn()) {
        enterLog(`SEL stale ignored ${fmtSel(e.nativeEvent.selection)} shownLen=${shown.length}`);
      }
      return;
    }
    if (enterLogOn()) enterLog(`SEL ${fmtSel(e.nativeEvent.selection)} shownLen=${shown.length}`);
    if (afterChange.current) {
      afterChange.current = false;
      if (enterLogOn()) enterLog(`POSTSEL ${fmtSel(e.nativeEvent.selection)}`);
    }
    trackedCaret.current = undefined;
    setPending(undefined);
    selections.current = { latest: e.nativeEvent.selection, previous: selections.current.latest };
    onSelectionChange?.(e.nativeEvent.selection);
  };

  const handleChange = (t: string) => {
    const dup = handled.current.indexOf(t);
    if (dup >= 0) {
      if (enterLogOn()) {
        enterLog(`DUP ignored which=${dup} nextLen=${t.length} shownLen=${shown.length}`);
      }
      return;
    }
    handled.current.push(t);
    // The text this change is a change of: the previous change in this tick, else what is shown.
    const prev = liveText.current;
    const snap = enterSnap.current;
    enterSnap.current = undefined;
    afterChange.current = true;
    const orderBefore = currentSelectionFirst();
    let pick: number | undefined;
    let usedSnap = false;
    if (listContinue) {
      let caret: number | undefined;
      if (snap && snap.len === prev.length && fitsInsert(prev, t, snap.caret)) {
        caret = snap.caret;
        usedSnap = true;
        // Learn the event order: the snapshot is the caret before the Enter. If it is the
        // second-latest selection (and not the latest) the selection event came first. Not when
        // the snapshot came from the tracked caret: that says nothing about the native order.
        if (!snap.tracked) {
          const { latest, previous } = selections.current;
          const isPrev = collapsedAt(previous) === snap.caret;
          const isLatest = collapsedAt(latest) === snap.caret;
          if (isPrev && !isLatest) learnedSelectionFirst = true;
          else if (isLatest && !isPrev) learnedSelectionFirst = false;
        }
      } else {
        const picked = pickCaretBefore(prev, t, selections.current, currentSelectionFirst());
        caret = picked.caret;
        if (picked.learned !== undefined && trackedCaret.current === undefined) {
          learnedSelectionFirst = picked.learned;
        }
      }
      pick = caret;
      const result = continueList(prev, t, caret);
      // Carry the caret through this change for the next one of the tick (not after a
      // continuation: that pins its own caret).
      const oldTracked = trackedCaret.current;
      if (!result) {
        const base = oldTracked ?? collapsedAt(selections.current.latest) ?? t.length;
        trackedCaret.current = mapCaretThroughEdit(prev, t, base);
      }
      if (enterLogOn()) {
        const head = commonHead(prev, t);
        const max = Math.min(prev.length, t.length);
        let tail = 0;
        while (tail < max - head && prev[prev.length - 1 - tail] === t[t.length - 1 - tail]) {
          tail += 1;
        }
        enterLog(
          `CHG prevLen=${prev.length} nextLen=${t.length} head=${head} liveLen=${prev.length} shownLen=${shown.length} delta=${t.length - prev.length} region=${head}..${prev.length - tail} latest=${fmtSel(selections.current.latest)} previous=${fmtSel(selections.current.previous)} order=${orderBefore} pick=${pick ?? 'undefined'} snapshot=${snap ? snap.caret : 'undefined'}${usedSnap ? '' : ' (snapshot unused)'} trackedCaret=${oldTracked ?? 'undefined'} mapped=${oldTracked ?? 'undefined'}->${trackedCaret.current ?? 'undefined'} path=${usedSnap ? 'snapshot' : 'fallback'} platform=${Platform.OS}`,
        );
        enterLog(`RES ${result ? 'continued' : 'plain'}`);
      }
      if (result) {
        awaitCommit.current = true;
        programmatic(result.text, result.selection);
        onChangeText(result.text, 'format');
        return;
      }
    } else {
      if (enterLogOn()) {
        enterLog(
          `CHG prevLen=${prev.length} nextLen=${t.length} head=${commonHead(prev, t)} liveLen=${prev.length} shownLen=${shown.length} latest=${fmtSel(selections.current.latest)} previous=${fmtSel(selections.current.previous)} order=${orderBefore} pick=undefined snapshot=${snap ? snap.caret : 'undefined'} path=fallback platform=${Platform.OS}`,
        );
        enterLog('RES plain');
      }
    }
    liveText.current = t;
    setShown(t);
    onChangeText(t, 'typing');
  };

  const baseSize = StyleSheet.flatten(style)?.fontSize ?? DEFAULT_BODY_FONT_SIZE;
  // Unstyled runs are still <Text> children: the test renderer refuses bare strings in a TextInput.
  const kids = noteRuns(shown, styleLevel, baseSize).map((r) => (
    <Text key={r.key} style={r.style}>
      {r.text}
    </Text>
  ));

  const input = (
    <TextInput
      // No `value` prop: React Native does not allow it together with children. Typing is mirrored
      // above; in 'remount' mode a programmatic change bumps `epoch`, which remounts the input.
      key={epoch}
      ref={inputRef}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      multiline
      textAlignVertical="top"
      autoFocus={epoch > 0 && refocus}
      editable={editable}
      showSoftInputOnFocus={showSoftInputOnFocus}
      caretHidden={caretHidden}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      selection={pending}
      onChangeText={handleChange}
      onKeyPress={handleKeyPress}
      onTouchStart={() => {
        userInputSinceRemount.current = true;
      }}
      onSelectionChange={handleSelection}
      onFocus={() => {
        if (enterLogOn()) enterLog('FOCUS onFocus');
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      style={style}
    >
      {kids}
    </TextInput>
  );
  return input;
}
