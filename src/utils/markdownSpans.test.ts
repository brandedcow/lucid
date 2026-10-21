import { excludedRanges, fenceStates, inlineSpans, isRuleLine, splitLines } from './markdownSpans';

const slices = (text: string, ranges: readonly (readonly [number, number])[]) =>
  ranges.map(([a, b]) => text.slice(a, b));

describe('excludedRanges', () => {
  it('returns [] on the fast path', () => {
    expect(excludedRanges('')).toEqual([]);
    expect(excludedRanges('plain #tag **bold** [a] (b)')).toEqual([]);
    expect(excludedRanges('[a] (b)')).toEqual([]);
  });

  it('covers inline code spans including the backticks', () => {
    const t = 'a `b #c` d ``e ` f``';
    expect(slices(t, excludedRanges(t))).toEqual(['`b #c`', '``e ` f``']);
  });

  it('leaves unclosed backticks alone', () => {
    expect(excludedRanges('a `b')).toEqual([]);
  });

  it('covers a link destination, parentheses included, not the text', () => {
    const t = 'x [a #b](http://a/#c) y';
    expect(slices(t, excludedRanges(t))).toEqual(['(http://a/#c)']);
  });

  it('covers an image destination', () => {
    const t = '![alt](u.png)';
    expect(slices(t, excludedRanges(t))).toEqual(['(u.png)']);
  });

  it('covers a wikilink body, not the brackets', () => {
    const t = 'see [[Foo #bar]] ok';
    expect(slices(t, excludedRanges(t))).toEqual(['Foo #bar']);
  });

  it('ignores invalid links and wikilinks', () => {
    expect(excludedRanges('[a](b c) [[]] [[a[b]] [](x)')).toEqual([]);
  });

  it('covers whole fenced lines, fence lines included, not the line endings', () => {
    const t = 'a\n```js\n#x\n\n- [ ] y\n```\nb #t';
    expect(slices(t, excludedRanges(t))).toEqual(['```js', '#x', '- [ ] y', '```']);
  });

  it('runs an unclosed fence to the end of the body', () => {
    const t = 'a\n```\n#x\nb';
    expect(slices(t, excludedRanges(t))).toEqual(['```', '#x', 'b']);
  });

  it('does not look for inline spans inside fenced code', () => {
    const t = '```\n`a` [b](c)\n```';
    expect(slices(t, excludedRanges(t))).toEqual(['```', '`a` [b](c)', '```']);
  });

  it('includes code inside link text, sorted before the destination', () => {
    const t = '[`a`](u)';
    expect(slices(t, excludedRanges(t))).toEqual(['`a`', '(u)']);
  });

  it('is sorted and non-overlapping across several lines', () => {
    const t = '`a` [b](c) [[d]]\n```\nx\n```\n![e](f) `g`';
    const r = excludedRanges(t);
    expect(slices(t, r)).toEqual(['`a`', '(c)', 'd', '```', 'x', '```', '(f)', '`g`']);
    for (let i = 1; i < r.length; i++) expect(r[i][0]).toBeGreaterThanOrEqual(r[i - 1][1]);
  });

  it('gives correct offsets with emoji and CRLF', () => {
    const t = '😀 `a`\r\n[😀](u) [[é]]\r```\r\nz\r\n```';
    expect(slices(t, excludedRanges(t))).toEqual(['`a`', '(u)', 'é', '```', 'z', '```']);
  });
});

describe('splitLines', () => {
  it('splits on LF, CRLF and CR and records offsets', () => {
    expect(splitLines('a\r\nb\nc\rd')).toEqual([
      { text: 'a', eol: '\r\n', start: 0 },
      { text: 'b', eol: '\n', start: 3 },
      { text: 'c', eol: '\r', start: 5 },
      { text: 'd', eol: '', start: 7 },
    ]);
    expect(splitLines('')).toEqual([{ text: '', eol: '', start: 0 }]);
  });
});

describe('fenceStates', () => {
  it('marks fences and the code between them', () => {
    expect(fenceStates(['a', '```js', 'b', '```', 'c'])).toEqual([
      null,
      'fence',
      'code',
      'fence',
      null,
    ]);
  });

  it('needs a closing run at least as long as the opening one', () => {
    expect(fenceStates(['````', '```', '````'])).toEqual(['fence', 'code', 'fence']);
  });
});

describe('isRuleLine', () => {
  it('accepts three or more of one character with optional spaces', () => {
    for (const l of ['---', '***', '___', '- - -', '* * *', '-----', ' --- ']) {
      expect(isRuleLine(l)).toBe(true);
    }
    for (const l of ['--', '-*-', '- - x', '', '- a', '    ---']) {
      expect(isRuleLine(l)).toBe(false);
    }
  });
});

describe('inlineSpans', () => {
  it('returns [] when nothing can start a span', () => {
    expect(inlineSpans('plain text')).toEqual([]);
  });

  it('reports geometry for each kind', () => {
    expect(inlineSpans('`a` [b](c) ![](d) [[e]]')).toEqual([
      { kind: 'code', start: 0, end: 3, ticks: 1 },
      { kind: 'link', start: 4, end: 10, textStart: 5, textEnd: 6, url: 'c' },
      { kind: 'image', start: 11, end: 17, textStart: 13, textEnd: 13, url: 'd' },
      { kind: 'wiki', start: 18, end: 23, target: 'e' },
    ]);
  });
});
