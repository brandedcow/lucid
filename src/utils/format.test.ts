import {
  countWords,
  formatDuration,
  formatEntryDateTime,
  formatShortDate,
  formatTimeOfDay,
  formatToday,
  plainSpaces,
} from './format';

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

describe('formatEntryDateTime', () => {
  it('formats weekday, date and time', () => {
    expect(formatEntryDateTime(new Date(2026, 9, 4, 6, 42))).toBe('Sunday, October 4 · 6:42 AM');
    expect(formatEntryDateTime(new Date(2026, 9, 4, 18, 5))).toBe('Sunday, October 4 · 6:05 PM');
  });
  it('gives an empty string for an invalid date', () => {
    expect(formatEntryDateTime(new Date('nope'))).toBe('');
  });
});

describe('formatTimeOfDay', () => {
  it.each([
    [new Date(2026, 9, 4, 6, 22), '6:22 AM'],
    [new Date(2026, 9, 4, 18, 5), '6:05 PM'],
    [new Date(2026, 9, 4, 12, 0), '12:00 PM'],
    [new Date(2026, 9, 4, 0, 0), '12:00 AM'],
    [new Date(2026, 9, 4, 9, 7), '9:07 AM'],
  ])('formats %s as %s', (date, expected) => {
    expect(formatTimeOfDay(date)).toBe(expected);
  });
  it('gives an empty string for an invalid date', () => {
    expect(formatTimeOfDay(new Date('nope'))).toBe('');
  });
  it('uses plain spaces even when the engine does not', () => {
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('6:22\u202fAM');
    const out = formatTimeOfDay(new Date(2026, 9, 4, 6, 22));
    jest.restoreAllMocks();
    expect(out).toBe('6:22 AM');
  });
});

describe('plain spaces', () => {
  afterEach(() => jest.restoreAllMocks());
  const NNBSP = ' ';
  const NBSP = ' ';
  const noOddSpaces = (s: string) => expect(s).not.toMatch(/[  ]/);

  it('plainSpaces swaps U+202F and U+00A0 for plain spaces', () => {
    expect(plainSpaces(`a${NNBSP}b${NBSP}c`)).toBe('a b c');
  });
  it('formatEntryDateTime uses plain spaces even when the engine does not', () => {
    jest
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue(`Sunday,${NBSP}October${NBSP}4`);
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue(`6:42${NNBSP}AM`);
    const out = formatEntryDateTime(new Date(2026, 9, 4, 6, 42));
    expect(out).toBe('Sunday, October 4 · 6:42 AM');
    noOddSpaces(out);
  });
  it('formatShortDate and formatToday use plain spaces', () => {
    jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue(`Sep${NNBSP}23,${NBSP}2025`);
    const short = formatShortDate(new Date(2025, 8, 23), new Date(2026, 9, 6));
    const today = formatToday(new Date(2026, 9, 4));
    expect(short).toBe('Sep 23, 2025');
    expect(today).toBe('Sep 23, 2025');
    noOddSpaces(short);
    noOddSpaces(today);
  });
});

describe('formatShortDate', () => {
  const now = new Date(2026, 9, 6);
  it('omits the current year', () => {
    expect(formatShortDate(new Date(2026, 8, 23), now)).toBe('Sep 23');
  });
  it('adds a different year', () => {
    expect(formatShortDate(new Date(2025, 8, 23), now)).toBe('Sep 23, 2025');
  });
  it('gives an empty string for an invalid date', () => {
    expect(formatShortDate(new Date('nope'), now)).toBe('');
  });
});
