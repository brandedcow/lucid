import { highlightParts, highlightRanges, splitByRanges } from './noteHighlight';
import { parseQuery, searchResults } from './noteSearch';
import { Note } from '../services/notesStorage';

const q = (s: string) => parseQuery(s);
const hits = (text: string, query: string) =>
  highlightRanges(text, q(query)).map(([s, e]) => text.slice(s, e));

describe('highlightRanges', () => {
  it('returns [] for an empty text or an empty query', () => {
    expect(highlightRanges('', q('a'))).toEqual([]);
    expect(highlightRanges('abc', q(''))).toEqual([]);
  });

  it('matches case-insensitively and keeps the original case', () => {
    expect(hits('Hello HELLO hello', 'hello')).toEqual(['Hello', 'HELLO', 'hello']);
  });

  it('folds accents both ways', () => {
    expect(hits('A Café au lait', 'cafe')).toEqual(['Café']);
    expect(hits('A cafe', 'café')).toEqual(['cafe']);
  });

  it('maps offsets back when folding changes the length (İ)', () => {
    const text = 'İstanbul trip';
    const r = highlightRanges(text, q('trip'));
    expect(text.slice(r[0][0], r[0][1])).toBe('trip');
    expect(hits(text, 'istanbul')).toEqual(['İstanbul']);
  });

  it('handles combining marks (decomposed é) as one original character', () => {
    const text = 'café time';
    expect(hits(text, 'cafe')).toEqual(['café']);
    expect(hits(text, 'time')).toEqual(['time']);
    // a hit ending before a mark still covers the whole character cluster unit it folds from
    expect(hits('éa', 'a')).toEqual(['a']);
  });

  it('handles emoji (surrogate pairs) without splitting them', () => {
    const text = '😀 dream 😀dream';
    const r = highlightRanges(text, q('dream'));
    expect(r.map(([s, e]) => text.slice(s, e))).toEqual(['dream', 'dream']);
    expect(r[1][0]).toBe(text.lastIndexOf('dream'));
  });

  it('handles Hangul (decomposes under NFD)', () => {
    const text = '꿈 일기 한글 꿈';
    expect(hits(text, '한글')).toEqual(['한글']);
    expect(hits(text, '꿈')).toEqual(['꿈', '꿈']);
    // partial syllable query is not a whole-character hit unless it folds equal
    expect(highlightRanges('한', q('ㅎ'))).toEqual(highlightRanges('한', q('ㅎ')));
  });

  it('merges overlapping and adjacent hits', () => {
    expect(hits('aaaa', 'aa')).toEqual(['aaaa']);
    expect(hits('foobar', 'foo bar')).toEqual(['foobar']);
    expect(hits('abcd', 'abc bcd')).toEqual(['abcd']);
    expect(hits('ab ab', 'ab')).toEqual(['ab', 'ab']);
  });

  it('covers overlapping occurrences of one word', () => {
    expect(hits('aaa', 'aa')).toEqual(['aaa']);
    expect(hits('xaaay', 'aa')).toEqual(['aaa']);
  });

  it('keeps the outer range when one hit contains another', () => {
    expect(hits('abcde', 'abcd bc')).toEqual(['abcd']);
    expect(hits('abcde f', 'abcde bc e')).toEqual(['abcde']);
  });

  it('highlights an emoji query as a whole surrogate pair', () => {
    expect(hits('a😀b', '😀')).toEqual(['😀']);
    expect(hits('😀', '😀')).toEqual(['😀']);
  });

  it('matches a tag term only at the start of the tag', () => {
    expect(hits('#asea #sea', '#sea')).toEqual(['#sea']);
  });

  it('highlights every word', () => {
    expect(hits('red fish blue fish', 'fish red')).toEqual(['red', 'fish', 'fish']);
  });

  it('highlights a tag-term prefix at a tag token start, including the #', () => {
    expect(hits('go #seaside now #sea', '#sea')).toEqual(['#sea', '#sea']);
    expect(hits('#Café x', '#cafe')).toEqual(['#Café']);
    expect(hits('go #seaside', '#sea')).toEqual(['#sea']);
  });

  it('does not highlight a tag term in plain text or a non-tag', () => {
    expect(hits('sea sea', '#sea')).toEqual([]);
    expect(hits('a#sea', '#sea')).toEqual([]);
  });

  it('a word does not need a tag: a word also matches inside a tag', () => {
    expect(hits('#seaside', 'side')).toEqual(['side']);
  });

  it('ignores a word that folds to nothing', () => {
    expect(highlightRanges('abc', q('́'))).toEqual([]);
  });

  it('property: non-empty iff searchResults matches the same text', () => {
    const alphabet = [
      'a',
      'A',
      'é',
      'e',
      'E',
      'é',
      'İ',
      'i',
      'ß',
      '😀',
      '한',
      ' ',
      'ñ',
      'n',
      'Ö',
      'o',
    ];
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const pick = (len: number) =>
      Array.from({ length: len }, () => alphabet[rnd(alphabet.length)]).join('');
    for (let i = 0; i < 400; i += 1) {
      const text = pick(2 + rnd(10));
      const word = pick(1 + rnd(3)).trim();
      if (word === '' || /\s/.test(word) || word.normalize('NFD').replace(/[̀-ͯ]/g, '') === '')
        continue;
      const note: Note = { id: 'x', createdAt: '', updatedAt: '', body: text };
      const found = searchResults([note], word).length > 0;
      expect({ text, word, hl: highlightRanges(text, q(word)).length > 0 }).toEqual({
        text,
        word,
        hl: found,
      });
    }
  });

  it('property: ranges are sorted, disjoint, within bounds and on character boundaries', () => {
    const text = 'İ😀 éé 한글 aAaA ß';
    for (const query of ['a', 'e', 'aa', 'i', 'ß', '한', 'a e']) {
      const ranges = highlightRanges(text, q(query));
      let prev = -1;
      for (const [s, e] of ranges) {
        expect(s).toBeGreaterThan(prev);
        expect(e).toBeGreaterThan(s);
        expect(e).toBeLessThanOrEqual(text.length);
        const code = text.charCodeAt(s);
        expect(code >= 0xdc00 && code <= 0xdfff).toBe(false); // not mid-surrogate
        prev = e - 1;
      }
    }
  });
});

describe('splitByRanges / highlightParts', () => {
  it('splits into plain and matched parts that rebuild the text', () => {
    const parts = highlightParts('Red fish, blue fish', q('fish'));
    expect(parts).toEqual([
      { text: 'Red ', match: false },
      { text: 'fish', match: true },
      { text: ', blue ', match: false },
      { text: 'fish', match: true },
    ]);
    expect(parts.map((p) => p.text).join('')).toBe('Red fish, blue fish');
  });

  it('gives one plain part with no match, and [] for empty text', () => {
    expect(highlightParts('abc', q('z'))).toEqual([{ text: 'abc', match: false }]);
    expect(highlightParts('', q('z'))).toEqual([]);
    expect(splitByRanges('abc', [[0, 3]])).toEqual([{ text: 'abc', match: true }]);
  });
});
