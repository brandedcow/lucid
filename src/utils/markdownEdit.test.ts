import {
  checkboxAction,
  continueList,
  indentLines,
  lineAt,
  toggleCheckbox,
  toggleCheckboxAtLine,
} from './markdownEdit';
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

  it('does not renumber following items', () => {
    expect(cont('1. a\n2. b', 4)).toEqual({ text: '1. a\n2. \n2. b', selection: at(8) });
  });

  it('is null for unsafe numbers', () => {
    expect(cont('99999999999999999999. a')).toBeNull();
  });
});

describe('checkboxAction / toggleCheckbox', () => {
  const table: [string, string, string, string][] = [
    ['unchecked -> checked', '- [ ] a', 'check', '- [x] a'],
    ['checked -> unchecked', '- [x] a', 'uncheck', '- [ ] a'],
    ['uppercase X -> unchecked', '- [X] a', 'uncheck', '- [ ] a'],
    ['no trailing space', '- [ ]', 'check', '- [x]'],
    ['star checkbox', '* [ ] a', 'check', '* [x] a'],
    ['bullet -> checkbox', '- a', 'add', '- [ ] a'],
    ['star bullet keeps its char', '* a', 'add', '* [ ] a'],
    ['indented star bullet keeps its char', '  * a', 'add', '  * [ ] a'],
    ['plus is not a bullet -> plain line', '+ a', 'add', '- [ ] + a'],
    ['indented bullet', '  - a', 'add', '  - [ ] a'],
    ['numbered -> checkbox', '3. a', 'add', '- [ ] a'],
    ['indented numbered', '  3. a', 'add', '  - [ ] a'],
    ['plain -> checkbox', 'a', 'add', '- [ ] a'],
    ['indented plain', '  a', 'add', '  - [ ] a'],
    ['blank -> checkbox', '', 'add', '- [ ] '],
  ];
  it.each(table)('%s', (_n, text, action, out) => {
    expect(checkboxAction(text, at(text.length))).toBe(action);
    expect(toggleCheckbox(text, at(text.length))!.text).toBe(out);
  });

  it('keeps the star bullet through add, check and uncheck', () => {
    const added = toggleCheckbox('* a', at(3))!;
    expect(added.text).toBe('* [ ] a');
    const checked = toggleCheckbox(added.text, added.selection)!;
    expect(checked.text).toBe('* [x] a');
    expect(toggleCheckbox(checked.text, checked.selection)!.text).toBe('* [ ] a');
  });

  it('is a no-op on headings and quotes', () => {
    for (const t of ['# h', '## h', '> q']) {
      expect(checkboxAction(t, at(1))).toBe('none');
      expect(toggleCheckbox(t, at(1))).toBeNull();
    }
  });

  it('only touches the line at sel.start', () => {
    const text = '- [ ] a\n- [ ] b\nplain';
    expect(toggleCheckbox(text, at(10))!.text).toBe('- [ ] a\n- [x] b\nplain');
    expect(toggleCheckbox('a\r\nb\r\nc', at(4))!.text).toBe('a\r\n- [ ] b\r\nc');
    expect(toggleCheckbox('a\n# h', at(0))!.text).toBe('- [ ] a\n# h');
  });

  it('shifts the selection for a same-length change', () => {
    const t = '- [ ] abc';
    expect(toggleCheckbox(t, at(0))!.selection).toEqual(at(6)); // before prefix -> end of prefix
    expect(toggleCheckbox(t, at(3))!.selection).toEqual(at(6)); // inside
    expect(toggleCheckbox(t, at(8))!.selection).toEqual(at(8)); // after
    expect(toggleCheckbox(t, { start: 7, end: 9 })!.selection).toEqual({ start: 7, end: 9 });
  });

  it('shifts the selection when the prefix grows', () => {
    expect(toggleCheckbox('- abc', at(5))!.selection).toEqual(at(9));
    expect(toggleCheckbox('- abc', at(1))!.selection).toEqual(at(6));
    expect(toggleCheckbox('abc', at(2))!.selection).toEqual(at(8));
    expect(toggleCheckbox('abc', { start: 1, end: 3 })!.selection).toEqual({ start: 7, end: 9 });
    expect(toggleCheckbox('12. abc', at(7))!.selection).toEqual(at(9)); // prefix shrinks 4 -> 6? grows by 2
  });

  it('shifts a range that ends on a later line', () => {
    const r = toggleCheckbox('- a\nb', { start: 2, end: 5 })!;
    expect(r.text).toBe('- [ ] a\nb');
    expect(r.selection).toEqual({ start: 6, end: 9 });
  });

  it('twice on a checkbox returns the original (property)', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pieces = [
      '- [ ] ',
      '- [x] ',
      '* [ ] ',
      '  - [ ] ',
      '- ',
      '1. ',
      '# ',
      '> ',
      'a',
      'bc ',
      '😀',
      '\n',
      '\r\n',
    ];
    for (let i = 0; i < 300; i++) {
      let text = '';
      const n = 1 + Math.floor(rnd() * 8);
      for (let k = 0; k < n; k++) text += pieces[Math.floor(rnd() * pieces.length)];
      const caret = Math.floor(rnd() * (text.length + 1));
      const once = toggleCheckbox(text, at(caret));
      if (!once) continue;
      const line = lineAt(text, caret).text;
      if (!/^\s*[-*] \[[ xX]\]/.test(line)) continue;
      const twice = toggleCheckbox(once.text, at(lineAt(text, caret).start));
      expect(twice!.text.toLowerCase()).toBe(text.toLowerCase());
      if (!/\[X\]/.test(line)) expect(twice!.text).toBe(text);
    }
  });
});

describe('indentLines', () => {
  it('indents a list line by two spaces and nests twice', () => {
    const one = indentLines('- a', at(3))!;
    expect(one).toEqual({ text: '  - a', selection: at(5) });
    expect(indentLines(one.text, one.selection)!.text).toBe('    - a');
  });

  it('indents numbered and checkbox lines', () => {
    expect(indentLines('1. a', at(0))!.text).toBe('  1. a');
    expect(indentLines('- [ ] a', at(0))!.text).toBe('  - [ ] a');
  });

  it('outdents by up to two spaces, never past zero', () => {
    expect(indentLines('    - a', at(7), true)!.text).toBe('  - a');
    expect(indentLines(' - a', at(4), true)!.text).toBe('- a');
    expect(indentLines('- a', at(3), true)).toBeNull();
  });

  it('outdents a tab as one level', () => {
    expect(indentLines('\t- a', at(4), true)).toEqual({ text: '- a', selection: at(3) });
  });

  it('leaves non-list lines untouched', () => {
    expect(indentLines('plain', at(2))).toBeNull();
    expect(indentLines('# h', at(2))).toBeNull();
    expect(indentLines('> q', at(2))).toBeNull();
    expect(indentLines('a\n- b\nc', at(0))).toBeNull();
    expect(indentLines('a\n- b\nc', { start: 0, end: 7 })!.text).toBe('a\n  - b\nc');
  });

  it('works on every list line of a range and shifts both endpoints', () => {
    const r = indentLines('- a\n- b\nplain\n- c', { start: 2, end: 9 })!;
    expect(r.text).toBe('  - a\n  - b\nplain\n- c');
    expect(r.selection).toEqual({ start: 4, end: 13 });
  });

  it('does not touch the line a range ends at the very start of', () => {
    expect(indentLines('- a\n- b', { start: 0, end: 4 })!.text).toBe('  - a\n- b');
  });

  it('keeps \\r\\n endings', () => {
    expect(indentLines('- a\r\n- b', { start: 0, end: 8 })!.text).toBe('  - a\r\n  - b');
  });

  it('outdent selection inside the removed run goes to its start', () => {
    expect(indentLines('  - a', at(1), true)).toEqual({ text: '- a', selection: at(0) });
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

  it('toggleCheckbox / checkboxAction ignore code, fence and rule lines', () => {
    for (const [text, at] of [
      [fenced, 9],
      [fenced, 19],
      [fenced, 1],
      ['- - -', 2],
      ['* * *', 0],
      ['---', 1],
      ['```js\nplain', 3],
      ['```\nplain code', 6],
    ] as [string, number][]) {
      expect(toggleCheckbox(text, { start: at, end: at })).toBeNull();
      expect(checkboxAction(text, { start: at, end: at })).toBe('none');
    }
  });

  it('toggleCheckbox still works after a closed fence and on `### ` stays null', () => {
    expect(toggleCheckbox('```\nx\n```\nplain', { start: 12, end: 12 })!.text).toBe(
      '```\nx\n```\n- [ ] plain',
    );
    expect(toggleCheckbox('### h', { start: 0, end: 0 })).toBeNull();
  });

  it('indentLines skips code, fence and rule lines', () => {
    expect(indentLines(fenced, { start: 0, end: fenced.length })).toBeNull();
    expect(indentLines('- - -', { start: 0, end: 0 })).toBeNull();
    expect(indentLines('```\n- a\n```\n- b', { start: 0, end: 15 })!.text).toBe(
      '```\n- a\n```\n  - b',
    );
    expect(indentLines('```\n  - a\n```', { start: 5, end: 5 }, true)).toBeNull();
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
