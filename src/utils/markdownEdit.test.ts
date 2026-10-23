import { continueList, lineAt, mapCaretThroughEdit, toggleCheckboxAtLine } from './markdownEdit';
import { parseListPrefix } from './markdownLines';

/** Simulates typing Enter at `c` in `prev`. */
const enter = (prev: string, c: number) => prev.slice(0, c) + '\n' + prev.slice(c);
const cont = (prev: string, c = prev.length) => continueList(prev, enter(prev, c), c);
const at = (n: number) => ({ start: n, end: n });

describe('lineAt', () => {
  it('finds lines with their endings', () => {
    expect(lineAt('ab\ncd', 1)).toEqual({ start: 0, end: 2, text: 'ab', eol: '\n' });
    expect(lineAt('ab\ncd', 3)).toEqual({ start: 3, end: 5, text: 'cd', eol: '' });
    expect(lineAt('ab\r\ncd', 2)).toEqual({ start: 0, end: 2, text: 'ab', eol: '\r\n' });
    expect(lineAt('ab\r\ncd', 4)).toEqual({ start: 4, end: 6, text: 'cd', eol: '' });
    expect(lineAt('', 0)).toEqual({ start: 0, end: 0, text: '', eol: '' });
  });
});

describe('continueList', () => {
  const table: [string, string, string, number][] = [
    ['bullet -', '- one', '- one\n- ', 8],
    ['bullet *', '* one', '* one\n* ', 8],
    ['numbered 9 -> 10', '9. nine', '9. nine\n10. ', 12],
    ['numbered 1 -> 2', '1. one', '1. one\n2. ', 10],
    ['checked -> unchecked', '- [x] done', '- [x] done\n- [ ] ', 17],
    ['unchecked -> unchecked', '- [ ] todo', '- [ ] todo\n- [ ] ', 17],
    ['star checkbox', '* [ ] todo', '* [ ] todo\n* [ ] ', 17],
    ['indented keeps indent', '  - nested', '  - nested\n  - ', 15],
    ['indented numbered', '\t2. two', '\t2. two\n\t3. ', 12],
  ];
  it.each(table)('%s', (_n, prev, text, caret) => {
    expect(cont(prev)).toEqual({ text, selection: at(caret) });
  });

  it('splits mid-line and moves the rest to the new item', () => {
    expect(cont('- ab cd', 4)).toEqual({ text: '- ab\n-  cd', selection: at(7) });
  });

  it('continues in the middle of a document', () => {
    expect(cont('x\n- a\ny', 5)).toEqual({ text: 'x\n- a\n- \ny', selection: at(8) });
  });

  it('is null when the caret is inside the marker or indent', () => {
    expect(cont('- one', 1)).toBeNull();
    expect(cont('- one', 0)).toBeNull();
    expect(cont('  - one', 1)).toBeNull();
    expect(cont('- [ ] one', 3)).toBeNull();
    expect(cont('12. one', 3)).toBeNull();
  });

  it('exits an empty bullet by removing the marker', () => {
    expect(cont('- a\n- ')).toEqual({ text: '- a\n', selection: at(4) });
  });

  it('treats a blank-content item as empty', () => {
    expect(cont('- a\n-   ')).toEqual({ text: '- a\n', selection: at(4) });
  });

  it('outdents an empty indented bullet first, then exits', () => {
    const first = cont('- a\n    - ');
    expect(first).toEqual({ text: '- a\n  - ', selection: at(8) });
    expect(cont(first!.text)).toEqual({ text: '- a\n- ', selection: at(6) });
    expect(cont('- a\n\t- ')).toEqual({ text: '- a\n- ', selection: at(6) });
  });

  it('exits an empty checkbox with and without the trailing space', () => {
    expect(cont('- [ ] ')).toEqual({ text: '', selection: at(0) });
    expect(cont('- [ ]')).toEqual({ text: '', selection: at(0) });
    expect(cont('- [x] ')).toEqual({ text: '', selection: at(0) });
  });

  it('exits an empty numbered item', () => {
    expect(cont('1. a\n2. ')).toEqual({ text: '1. a\n', selection: at(5) });
  });

  it.each([['# Heading'], ['## Heading'], ['plain'], [''], ['> quote'], ['*italic*'], ['-no']])(
    '%j -> null',
    (line) => {
      expect(cont(line)).toBeNull();
    },
  );

  it('is null for anything but exactly one inserted newline', () => {
    expect(continueList('- a', '- a\n\n', 3)).toBeNull(); // two newlines
    expect(continueList('- a', '- a\nb', 3)).toBeNull(); // multi-char change
    expect(continueList('- ab', '- a\n', 3)).toBeNull(); // replacement
    expect(continueList('- abc', '- a\nc', 3)).toBeNull(); // selection replaced by newline
    expect(continueList('- a', '- a', 3)).toBeNull(); // nothing
    expect(continueList('- a', '- b\n', 3)).toBeNull(); // different text
  });

  it('handles a second Enter in a row (continued item becomes empty, then exits)', () => {
    const one = cont('- a')!;
    expect(one.text).toBe('- a\n- ');
    expect(cont(one.text)).toEqual({ text: '- a\n', selection: at(4) });
  });

  it('uses \\r\\n for new lines in \\r\\n bodies and preserves existing endings', () => {
    expect(cont('- a\r\n- b')).toEqual({ text: '- a\r\n- b\r\n- ', selection: at(12) });
    expect(cont('- a\r\n- ', 7)).toEqual({ text: '- a\r\n', selection: at(5) });
    expect(cont('- a\r\n- b\r\nz', 8)).toEqual({
      text: '- a\r\n- b\r\n- \r\nz',
      selection: at(12),
    });
  });

  it('is null when the newline lands inside a \\r\\n', () => {
    expect(continueList('- a\r\nb', '- a\r\n\nb', 4)).toBeNull();
  });

  it('handles emoji before the caret', () => {
    expect(cont('- 😀 hi')).toEqual({ text: '- 😀 hi\n- ', selection: at(10) });
    expect(cont('- 😀', 4)).toEqual({ text: '- 😀\n- ', selection: at(7) });
  });

  it('never splits a surrogate pair', () => {
    const prev = '- 😀';
    expect(continueList(prev, '- \uD83D\n\uDE00', 3)).toBeNull();
  });

  it('falls back to the diff when caretBefore is inconsistent', () => {
    expect(continueList('- a\n- b', '- a\n- b\n', 0)).toEqual({
      text: '- a\n- b\n- ',
      selection: at(10),
    });
    expect(continueList('- a', '- a\n')).toEqual({ text: '- a\n- ', selection: at(6) });
    expect(continueList('- a', '- a\n', 99)).toEqual({ text: '- a\n- ', selection: at(6) });
  });

  // Reversed on purpose (user decision 2026-10-23): a new numbered item renumbers the items after
  // it in the same run. It used to be "does not renumber following items".
  describe('numbered renumbering', () => {
    it('renumbers the following items from the new one', () => {
      expect(cont('1. a\n2. b', 4)).toEqual({ text: '1. a\n2. \n3. b', selection: at(8) });
      expect(cont('1. a\n2. b\n3. c', 4)).toEqual({
        text: '1. a\n2. \n3. b\n4. c',
        selection: at(8),
      });
    });

    it('splitting mid-item moves the rest to the new item and renumbers', () => {
      expect(cont('1. ab\n2. c', 4)).toEqual({ text: '1. a\n2. b\n3. c', selection: at(8) });
    });

    it('handles digit growth (9 -> 10 -> 11)', () => {
      expect(cont('9. a\n10. b', 4)).toEqual({ text: '9. a\n10. \n11. b', selection: at(9) });
    });

    it('leaves deeper items untouched and does not end the run on them', () => {
      expect(cont('1. a\n  1. x\n2. b', 4)).toEqual({
        text: '1. a\n2. \n  1. x\n3. b',
        selection: at(8),
      });
    });

    it('ends the run at a blank line', () => {
      expect(cont('1. a\n2. b\n\n3. c', 4)!.text).toBe('1. a\n2. \n3. b\n\n3. c');
    });

    it('ends the run at a non-list line', () => {
      expect(cont('1. a\n2. b\ntext\n3. c', 4)!.text).toBe('1. a\n2. \n3. b\ntext\n3. c');
    });

    it('ends the run at a line with a smaller indent', () => {
      expect(cont('  1. a\n  2. b\n3. c', 6)!.text).toBe('  1. a\n  2. \n  3. b\n3. c');
    });

    it('ends the run at a bullet of the same indent', () => {
      expect(cont('1. a\n2. b\n- c\n3. d', 4)!.text).toBe('1. a\n2. \n3. b\n- c\n3. d');
    });

    it('uses the body line ending and keeps others', () => {
      expect(cont('1. a\r\n2. b', 4)).toEqual({ text: '1. a\r\n2. \r\n3. b', selection: at(9) });
    });

    it('is null when a renumbered item would not be a safe integer', () => {
      // The new item (…991) is safe, the item after it would be …992.
      expect(cont('9007199254740990. a\n1. b', 19)).toBeNull();
    });

    it('does not touch bullets or checkboxes', () => {
      expect(cont('- a\n1. b', 3)!.text).toBe('- a\n- \n1. b');
    });
  });

  // continueList stays pure: the caller (NoteBodyInput) must pass a caret that is consistent with
  // the text. In a run of newlines, offsets c and c+1 both reproduce `next`.
  it('continues when given the real caret in a newline run, plain newline for the stale one', () => {
    expect(continueList('- a\ntext', '- a\n\ntext', 3)).toEqual({
      text: '- a\n- \ntext',
      selection: at(6),
    });
    // Stale caret 4 (one past the real one) is also "consistent", so it reads as an Enter typed on
    // the blank line under the item: null. The caller must never pass it.
    expect(continueList('- a\ntext', '- a\n\ntext', 4)).toBeNull();
  });

  it('is null for unsafe numbers', () => {
    expect(cont('99999999999999999999. a')).toBeNull();
  });
});

describe('code, fence and rule lines are plain for the edit helpers', () => {
  const fenced = '```\n- item\n- [ ] box\n1. one\n```';

  it.each([
    ['inside a fence, bullet', fenced, 9],
    ['inside a fence, checkbox', fenced, 19],
    ['inside a fence, numbered', fenced, 27],
    ['unclosed fence', '```\n- a', 7],
  ])('continueList leaves Enter alone: %s', (_n, text, c) => {
    expect(cont(text, c)).toBeNull();
  });

  it('continueList still continues a list after the fence closes', () => {
    expect(cont('```\nx\n```\n- a')!.text).toBe('```\nx\n```\n- a\n- ');
  });

  it('continueList does not treat a rule as a bullet', () => {
    expect(cont('- - -')).toBeNull();
    expect(cont('* * *')).toBeNull();
    expect(cont('---')).toBeNull();
  });

  it('parseListPrefix: rule-looking lines are null with and without a kind', () => {
    for (const line of ['- - -', '* * *', '-  -  -']) {
      expect(parseListPrefix(line)).toBeNull();
      expect(parseListPrefix(line, 'rule')).toBeNull();
    }
    expect(parseListPrefix('- a', 'code')).toBeNull();
    expect(parseListPrefix('- a', 'bullet')).not.toBeNull();
  });
});

describe('toggleCheckboxAtLine', () => {
  it('toggles the checkbox on the line containing the offset', () => {
    const t = 'T\n- [ ] a\n- [x] b';
    expect(toggleCheckboxAtLine(t, 5)!.text).toBe('T\n- [x] a\n- [x] b');
    expect(toggleCheckboxAtLine(t, 14)!.text).toBe('T\n- [ ] a\n- [ ] b');
    expect(toggleCheckboxAtLine(t, 9)!.text).toBe('T\n- [x] a\n- [x] b');
  });

  it('is null for non-checkbox, heading, rule and code lines', () => {
    expect(toggleCheckboxAtLine('T\n- a', 3)).toBeNull();
    expect(toggleCheckboxAtLine('T\nplain', 3)).toBeNull();
    expect(toggleCheckboxAtLine('# h', 0)).toBeNull();
    expect(toggleCheckboxAtLine('- - -', 1)).toBeNull();
    expect(toggleCheckboxAtLine('```\n- [ ] a\n```', 6)).toBeNull();
  });

  it('keeps CRLF and clamps odd offsets', () => {
    expect(toggleCheckboxAtLine('- [ ] a\r\nz', 3)!.text).toBe('- [x] a\r\nz');
    expect(toggleCheckboxAtLine('- [ ] a', 99)!.text).toBe('- [x] a');
  });
});

describe('mapCaretThroughEdit', () => {
  it('leaves the caret when nothing changed', () => {
    expect(mapCaretThroughEdit('- abc', '- abc', 3)).toBe(3);
  });
  it('keeps a caret at the end after a same-length swap with a coincident tail', () => {
    expect(mapCaretThroughEdit('recieve', 'receive', 7)).toBe(7);
  });
  it('shifts a caret after a longer correction', () => {
    expect(mapCaretThroughEdit('- im', "- I'm", 4)).toBe(5);
  });
  it('shifts a caret back after a shorter correction', () => {
    expect(mapCaretThroughEdit('- hte', '- he', 5)).toBe(4);
  });
  it('keeps a caret before the changed span', () => {
    expect(mapCaretThroughEdit('- hte', '- he', 2)).toBe(2);
    expect(mapCaretThroughEdit('- hte', '- he', 3)).toBe(3);
  });
  it('puts a caret inside the span at the end of the new span', () => {
    expect(mapCaretThroughEdit('xx teh yy', 'xx the yy', 5)).toBe(6);
    expect(mapCaretThroughEdit('xx im yy', "xx I'm yy", 4)).toBe(5);
  });
  it('shifts a caret after the span in the middle of the text', () => {
    expect(mapCaretThroughEdit('a im b', "a I'm b", 6)).toBe(7);
  });
  it('never lands inside a surrogate pair', () => {
    // Replacing "ab" by an emoji: a caret inside the span maps to next.length - tail = 0 + 2 = 2,
    // which is after the pair; a position between the halves moves back to before it.
    expect(mapCaretThroughEdit('x\u{1F600}y', 'x\u{1F601}y', 2)).toBe(1);
    expect(mapCaretThroughEdit('xy', 'x\u{1F600}y', 2)).toBe(4);
  });
  it('handles empty strings', () => {
    expect(mapCaretThroughEdit('', '', 0)).toBe(0);
    expect(mapCaretThroughEdit('', 'ab', 0)).toBe(0);
    expect(mapCaretThroughEdit('ab', '', 2)).toBe(0);
    expect(mapCaretThroughEdit('ab', 'abc', 99)).toBe(3);
  });
});
