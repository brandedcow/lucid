import {
  activeToken,
  completeToken,
  inlineTagFor,
  inlineTags,
  insertHash,
  materializeTags,
  missingInlineTags,
  scanTags,
} from './inlineTags';

describe('inlineTags grammar', () => {
  it.each([
    ['#water', ['water']],
    ['I saw #water today', ['water']],
    ['ended with #water', ['water']],
    ['sentence end #water.', ['water']],
    ['#a, #b; #c! #d? #e: #f', ['a', 'b', 'c', 'd', 'e', 'f']],
    ['(#a) [#b] {#c} "#d" \'#e\'', ['a', 'b', 'c', 'd', 'e']],
    ['x\n#line', ['line']],
    ['x\t#tab', ['tab']],
    ['#a/b', ['a']],
    ['#a@b', ['a']],
    ['#a#b', ['a']],
    ['#a&b', ['a']],
    ['#a|b', ['a']],
    ['#a…', ['a']],
    ['“#a”', []],
    ['#a”', ['a']],
    ['#a’s', ['a']],
    ['#a=b', ['a']],
    ['#Water #WATER #water', ['water']],
    ['#b #a #b #c #a', ['b', 'a', 'c']],
  ])('%j', (text, expected) => {
    expect(inlineTags(text)).toEqual(expected);
  });

  it('rejects # glued to a preceding word character or symbol', () => {
    expect(inlineTags('C#')).toEqual([]);
    expect(inlineTags('F# rocks')).toEqual([]);
    expect(inlineTags('a#b')).toEqual([]);
    expect(inlineTags('1#b')).toEqual([]);
    expect(inlineTags('_#b')).toEqual([]);
    expect(inlineTags('see https://x.com/#top')).toEqual([]);
    expect(inlineTags('&#39;')).toEqual([]);
    expect(inlineTags('foo.#bar')).toEqual([]);
  });

  it('rejects digit-only tokens but allows digits mixed with others', () => {
    expect(inlineTags('#123')).toEqual([]);
    expect(inlineTags('#2024 and #007')).toEqual([]);
    expect(inlineTags('#2024a #1-2 #3d')).toEqual(['2024a', '1-2', '3d']);
  });

  it('does not treat the second # of ## as a start', () => {
    expect(inlineTags('##a')).toEqual([]);
    expect(inlineTags('## a')).toEqual([]);
    expect(inlineTags('x ##a #b')).toEqual(['b']);
  });

  it('ignores a lone # and a # followed by a terminator or space', () => {
    expect(inlineTags('#')).toEqual([]);
    expect(inlineTags('# a')).toEqual([]);
    expect(inlineTags('#.')).toEqual([]);
    expect(inlineTags('#-')).toEqual([]);
  });

  it('allows 40 characters and rejects 41 (not truncated)', () => {
    const t40 = 'a'.repeat(40);
    expect(inlineTags('#' + t40)).toEqual([t40]);
    expect(inlineTags('#' + t40 + 'a')).toEqual([]);
  });

  it('counts length in code points, not UTF-16 units', () => {
    const e40 = '\u{1F319}'.repeat(40);
    expect(inlineTags('#' + e40)).toEqual([e40]);
    expect(inlineTags('#' + e40 + '\u{1F319}')).toEqual([]);
  });

  it('trims trailing hyphens and underscores, keeps inner ones', () => {
    expect(inlineTags('#foo-')).toEqual(['foo']);
    expect(inlineTags('#foo__ bar')).toEqual(['foo']);
    expect(inlineTags('#foo-bar_baz')).toEqual(['foo-bar_baz']);
    expect(inlineTags('#-foo')).toEqual(['-foo']);
    expect(scanTags('#foo--')).toEqual([{ start: 0, end: 4, tag: 'foo' }]);
  });

  it('measures the 40 limit after trimming trailing hyphens', () => {
    const t40 = 'a'.repeat(40);
    expect(inlineTags('#' + t40 + '-')).toEqual([t40]);
  });

  it('supports letters of any script', () => {
    expect(inlineTags('#水 #вода #été #ماء #물')).toEqual(['水', 'вода', 'été', 'ماء', '물']);
  });

  it('lowercases but does not NFC-normalize', () => {
    expect(inlineTags('#ÉTÉ')).toEqual(['été']);
    const decomposed = 'é';
    expect(inlineTags('#' + decomposed)).toEqual([decomposed]);
  });

  it('supports emoji including surrogate pairs and ZWJ sequences', () => {
    expect(inlineTags('#\u{1F319} #\u{1F468}‍\u{1F469}')).toEqual([
      '\u{1F319}',
      '\u{1F468}‍\u{1F469}',
    ]);
    expect(inlineTags('#moon\u{1F319}.')).toEqual(['moon\u{1F319}']);
  });

  it('has no cap on the number of tags', () => {
    const text = Array.from({ length: 60 }, (_, i) => `#t${i}`).join(' ');
    expect(inlineTags(text)).toHaveLength(60);
  });

  it('reports UTF-16 offsets of the # token', () => {
    const text = '\u{1F319} hi #Bad-dream. ok';
    const [m] = scanTags(text);
    expect(text.slice(m.start, m.end)).toBe('#Bad-dream');
    expect(m.tag).toBe('bad-dream');
    expect(scanTags('a #b #c')).toEqual([
      { start: 2, end: 4, tag: 'b' },
      { start: 5, end: 7, tag: 'c' },
    ]);
  });

  it('returns [] for empty text', () => {
    expect(scanTags('')).toEqual([]);
    expect(inlineTags('')).toEqual([]);
  });
});

describe('activeToken', () => {
  it('finds a token with the cursor at its end', () => {
    expect(activeToken('hi #wa', 6)).toEqual({ start: 3, end: 6, query: 'wa' });
  });

  it('finds a token with the cursor in the middle, covering the whole run', () => {
    expect(activeToken('hi #water now', 6)).toEqual({ start: 3, end: 9, query: 'water' });
  });

  it('returns an empty query right after the #', () => {
    expect(activeToken('hi #', 4)).toEqual({ start: 3, end: 4, query: '' });
    expect(activeToken('#', 1)).toEqual({ start: 0, end: 1, query: '' });
  });

  it('returns null with the cursor before the # (including text start)', () => {
    expect(activeToken('#water', 0)).toBeNull();
    expect(activeToken('hi #water', 3)).toBeNull();
  });

  it('returns null after a space or terminator', () => {
    expect(activeToken('#water ', 7)).toBeNull();
    expect(activeToken('#water.', 7)).toBeNull();
    expect(activeToken('#water, x', 9)).toBeNull();
  });

  it('returns null when # is not a valid start', () => {
    expect(activeToken('C#', 2)).toBeNull();
    expect(activeToken('a#b', 3)).toBeNull();
    expect(activeToken('##a', 3)).toBeNull();
    expect(activeToken('##', 2)).toBeNull();
  });

  it('works with multiple tokens: picks the one at the cursor', () => {
    const text = '#one #two #three';
    expect(activeToken(text, 4)).toEqual({ start: 0, end: 4, query: 'one' });
    expect(activeToken(text, 8)).toEqual({ start: 5, end: 9, query: 'two' });
    expect(activeToken(text, text.length)).toEqual({ start: 10, end: 16, query: 'three' });
  });

  it('lowercases the query and keeps typing-in-progress forms', () => {
    expect(activeToken('#Wa-', 4)).toEqual({ start: 0, end: 4, query: 'wa-' });
    expect(activeToken('#123', 4)).toEqual({ start: 0, end: 4, query: '123' });
  });

  it('works after an opening bracket and a newline', () => {
    expect(activeToken('(#a', 3)).toEqual({ start: 1, end: 3, query: 'a' });
    expect(activeToken('x\n#a', 4)).toEqual({ start: 2, end: 4, query: 'a' });
  });

  it('handles emoji in the token and out-of-range cursors', () => {
    const text = '#\u{1F319}x';
    expect(activeToken(text, text.length)).toEqual({ start: 0, end: 4, query: '\u{1F319}x' });
    expect(activeToken('#a', 5)).toBeNull();
    expect(activeToken('#a', -1)).toBeNull();
  });
});

describe('completeToken', () => {
  it('replaces the token at the end of text and adds a space', () => {
    expect(completeToken('hi #wa', { start: 3, end: 6 }, 'water')).toEqual({
      text: 'hi #water ',
      cursor: 10,
    });
  });

  it('replaces the whole token when the cursor was mid-token', () => {
    const text = 'hi #wat later';
    const tok = activeToken(text, 5);
    expect(tok).not.toBeNull();
    expect(completeToken(text, tok!, 'water')).toEqual({
      text: 'hi #water later',
      cursor: 10,
    });
  });

  it('does not double an existing following space', () => {
    expect(completeToken('#wa x', { start: 0, end: 3 }, 'water')).toEqual({
      text: '#water x',
      cursor: 7,
    });
  });

  it('adds a space before a following newline or punctuation', () => {
    expect(completeToken('#wa\nx', { start: 0, end: 3 }, 'water').text).toBe('#water \nx');
    expect(completeToken('#wa.', { start: 0, end: 3 }, 'water').text).toBe('#water .');
  });

  it('works on a bare # at the start and with multiple tokens', () => {
    expect(completeToken('#', { start: 0, end: 1 }, 'a')).toEqual({ text: '#a ', cursor: 3 });
    const text = '#one #tw #three';
    const tok = activeToken(text, 8)!;
    expect(completeToken(text, tok, 'two').text).toBe('#one #two #three');
  });

  it('normalizes and hyphenates the chosen tag', () => {
    expect(completeToken('#b', { start: 0, end: 2 }, 'Bad Dream').text).toBe('#bad-dream ');
  });

  it('keeps emoji intact around the replacement', () => {
    expect(completeToken('\u{1F319} #m', { start: 3, end: 5 }, 'moon').text).toBe(
      '\u{1F319} #moon ',
    );
  });
});

describe('insertHash', () => {
  it('inserts at the start and into empty text without a space', () => {
    expect(insertHash('', 0)).toEqual({ text: '#', cursor: 1 });
    expect(insertHash('abc', 0)).toEqual({ text: '#abc', cursor: 1 });
  });

  it('adds no space after whitespace or an opening bracket/quote', () => {
    expect(insertHash('hi ', 3)).toEqual({ text: 'hi #', cursor: 4 });
    expect(insertHash('hi\n', 3)).toEqual({ text: 'hi\n#', cursor: 4 });
    expect(insertHash('(', 1)).toEqual({ text: '(#', cursor: 2 });
    expect(insertHash('"', 1)).toEqual({ text: '"#', cursor: 2 });
  });

  it('adds a leading space after a word or punctuation so it parses', () => {
    expect(insertHash('hi', 2)).toEqual({ text: 'hi #', cursor: 4 });
    expect(insertHash('end.', 4)).toEqual({ text: 'end. #', cursor: 6 });
    const r = insertHash('hi', 2);
    expect(activeToken(r.text, r.cursor)).toEqual({ start: 3, end: 4, query: '' });
  });

  it('inserts mid-text at the cursor', () => {
    expect(insertHash('ab cd', 2)).toEqual({ text: 'ab # cd', cursor: 4 });
    expect(insertHash('ab cd', 3)).toEqual({ text: 'ab #cd', cursor: 4 });
  });
});

describe('materializeTags', () => {
  it('appends missing tags as a final line', () => {
    expect(materializeTags('A dream.', ['water', 'flying'])).toBe('A dream.\n#water #flying');
  });

  it('uses no separator for an empty body', () => {
    expect(materializeTags('', ['water'])).toBe('#water');
  });

  it('does not add a second newline when the body already ends with one', () => {
    expect(materializeTags('A dream.\n', ['water'])).toBe('A dream.\n#water');
  });

  it('hyphenates spaces and normalizes case', () => {
    expect(materializeTags('x', ['Bad Dream', '  Moon  '])).toBe('x\n#bad-dream #moon');
  });

  it('skips tags already in the body by normalized comparison', () => {
    expect(materializeTags('saw #Water', ['water', 'sky'])).toBe('saw #Water\n#sky');
    expect(materializeTags('saw #bad-dream', ['Bad Dream'])).toBe('saw #bad-dream');
  });

  it('returns the body unchanged when nothing is added', () => {
    expect(materializeTags('hello', [])).toBe('hello');
    expect(materializeTags('hello #a', ['a'])).toBe('hello #a');
    expect(materializeTags('', [])).toBe('');
  });

  it('collapses duplicate input tags', () => {
    expect(materializeTags('', ['a', 'A', ' a '])).toBe('#a');
  });

  it('drops tags that are empty, digits-only or too long', () => {
    expect(materializeTags('x', ['', '   ', '#', '..', '2024', 'a'.repeat(41)])).toBe('x');
    expect(materializeTags('x', ['2024', 'ok'])).toBe('x\n#ok');
  });

  it('sanitizes terminator characters to hyphens, collapsing runs and trimming the end', () => {
    expect(materializeTags('x', ['v1.2'])).toBe('x\n#v1-2');
    expect(materializeTags('x', ['a/b', 'a(b', 'a_', 'c.s.', 'foo-', 'a. .b', 'q?!'])).toBe(
      'x\n#a-b #a #c-s #foo #q',
    );
    expect(materializeTags('', ['2.5'])).toBe('#2-5');
  });

  it('treats a sanitized tag already in the body as present', () => {
    expect(materializeTags('saw #v1-2', ['v1.2'])).toBe('saw #v1-2');
  });

  it('writes every sanitized result as one inline tag', () => {
    const out = materializeTags('', ['v1.2', 'a/b', 'a(b', 'a_', 'bad dream']);
    expect(inlineTags(out)).toEqual(['v1-2', 'a-b', 'a', 'bad-dream']);
  });

  it('keeps emoji tags and round-trips through inlineTags', () => {
    const out = materializeTags('note', ['\u{1F319}', 'bad dream', 'Été']);
    expect(inlineTags(out)).toEqual(['\u{1F319}', 'bad-dream', 'été']);
  });
});

describe('inlineTagFor', () => {
  it('converts stored tags to their inline form, or null when they cannot be inline', () => {
    expect(inlineTagFor('bad dream')).toBe('bad-dream');
    expect(inlineTagFor('v1.2')).toBe('v1-2');
    expect(inlineTagFor('Water')).toBe('water');
    expect(inlineTagFor('2024')).toBeNull();
    expect(inlineTagFor('')).toBeNull();
    expect(inlineTagFor('x'.repeat(41))).toBeNull();
  });
});

describe('missingInlineTags', () => {
  it('lists converted stored tags the body lacks, once each, in order', () => {
    expect(
      missingInlineTags('Saw #water.', ['water', 'bad dream', 'Bad Dream', '2024', 'v1.2']),
    ).toEqual(['bad-dream', 'v1-2']);
  });

  it('returns nothing when the body has them all', () => {
    expect(missingInlineTags('#a #b', ['a', 'b'])).toEqual([]);
  });
});
