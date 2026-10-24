import { highlightRanges } from './noteHighlight';
import { matchSnippet, notePreview } from './notePreview';

describe('notePreview', () => {
  it('is the text after the title line', () => {
    expect(notePreview('Title\nbody text')).toBe('body text');
  });

  it('is empty with no text after the title', () => {
    expect(notePreview('')).toBe('');
    expect(notePreview('Title')).toBe('');
    expect(notePreview('Title\n\n  \n')).toBe('');
  });

  it('strips markers and collapses whitespace across lines', () => {
    expect(notePreview('T\n## Head\n- [ ]  one\n\n> two   **three**\r\n4. *four*')).toBe(
      'Head one two three four',
    );
  });

  it('does not include the title line, even when the title is only a tag', () => {
    expect(notePreview('#tag\nbody')).toBe('body');
  });

  it('keeps tags as written', () => {
    expect(notePreview('T\nsee #idea')).toBe('see #idea');
  });

  it('truncates with an ellipsis within maxLength', () => {
    const p = notePreview('T\nabcdefghij', 5);
    expect(p).toBe('abcd…');
    expect(Array.from(p).length).toBe(5);
  });

  it('does not truncate at exactly maxLength', () => {
    expect(notePreview('T\nabcde', 5)).toBe('abcde');
  });

  it('counts code points, not UTF-16 units', () => {
    expect(notePreview('T\n😀😀😀😀😀😀', 4)).toBe('😀😀😀…');
  });

  it('returns empty for a non-positive maxLength', () => {
    expect(notePreview('T\nabc', 0)).toBe('');
  });

  it('defaults to 120 characters', () => {
    expect(Array.from(notePreview('T\n' + 'a'.repeat(300))).length).toBe(120);
  });
});

describe('matchSnippet', () => {
  const words = (...w: string[]) => ({ words: w, tagTerms: [] as string[] });
  const filler = (n: number) => 'lorem ipsum dolor sit amet '.repeat(n);

  it('is the normal preview when the match is inside it', () => {
    const body = `Title\nfind me here ${filler(10)}`;
    expect(matchSnippet(body, words('find'))).toBe(notePreview(body));
  });

  it('is the normal preview when there is no visible match', () => {
    const body = `Title\n${filler(10)}`;
    expect(matchSnippet(body, words('zebra'))).toBe(notePreview(body));
  });

  it('is the normal preview when the only match is in the title', () => {
    const body = `Zebra\n${filler(10)}`;
    expect(matchSnippet(body, words('zebra'))).toBe(notePreview(body));
  });

  it('is the normal preview when the match is only in stripped markdown', () => {
    const body = `Title\n- [ ] ${filler(10)}`;
    expect(matchSnippet(body, words('['))).toBe(notePreview(body));
  });

  it('returns a "…" excerpt around a match beyond the preview', () => {
    const body = `Title\n${filler(12)}needle ${filler(4)}`;
    const s = matchSnippet(body, words('needle'));
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s).toContain('needle');
    expect(Array.from(s).length).toBeLessThanOrEqual(120);
    // starts at a word boundary: the char after the leading marker begins a word
    expect(s).toMatch(/^…\S/);
    expect(s.indexOf('needle')).toBeLessThanOrEqual(1 + 31);
  });

  it('has no trailing "…" when the match is near the end of the text', () => {
    const body = `Title\n${filler(12)}needle end`;
    const s = matchSnippet(body, words('needle'));
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(false);
    expect(s.endsWith('needle end')).toBe(true);
    expect(Array.from(s).length).toBeLessThanOrEqual(120);
  });

  it('respects maxLength and counts markers and code points', () => {
    const body = `Title\n${'😀 '.repeat(100)}needle ${'😀 '.repeat(100)}`;
    const s = matchSnippet(body, words('needle'), 60);
    expect(Array.from(s).length).toBeLessThanOrEqual(60);
    expect(s).toContain('needle');
  });

  it('matches folded text (accent and case)', () => {
    const body = `Title\n${filler(12)}Café ${filler(2)}`;
    expect(matchSnippet(body, words('cafe'))).toContain('Café');
  });

  it('handles a tag term beyond the preview', () => {
    const body = `Title\n${filler(12)}#night ${filler(2)}`;
    const s = matchSnippet(body, { words: [], tagTerms: ['nig'] });
    expect(s).toContain('#night');
  });

  it('copes with a very long word before the match', () => {
    const body = `Title\n${'x'.repeat(200)} needle tail`;
    const s = matchSnippet(body, words('needle'));
    expect(Array.from(s).length).toBeLessThanOrEqual(120);
    expect(s).toContain('needle');
  });

  it('switches to a snippet exactly where the preview stops showing the match', () => {
    const at = (p: number) => `Title\n${'a'.repeat(p)}zz${'a'.repeat(100)}`;
    // the preview shows 119 characters, then "…"
    expect(matchSnippet(at(117), words('zz'))).toBe(notePreview(at(117)));
    expect(matchSnippet(at(100), words('zz'))).toBe(notePreview(at(100)));
    expect(matchSnippet(at(118), words('zz'))).not.toBe(notePreview(at(118)));
    expect(matchSnippet(at(118), words('zz'))).toContain('zz');
    expect(matchSnippet(at(130), words('zz'))).toContain('zz');
  });

  it('is the full text when the whole text fits in the limit', () => {
    const body = `Title\n${'a'.repeat(118)}zz`;
    expect(matchSnippet(body, words('zz'))).toBe(`${'a'.repeat(118)}zz`);
  });

  it('starts the excerpt on a whole word', () => {
    const vocab = ['lorem', 'ipsum', 'dolor', 'sit', 'amet'];
    for (let pad = 0; pad < 8; pad += 1) {
      const body = `Title\n${'q'.repeat(pad)} ${filler(12)}needle ${filler(4)}`;
      const s = matchSnippet(body, words('needle'));
      const first = s.slice(1).split(' ')[0];
      expect(vocab).toContain(first);
    }
  });

  it('keeps a matched tag recognisable when a long unbroken token precedes it', () => {
    const body = `Title\n${'x'.repeat(200)}${'y'.repeat(30)} #night ${filler(3)}`;
    const parsed = { words: [] as string[], tagTerms: ['night'] };
    const s = matchSnippet(body, parsed);
    expect(s).toContain('#night');
    expect(highlightRanges(s, parsed).length).toBeGreaterThan(0);
    expect(Array.from(s).length).toBeLessThanOrEqual(120);
  });

  it('keeps word matches and the 120 cap with and without a "#" at the cut', () => {
    for (let pad = 20; pad < 50; pad += 1) {
      const body = `Title\n${'x'.repeat(150)}${'y'.repeat(pad)} #night needle ${filler(3)}`;
      for (const parsed of [words('needle'), { words: [], tagTerms: ['night'] }]) {
        const s = matchSnippet(body, parsed);
        expect(Array.from(s).length).toBeLessThanOrEqual(120);
        expect(highlightRanges(s, parsed).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('notePreview with the new markdown syntax', () => {
  it.each([
    ['T\n---', ''],
    ['T\n- - -', ''],
    ['T\na\n***\nb', 'a b'],
    ['T\n```js\ncode\n```', 'code'],
    ['T\n```\n- [ ] a\n# h\n```', '- [ ] a # h'],
    ['T\n```\nunclosed code', 'unclosed code'],
    ['T\nuse `x` here', 'use x here'],
    ['T\nsee [Foo](http://u) now', 'see Foo now'],
    ['T\n![](u)', ''],
    ['T\n![alt](u)', 'alt'],
    ['T\n[[Foo]] and [[Bar]]', 'Foo and Bar'],
    ['T\n### head', 'head'],
    ['T\n```js title\ncode\n```', 'code'],
  ])('notePreview(%j) is %j', (body, expected) => {
    expect(notePreview(body)).toBe(expected);
  });

  it('matchSnippet falls back to the plain preview for a word only in a URL or a fence', () => {
    const q = { words: ['zzz'], tagTerms: [] };
    expect(matchSnippet('T\n[a](http://zzz.example)', q)).toBe('a');
    // The fence info string is not shown, so a hit there is not visible either.
    expect(matchSnippet('T\n```zzz\ncode\n```', q)).toBe('code');
  });
});
