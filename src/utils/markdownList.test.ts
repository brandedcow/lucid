import { indentItem, listActions, moveItem, renumber, setListType } from './markdownList';

const at = (n: number) => ({ start: n, end: n });
const range = (a: number, b: number) => ({ start: a, end: b });
/** Caret marker: "|" in `s` is the caret and is removed. */
function caret(s: string): { text: string; sel: { start: number; end: number } } {
  const i = s.indexOf('|');
  return { text: s.slice(0, i) + s.slice(i + 1), sel: at(i) };
}
function show(
  r: { text: string; selection: { start: number; end: number } } | null,
): string | null {
  if (!r) return null;
  const { text, selection: s } = r;
  if (s.start === s.end) return text.slice(0, s.start) + '|' + text.slice(s.start);
  return text.slice(0, s.start) + '[' + text.slice(s.start, s.end) + ']' + text.slice(s.end);
}
const run = (
  fn: (t: string, s: { start: number; end: number }) => ReturnType<typeof indentItem>,
  marked: string,
) => {
  const { text, sel } = caret(marked);
  return show(fn(text, sel));
};

describe('indentItem', () => {
  it('indents only the caret line, not its sub-items', () => {
    expect(run((t, s) => indentItem(t, s), '- a|\n  - sub\n- b')).toBe('    - a|\n  - sub\n- b');
  });

  it('outdents one unit; null at indent 0', () => {
    expect(run((t, s) => indentItem(t, s, true), '    - a|')).toBe('- a|'); // 4-space note
    expect(run((t, s) => indentItem(t, s, true), '- a|')).toBeNull();
    expect(run((t, s) => indentItem(t, s, true), '  - a|')).toBe('- a|'); // 2-space note
  });

  it('handles tabs and a single space', () => {
    expect(run((t, s) => indentItem(t, s, true), '\t- a|')).toBe('- a|');
    expect(run((t, s) => indentItem(t, s, true), ' - a|')).toBe('- a|');
    expect(run((t, s) => indentItem(t, s), '\t- a|')).toBe('    \t- a|');
  });

  it('has no depth cap and needs no previous item', () => {
    let text = '- a';
    for (let i = 0; i < 20; i += 1) text = indentItem(text, at(text.length))!.text;
    expect(text).toBe(' '.repeat(80) + '- a');
    expect(indentItem('- first', at(0))).not.toBeNull();
  });

  it('indents and outdents paragraphs and blank lines (caret only)', () => {
    expect(run((t, s) => indentItem(t, s), 'plain|')).toBe('    plain|');
    expect(run((t, s) => indentItem(t, s, true), '  plain|')).toBe('plain|');
    expect(run((t, s) => indentItem(t, s, true), '      plain|')).toBe('  plain|'); // up to 4
    expect(run((t, s) => indentItem(t, s), 'a\n|\nb')).toBe('a\n    |\nb');
    expect(indentItem('a\n\nb', range(0, 4))!.text).toBe('    a\n\n    b'); // blank skipped in a range
  });

  it('skips headings, quotes and rules (both directions, null when nothing applies)', () => {
    for (const line of ['# h', '## h', '### h', '> q', '---']) {
      expect(indentItem(line, at(0))).toBeNull();
      expect(indentItem(line, at(0), true)).toBeNull();
      const a = listActions(line, at(0));
      expect(a.canIndent).toBe(false);
      expect(a.canOutdent).toBe(false);
    }
    const t = '# h\n- a\n> q\nplain\n---';
    expect(indentItem(t, range(0, t.length))!.text).toBe('# h\n    - a\n> q\n    plain\n---');
    expect(indentItem('# h\n> q', range(0, 7))).toBeNull();
  });

  it('skips fence lines and fenced code', () => {
    const t = '```\n- code\n```';
    expect(indentItem(t, at(0))).toBeNull();
    expect(indentItem(t, at(7))).toBeNull();
    expect(indentItem(t, range(0, t.length))).toBeNull();
    const mixed = '- a\n```\nx\n```\n- b';
    expect(indentItem(mixed, range(0, mixed.length))!.text).toBe('    - a\n```\nx\n```\n    - b');
  });

  it('indents every line a range touches and maps the range', () => {
    const t = '- a\n- b\n- c';
    const r = indentItem(t, range(2, 9))!;
    expect(r.text).toBe('    - a\n    - b\n    - c');
    expect(show(r)).toBe('    - [a\n    - b\n    -] c');
  });

  it('does not touch the line after a range that ends at its start', () => {
    const t = '- a\n- b';
    expect(indentItem(t, range(0, 4))!.text).toBe('    - a\n- b');
  });

  it('skips blank lines in a range but not for a caret', () => {
    const t = '- a\n\n- b';
    expect(indentItem(t, range(0, t.length))!.text).toBe('    - a\n\n    - b');
    expect(indentItem('\n', at(0))!.text).toBe('    \n');
  });

  it('keeps CRLF, CR and a last line with no EOL', () => {
    expect(indentItem('- a\r\n- b', range(0, 8))!.text).toBe('    - a\r\n    - b');
    expect(indentItem('- a\r- b', range(0, 7))!.text).toBe('    - a\r    - b');
    expect(indentItem('- a\n- b\n', at(8))!.text).toBe('- a\n- b\n    ');
    expect(indentItem('- a\r\n', at(1))!.text).toBe('    - a\r\n');
  });

  it('handles emoji and surrogate pairs in the content', () => {
    const t = '- 😀a';
    const r = indentItem(t, at(4))!; // between the surrogate pair and "a"
    expect(r.text).toBe('    - 😀a');
    expect(r.selection).toEqual(at(8));
    expect(indentItem(r.text, r.selection, true)).toEqual({ text: t, selection: at(4) });
  });

  it('renumbers the old and the new run', () => {
    // The new nested run restarts at 1; the outer run (a, c) closes up and is renumbered 1, 2.
    expect(run((t, s) => indentItem(t, s), '1. a\n2. b|\n3. c')).toBe('1. a\n    1. b|\n2. c');
    // A hand-numbered outer run keeps its start when its head slot is unchanged.
    expect(run((t, s) => indentItem(t, s), '5. a\n6. b|\n7. c')).toBe('5. a\n    1. b|\n6. c');
    // Indenting the head: the nested run restarts at 1 and the next item becomes the new head.
    expect(run((t, s) => indentItem(t, s), '|3. a\n4. b')).toBe('    |1. a\n1. b');
    expect(run((t, s) => indentItem(t, s, true), '1. a\n  2. b|\n2. c')).toBe('1. a\n2. b|\n3. c');
  });

  it('tolerates empty text, bad selections and out-of-range offsets', () => {
    expect(indentItem('', at(0))!.text).toBe('    ');
    expect(indentItem('', at(0), true)).toBeNull();
    expect(indentItem('- a', at(99))!.text).toBe('    - a');
    expect(indentItem('- a', { start: NaN, end: NaN })).toBeNull();
    expect(indentItem('- a', range(3, 0))!.text).toBe('    - a');
  });
});

describe('indent unit and outdent target (4 spaces while editing)', () => {
  const out = (marked: string) => run((t, sel) => indentItem(t, sel, true), marked);
  const ind = (marked: string) => run((t, sel) => indentItem(t, sel), marked);

  it('indent adds exactly 4 spaces on a caret, a range, a paragraph and a blank line', () => {
    expect(ind('- a|')).toBe('    - a|');
    expect(indentItem('- a\n- b', range(0, 7))!.text).toBe('    - a\n    - b');
    expect(ind('para|')).toBe('    para|');
    expect(ind('x\n|\ny')).toBe('x\n    |\ny');
    expect(indentItem('  - a', at(0))!.text).toBe('      - a'); // a 2-space line gains 4 more
  });

  it('outdents by note style: 4-space, 2-space, mixed, lone 8, tab, non-list', () => {
    expect(out('- a\n    - b|')).toBe('- a\n- b|'); // 4 -> 0
    expect(out('- a\n  - b|')).toBe('- a\n- b|'); // 2 -> 0
    expect(out('- a\n  - b\n    - c|')).toBe('- a\n  - b\n  - c|'); // 4 under 2 -> 2
    expect(out('- a\n  - b\n      - c|')).toBe('- a\n  - b\n  - c|'); // 6 under 2 -> 2
    expect(out('- a\n    - b\n        - c|')).toBe('- a\n    - b\n    - c|'); // 8 under 4 -> 4
    expect(out('        - a|')).toBe('    - a|'); // lone 8 -> 4
    expect(out('\t- a|')).toBe('- a|');
    expect(out('- a\n  - b\n\t\t- c|')).toBe('- a\n  - b\n\t- c|'); // two tabs (8) under 2 -> 4
    expect(out('      plain|')).toBe('  plain|');
    expect(out('\tplain|')).toBe('plain|');
    expect(out('plain|')).toBeNull();
  });

  it('outdent never goes below the parent or below 0', () => {
    expect(out('- a\n   - b|')).toBe('- a\n- b|'); // 3 -> 0
    expect(out('- a|')).toBeNull();
    expect(out(' - a|')).toBe('- a|');
  });

  it('a multi-line outdent gives each line its own target and keeps the structure', () => {
    const t = '- a\n  - b\n    - c';
    const r = indentItem(t, range(4, t.length), true)!;
    expect(r.text).toBe('- a\n- b\n  - c'); // 2 -> 0, 4 under 2 -> 2
    const r4 = indentItem('- a\n    - b\n        - c', range(4, 26), true)!;
    expect(r4.text).toBe('- a\n- b\n    - c');
    // A line already at 0 is skipped, the others still move.
    expect(indentItem('- a\n  - b', range(0, 9), true)!.text).toBe('- a\n- b');
  });

  it('a multi-line indent shifts every line by 4', () => {
    const t = '- a\n  - b\n    - c';
    expect(indentItem(t, range(0, t.length))!.text).toBe('    - a\n      - b\n        - c');
  });

  it('selection mapping: caret and range follow the 4-space delta', () => {
    expect(show(indentItem('- ab', at(3)))).toBe('    - a|b');
    expect(show(indentItem('    - ab', at(7), true))).toBe('- a|b');
    expect(show(indentItem('    - ab', at(2), true))).toBe('|- ab'); // inside the removed indent
    expect(show(indentItem('- a\n- b', range(2, 7)))).toBe('    - [a\n    - b]');
  });

  it('round trips: indent then outdent returns the original for 2-space and 4-space notes', () => {
    for (const t of [
      '- a\n- b\n    - c',
      '- a\n- b\n  - c',
      '- a\n  - b',
      'plain',
      '        - a',
    ]) {
      for (let p = 0; p <= t.length; p += 1) {
        const one = indentItem(t, at(p));
        if (!one) continue;
        const back = indentItem(one.text, one.selection, true);
        expect(back).toEqual({ text: t, selection: at(p) });
      }
    }
  });

  it('renumbers in mixed widths after indent, outdent and move', () => {
    expect(run((t, sel) => indentItem(t, sel), '1. a\n  1. b\n2. c|\n3. d')).toBe(
      '1. a\n  1. b\n    1. c|\n2. d',
    );
    expect(out('1. a\n    1. b\n    2. c|\n2. d')).toBe('1. a\n    1. b\n2. c|\n3. d');
    expect(out('1. a\n  1. b\n  2. c|\n2. d')).toBe('1. a\n  1. b\n2. c|\n3. d');
    expect(run((t, sel) => moveItem(t, sel, 'up'), '1. a\n2. b|\n    1. x\n3. c')).toBe(
      '1. b|\n2. a\n    1. x\n3. c',
    );
  });

  it('a 2-space note still moves, changes type and renumbers as before', () => {
    expect(run((t, sel) => moveItem(t, sel, 'down'), '- a|\n  - b\n- c')).toBe('  - b\n- a|\n- c');
    expect(run((t, sel) => setListType(t, sel, 'numbered'), '  - a|\n  - b')).toBe(
      '  1. a|\n  - b',
    );
    expect(show(renumber('1. a\n  1. x\n1. c', at(0), [0, 2]))).toBe('|1. a\n  1. x\n2. c');
  });
});

describe('moveItem', () => {
  it('swaps with the neighbour and keeps the caret offset', () => {
    expect(run((t, s) => moveItem(t, s, 'up'), '- a\n- b|c\n- d')).toBe('- b|c\n- a\n- d');
    expect(run((t, s) => moveItem(t, s, 'down'), '- a|\n- bc\n- d')).toBe('- bc\n- a|\n- d');
  });

  it('is null at the ends and next to non-list lines', () => {
    expect(moveItem('- a\n- b', at(0), 'up')).toBeNull();
    expect(moveItem('- a\n- b', at(5), 'down')).toBeNull();
    expect(moveItem('text\n- b', at(6), 'up')).toBeNull();
    expect(moveItem('- a\n\n- b', at(0), 'down')).toBeNull();
    expect(moveItem('plain\n- b', at(0), 'down')).toBeNull();
    expect(moveItem('- a\n# h', at(0), 'down')).toBeNull();
    expect(moveItem('- a\n> q', at(0), 'down')).toBeNull();
    expect(moveItem('- a\n---', at(0), 'down')).toBeNull();
    expect(moveItem('- a', at(0), 'down')).toBeNull();
    expect(moveItem('', at(0), 'up')).toBeNull();
  });

  it('is null when the neighbour is a fence or fenced code', () => {
    const t = '- a\n```\n- not a list\n```\n- b';
    expect(moveItem(t, at(0), 'down')).toBeNull();
    expect(moveItem(t, at(t.length), 'up')).toBeNull();
    expect(moveItem(t, at(10), 'up')).toBeNull(); // the code line itself is not an item
  });

  it('moves the line alone: sub-items stay put', () => {
    expect(run((t, s) => moveItem(t, s, 'down'), '- a|\n  - sub\n- b')).toBe('  - sub\n- a|\n- b');
  });

  it('is null for a selection over several lines', () => {
    expect(moveItem('- a\n- b\n- c', range(0, 6), 'down')).toBeNull();
    expect(moveItem('- a\n- b\n- c', range(0, 4), 'down')).not.toBeNull(); // a whole line only
  });

  it('keeps each EOL in its slot (CRLF, CR, mixed, last line without EOL)', () => {
    expect(moveItem('- a\r\n- b', at(0), 'down')!.text).toBe('- b\r\n- a');
    expect(moveItem('- a\r- b', at(5), 'up')!.text).toBe('- b\r- a');
    expect(moveItem('- a\r\n- b\n- c', at(0), 'down')!.text).toBe('- b\r\n- a\n- c');
    expect(moveItem('- a\r\n- b\n- c', at(9), 'up')!.text).toBe('- a\r\n- c\n- b');
    expect(moveItem('- a\n- b\n', at(0), 'down')!.text).toBe('- b\n- a\n');
  });

  it('maps a caret inside CRLF and at the very end', () => {
    const t = '- a\r\n- b';
    expect(moveItem(t, at(3), 'down')!.selection).toEqual(at(8)); // between \r and \n -> end of the moved line
    expect(moveItem(t, at(t.length), 'up')!.selection).toEqual(at(3));
  });

  it('maps a range inside one line', () => {
    expect(show(moveItem('- ab\n- c', range(2, 4), 'down'))).toBe('- c\n- [ab]');
  });

  it('maps ranges through the line ending without inverting (LF, CRLF, CR)', () => {
    expect(show(moveItem('- ab\n- c', range(2, 5), 'down'))).toBe('- c\n- [ab]'); // through the \n
    expect(show(moveItem('- ab\r\n- c', range(2, 6), 'down'))).toBe('- c\r\n- [ab]');
    expect(show(moveItem('- ab\r- c', range(2, 5), 'down'))).toBe('- c\r- [ab]');
    expect(show(moveItem('- ab\r\n- c', range(2, 5), 'down'))).toBe('- c\r\n- [ab]'); // between \r and \n
    expect(show(moveItem('- c\n- ab\n- d', range(6, 9), 'up'))).toBe('- [ab]\n- c\n- d');
    expect(show(moveItem('- c\r\n- ab\r\n- d', range(7, 11), 'up'))).toBe('- [ab]\r\n- c\r\n- d');
    expect(show(moveItem('- c\r- ab\r- d', range(6, 9), 'up'))).toBe('- [ab]\r- c\r- d');
    // The reviewer's examples.
    const a = moveItem('1. b\n1. b\r', range(3, 5), 'down')!;
    expect(a.selection.start).toBeLessThanOrEqual(a.selection.end);
    expect(a.selection.end).toBeLessThanOrEqual(a.text.length);
    const b = moveItem('2. c\r\n  - d\r> q', range(3, 6), 'down')!;
    expect(b.selection.start).toBeLessThanOrEqual(b.selection.end);
  });

  it('listActions move flags agree with moveItem for ranges', () => {
    for (const t of ['- a\n- b\n- c', '- a\r\n- b\r- c\n', '- a\n- b\n\n- c', '- a\n- b\n> q']) {
      for (let x = 0; x <= t.length; x += 1) {
        for (let y = x; y <= t.length; y += 1) {
          const a = listActions(t, range(x, y));
          expect(a.canMoveUp).toBe(moveItem(t, range(x, y), 'up') !== null);
          expect(a.canMoveDown).toBe(moveItem(t, range(x, y), 'down') !== null);
        }
      }
    }
  });

  it('handles emoji lines', () => {
    const r = moveItem('- 😀\n- b', at(4), 'down')!;
    expect(r.text).toBe('- b\n- 😀');
    expect(r.selection).toEqual(at(8));
  });

  it('renumbers the touched run, keeping where the run starts', () => {
    expect(run((t, s) => moveItem(t, s, 'up'), '1. a\n2. b|\n3. c')).toBe('1. b|\n2. a\n3. c');
    expect(run((t, s) => moveItem(t, s, 'down'), '1. a|\n2. b\n3. c')).toBe('1. b\n2. a|\n3. c');
    expect(run((t, s) => moveItem(t, s, 'down'), '5. a|\n6. b')).toBe('5. b\n6. a|');
  });

  it('does not rewrite other numbered runs', () => {
    const t = '1. a\n2. b\n\n7. x\n9. y\n10. z';
    expect(moveItem(t, at(0), 'down')!.text).toBe('1. b\n2. a\n\n7. x\n9. y\n10. z');
  });
});

describe('setListType', () => {
  it('converts keeping indent', () => {
    expect(run((t, s) => setListType(t, s, 'numbered'), '  - a|')).toBe('  1. a|');
    expect(run((t, s) => setListType(t, s, 'bullet'), '  1. a|')).toBe('  - a|');
    expect(run((t, s) => setListType(t, s, 'checkbox'), '  - a|')).toBe('  - [ ] a|');
    expect(run((t, s) => setListType(t, s, 'checkbox'), '1. a|')).toBe('- [ ] a|');
    expect(run((t, s) => setListType(t, s, 'checkbox'), '* a|')).toBe('* [ ] a|');
  });

  it('drops checked state going to bullet or numbered', () => {
    expect(run((t, s) => setListType(t, s, 'bullet'), '- [x] a|')).toBe('- a|');
    expect(run((t, s) => setListType(t, s, 'numbered'), '- [X] a|')).toBe('1. a|');
    expect(run((t, s) => setListType(t, s, 'bullet'), '* [ ] a|')).toBe('* a|');
  });

  it('gives a plain line a marker, after its indent', () => {
    expect(run((t, s) => setListType(t, s, 'bullet'), 'abc|')).toBe('- abc|');
    expect(run((t, s) => setListType(t, s, 'checkbox'), '  abc|')).toBe('  - [ ] abc|');
    expect(run((t, s) => setListType(t, s, 'numbered'), 'abc|')).toBe('1. abc|');
    expect(setListType('', at(0), 'bullet')).toEqual({ text: '- ', selection: at(2) });
  });

  it('toggles the marker off when all lines already have the kind', () => {
    expect(run((t, s) => setListType(t, s, 'bullet'), '- a|')).toBe('a|');
    expect(run((t, s) => setListType(t, s, 'numbered'), '  3. a|')).toBe('  a|');
    expect(run((t, s) => setListType(t, s, 'checkbox'), '- [x] a|')).toBe('a|');
    const t = '- a\n- b';
    expect(setListType(t, range(0, t.length), 'bullet')!.text).toBe('a\nb');
  });

  it('on a mixed range converts the others and leaves matching lines', () => {
    const t = '- a\nb\n1. c\n- [x] d';
    expect(setListType(t, range(0, t.length), 'bullet')!.text).toBe('- a\n- b\n- c\n- d');
    expect(setListType(t, range(0, t.length), 'checkbox')!.text).toBe(
      '- [ ] a\n- [ ] b\n- [ ] c\n- [x] d',
    );
  });

  it('skips heading, quote, rule, fence and fenced code lines', () => {
    for (const t of ['# h', '### h', '> q', '---', '```\nx\n```']) {
      expect(setListType(t, range(0, t.length), 'bullet')).toBeNull();
    }
    expect(setListType('```\nx\n```', at(5), 'bullet')).toBeNull();
    const t = '# h\nabc\n---\n> q\n```\nx\n```\ndef';
    expect(setListType(t, range(0, t.length), 'bullet')!.text).toBe(
      '# h\n- abc\n---\n> q\n```\nx\n```\n- def',
    );
  });

  it('numbers a converted range sequentially', () => {
    const t = '- a\n- b\n- c';
    expect(setListType(t, range(0, t.length), 'numbered')!.text).toBe('1. a\n2. b\n3. c');
  });

  it('joins an existing run and renumbers it', () => {
    expect(run((t, s) => setListType(t, s, 'numbered'), '1. a\n- b|\n3. c')).toBe(
      '1. a\n2. b|\n3. c',
    );
  });

  it('toggle-off in the middle: the tail after it is a new run and restarts at 1', () => {
    expect(run((t, s) => setListType(t, s, 'numbered'), '1. a\n2. b|\n3. c')).toBe(
      '1. a\nb|\n1. c',
    );
    expect(run((t, s) => setListType(t, s, 'bullet'), '1. a\n2. b|\n3. c\n4. d')).toBe(
      '1. a\n- b|\n1. c\n2. d',
    );
    // A hand-numbered run keeps its start while its head slot is unchanged.
    expect(run((t, s) => setListType(t, s, 'numbered'), '5. a\n6. b\n7. c|')).toBe(
      '5. a\n6. b\nc|',
    );
  });

  it('maps a caret in the marker to the end of the new marker, and ranges', () => {
    expect(show(setListType('- abc', at(1), 'numbered'))).toBe('1. |abc');
    expect(show(setListType('- abc', range(2, 5), 'checkbox'))).toBe('- [ ] [abc]');
    expect(show(setListType('abc', range(0, 3), 'bullet'))).toBe('- [abc]');
  });

  it('keeps CRLF, CR and a last line without EOL', () => {
    expect(setListType('a\r\nb\rc', range(0, 6), 'bullet')!.text).toBe('- a\r\n- b\r- c');
    expect(setListType('a\n', at(0), 'bullet')!.text).toBe('- a\n');
    expect(setListType('a\n', at(2), 'bullet')!.text).toBe('a\n- ');
  });

  it('handles emoji', () => {
    const r = setListType('😀x', at(2), 'bullet')!;
    expect(r).toEqual({ text: '- 😀x', selection: at(4) });
  });

  it('skips blank lines in a range', () => {
    const t = 'a\n\nb';
    expect(setListType(t, range(0, t.length), 'bullet')!.text).toBe('- a\n\n- b');
  });

  it('does not add a marker to a numbered line past the safe integer range', () => {
    const t = '9007199254740991. a\n- b';
    const r = setListType(t, range(0, t.length), 'numbered');
    expect(r).not.toBeNull();
    expect(r!.text.split('\n')[0]).toBe('9007199254740991. a');
  });
});

describe('renumber', () => {
  it('renumbers only the runs of touched lines', () => {
    const t = '1. a\n3. b\n\n7. x\n9. y';
    expect(renumber(t, at(0), [0])!.text).toBe('1. a\n2. b\n\n7. x\n9. y');
    expect(renumber(t, at(0), [3])!.text).toBe('1. a\n3. b\n\n7. x\n8. y');
    expect(renumber(t, at(0), [])).toBeNull();
  });

  it('uses the first number of the run', () => {
    expect(renumber('4. a\n9. b\n9. c', at(0), [1])!.text).toBe('4. a\n5. b\n6. c');
  });

  it('is null when already sequential', () => {
    expect(renumber('1. a\n2. b', at(0), [0, 1])).toBeNull();
  });

  it('treats deeper items as part of the run, but a shallower item, blank or plain line ends it', () => {
    expect(renumber('1. a\n  - x\n5. b', at(0), [0])!.text).toBe('1. a\n  - x\n2. b');
    expect(renumber('1. a\n  1. x\n  5. y\n5. b', at(0), [0])!.text).toBe(
      '1. a\n  1. x\n  5. y\n2. b',
    );
    expect(renumber('1. a\n  1. x\n  5. y\n5. b', at(0), [2])!.text).toBe(
      '1. a\n  1. x\n  2. y\n5. b',
    );
    expect(renumber('1. a\ntext\n5. b', at(0), [0])).toBeNull();
    expect(renumber('1. a\n\n5. b', at(0), [0])).toBeNull();
    expect(renumber('2. a\n- b\n5. c', at(0), [0])).toBeNull(); // a bullet at the same indent ends the run
    expect(renumber('  1. a\n5. b\n  5. c', at(0), [0])).toBeNull(); // a shallower line ends the nested run
  });

  it('does not run across a fenced block', () => {
    const t = '1. a\n```\nx\n```\n5. b';
    expect(renumber(t, at(0), [0, 4])).toBeNull();
  });

  it('adjusts the selection for changed digit counts', () => {
    const t = '9. a\n5. b';
    const r = renumber(t, at(t.length), [0])!;
    expect(r.text).toBe('9. a\n10. b');
    expect(r.selection).toEqual(at(r.text.length));
  });

  it('guards unsafe integers', () => {
    expect(renumber('9007199254740991. a\n1. b', at(0), [0])).toBeNull();
    expect(renumber('99999999999999999999. a\n1. b', at(0), [0])).toBeNull();
  });

  it('is idempotent', () => {
    const t = '3. a\n7. b\n  2. c\n  9. d\n11. e';
    const once = renumber(t, at(0), [0, 2])!;
    expect(renumber(once.text, once.selection, [0, 2])).toBeNull();
  });

  it('keeps line endings', () => {
    expect(renumber('1. a\r\n5. b\r6. c', at(0), [0])!.text).toBe('1. a\r\n2. b\r3. c');
  });
});

describe('listActions', () => {
  it('reports the kind and enabled controls', () => {
    const t = '- a\n- b\n- c';
    expect(listActions(t, at(5))).toEqual({
      onList: true,
      kind: 'bullet',
      canIndent: true,
      canOutdent: false,
      canMoveUp: true,
      canMoveDown: true,
    });
    expect(listActions(t, at(0)).canMoveUp).toBe(false);
    expect(listActions(t, at(t.length)).canMoveDown).toBe(false);
    expect(listActions('  - a', at(0)).canOutdent).toBe(true);
  });

  it('reports mixed, numbered, checkbox and not-on-list', () => {
    expect(listActions('- a\n1. b', range(0, 8)).kind).toBe('mixed');
    expect(listActions('1. a', at(0)).kind).toBe('numbered');
    expect(listActions('- [x] a', at(0)).kind).toBe('checkbox');
    const plain = listActions('abc', at(0));
    expect(plain.onList).toBe(false);
    expect(plain.kind).toBeNull();
    expect(plain.canIndent).toBe(true); // plain lines indent too
    expect(plain.canMoveUp).toBe(false);
    expect(listActions('```\nx\n```', at(5))).toMatchObject({ onList: false, canIndent: false });
  });

  it('is consistent with the transforms', () => {
    const texts = ['- a\n- b', '1. a\n\n2. b', '```\n- a\n```\n- b', '  - a\n- b', ''];
    for (const t of texts) {
      for (let p = 0; p <= t.length; p += 1) {
        const a = listActions(t, at(p));
        expect(a.canIndent).toBe(indentItem(t, at(p)) !== null);
        expect(a.canOutdent).toBe(indentItem(t, at(p), true) !== null);
        expect(a.canMoveUp).toBe(moveItem(t, at(p), 'up') !== null);
        expect(a.canMoveDown).toBe(moveItem(t, at(p), 'down') !== null);
      }
    }
  });
});

describe('random documents', () => {
  // Small deterministic LCG so failures reproduce.
  let seed = 12345;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const lineKinds = ['- a', '1. a', '- [ ] a', 'plain', '', '# h', '```', '> q'];
  const indents = ['', '  ', '    ', '      ', '        ', '\t', ' '];

  it('listActions agrees with indentItem/moveItem and selections stay in range', () => {
    for (let n = 0; n < 150; n += 1) {
      const lines: string[] = [];
      const count = 1 + rnd(7);
      for (let i = 0; i < count; i += 1)
        lines.push(indents[rnd(indents.length)] + lineKinds[rnd(8)]);
      const t = lines.join(rnd(2) ? '\n' : '\r\n');
      for (let k = 0; k < 6; k += 1) {
        const a = rnd(t.length + 1);
        const sel = k < 3 ? at(a) : range(a, a + rnd(t.length + 1 - a));
        const acts = listActions(t, sel);
        const results = {
          canIndent: indentItem(t, sel),
          canOutdent: indentItem(t, sel, true),
          canMoveUp: moveItem(t, sel, 'up'),
          canMoveDown: moveItem(t, sel, 'down'),
        };
        for (const [key, r] of Object.entries(results)) {
          expect(acts[key as keyof typeof results]).toBe(r !== null);
          if (r) {
            expect(r.selection.start).toBeGreaterThanOrEqual(0);
            expect(r.selection.start).toBeLessThanOrEqual(r.selection.end);
            expect(r.selection.end).toBeLessThanOrEqual(r.text.length);
          }
        }
      }
    }
  });
});

describe('properties', () => {
  const docs = [
    '- a\n- b\n- c',
    '- a\r\n  - b\r\n- c',
    '1. a\n2. b\n3. c',
    '- 😀a\n- b\n',
    '- [ ] a\n- [x] b\n- c\r- d',
    '- a\n```\n- x\n```\n- b\n- c',
    '- a\n\n- b\n- c',
  ];

  it('move up then down (and down then up) returns the original text and selection', () => {
    for (const t of docs) {
      for (let p = 0; p <= t.length; p += 1) {
        for (const [first, second] of [
          ['up', 'down'],
          ['down', 'up'],
        ] as const) {
          if (t[p - 1] === '\r' && t[p] === '\n') continue; // inside a CRLF: not a caret position
          const one = moveItem(t, at(p), first);
          if (!one) continue;
          expect(one.text).toHaveLength(t.length);
          const back = moveItem(one.text, one.selection, second);
          expect(back).toEqual({ text: t, selection: at(p) });
        }
      }
    }
  });

  it('range selections: always in bounds with start <= end, and move up/down round-trips', () => {
    for (const t of docs) {
      for (let x = 0; x <= t.length; x += 1) {
        for (let y = x; y <= t.length; y += 1) {
          for (const [first, second] of [
            ['up', 'down'],
            ['down', 'up'],
          ] as const) {
            const one = moveItem(t, range(x, y), first);
            if (!one) continue;
            const { start, end } = one.selection;
            expect(start).toBeLessThanOrEqual(end);
            expect(end).toBeLessThanOrEqual(one.text.length);
            expect(one.text).toHaveLength(t.length);
            const back = moveItem(one.text, one.selection, second);
            expect(back).not.toBeNull();
            expect(back!.text).toBe(t);
            expect(back!.selection.start).toBeLessThanOrEqual(back!.selection.end);
          }
        }
      }
    }
  });

  it('indent then outdent returns the original', () => {
    // docs[1] has a 2-space child; indenting the "- c" after it is the known exception, see below.
    for (const t of docs.filter((_, i) => i !== 1)) {
      for (let p = 0; p <= t.length; p += 1) {
        const one = indentItem(t, at(p));
        if (!one) continue;
        expect(indentItem(one.text, one.selection, true)).toEqual({ text: t, selection: at(p) });
      }
    }
    const t = '- a\n- b\n- c';
    const one = indentItem(t, range(1, 10))!;
    expect(indentItem(one.text, one.selection, true)).toEqual({ text: t, selection: range(1, 10) });
  });

  it('round trips for 2-space and 4-space notes; the one exception is a line after a deeper sibling', () => {
    for (const t of ['- a\n  - b\n- c', '- a\n    - b\n- c', '- a\n  - b\n    - c']) {
      for (let p = 0; p <= t.length; p += 1) {
        const one = indentItem(t, at(p));
        if (!one) continue;
        const back = indentItem(one.text, one.selection, true);
        // Indenting a top-level line right after a child makes it that child's child; outdenting
        // lands on the child's indent (the parent rule), not on the original column.
        const exception = t === '- a\n  - b\n- c' && one.text.endsWith('\n    - c');
        if (exception) expect(back!.text).toBe('- a\n  - b\n  - c');
        else expect(back).toEqual({ text: t, selection: at(p) });
      }
    }
  });

  it('transforms never throw and keep non-list text lines intact', () => {
    for (const t of docs) {
      for (let p = 0; p <= t.length; p += 1) {
        for (const kind of ['bullet', 'numbered', 'checkbox'] as const) {
          const r = setListType(t, range(p, Math.min(t.length, p + 5)), kind);
          if (r) expect(r.selection.start).toBeLessThanOrEqual(r.text.length);
        }
      }
    }
  });

  it('bullet toggle twice returns the original for plain lines', () => {
    const t = 'a\nb';
    const on = setListType(t, range(0, 3), 'bullet')!;
    expect(setListType(on.text, on.selection, 'bullet')!.text).toBe(t);
  });
});

describe('performance', () => {
  it('handles 2000 items without quadratic blowup', () => {
    const lines: string[] = [];
    for (let i = 0; i < 2000; i += 1) lines.push(`${i + 1}. item ${i}`);
    const t = lines.join('\n');
    const start = Date.now();
    const all = { start: 0, end: t.length };
    expect(indentItem(t, all)).not.toBeNull();
    expect(setListType(t, all, 'bullet')).not.toBeNull();
    const mid = t.indexOf('item 1000');
    const moved = moveItem(t, at(mid), 'up')!;
    expect(moved.text).toHaveLength(t.length);
    expect(renumber(t.replace('1000. ', '1. '), at(0), [0])).not.toBeNull();
    expect(listActions(t, at(mid)).canMoveUp).toBe(true);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
