import { useCallback, useState } from 'react';
import type { NoteBodyInputProps } from '../components/NoteBodyInput';
import {
  checkboxAction as planCheckbox,
  indentLines,
  toggleCheckbox as applyToggle,
  type EditResult,
  type Sel,
} from '../utils/markdownEdit';

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
  /** What the checkbox button would do on the caret's line, for its state and label. */
  checkboxAction: 'check' | 'uncheck' | 'add' | 'none';
  toggleCheckbox(): void;
  indent(): void;
  outdent(): void;
  focus(): void;
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
    checkboxAction: planCheckbox(body, selection),
    toggleCheckbox: () => apply(applyToggle(body, selection)),
    indent: () => apply(indentLines(body, selection)),
    outdent: () => apply(indentLines(body, selection, true)),
    focus: () => setFocusSignal((n) => n + 1),
  };
}
