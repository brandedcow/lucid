import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { bodyText } from '../test/bodyText';
import * as markdownEdit from '../utils/markdownEdit';
import { NoteBodyInput, type NoteBodyInputProps, cursorAfterEdit } from './NoteBodyInput';

jest.mock('../utils/markdownEdit', () => {
  const actual = jest.requireActual('../utils/markdownEdit');
  return { ...actual, continueList: jest.fn(actual.continueList) };
});

type Sel = { start: number; end: number };
const outsideApi: { set: (t: string, sel?: Sel) => void } = { set: () => {} };
const selections: Sel[] = [];
const changes: [string, string][] = [];

function Harness({ initial = '', ...rest }: { initial?: string } & Partial<NoteBodyInputProps>) {
  const [text, setText] = useState(initial);
  const [sel, setSel] = useState<Sel | undefined>(undefined);
  useEffect(() => {
    outsideApi.set = (t, s) => {
      setText(t);
      setSel(s);
    };
  });
  return (
    <NoteBodyInput
      text={text}
      onChangeText={(t, source) => {
        changes.push([t, source]);
        setText(t);
      }}
      onSelectionChange={(s) => {
        selections.push(s);
        setSel(undefined);
      }}
      selection={sel}
      placeholder="Start writing..."
      testID="note-body"
      {...rest}
    />
  );
}

const input = () => screen.getByTestId('note-body');
const outside = (t: string, sel?: Sel) => act(async () => outsideApi.set(t, sel));
const caretAt = (n: number) =>
  fireEvent(input(), 'selectionChange', { nativeEvent: { selection: { start: n, end: n } } });

beforeEach(() => {
  selections.length = 0;
  changes.length = 0;
  jest.mocked(markdownEdit.continueList).mockClear();
});

describe('cursorAfterEdit', () => {
  it.each([
    ['abc def', 'abc XY def', 7],
    ['abc XY def', 'abc def', 4],
    ['', 'hello', 5],
  ])('%j -> %j puts the cursor at %i', (prev, next, want) => {
    expect(cursorAfterEdit(prev, next)).toBe(want);
  });

  it('never lands inside a surrogate pair', () => {
    expect(cursorAfterEdit('😀', '😁😀')).toBe(2);
  });
});

describe('NoteBodyInput', () => {
  it('shows the text, with the default accessibility label and no value prop', async () => {
    await render(<Harness initial={'# Title\n- a'} />);
    expect(screen.getByLabelText('Note text')).toBe(input());
    expect(bodyText(input())).toBe('# Title\n- a');
    expect(input().props.value).toBeUndefined();
    expect(screen.getByPlaceholderText('Start writing...')).toBe(input());
  });

  it('keeps the text exact after typing and after a parent change', async () => {
    await render(<Harness initial="a" />);
    await fireEvent.changeText(input(), 'a **b** #c');
    expect(bodyText(input())).toBe('a **b** #c');
    await outside('# x\r\n- [ ] y');
    expect(bodyText(input())).toBe('# x\r\n- [ ] y');
  });

  it('typing never remounts the input', async () => {
    await render(<Harness />);
    const before = input();
    for (const t of ['a', 'a ', 'a #', 'a #w', 'a #wa b']) {
      await fireEvent.changeText(input(), t);
      expect(bodyText(input())).toBe(t);
    }
    expect(input()).toBe(before);
    expect(input().props.autoFocus).toBeFalsy();
    expect(changes.every(([, s]) => s === 'typing')).toBe(true);
  });

  it('a parent change remounts in remount mode and applies the clamped selection', async () => {
    await render(<Harness initial="hello" />);
    const before = input();
    await outside('hello #', { start: 99, end: 99 });
    expect(input()).not.toBe(before);
    expect(input().props.selection).toEqual({ start: 7, end: 7 });
  });

  it('inPlace mode does not remount but still applies the selection', async () => {
    await render(<Harness initial="hello" editMode="inPlace" />);
    const before = input();
    await outside('hello #', { start: 7, end: 7 });
    expect(input()).toBe(before);
    expect(bodyText(input())).toBe('hello #');
    expect(input().props.selection).toEqual({ start: 7, end: 7 });
  });

  it('reports a selection once after a remount that chose its own', async () => {
    await render(<Harness initial="abc XY def" />);
    await outside('abc def');
    expect(input().props.selection).toEqual({ start: 4, end: 4 });
    expect(selections.filter((s) => s.start === 4 && s.end === 4)).toHaveLength(1);
  });

  describe('list continuation', () => {
    it('Enter at the end of a bullet continues it as one format change', async () => {
      await render(<Harness initial="- a" />);
      await caretAt(3);
      await fireEvent.changeText(input(), '- a\n');
      expect(changes).toEqual([['- a\n- ', 'format']]);
      expect(bodyText(input())).toBe('- a\n- ');
      expect(input().props.selection).toEqual({ start: 6, end: 6 });
      expect(selections.at(-1)).toEqual({ start: 6, end: 6 });
    });

    it('remounts for the continuation in remount mode', async () => {
      await render(<Harness initial="- a" />);
      const before = input();
      await caretAt(3);
      await fireEvent.changeText(input(), '- a\n');
      expect(input()).not.toBe(before);
    });

    it('keeps the input mounted for the continuation in inPlace mode', async () => {
      await render(<Harness initial="- a" editMode="inPlace" />);
      const before = input();
      await caretAt(3);
      await fireEvent.changeText(input(), '- a\n');
      expect(input()).toBe(before);
      expect(bodyText(input())).toBe('- a\n- ');
      expect(input().props.selection).toEqual({ start: 6, end: 6 });
    });

    it('a plain line plus Enter is typing', async () => {
      await render(<Harness initial="abc" />);
      await caretAt(3);
      await fireEvent.changeText(input(), 'abc\n');
      expect(changes).toEqual([['abc\n', 'typing']]);
    });

    it('Enter on an empty item removes the marker with no intermediate call', async () => {
      await render(<Harness initial="- " />);
      await caretAt(2);
      await fireEvent.changeText(input(), '- \n');
      expect(changes).toEqual([['', 'format']]);
      expect(bodyText(input())).toBe('');
    });

    it('listContinue={false} leaves it as typing', async () => {
      await render(<Harness initial="- a" listContinue={false} />);
      await caretAt(3);
      await fireEvent.changeText(input(), '- a\n');
      expect(changes).toEqual([['- a\n', 'typing']]);
    });

    it('an autocorrect-style change with a newline is typing', async () => {
      await render(<Harness initial="- helo" />);
      await caretAt(6);
      await fireEvent.changeText(input(), '- hello\n');
      expect(changes).toEqual([['- hello\n', 'typing']]);
    });

    it('pasted multi-line text is typing', async () => {
      await render(<Harness initial="- a" />);
      await caretAt(3);
      await fireEvent.changeText(input(), '- a\n- b\n- c');
      expect(changes).toEqual([['- a\n- b\n- c', 'typing']]);
    });

    it('passes the previous caret to continueList', async () => {
      await render(<Harness initial={'- a\n- b'} />);
      await caretAt(3);
      await fireEvent.changeText(input(), '- a\n\n- b');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith('- a\n- b', '- a\n\n- b', 3);
    });

    it('passes undefined when the previous selection is a range', async () => {
      await render(<Harness initial={'- a\n- b'} />);
      await fireEvent(input(), 'selectionChange', {
        nativeEvent: { selection: { start: 1, end: 3 } },
      });
      await fireEvent.changeText(input(), '- a\n\n- b');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith(
        '- a\n- b',
        '- a\n\n- b',
        undefined,
      );
    });

    it('passes undefined when no selection has been reported yet', async () => {
      await render(<Harness initial="- a" />);
      await fireEvent.changeText(input(), '- a\n');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith('- a', '- a\n', undefined);
    });
  });

  it('is not editable when told so', async () => {
    await render(<Harness initial="abc" editable={false} />);
    expect(input().props.editable).toBe(false);
  });

  it('refocuses after a remount only if the input had focus', async () => {
    await render(<Harness initial="abc" />);
    await outside('abcd');
    expect(input().props.autoFocus).toBe(false);
    await fireEvent(input(), 'focus');
    await outside('abcde');
    expect(input().props.autoFocus).toBe(true);
  });

  it('focuses when the focus signal changes, not on mount', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    const view = await render(<NoteBodyInput text="a" onChangeText={() => {}} focusSignal={0} />);
    expect(focus).not.toHaveBeenCalled();
    await view.rerender(<NoteBodyInput text="a" onChangeText={() => {}} focusSignal={1} />);
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });

  it('sizes headings from the style font size', async () => {
    await render(<Harness initial="# Big" style={{ fontSize: 20 }} />);
    expect(screen.getByText('Big').props.style).toMatchObject({ fontSize: 30 });
  });

  it('seeds the selection from the prop at mount, clamped', async () => {
    await render(
      <NoteBodyInput
        text="hello"
        selection={{ start: 2, end: 99 }}
        onChangeText={() => {}}
        testID="note-body"
      />,
    );
    expect(input().props.selection).toEqual({ start: 2, end: 5 });
  });

  it('has no selection at mount when none is given', async () => {
    await render(<NoteBodyInput text="hello" onChangeText={() => {}} testID="note-body" />);
    expect(input().props.selection).toBeUndefined();
  });

  it('focuses at mount when the focus signal is already above 0', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await render(<NoteBodyInput text="a" onChangeText={() => {}} focusSignal={1} />);
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });

  it('calls onRemount when a programmatic edit remounts the input, not at mount', async () => {
    const onRemount = jest.fn();
    await render(<Harness initial="abc" onRemount={onRemount} />);
    expect(onRemount).not.toHaveBeenCalled();
    await outside('abcd');
    expect(onRemount).toHaveBeenCalledTimes(1);
    await outside('abcde');
    expect(onRemount).toHaveBeenCalledTimes(2);
  });

  it('does not call onRemount for typing or in place edits', async () => {
    const onRemount = jest.fn();
    await render(<Harness initial="abc" editMode="inPlace" onRemount={onRemount} />);
    await fireEvent(input(), 'changeText', 'abcd');
    await outside('abcde');
    expect(onRemount).not.toHaveBeenCalled();
  });
});
