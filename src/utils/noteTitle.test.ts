import { noteTitle } from './noteTitle';

describe('noteTitle', () => {
  it('uses the first line', () => {
    expect(noteTitle('Shopping\nmilk')).toBe('Shopping');
  });

  it.each([
    ['# Heading', 'Heading'],
    ['## Heading', 'Heading'],
    ['- item', 'item'],
    ['* item', 'item'],
    ['3. item', 'item'],
    ['- [ ] task', 'task'],
    ['- [x] task', 'task'],
    ['> quote', 'quote'],
    ['**bold** and *italic*', 'bold and italic'],
    ['  padded  ', 'padded'],
  ])('strips markers from %j', (body, title) => {
    expect(noteTitle(body)).toBe(title);
  });

  it('is Untitled for an empty body or empty first line', () => {
    expect(noteTitle('')).toBe('Untitled');
    expect(noteTitle('\nsecond line')).toBe('Untitled');
    expect(noteTitle('   \nx')).toBe('Untitled');
    expect(noteTitle('# ')).toBe('Untitled');
  });

  it('is Untitled when the first line is only tags', () => {
    expect(noteTitle('#dream')).toBe('Untitled');
    expect(noteTitle('#a #b\ntext')).toBe('Untitled');
    expect(noteTitle('- [ ] #todo')).toBe('Untitled');
  });

  it('keeps tags that sit next to words', () => {
    expect(noteTitle('Flying #dream')).toBe('Flying #dream');
  });

  it('does not count a bare # or ### as tags', () => {
    expect(noteTitle('# #')).toBe('#');
    expect(noteTitle('### x')).toBe('### x');
  });

  it('handles CRLF and unicode', () => {
    expect(noteTitle('日本語\r\nbody')).toBe('日本語');
    expect(noteTitle('\r\nbody')).toBe('Untitled');
  });

  it('keeps unclosed markers as text', () => {
    expect(noteTitle('a **b')).toBe('a **b');
  });
});
