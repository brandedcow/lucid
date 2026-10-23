import { useEffect, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputSelectionChangeEventData,
  TextStyle,
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
 *   as `caretBefore`, chosen by `pickCaretBefore` from the last two selection events (the order of
 *   onChangeText and onSelectionChange is not the same on every platform), or undefined when no
 *   collapsed selection explains the change.
 * - focusSignal: focuses the body each time this number changes (0, the initial value, is ignored).
 * - Styling: nested <Text> runs from `noteRuns`; `styleLevel` picks how much is styled and heading
 *   sizes derive from the `style` fontSize so both scale together.
 */
export type NoteBodyInputProps = {
  text: string;
  onChangeText: (text: string, source: 'typing' | 'format') => void;
  onSelectionChange?: (selection: Sel) => void;
  selection?: Sel;
  focusSignal?: number;
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
  const fits = (c: number) =>
    c >= 0 &&
    c <= prev.length &&
    next.length === prev.length + 1 &&
    next.slice(0, c) === prev.slice(0, c) &&
    next.slice(c + 1) === prev.slice(c);
  const collapsed = (s?: Sel) => (s && s.start === s.end ? s.start : undefined);
  const latest = collapsed(sels.latest);
  const previous = collapsed(sels.previous);
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
  // Whether onSelectionChange arrives before onChangeText. Learned from the first change that only
  // one of the two selections explains; until then a platform default (Android is suspected to
  // report the selection first, iOS the change first; neither is device-confirmed).
  const selectionFirst = useRef<boolean>(Platform.OS === 'android');
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

  useEffect(() => {
    // 0 is the initial value, not a request.
    if (focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);

  const handleSelection = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setPending(undefined);
    selections.current = { latest: e.nativeEvent.selection, previous: selections.current.latest };
    onSelectionChange?.(e.nativeEvent.selection);
  };

  const handleChange = (t: string) => {
    if (listContinue) {
      const { caret, learned } = pickCaretBefore(
        shown,
        t,
        selections.current,
        selectionFirst.current,
      );
      if (learned !== undefined) selectionFirst.current = learned;
      const result = continueList(shown, t, caret);
      if (result) {
        programmatic(result.text, result.selection);
        onChangeText(result.text, 'format');
        return;
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

  return (
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
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      selection={pending}
      onChangeText={handleChange}
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
}
