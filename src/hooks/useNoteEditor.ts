import { useCallback, useState } from 'react';
import type { NoteBodyInputProps } from '../components/NoteBodyInput';
import { toggleCheckboxAtLine, type EditResult, type Sel } from '../utils/markdownEdit';
import {
  indentItem,
  listActions as planListActions,
  moveItem,
  setListType,
  type ListActions,
  type ListKind,
} from '../utils/markdownList';

type EditSource = 'typing' | 'format';

export type NoteEditor = {
  inputProps: Pick<
    NoteBodyInputProps,
    | 'text'
    | 'onChangeText'
    | 'onSelectionChange'
    | 'selection'
    | 'focusSignal'
    | 'onFocus'
    | 'onBlur'
  >;
  /** The selection as last reported (or last requested by a toolbar edit). */
  selection: Sel;
  focused: boolean;
  /** What the list controls can do for the current body and selection (derived, never stored). */
  listActions: ListActions;
  /** Toggles the checkbox on the line at `offset` (reading view); no selection change. */
  toggleCheckboxAt(offset: number): void;
  /** List edits: each applies the pure function from markdownList; a null result changes nothing. */
  indentItem(): void;
  outdentItem(): void;
  moveItem(dir: 'up' | 'down'): void;
  setListType(kind: ListKind): void;
  focus(): void;
  /** Marks the body as not focused (leaving editing mode without a native blur event). */
  markBlurred(): void;
  /** Moves the caret to `sel` together with a body change made in the same update (a tag edit). */
  select(sel: Sel): void;
};

/**
 * Binds NoteBodyInput to a body held elsewhere (useNoteSession): the hook only ever calls `setBody`
 * (and the optional `onEdit` observer). It tracks the selection, holds the pending selection of a
 * toolbar edit and exposes the toolbar actions. Toolbar edits do not depend on the keyboard state.
 */
export function useNoteEditor(args: {
  body: string;
  setBody: (text: string) => void;
  onEdit?: (prev: string, next: string, source: EditSource) => void;
}): NoteEditor {
  const { body, setBody, onEdit } = args;
  const [selection, setSelection] = useState<Sel>({ start: 0, end: 0 });
  const [pending, setPending] = useState<Sel | undefined>(undefined);
  const [focused, setFocused] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);

  const apply = useCallback(
    (result: EditResult | null) => {
      if (!result) return;
      setBody(result.text);
      setSelection(result.selection);
      setPending(result.selection);
      onEdit?.(body, result.text, 'format');
    },
    [body, setBody, onEdit],
  );

  return {
    inputProps: {
      text: body,
      onChangeText: (text, source) => {
        onEdit?.(body, text, source);
        setBody(text);
      },
      onSelectionChange: (sel) => {
        setSelection(sel);
        setPending(undefined);
      },
      selection: pending,
      focusSignal,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
    selection,
    focused,
    listActions: planListActions(body, selection),
    toggleCheckboxAt: (offset) => {
      const result = toggleCheckboxAtLine(body, offset);
      if (!result) return;
      setBody(result.text);
      onEdit?.(body, result.text, 'format');
    },
    indentItem: () => apply(indentItem(body, selection)),
    outdentItem: () => apply(indentItem(body, selection, true)),
    moveItem: (dir) => apply(moveItem(body, selection, dir)),
    setListType: (kind) => apply(setListType(body, selection, kind)),
    focus: () => setFocusSignal((n) => n + 1),
    markBlurred: () => setFocused(false),
    select: (sel) => {
      setSelection(sel);
      setPending(sel);
    },
  };
}
