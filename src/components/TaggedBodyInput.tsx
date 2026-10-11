import { useEffect, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputSelectionChangeEventData,
  TextStyle,
} from 'react-native';
import { colors } from '../theme';
import { scanTags } from '../utils/inlineTags';

type Selection = { start: number; end: number };

/** Plain and tag runs of `text`, in order, covering it exactly. */
export function bodySegments(text: string): { s: string; tag: boolean }[] {
  const out: { s: string; tag: boolean }[] = [];
  let pos = 0;
  for (const m of scanTags(text)) {
    if (m.start > pos) out.push({ s: text.slice(pos, m.start), tag: false });
    out.push({ s: text.slice(m.start, m.end), tag: true });
    pos = m.end;
  }
  if (pos < text.length) out.push({ s: text.slice(pos), tag: false });
  return out;
}

/**
 * Where the cursor belongs after `prev` became `next` by something other than typing (undo, redo):
 * the end of the changed region in `next` (common head and tail are skipped). Always within `next`.
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
  // Never between the two halves of a surrogate pair (an emoji): step back to its start.
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
 * Prop contract:
 * - text / onChangeText: the body, owned by the parent. Typing reports through onChangeText and is
 *   mirrored here, so typing never remounts the input.
 * - When `text` becomes something the input did not just report (undo, redo, a tag completion, the
 *   # button), the input is REMOUNTED (React Native forbids `value` together with children, and a
 *   child-driven input cannot be set in place). The cursor is restored with `selection` if the
 *   parent gave one in the same update, else placed at the end of the changed region; the body is
 *   refocused if it had focus, so the keyboard stays open.
 * - selection: where to put the cursor for a programmatic change (also honoured when the text did
 *   not change). Dropped as soon as the input reports a selection of its own.
 * - onSelectionChange: the cursor / selection moved. Also called once after a remount that chose
 *   the cursor itself (undo / redo), so the parent's view of the cursor stays right.
 * - onFocus / onBlur: as TextInput.
 * - focusSignal: focuses the body each time this number changes (0 is the initial value, ignored).
 * - editable, placeholder, placeholderTextColor, accessibilityLabel, testID, style, onBlur: as TextInput.
 *
 * Tags are shown by nesting <Text> runs inside the input (accent colour, tinted background; the
 * rounded corners of the tint only render on iOS).
 */
export type TaggedBodyInputProps = {
  text: string;
  onChangeText: (text: string) => void;
  onSelectionChange?: (selection: Selection) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  selection?: Selection;
  focusSignal?: number;
  editable?: boolean;
  placeholder?: string;
  placeholderTextColor?: string;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<TextStyle>;
};

const clamp = (sel: Selection, len: number): Selection => ({
  start: Math.max(0, Math.min(sel.start, len)),
  end: Math.max(0, Math.min(sel.end, len)),
});

export function TaggedBodyInput({
  text,
  onChangeText,
  onSelectionChange,
  onBlur,
  onFocus,
  selection,
  focusSignal = 0,
  editable = true,
  placeholder,
  placeholderTextColor,
  accessibilityLabel,
  testID,
  style,
}: TaggedBodyInputProps) {
  const inputRef = useRef<TextInput>(null);
  // The text the input is showing: what it last reported, or what the parent last set.
  const [shown, setShown] = useState(text);
  const [epoch, setEpoch] = useState(0);
  const [pending, setPending] = useState<Selection | undefined>(undefined);
  const [chosen, setChosen] = useState<Selection | null>(null);
  const [refocus, setRefocus] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seenSelection, setSeenSelection] = useState(selection);

  // Adjusting state while rendering (React re-renders at once, before anything is committed).
  if (selection !== seenSelection) {
    setSeenSelection(selection);
    if (selection && text === shown) setPending(clamp(selection, text.length));
  }
  if (text !== shown) {
    setShown(text);
    setEpoch(epoch + 1);
    setRefocus(focused);
    if (selection) {
      setPending(clamp(selection, text.length));
    } else {
      const c = cursorAfterEdit(shown, text);
      setPending({ start: c, end: c });
      setChosen({ start: c, end: c });
    }
  }

  useEffect(() => {
    // A new object per remount, so each one is reported once.
    if (chosen) onSelectionChange?.(chosen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  useEffect(() => {
    // 0 is the initial value, not a request.
    if (focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);

  const handleSelection = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setPending(undefined);
    onSelectionChange?.(e.nativeEvent.selection);
  };

  // Plain runs are unstyled <Text> too: the test renderer refuses bare strings inside a TextInput.
  // (The device spike used bare strings for plain runs; an unstyled nested Text should be the same
  // span on native, but that exact form has not been run on a device.)
  const kids = bodySegments(shown).map((g, i) => (
    <Text key={i} style={g.tag ? styles.tag : undefined}>
      {g.s}
    </Text>
  ));

  return (
    <TextInput
      // No `value` prop: React Native does not allow it together with children. Typing is mirrored
      // below; a programmatic change bumps `epoch`, which remounts the input.
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
      onChangeText={(t) => {
        setShown(t);
        onChangeText(t);
      }}
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

const styles = StyleSheet.create({
  tag: {
    color: colors.accent,
    fontWeight: '600',
    backgroundColor: colors.emotionChipBg,
    borderRadius: 6,
  },
});
