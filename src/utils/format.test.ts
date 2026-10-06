import { countWords, formatDuration, formatToday } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [600, '10:00'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('formatToday', () => {
  it('formats weekday, month and day', () => {
    expect(formatToday(new Date(2026, 9, 4))).toBe('Sunday, October 4');
  });
});

describe('countWords', () => {
  it.each([
    ['', 0],
    ['   \n\t ', 0],
    ['one', 1],
    ['  two   words ', 2],
    ['line one\nline two\n\nthree', 5],
  ])('counts %j as %i', (text, expected) => {
    expect(countWords(text)).toBe(expected);
  });
});
