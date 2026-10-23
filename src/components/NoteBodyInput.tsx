import { Fragment, useEffect, useReducer, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TextInputSelectionChangeEventData,
  TextStyle,
  View,
} from 'react-native';
import { continueList, type Sel } from '../utils/markdownEdit';
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
const ENTER_LOG_BUILD = 'enter-1b';
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
const fmtSel = (s?: Sel) => (s ? `${s.start}-${s.end}` : 'none');
const commonHead = (a: string, b: string) => {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
};

function EnterLogStrip() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    enterLogListeners.add(bump);
    return () => {
      enterLogListeners.delete(bump);
    };
  }, []);
  const lines = getEnterLog();
  return (
    <View testID="enter-log-strip" style={logStyles.strip}>
      <View style={logStyles.row}>
        <Pressable accessibilityRole="button" onPress={() => setOpen(!open)}>
          <Text style={logStyles.head}>{`Enter log (${lines.length}) ${open ? '-' : '+'}`}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
            void Clipboard.setStringAsync(getEnterLog().join('\n'));
          }}
        >
          <Text style={logStyles.head}>Copy log</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={clearEnterLog}>
          <Text style={logStyles.head}>Clear log</Text>
        </Pressable>
      </View>
      {open && (
        <Text selectable style={logStyles.body}>
          {lines.join('\n')}
        </Text>
      )}
    </View>
  );
}

const logStyles = StyleSheet.create({
  strip: { borderTopWidth: 1, borderColor: '#888', marginTop: 8, paddingVertical: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  head: { fontSize: 12, fontWeight: '600', padding: 4 },
  body: { fontSize: 10, fontFamily: 'Courier' },
});

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
  const enterSnap = useRef<{ caret: number; len: number; latest: Sel; previous?: Sel }>(undefined);
  const afterChange = useRef(false); // dev log: the next selection event is POSTSEL
  const knowSelection = (sel: Sel) => {
    selections.current = { latest: sel, previous: sel };
  };

  const programmatic = (next: string, sel: Sel) => {
    setShown(next);
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
    // 0 is the initial value, not a request.
    if (focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    if (enterLogOn() && !enterLogBuildDone) {
      enterLogBuildDone = true;
      enterLog(`BUILD ${ENTER_LOG_BUILD} mount=${Date.now()} platform=${Platform.OS}`);
    }
  }, []);

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = e.nativeEvent.key;
    const { latest, previous } = selections.current;
    const caret = collapsedAt(latest);
    enterSnap.current =
      key === 'Enter' && latest && caret !== undefined
        ? { caret, len: shown.length, latest, previous }
        : undefined;
    if (enterLogOn()) {
      // Never the typed character: only whether it was Enter.
      enterLog(
        `KEY key=${key === 'Enter' ? 'Enter' : 'other'} latestSel=${fmtSel(latest)} prevSel=${fmtSel(previous)} shownLen=${shown.length}`,
      );
    }
  };

  const handleSelection = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    if (enterLogOn()) enterLog(`SEL ${fmtSel(e.nativeEvent.selection)} shownLen=${shown.length}`);
    if (afterChange.current) {
      afterChange.current = false;
      if (enterLogOn()) enterLog(`POSTSEL ${fmtSel(e.nativeEvent.selection)}`);
    }
    setPending(undefined);
    selections.current = { latest: e.nativeEvent.selection, previous: selections.current.latest };
    onSelectionChange?.(e.nativeEvent.selection);
  };

  const handleChange = (t: string) => {
    const snap = enterSnap.current;
    enterSnap.current = undefined;
    afterChange.current = true;
    const orderBefore = currentSelectionFirst();
    let pick: number | undefined;
    let usedSnap = false;
    if (listContinue) {
      let caret: number | undefined;
      if (snap && snap.len === shown.length && fitsInsert(shown, t, snap.caret)) {
        caret = snap.caret;
        usedSnap = true;
        // Learn the event order: the snapshot is the caret before the Enter. If it is the
        // second-latest selection (and not the latest) the selection event came first.
        const { latest, previous } = selections.current;
        const isPrev = collapsedAt(previous) === snap.caret;
        const isLatest = collapsedAt(latest) === snap.caret;
        if (isPrev && !isLatest) learnedSelectionFirst = true;
        else if (isLatest && !isPrev) learnedSelectionFirst = false;
      } else {
        const picked = pickCaretBefore(shown, t, selections.current, currentSelectionFirst());
        caret = picked.caret;
        if (picked.learned !== undefined) learnedSelectionFirst = picked.learned;
      }
      pick = caret;
      const result = continueList(shown, t, caret);
      if (enterLogOn()) {
        enterLog(
          `CHG prevLen=${shown.length} nextLen=${t.length} head=${commonHead(shown, t)} latest=${fmtSel(selections.current.latest)} previous=${fmtSel(selections.current.previous)} order=${orderBefore} pick=${pick ?? 'undefined'} snapshot=${snap ? snap.caret : 'undefined'}${usedSnap ? '' : ' (snapshot unused)'} platform=${Platform.OS}`,
        );
        enterLog(`RES ${result ? 'continued' : 'plain'}`);
      }
      if (result) {
        programmatic(result.text, result.selection);
        onChangeText(result.text, 'format');
        return;
      }
    } else {
      if (enterLogOn()) {
        enterLog(
          `CHG prevLen=${shown.length} nextLen=${t.length} head=${commonHead(shown, t)} latest=${fmtSel(selections.current.latest)} previous=${fmtSel(selections.current.previous)} order=${orderBefore} pick=undefined snapshot=${snap ? snap.caret : 'undefined'} platform=${Platform.OS}`,
        );
        enterLog('RES plain');
      }
    }
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
      onSelectionChange={handleSelection}
      onFocus={() => {
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
  if (!enterLogOn()) return input;
  return (
    <Fragment>
      {input}
      <EnterLogStrip />
    </Fragment>
  );
}
