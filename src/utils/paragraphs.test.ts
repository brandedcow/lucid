import { splitParagraphs } from './paragraphs';

describe('splitParagraphs', () => {
  it('splits on blank lines and trims', () => {
    expect(splitParagraphs('  one\n\ntwo  \n\n\n  three ')).toEqual(['one', 'two', 'three']);
  });
  it('keeps a single line break inside a paragraph', () => {
    expect(splitParagraphs('a\nb\n\nc')).toEqual(['a\nb', 'c']);
  });
  it('normalizes CRLF and lone CR', () => {
    expect(splitParagraphs('a\r\n\r\nb\r\rc')).toEqual(['a', 'b', 'c']);
  });
  it('treats whitespace-only lines as a blank line', () => {
    expect(splitParagraphs('a\n   \t\nb')).toEqual(['a', 'b']);
  });
  it('returns [] for empty, blank or missing text', () => {
    expect(splitParagraphs('')).toEqual([]);
    expect(splitParagraphs('  \n\n ')).toEqual([]);
    expect(splitParagraphs(undefined)).toEqual([]);
  });
  it('returns [] for non-string input', () => {
    expect(splitParagraphs(null as unknown as string)).toEqual([]);
    expect(splitParagraphs(42 as unknown as string)).toEqual([]);
    expect(splitParagraphs({} as unknown as string)).toEqual([]);
  });
  it('returns one paragraph for plain text', () => {
    expect(splitParagraphs('just one')).toEqual(['just one']);
  });
});
