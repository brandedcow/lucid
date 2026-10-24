import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, TextInput } from 'react-native';
import { bodyText } from '../test/bodyText';
import * as markdownEdit from '../utils/markdownEdit';
import {
  ANDROID_FOCUS_RETRY_MS,
  ANDROID_RESELECT_MS,
  NoteBodyInput,
  type NoteBodyInputProps,
  clearEnterLog,
  cursorAfterEdit,
  getEnterLog,
  refreshEnterLogFlag,
  resetNoteBodyInputOrder,
} from './NoteBodyInput';

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
  resetNoteBodyInputOrder();
  clearEnterLog();
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

  describe.each([
    ['onChangeText before onSelectionChange', 'changeFirst', 'android'],
    ['onSelectionChange before onChangeText', 'selectionFirst', 'ios'],
  ] as const)('Enter with %s', (_name, order, wrongDefault) => {
    // The platform default is set to the OPPOSITE of the order under test, so the pick has to come
    // from what was learned from an unambiguous typed character, not from the default.
    let restore: { restore: () => void } | undefined;
    beforeEach(() => {
      restore = jest.replaceProperty(Platform, 'OS', wrongDefault);
    });
    afterEach(() => restore?.restore());

    // Native events for the caret moving to c then Enter: the selection event for the caret after
    // the Enter is delivered before the change (selectionFirst) or not at all yet (changeFirst).
    const press = async (c: number, next: string) => {
      await caretAt(c);
      if (order === 'selectionFirst') await caretAt(c + 1);
      await fireEvent.changeText(input(), next);
    };
    // One typed character at the end: unambiguous, teaches the order.
    const teach = async (body: string) => {
      await caretAt(body.length);
      if (order === 'selectionFirst') await caretAt(body.length + 1);
      await fireEvent.changeText(input(), body + 'z');
      changes.length = 0;
    };
    const enterAt = async (body: string, c: number) => {
      await render(<Harness initial={body} />);
      await teach(body);
      const shownBody = body + 'z';
      await press(c, shownBody.slice(0, c) + '\n' + shownBody.slice(c));
    };

    const cases: [string, string, number, string][] = [
      ['a line below', '- a\ntext', 3, '- a\n- \ntext'],
      ['one blank line below', '- a\n\ntext', 3, '- a\n- \n\ntext'],
      ['3 blank lines below', '- a\n\n\n\ntext', 3, '- a\n- \n\n\n\ntext'],
      ['a following bullet', '- a\n- b', 3, '- a\n- \n- b'],
      ['a following numbered item (renumbered)', '1. a\n2. b', 4, '1. a\n2. \n3. b'],
      ['a checkbox item', '- [x] a\ntext', 7, '- [x] a\n- [ ] \ntext'],
      ['a numbered list with a paragraph below', '1. a\ntext', 4, '1. a\n2. \ntext'],
      ['a CRLF body with a line below', '- a\r\ntext', 3, '- a\r\n- \r\ntext'],
    ];
    it.each(cases)('at the end of an item with %s continues the list', async (_n, body, c, out) => {
      await enterAt(body, c);
      expect(changes).toEqual([[out + 'z', 'format']]);
      expect(bodyText(input())).toBe(out + 'z');
    });

    it('Enter on the blank line directly under an item stays a plain newline', async () => {
      await enterAt('- a\n\ntext', 4);
      expect(changes).toEqual([['- a\n\n\ntextz', 'typing']]);
    });

    it('Enter at the end of the document continues the list', async () => {
      await render(<Harness initial="- a" />);
      await teach('- a');
      await press(4, '- az\n');
      expect(changes).toEqual([['- az\n- ', 'format']]);
    });
  });

  describe('event order learning', () => {
    let restore: { restore: () => void } | undefined;
    afterEach(() => restore?.restore());

    it('an unambiguous typed character with selection first makes an ambiguous Enter pick the earlier caret', async () => {
      restore = jest.replaceProperty(Platform, 'OS', 'ios'); // default: change first
      await render(<Harness initial={'- a\ntext'} />);
      await caretAt(8);
      await caretAt(9);
      await fireEvent.changeText(input(), '- a\ntextx');
      await caretAt(3);
      await caretAt(4);
      await fireEvent.changeText(input(), '- a\n\ntextx');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith('- a\ntextx', '- a\n\ntextx', 3);
      expect(changes.at(-1)).toEqual(['- a\n- \ntextx', 'format']);
    });

    it('with NO key press and NO teaching an ambiguous Enter is a guess: the platform default (android earlier caret, ios latest caret)', async () => {
      // Documents a guess, not device behaviour: this is the path taken only when onKeyPress was
      // not delivered and nothing was learned yet.
      restore = jest.replaceProperty(Platform, 'OS', 'android');
      await render(<Harness initial={'- a\ntext'} />);
      await caretAt(3);
      await caretAt(4);
      await fireEvent.changeText(input(), '- a\n\ntext');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith('- a\ntext', '- a\n\ntext', 3);
      restore.restore();
      resetNoteBodyInputOrder();
      restore = jest.replaceProperty(Platform, 'OS', 'ios');
      await render(<Harness initial={'- a\ntext'} />);
      await caretAt(3);
      await caretAt(4);
      await fireEvent.changeText(input(), '- a\n\ntext');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith('- a\ntext', '- a\n\ntext', 4);
    });

    it('a programmatic edit resets both remembered carets to its selection', async () => {
      await render(<Harness initial={'- a\ntext'} />);
      await caretAt(3);
      await caretAt(4);
      await outside('- b\ntext', { start: 3, end: 3 });
      await fireEvent.changeText(input(), '- b\n\ntext');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith('- b\ntext', '- b\n\ntext', 3);
    });
  });

  describe('Enter with a key press snapshot (fresh mount, nothing learned)', () => {
    let restore: { restore: () => void } | undefined;
    afterEach(() => restore?.restore());
    const enter = () => fireEvent(input(), 'keyPress', { nativeEvent: { key: 'Enter' } });
    const key = (k: string) => fireEvent(input(), 'keyPress', { nativeEvent: { key: k } });
    const mount = (body: string, at: number) =>
      render(<Harness initial={body} selection={{ start: at, end: at }} />);
    const nl = (body: string, at: number) => body.slice(0, at) + '\n' + body.slice(at);

    const bodies: [string, string, number, string][] = [
      ['numbered, 2 blank lines', '1. new item\n\n\ntest', 11, '1. new item\n2. \n\n\ntest'],
      ['numbered, 1 blank line', '1. new item\n\ntest', 11, '1. new item\n2. \n\ntest'],
      ['bullet', '- new item\n\n\ntest', 10, '- new item\n- \n\n\ntest'],
      ['checkbox', '- [ ] new item\n\n\ntest', 14, '- [ ] new item\n- [ ] \n\n\ntest'],
    ];
    describe.each(['ios', 'android'] as const)('platform %s', (os) => {
      beforeEach(() => {
        restore = jest.replaceProperty(Platform, 'OS', os);
      });
      describe.each(bodies)('%s', (_n, body, c, out) => {
        it('selection first: keyPress, selection, change continues', async () => {
          await mount(body, c);
          await enter();
          await caretAt(c + 1);
          await fireEvent.changeText(input(), nl(body, c));
          expect(changes).toEqual([[out, 'format']]);
        });
        it('change first: keyPress, change, selection continues', async () => {
          await mount(body, c);
          await enter();
          await fireEvent.changeText(input(), nl(body, c));
          expect(changes).toEqual([[out, 'format']]);
          await caretAt(c + 1);
        });
        it('a duplicate selection event does not hide the caret', async () => {
          await mount(body, c);
          await enter();
          await caretAt(c + 1);
          await caretAt(c + 1);
          await fireEvent.changeText(input(), nl(body, c));
          expect(changes).toEqual([[out, 'format']]);
        });
      });
    });

    it('hands the caret after the new marker to the input', async () => {
      await mount('1. new item\n\n\ntest', 11);
      await enter();
      await caretAt(12);
      await fireEvent.changeText(input(), '1. new item\n\n\n\ntest');
      expect('1. new item\n2. '.length).toBe(15);
      expect(input().props.selection).toEqual({ start: 15, end: 15 });
    });

    it('with no key press delivered it falls back to pickCaretBefore', async () => {
      restore = jest.replaceProperty(Platform, 'OS', 'ios');
      await mount('1. new item\n\n\ntest', 11);
      await caretAt(12);
      await fireEvent.changeText(input(), '1. new item\n\n\n\ntest');
      // iOS default: the latest caret (12), which is the line below: plain.
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith(
        '1. new item\n\n\ntest',
        '1. new item\n\n\n\ntest',
        12,
      );
      expect(changes).toEqual([['1. new item\n\n\n\ntest', 'typing']]);
    });

    it('a key other than Enter clears the snapshot', async () => {
      restore = jest.replaceProperty(Platform, 'OS', 'ios');
      await mount('1. new item\n\n\ntest', 11);
      await enter();
      await key('a');
      await caretAt(12);
      await fireEvent.changeText(input(), '1. new item\n\n\n\ntest');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith(
        '1. new item\n\n\ntest',
        '1. new item\n\n\n\ntest',
        12,
      );
    });

    it('a snapshot that does not fit the change falls back to pickCaretBefore', async () => {
      restore = jest.replaceProperty(Platform, 'OS', 'ios');
      await mount('- a\ntext', 3);
      await enter();
      await caretAt(8);
      await caretAt(9);
      await fireEvent.changeText(input(), '- a\ntextx');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith('- a\ntext', '- a\ntextx', 8);
    });

    it('the snapshot is used once: the next change does not reuse it', async () => {
      restore = jest.replaceProperty(Platform, 'OS', 'ios');
      await mount('- a\ntext', 3);
      await enter();
      await caretAt(4);
      await fireEvent.changeText(input(), '- a\n\ntext');
      expect(changes.at(-1)).toEqual(['- a\n- \ntext', 'format']);
      await caretAt(5);
      await fireEvent.changeText(input(), '- a\n- \ntextq');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith(
        '- a\n- \ntext',
        '- a\n- \ntextq',
        undefined,
      );
    });

    it('Enter on the blank line directly under an item, snapshot at the blank line, stays plain', async () => {
      await mount('- a\n\ntext', 4);
      await enter();
      await caretAt(5);
      await fireEvent.changeText(input(), '- a\n\n\ntext');
      expect(changes).toEqual([['- a\n\n\ntext', 'typing']]);
    });

    it('learns selection-first from the snapshot and keeps it across an unmount and mount', async () => {
      restore = jest.replaceProperty(Platform, 'OS', 'ios'); // default would be change first
      const first = await mount('- a\ntext', 3);
      await enter();
      await caretAt(4);
      await fireEvent.changeText(input(), '- a\n\ntext');
      await first.unmount();
      // No key press now: the ambiguous change must use the learned order (earlier caret = 3).
      await render(<Harness initial={'- a\ntext'} />);
      await caretAt(3);
      await caretAt(4);
      await fireEvent.changeText(input(), '- a\n\ntext');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith('- a\ntext', '- a\n\ntext', 3);
    });

    it('learns change-first from the snapshot (overrides the android default)', async () => {
      restore = jest.replaceProperty(Platform, 'OS', 'android'); // default would be selection first
      const first = await mount('- a\ntext', 3);
      await caretAt(2);
      await caretAt(3);
      await enter();
      await fireEvent.changeText(input(), '- a\n\ntext');
      await first.unmount();
      await render(<Harness initial={'- a\ntext'} />);
      await caretAt(3);
      await caretAt(4);
      await fireEvent.changeText(input(), '- a\n\ntext');
      expect(markdownEdit.continueList).toHaveBeenLastCalledWith('- a\ntext', '- a\n\ntext', 4);
    });
  });

  // Chunk 1e: the real iPhone sequence. On iOS one native Enter edit produced KEY, CHG (continued),
  // a stale SEL, then a SECOND CHG with the same text, all before React committed. The tests above
  // `await` every fireEvent, which commits between steps and so masked the duplicate. Here the whole
  // sequence runs inside ONE act() so nothing commits until it ends.
  describe('one native edit, duplicate change before commit (device log, chunk 1e)', () => {
    let restore: { restore: () => void } | undefined;
    afterEach(() => restore?.restore());
    const key = (k: string) => fireEvent(input(), 'keyPress', { nativeEvent: { key: k } });
    const change = (t: string) => fireEvent.changeText(input(), t);
    const bodies: [string, string, number, string][] = [
      ['numbered', '1. new item\n\n\n\n\ntest', 11, '1. new item\n2. \n\n\n\n\ntest'],
      ['bullet', '- new item!\n\n\n\n\ntest', 11, '- new item!\n- \n\n\n\n\ntest'],
    ];
    const nl = (b: string, at: number) => b.slice(0, at) + '\n' + b.slice(at);
    const pinned = (c: number) => ({ start: c, end: c });

    describe.each(['ios', 'android'] as const)('platform %s', (os) => {
      beforeEach(() => {
        restore = jest.replaceProperty(Platform, 'OS', os);
      });
      describe.each(bodies)('%s', (_n, body, c, out) => {
        const plain = nl(body, c);
        const mount = () => render(<Harness initial={body} selection={{ start: c, end: c }} />);

        it('A: key, change, stale selection, identical change keeps the continued edit and pin', async () => {
          await mount();
          selections.length = 0;
          await act(async () => {
            key('Enter');
            change(plain);
            caretAt(c + 1); // stale: from the old native view
            change(plain); // the duplicate
          });
          expect(changes).toEqual([[out, 'format']]);
          expect(input().props.selection).toEqual(pinned(out.indexOf('\n', c + 1)));
          expect(selections).toEqual([pinned(out.indexOf('\n', c + 1))]);
        });

        it('B: selection first, then change, stale selection, identical change', async () => {
          await mount();
          selections.length = 0;
          await act(async () => {
            key('Enter');
            caretAt(c + 1);
            change(plain);
            caretAt(c + 1); // stale
            change(plain);
          });
          expect(changes).toEqual([[out, 'format']]);
          expect(input().props.selection).toEqual(pinned(out.indexOf('\n', c + 1)));
          expect(selections.at(-1)).toEqual(pinned(out.indexOf('\n', c + 1)));
        });

        it('C: after the continued edit commits, a typed x is a normal insert', async () => {
          await mount();
          await act(async () => {
            key('Enter');
            change(plain);
            caretAt(c + 1);
            change(plain);
          });
          const shown = out;
          await key('x');
          await change(
            shown.slice(0, out.indexOf('\n', c + 1)) + 'x' + shown.slice(out.indexOf('\n', c + 1)),
          );
          expect(changes).toEqual([
            [out, 'format'],
            [
              shown.slice(0, out.indexOf('\n', c + 1)) +
                'x' +
                shown.slice(out.indexOf('\n', c + 1)),
              'typing',
            ],
          ]);
        });
      });
    });

    describe('D: no over-blocking', () => {
      it('two different fast chars are both applied', async () => {
        await render(<Harness initial="ab" />);
        await act(async () => {
          change('abx');
          change('abxy');
        });
        expect(changes).toEqual([
          ['abx', 'typing'],
          ['abxy', 'typing'],
        ]);
      });

      it('the same text typed again after a commit is applied', async () => {
        await render(<Harness initial="ab" />);
        await act(async () => {
          change('abx');
        });
        await act(async () => {
          change('ab');
        });
        await act(async () => {
          change('abx');
        });
        expect(changes.map((c) => c[0])).toEqual(['abx', 'ab', 'abx']);
      });

      it('a selection event after a plain edit is still processed', async () => {
        await render(<Harness initial="ab" />);
        selections.length = 0;
        await act(async () => {
          change('abx');
          caretAt(3);
        });
        expect(selections).toEqual([{ start: 3, end: 3 }]);
      });

      it('a selection event after the continued edit has committed is processed', async () => {
        await render(<Harness initial={'- a\ntext'} selection={{ start: 3, end: 3 }} />);
        await act(async () => {
          key('Enter');
          change('- a\n\ntext');
        });
        selections.length = 0;
        await caretAt(1);
        expect(selections).toEqual([{ start: 1, end: 1 }]);
      });
    });

    it('E: inPlace variant also ignores the duplicate', async () => {
      const body = '1. new item\n\n\n\n\ntest';
      await render(
        <Harness initial={body} editMode="inPlace" selection={{ start: 11, end: 11 }} />,
      );
      await act(async () => {
        key('Enter');
        change(nl(body, 11));
        caretAt(12);
        change(nl(body, 11));
      });
      expect(changes).toEqual([['1. new item\n2. \n\n\n\n\ntest', 'format']]);
    });

    it('F: the dev log shows DUP, SEL stale and COMMIT and never note text', async () => {
      const OLD = process.env.EXPO_PUBLIC_ENTER_LOG;
      process.env.EXPO_PUBLIC_ENTER_LOG = '1';
      refreshEnterLogFlag();
      try {
        const body = '1. zebrafish\n\n\n\n\ntest';
        await render(<Harness initial={body} selection={{ start: 12, end: 12 }} />);
        await act(async () => {
          key('Enter');
          change(nl(body, 12));
          caretAt(13);
          change(nl(body, 12));
        });
        const log = getEnterLog().join('\n');
        expect(log).toMatch(/BUILD android-2 /);
        expect(log).toMatch(/CHG .*pick=12 snapshot=12/);
        expect(log).toMatch(/RES continued/);
        expect(log).toMatch(/DUP ignored which=\d+ nextLen=\d+ shownLen=\d+/);
        expect(log).toMatch(/SEL stale ignored 13-13 shownLen=\d+/);
        expect(log).toMatch(/COMMIT shownLen=\d+/);
        expect(log).not.toContain('zebrafish');
        expect(log).not.toContain('test\n');
      } finally {
        if (OLD === undefined) delete process.env.EXPO_PUBLIC_ENTER_LOG;
        else process.env.EXPO_PUBLIC_ENTER_LOG = OLD;
        refreshEnterLogFlag();
      }
    });
  });

  describe('autocorrect then Enter: two native edits in one tick (device log 2, chunk 1f)', () => {
    let restore: { restore: () => void } | undefined;
    afterEach(() => restore?.restore());
    const key = (k: string) => fireEvent(input(), 'keyPress', { nativeEvent: { key: k } });
    const change = (t: string) => fireEvent.changeText(input(), t);
    const pinned = (c: number) => ({ start: c, end: c });
    const withLog = async (fn: () => Promise<void>) => {
      const OLD = process.env.EXPO_PUBLIC_ENTER_LOG;
      process.env.EXPO_PUBLIC_ENTER_LOG = '1';
      refreshEnterLogFlag();
      try {
        await fn();
      } finally {
        if (OLD === undefined) delete process.env.EXPO_PUBLIC_ENTER_LOG;
        else process.env.EXPO_PUBLIC_ENTER_LOG = OLD;
        refreshEnterLogFlag();
      }
    };

    // [name, marker before the item, marker of the new item]
    const kinds: [string, string, string][] = [
      ['bullet', '- ', '- '],
      ['numbered', '1. ', '2. '],
    ];

    describe.each(['ios', 'android'] as const)('platform %s', (os) => {
      beforeEach(() => {
        restore = jest.replaceProperty(Platform, 'OS', os);
      });
      describe.each(kinds)('%s', (_n, m, m2) => {
        const below = 'below';
        // wrong -> right word; the cursor is at the end of the item
        const setup = (wrong: string, right: string) => {
          const before = `${m}a ${wrong}\n${below}`;
          const c0 = `${m}a ${wrong}`.length;
          const fixedLine = `${m}a ${right}`;
          const fixed = `${fixedLine}\n${below}`;
          const enterText = `${fixedLine}\n\n${below}`;
          const out = `${fixedLine}\n${m2}\n${below}`;
          const pin = fixedLine.length + 1 + m2.length;
          return { before, c0, fixed, enterText, out, pin, endOfFixed: fixedLine.length };
        };
        const mount = (s: ReturnType<typeof setup>) =>
          render(<Harness initial={s.before} selection={pinned(s.c0)} />);

        it('1: the logged sequence continues the list and pins the caret', async () => {
          const s = setup('teh', 'the');
          await mount(s);
          selections.length = 0;
          await act(async () => {
            key('the');
            change(s.fixed);
            key('Enter');
            change(s.enterText);
            caretAt(s.endOfFixed + 1); // stale, from the old native view
            change(s.enterText); // duplicate of the Enter edit
          });
          expect(changes).toEqual([
            [s.fixed, 'typing'],
            [s.out, 'format'],
          ]);
          expect(input().props.selection).toEqual(pinned(s.pin));
          expect(selections).toEqual([pinned(s.pin)]);
        });

        it("2a: a correction that makes the word longer (im -> I'm)", async () => {
          const s = setup('im', "I'm");
          await mount(s);
          await act(async () => {
            key("I'm");
            change(s.fixed);
            key('Enter');
            change(s.enterText);
          });
          expect(changes).toEqual([
            [s.fixed, 'typing'],
            [s.out, 'format'],
          ]);
          expect(input().props.selection).toEqual(pinned(s.pin));
        });

        it('2b: a correction that makes the word shorter (hte -> he)', async () => {
          const s = setup('hte', 'he');
          await mount(s);
          await act(async () => {
            key('he');
            change(s.fixed);
            key('Enter');
            change(s.enterText);
          });
          expect(changes).toEqual([
            [s.fixed, 'typing'],
            [s.out, 'format'],
          ]);
          expect(input().props.selection).toEqual(pinned(s.pin));
        });

        it('4a: a duplicate of the correction arriving after the Enter edit is ignored', async () => {
          const s = setup('teh', 'the');
          await mount(s);
          await act(async () => {
            key('the');
            change(s.fixed);
            key('Enter');
            change(s.enterText);
            change(s.fixed); // duplicate of event 1
            change(s.enterText); // duplicate of event 2
          });
          expect(changes).toEqual([
            [s.fixed, 'typing'],
            [s.out, 'format'],
          ]);
          expect(input().props.selection).toEqual(pinned(s.pin));
        });

        it('8: a letter typed after the continuation lands at the pinned caret', async () => {
          const s = setup('teh', 'the');
          await mount(s);
          await act(async () => {
            key('the');
            change(s.fixed);
            key('Enter');
            change(s.enterText);
            caretAt(s.endOfFixed + 1);
            change(s.enterText);
          });
          const typed = s.out.slice(0, s.pin) + 'x' + s.out.slice(s.pin);
          await key('x');
          await change(typed);
          expect(changes).toEqual([
            [s.fixed, 'typing'],
            [s.out, 'format'],
            [typed, 'typing'],
          ]);
        });

        it('9: a selection event between the two changes still continues', async () => {
          const s = setup('teh', 'the');
          await mount(s);
          await act(async () => {
            key('the');
            change(s.fixed);
            caretAt(s.endOfFixed);
            key('Enter');
            change(s.enterText);
          });
          expect(changes).toEqual([
            [s.fixed, 'typing'],
            [s.out, 'format'],
          ]);
          expect(input().props.selection).toEqual(pinned(s.pin));
        });

        it('6: a multi-line change without a key press is plain', async () => {
          const s = setup('teh', 'the');
          await mount(s);
          const pasted = `${m}a the\n\n\n${below}`;
          await act(async () => {
            change(s.fixed);
            change(pasted);
          });
          expect(changes).toEqual([
            [s.fixed, 'typing'],
            [pasted, 'typing'],
          ]);
        });
      });

      it('3: numbered items below are renumbered', async () => {
        const before = '1. a teh\n2. b\n3. c';
        await render(<Harness initial={before} selection={pinned(8)} />);
        await act(async () => {
          key('the');
          change('1. a the\n2. b\n3. c');
          key('Enter');
          change('1. a the\n\n2. b\n3. c');
        });
        expect(changes).toEqual([
          ['1. a the\n2. b\n3. c', 'typing'],
          ['1. a the\n2. \n3. b\n4. c', 'format'],
        ]);
        expect(input().props.selection).toEqual(pinned(12));
      });

      it('5: a correction inside the marker area then Enter is a plain newline', async () => {
        const before = '1. a\nbelow';
        await render(<Harness initial={before} selection={pinned(4)} />);
        await act(async () => {
          key('1,');
          change('1, a\nbelow');
          key('Enter');
          change('1, a\n\nbelow');
        });
        expect(changes).toEqual([
          ['1, a\nbelow', 'typing'],
          ['1, a\n\nbelow', 'typing'],
        ]);
      });

      it('7: a normal Enter with a key press snapshot still continues', async () => {
        const before = '- a\nbelow';
        await render(<Harness initial={before} selection={pinned(3)} />);
        await act(async () => {
          key('Enter');
          change('- a\n\nbelow');
        });
        expect(changes).toEqual([['- a\n- \nbelow', 'format']]);
      });
    });

    it('10: the dev log has the new fields and never note text or key text', async () => {
      await withLog(async () => {
        const before = '- zebrafish teh\nquokka';
        await render(<Harness initial={before} selection={pinned(15)} />);
        await act(async () => {
          key('xylophone');
          change('- zebrafish the\nquokka');
          key('Enter');
          change('- zebrafish the\n\nquokka');
          caretAt(17);
          change('- zebrafish the\n\nquokka');
          change('- zebrafish the\nquokka');
        });
        const log = getEnterLog().join('\n');
        expect(log).toMatch(/BUILD android-2 /);
        expect(log).toMatch(/KEY key=Enter .*keyKind=enter keyLen=5 liveLen=22 trackedCaret=15/);
        expect(log).toMatch(
          /CHG .*liveLen=22 shownLen=22 delta=0 region=\d+\.\.\d+ .*mapped=undefined->15 path=fallback/,
        );
        expect(log).toMatch(/CHG .*delta=1 .*trackedCaret=15 mapped=15->15 path=snapshot/);
        expect(log).toMatch(/RES continued/);
        expect(log).toMatch(/DUP ignored which=1 /);
        expect(log).toMatch(/DUP ignored which=0 /);
        expect(log).toMatch(/COMMIT /);
        expect(log).not.toContain('zebrafish');
        expect(log).not.toContain('quokka');
        expect(log).not.toContain('xylophone');
      });
    });
  });

  describe('dev Enter log', () => {
    const OLD = process.env.EXPO_PUBLIC_ENTER_LOG;
    afterEach(() => {
      if (OLD === undefined) delete process.env.EXPO_PUBLIC_ENTER_LOG;
      else process.env.EXPO_PUBLIC_ENTER_LOG = OLD;
      refreshEnterLogFlag();
    });
    const setFlag = (on: boolean) => {
      if (on) process.env.EXPO_PUBLIC_ENTER_LOG = '1';
      else delete process.env.EXPO_PUBLIC_ENTER_LOG;
      refreshEnterLogFlag();
    };

    it('logs nothing and renders no bar unless EXPO_PUBLIC_ENTER_LOG is 1', async () => {
      setFlag(false);
      await render(<Harness initial={'- a\ntext'} />);
      await fireEvent(input(), 'keyPress', { nativeEvent: { key: 'Enter' } });
      expect(getEnterLog()).toEqual([]);
    });

    it('logs FOCUS, REMOUNT and RESELECT lines on Android, without note text', async () => {
      jest.useFakeTimers();
      const restoreOs = jest.replaceProperty(Platform, 'OS', 'android');
      const visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
      // The RN jest mock's focus is itself a mock whose calls would leak into later tests.
      const focus = jest.spyOn(TextInput.prototype, 'focus');
      // The RN jest mock of TextInput has no setSelection.
      (TextInput.prototype as unknown as { setSelection: unknown }).setSelection = jest.fn();
      setFlag(true);
      const view = await render(<NoteBodyInput text="secret" onChangeText={() => {}} />);
      await view.rerender(<NoteBodyInput text="secret" onChangeText={() => {}} focusSignal={1} />);
      await view.rerender(
        <NoteBodyInput
          text="secret2"
          onChangeText={() => {}}
          focusSignal={1}
          selection={{ start: 1, end: 1 }}
        />,
      );
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      const log = getEnterLog().join('\n');
      expect(log).toMatch(/FOCUS req=1 attempt=0 kbVisible=false/);
      expect(log).toMatch(/FOCUS req=1 attempt=3 kbVisible=false/);
      expect(log).toMatch(/FOCUS retry nativeCmd blur\+focus attempt=1/);
      expect(log).toMatch(/REMOUNT epoch=1 pending=1-1/);
      expect(log).toMatch(/RESELECT want=1-1/);
      expect(log).not.toMatch(/secret/);
      await view.unmount();
      focus.mockRestore();
      restoreOs.restore();
      visible.mockRestore();
      delete (TextInput.prototype as unknown as { setSelection?: unknown }).setSelection;
      jest.useRealTimers();
    });

    it('logs BUILD, KEY, SEL, CHG, RES and POSTSEL for one Enter and shows the strip', async () => {
      setFlag(true);
      await render(<Harness initial={'- a\ntext'} selection={{ start: 3, end: 3 }} />);
      await fireEvent(input(), 'keyPress', { nativeEvent: { key: 'Enter' } });
      await caretAt(4);
      await fireEvent.changeText(input(), '- a\n\ntext');
      await caretAt(6);
      const log = getEnterLog().join('\n');
      expect(log).toMatch(/BUILD android-2 mount=\d+/);
      expect(log).toMatch(/KEY key=Enter latestSel=3-3 prevSel=3-3 shownLen=8/);
      expect(log).toMatch(/SEL 4-4 shownLen=8/);
      expect(log).toMatch(/CHG prevLen=8 nextLen=9 head=4 .*pick=3 snapshot=3/);
      expect(log).toMatch(/RES continued/);
      expect(log).toMatch(/POSTSEL 6-6/);
      expect(changes.at(-1)).toEqual(['- a\n- \ntext', 'format']);
    });

    it('logs only Enter or other for keys, never typed characters or note text', async () => {
      setFlag(true);
      await render(<Harness initial="zebrafish note" selection={{ start: 3, end: 3 }} />);
      await fireEvent(input(), 'keyPress', { nativeEvent: { key: 'qxqx' } });
      await fireEvent(input(), 'keyPress', { nativeEvent: { key: 'Enter' } });
      await caretAt(4);
      await fireEvent.changeText(input(), 'zebrafish notq');
      const log = getEnterLog().join('\n');
      expect(log).toMatch(/KEY key=other /);
      expect(log).toMatch(/KEY key=Enter /);
      expect(log).not.toMatch(/key=q/);
      expect(log).toMatch(/keyLen=4/);
      expect(log).not.toContain('zebrafish');
      expect(log.replace(/BUILD.*|platform=\w+/g, '')).not.toMatch(/[qz]/);
    });

    it('logs and renders nothing through a full Enter when the flag is off', async () => {
      // Observable part only: that the call sites build no strings is by code structure (every
      // enterLog call and commonHead sit inside `if (enterLogOn())`), not something jest can see.
      setFlag(false);
      await render(<Harness initial={'- a\ntext'} selection={{ start: 3, end: 3 }} />);
      await fireEvent(input(), 'keyPress', { nativeEvent: { key: 'Enter' } });
      await caretAt(4);
      await fireEvent.changeText(input(), '- a\n\ntext');
      expect(getEnterLog()).toEqual([]);
    });

    it('keeps at most 40 entries with rising sequence numbers', async () => {
      setFlag(true);
      await render(<Harness initial="abc" />);
      for (let i = 0; i < 60; i += 1) await caretAt(i % 3);
      const log = getEnterLog();
      expect(log).toHaveLength(40);
      expect(log.at(-1)).toMatch(/^#6\d /);
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

  it('passes showSoftInputOnFocus and caretHidden to the input, by default and when set', async () => {
    const view = await render(<Harness initial="abc" />);
    expect(input().props.showSoftInputOnFocus).toBe(true);
    expect(input().props.caretHidden).toBe(false);
    await view.unmount();
    await render(<Harness initial="abc" showSoftInputOnFocus={false} caretHidden />);
    expect(input().props.showSoftInputOnFocus).toBe(false);
    expect(input().props.caretHidden).toBe(true);
  });

  it('keeps showSoftInputOnFocus and caretHidden after a programmatic edit remount', async () => {
    await render(<Harness initial="abc" showSoftInputOnFocus={false} caretHidden />);
    const before = input();
    await outside('abcd');
    expect(input()).not.toBe(before);
    expect(input().props.showSoftInputOnFocus).toBe(false);
    expect(input().props.caretHidden).toBe(true);
  });

  it('ignores a blur signal of 0 and blurs when it changes', async () => {
    const blur = jest.spyOn(TextInput.prototype, 'blur');
    const view = await render(<NoteBodyInput text="a" onChangeText={() => {}} blurSignal={0} />);
    expect(blur).not.toHaveBeenCalled();
    await view.rerender(<NoteBodyInput text="a" onChangeText={() => {}} blurSignal={1} />);
    expect(blur).toHaveBeenCalledTimes(1);
    await view.rerender(<NoteBodyInput text="a" onChangeText={() => {}} blurSignal={2} />);
    expect(blur).toHaveBeenCalledTimes(2);
    blur.mockRestore();
  });

  it('blurs before it focuses when both signals change in one render', async () => {
    const calls: string[] = [];
    const blur = jest.spyOn(TextInput.prototype, 'blur').mockImplementation(() => {
      calls.push('blur');
    });
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {
      calls.push('focus');
    });
    const view = await render(
      <NoteBodyInput text="a" onChangeText={() => {}} focusSignal={0} blurSignal={0} />,
    );
    await view.rerender(
      <NoteBodyInput text="a" onChangeText={() => {}} focusSignal={1} blurSignal={1} />,
    );
    expect(calls).toEqual(['blur', 'focus']);
    blur.mockRestore();
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

// Jest does not exercise the native IME or native selection: these tests only pin down when
// focus() and setSelection() are called. Whether they fix the keyboard / caret on a device is
// unverified.
describe('Android focus retry and caret re-assert', () => {
  let restore: { restore: () => void } | undefined;
  let focus: jest.SpyInstance;
  let blur: jest.SpyInstance;
  let order: string[];
  let setSelection: jest.Mock;
  let visible: jest.SpyInstance;
  const advance = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms);
    });
  const noop = () => {};
  const withOs = (os: 'ios' | 'android') => {
    restore = jest.replaceProperty(Platform, 'OS', os);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    order = [];
    focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {
      order.push('focus');
    });
    blur = jest.spyOn(TextInput.State, 'blurTextInput').mockImplementation(() => {
      order.push('blur');
    });
    setSelection = jest.fn();
    (TextInput.prototype as unknown as { setSelection: unknown }).setSelection = setSelection;
    visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  });
  afterEach(() => {
    restore?.restore();
    restore = undefined;
    focus.mockRestore();
    blur.mockRestore();
    visible.mockRestore();
    delete (TextInput.prototype as unknown as { setSelection?: unknown }).setSelection;
    jest.useRealTimers();
  });

  const lastDelay = Math.max(...ANDROID_FOCUS_RETRY_MS);
  const tree = (signal: number, extra: Partial<NoteBodyInputProps> = {}) => (
    <NoteBodyInput text="a" onChangeText={noop} focusSignal={signal} {...extra} />
  );

  it('iOS: focuses exactly once per signal and never retries or calls setSelection', async () => {
    withOs('ios');
    const view = await render(tree(0));
    await view.rerender(tree(1));
    await advance(lastDelay + 100);
    expect(focus).toHaveBeenCalledTimes(1);
    await view.rerender(tree(2));
    await advance(lastDelay + 100);
    expect(focus).toHaveBeenCalledTimes(2);
    expect(blur).not.toHaveBeenCalled();
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('Android: each retry blurs the input state before focusing, not the first attempt', async () => {
    withOs('android');
    const view = await render(tree(0));
    await view.rerender(tree(1));
    expect(order).toEqual(['focus']);
    await advance(lastDelay + 100);
    expect(order).toEqual(['focus', 'blur', 'focus', 'blur', 'focus', 'blur', 'focus']);
    expect(blur).toHaveBeenCalledTimes(ANDROID_FOCUS_RETRY_MS.length);
  });

  it('Android: retries focus at each delay while the keyboard is not visible', async () => {
    withOs('android');
    const view = await render(tree(0));
    await view.rerender(tree(1));
    expect(focus).toHaveBeenCalledTimes(1);
    for (let i = 0; i < ANDROID_FOCUS_RETRY_MS.length; i += 1) {
      await advance((ANDROID_FOCUS_RETRY_MS[i] ?? 0) - (ANDROID_FOCUS_RETRY_MS[i - 1] ?? 0));
      expect(focus).toHaveBeenCalledTimes(2 + i);
    }
    await advance(2000);
    expect(focus).toHaveBeenCalledTimes(1 + ANDROID_FOCUS_RETRY_MS.length);
  });

  it('Android: stops retrying once the keyboard is visible', async () => {
    withOs('android');
    const view = await render(tree(0));
    await view.rerender(tree(1));
    await advance(ANDROID_FOCUS_RETRY_MS[0] ?? 0);
    expect(focus).toHaveBeenCalledTimes(2);
    visible.mockReturnValue(true);
    await advance(2000);
    expect(focus).toHaveBeenCalledTimes(2);
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('Android: no retries when the soft keyboard is off (panel open) or not editable', async () => {
    withOs('android');
    const view = await render(tree(0, { showSoftInputOnFocus: false }));
    await view.rerender(tree(1, { showSoftInputOnFocus: false }));
    await advance(2000);
    expect(focus).toHaveBeenCalledTimes(1);
    await view.rerender(tree(2, { editable: false }));
    await advance(2000);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('Android: stops a pending retry when the panel opens before it fires', async () => {
    withOs('android');
    const view = await render(tree(0));
    await view.rerender(tree(1));
    await view.rerender(tree(1, { showSoftInputOnFocus: false }));
    await advance(2000);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('Android: makes no calls after unmount', async () => {
    withOs('android');
    const view = await render(tree(0));
    await view.rerender(tree(1));
    await view.unmount();
    await advance(2000);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(blur).not.toHaveBeenCalled();
  });

  it('Android: a new signal cancels the old retries and starts its own', async () => {
    withOs('android');
    const view = await render(tree(0));
    await view.rerender(tree(1));
    await advance(ANDROID_FOCUS_RETRY_MS[0] ?? 0);
    await view.rerender(tree(2));
    expect(focus).toHaveBeenCalledTimes(3);
    await advance(2000);
    expect(focus).toHaveBeenCalledTimes(3 + ANDROID_FOCUS_RETRY_MS.length);
  });

  it('iOS: a programmatic remount never calls setSelection', async () => {
    withOs('ios');
    await render(<Harness initial="abc" />);
    await outside('abcd', { start: 1, end: 2 });
    await advance(1000);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('Android: a programmatic remount re-asserts the selection once, after the delay', async () => {
    withOs('android');
    await render(<Harness initial="abc" />);
    await outside('abcd', { start: 1, end: 3 });
    expect(setSelection).not.toHaveBeenCalled();
    await advance(ANDROID_RESELECT_MS);
    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(setSelection).toHaveBeenCalledWith(1, 3);
    await advance(2000);
    expect(setSelection).toHaveBeenCalledTimes(1);
  });

  it('Android: with no selection from the parent it re-asserts the end of the changed region', async () => {
    withOs('android');
    await render(<Harness initial="abc" />);
    await outside('abXYc');
    await advance(ANDROID_RESELECT_MS);
    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(setSelection).toHaveBeenCalledWith(4, 4);
  });

  it('Android: clamps a selection beyond the text', async () => {
    withOs('android');
    await render(<Harness initial="abc" />);
    await outside('abcd', { start: 2, end: 99 });
    await advance(ANDROID_RESELECT_MS);
    expect(setSelection).toHaveBeenCalledWith(2, 4);
  });

  it('Android: native-style selection events after the remount do not cancel the re-assert', async () => {
    withOs('android');
    await render(<Harness initial="abc" />);
    await outside('abcd', { start: 1, end: 1 });
    await caretAt(4);
    await caretAt(0);
    await advance(ANDROID_RESELECT_MS);
    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(setSelection).toHaveBeenCalledWith(1, 1);
  });

  it('Android: a touch after the remount cancels the re-assert', async () => {
    withOs('android');
    await render(<Harness initial="abc" />);
    await outside('abcd', { start: 1, end: 1 });
    await fireEvent(input(), 'touchStart');
    await advance(2000);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('Android: a key press after the remount cancels the re-assert', async () => {
    withOs('android');
    await render(<Harness initial="abc" />);
    await outside('abcd', { start: 1, end: 1 });
    await fireEvent(input(), 'keyPress', { nativeEvent: { key: 'a' } });
    await advance(2000);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('Android: a touch before the remount does not suppress the re-assert after it', async () => {
    withOs('android');
    await render(<Harness initial="abc" />);
    await fireEvent(input(), 'touchStart');
    await outside('abcd', { start: 1, end: 1 });
    await advance(ANDROID_RESELECT_MS);
    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(setSelection).toHaveBeenCalledWith(1, 1);
  });

  it('iOS: touch and selection events never lead to setSelection', async () => {
    withOs('ios');
    await render(<Harness initial="abc" />);
    await outside('abcd', { start: 1, end: 1 });
    await caretAt(3);
    await advance(2000);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('Android: makes no setSelection call after unmount', async () => {
    withOs('android');
    const view = await render(<Harness initial="abc" />);
    await outside('abcd', { start: 1, end: 1 });
    await view.unmount();
    await advance(2000);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('Android: each remount re-asserts its own selection', async () => {
    withOs('android');
    await render(<Harness initial="abc" />);
    await outside('abcd', { start: 1, end: 1 });
    await advance(ANDROID_RESELECT_MS);
    await outside('abcde', { start: 2, end: 2 });
    await advance(ANDROID_RESELECT_MS);
    expect(setSelection.mock.calls).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});
