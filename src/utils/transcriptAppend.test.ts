import { appendTranscript } from './transcriptAppend';

describe('appendTranscript', () => {
  it('puts the text alone into an empty body', () => {
    expect(appendTranscript('', 'I was flying')).toBe('I was flying');
    expect(appendTranscript(' \n ', 'I was flying')).toBe('I was flying');
  });

  it('adds exactly one blank line after the body', () => {
    expect(appendTranscript('Last night', 'I was flying')).toBe('Last night\n\nI was flying');
  });

  it('drops trailing spaces and newlines of the body first', () => {
    expect(appendTranscript('Last night  \n\n\n', 'I was flying')).toBe(
      'Last night\n\nI was flying',
    );
  });

  it('keeps leading whitespace of the body', () => {
    expect(appendTranscript('  indented', 'x')).toBe('  indented\n\nx');
  });

  it('trims the transcript', () => {
    expect(appendTranscript('a', '\n  b c  \n')).toBe('a\n\nb c');
  });

  it('returns the body unchanged for a whitespace-only transcript', () => {
    expect(appendTranscript('a  \n', '  \n')).toBe('a  \n');
    expect(appendTranscript('', '')).toBe('');
  });
});
