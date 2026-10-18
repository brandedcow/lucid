import { notePreview } from './notePreview';

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
