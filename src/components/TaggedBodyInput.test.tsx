import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { bodyText } from '../test/bodyText';
import { colors } from '../theme';
import { TaggedBodyInput, bodySegments, cursorAfterEdit } from './TaggedBodyInput';

type Sel = { start: number; end: number };
const outsideApi: { set: (t: string, sel?: Sel) => void } = { set: () => {} };
const selections: Sel[] = [];

function Harness({ initial = '', editable = true }: { initial?: string; editable?: boolean }) {
  const [text, setText] = useState(initial);
  const [sel, setSel] = useState<Sel | undefined>(undefined);
  useEffect(() => {
    outsideApi.set = (t, s) => {
      setText(t);
      setSel(s);
    };
  });
  return (
    <TaggedBodyInput
      text={text}
      onChangeText={setText}
      onSelectionChange={(s) => {
        selections.push(s);
        setSel(undefined);
      }}
      selection={sel}
      editable={editable}
      placeholder="Start writing..."
      accessibilityLabel="Entry text"
      testID="entry-body"
    />
  );
}

const input = () => screen.getByTestId('entry-body');
const outside = (t: string, sel?: Sel) => act(async () => outsideApi.set(t, sel));

beforeEach(() => {
  selections.length = 0;
});

describe('bodySegments', () => {
  it('splits plain and tag runs and covers the text exactly', () => {
    const text = 'a #water, then #x';
    const segs = bodySegments(text);
    expect(segs.map((s) => s.s).join('')).toBe(text);
    expect(segs.filter((s) => s.tag).map((s) => s.s)).toEqual(['#water', '#x']);
  });

  it('is empty for empty text', () => {
    expect(bodySegments('')).toEqual([]);
  });
});

describe('cursorAfterEdit', () => {
  it.each([
    ['abc def', 'abc XY def', 7],
    ['abc XY def', 'abc def', 4],
    ['', 'hello', 5],
    ['hello', '', 0],
    ['same', 'same', 4],
    ['aaa', 'aa', 2],
  ])('%j -> %j puts the cursor at %i', (prev, next, want) => {
    expect(cursorAfterEdit(prev, next)).toBe(want);
  });

  it('never lands inside a surrogate pair', () => {
    // "😀" vs "😁😀": the shared tail is the low half of the emoji; the cursor snaps to a boundary.
    const next = '😁😀';
    const c = cursorAfterEdit('😀', next);
    expect(c % 2).toBe(0);
    expect(c).toBe(2);
    const c2 = cursorAfterEdit('😁😀', '😀');
    expect([0, 2]).toContain(c2);
  });

  it('never leaves the new text', () => {
    for (const [a, b] of [
      ['x', 'xyz'],
      ['hello world', 'hello'],
      ['a #b c', 'a #bc'],
    ]) {
      const c = cursorAfterEdit(a, b);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(b.length);
    }
  });
});

describe('TaggedBodyInput', () => {
  it('renders the text with tags in their own styled runs, keeping label and testID', async () => {
    await render(<Harness initial="saw #water and #sea" />);
    expect(screen.getByLabelText('Entry text')).toBe(input());
    expect(bodyText(input())).toBe('saw #water and #sea');
    const tags = screen.getAllByText(/^#/);
    expect(tags.map((t) => t.props.children)).toEqual(['#water', '#sea']);
    for (const t of tags) {
      expect(t.props.style).toMatchObject({ color: colors.accent, fontWeight: '600' });
    }
    expect(screen.getByText('saw ').props.style).toBeUndefined();
  });

  it('has no value prop (React Native forbids value with children)', async () => {
    await render(<Harness initial="x" />);
    expect(input().props.value).toBeUndefined();
  });

  it('highlights a tag as it is typed, and drops it when the # is removed', async () => {
    await render(<Harness />);
    await fireEvent.changeText(input(), 'a #dre');
    expect(screen.getAllByText(/^#/).map((t) => t.props.children)).toEqual(['#dre']);
    await fireEvent.changeText(input(), 'a dre');
    expect(screen.queryAllByText(/^#/)).toHaveLength(0);
  });

  it('typing never remounts the input', async () => {
    await render(<Harness />);
    const before = input();
    for (const t of ['a', 'a ', 'a #', 'a #w', 'a #wa', 'a #wat', 'a #wat b']) {
      await fireEvent.changeText(input(), t);
      expect(bodyText(input())).toBe(t);
    }
    expect(input()).toBe(before);
    expect(input().props.autoFocus).toBeFalsy();
    expect(input().props.selection).toBeUndefined();
  });

  it('a programmatic change remounts, with the given cursor', async () => {
    await render(<Harness initial="hello" />);
    const before = input();
    await outside('hello #', { start: 7, end: 7 });
    expect(input()).not.toBe(before);
    expect(bodyText(input())).toBe('hello #');
    expect(input().props.selection).toEqual({ start: 7, end: 7 });
  });

  it('without a given cursor it picks the end of the changed region and reports it', async () => {
    await render(<Harness initial="abc XY def" />);
    await outside('abc def');
    expect(input().props.selection).toEqual({ start: 4, end: 4 });
    expect(selections).toContainEqual({ start: 4, end: 4 });
  });

  it('drops the forced cursor when the input reports its own selection', async () => {
    await render(<Harness initial="abc" />);
    await outside('abcd', { start: 4, end: 4 });
    expect(input().props.selection).toEqual({ start: 4, end: 4 });
    await fireEvent(input(), 'selectionChange', {
      nativeEvent: { selection: { start: 1, end: 1 } },
    });
    expect(input().props.selection).toBeUndefined();
    expect(selections.at(-1)).toEqual({ start: 1, end: 1 });
  });

  it('clamps a forced cursor to the text', async () => {
    await render(<Harness initial="abc" />);
    await outside('ab', { start: 9, end: 9 });
    expect(input().props.selection).toEqual({ start: 2, end: 2 });
  });

  it('applies a forced cursor even when the text did not change, without remounting', async () => {
    await render(<Harness initial="abc" />);
    const before = input();
    await outside('abc', { start: 1, end: 1 });
    expect(input()).toBe(before);
    expect(input().props.selection).toEqual({ start: 1, end: 1 });
  });

  it('refocuses after a remount only if the input had focus', async () => {
    await render(<Harness initial="abc" />);
    await outside('abcd');
    expect(input().props.autoFocus).toBe(false);
    await fireEvent(input(), 'focus');
    await outside('abcde');
    expect(input().props.autoFocus).toBe(true);
    await fireEvent(input(), 'blur');
    await outside('abcdef');
    expect(input().props.autoFocus).toBe(false);
  });

  it('is not editable when told so', async () => {
    await render(<Harness initial="abc" editable={false} />);
    expect(input().props.editable).toBe(false);
  });

  it('keeps the placeholder', async () => {
    await render(<Harness />);
    expect(screen.getByPlaceholderText('Start writing...')).toBe(input());
  });

  it('focuses when the focus signal changes, not on mount', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    function Signalled({ n }: { n: number }) {
      return (
        <TaggedBodyInput text="a" onChangeText={() => {}} focusSignal={n} testID="entry-body" />
      );
    }
    const view = await render(<Signalled n={0} />);
    expect(focus).not.toHaveBeenCalled();
    await view.rerender(<Signalled n={1} />);
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });
});
