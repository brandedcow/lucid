import { formatClock, formatRecordedAt, timeTicks } from './voiceNoteTime';

describe('timeTicks', () => {
  const secs = (d: number) => timeTicks(d).map((t) => t.seconds);
  it('is empty for zero, negative, NaN or infinite lengths', () => {
    for (const d of [0, -3, NaN, Infinity, -Infinity]) expect(timeTicks(d)).toEqual([]);
  });
  it('uses 5 s steps for short notes', () => {
    expect(secs(1)).toEqual([0]);
    expect(secs(5)).toEqual([0, 5]);
    expect(secs(23)).toEqual([0, 5, 10, 15, 20]);
    expect(secs(25)).toEqual([0, 5, 10, 15, 20, 25]);
  });
  it('steps up to 10, 15 and 30 s so about 5 ticks fit', () => {
    expect(secs(26)).toEqual([0, 10, 20]);
    expect(secs(50)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(secs(51)).toEqual([0, 15, 30, 45]);
    expect(secs(75)).toEqual([0, 15, 30, 45, 60, 75]);
    expect(secs(76)).toEqual([0, 30, 60]);
    expect(secs(300)).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
  });
  it('labels as m:ss', () => {
    expect(timeTicks(100).map((t) => t.label)).toEqual(['0:00', '0:30', '1:00', '1:30']);
    expect(timeTicks(12).map((t) => t.label)).toEqual(['0:00', '0:05', '0:10']);
  });
  it('never has a tick past the length', () => {
    for (const d of [0.4, 7.9, 29.99, 61, 1000]) {
      expect(Math.max(...secs(d))).toBeLessThanOrEqual(d);
    }
  });
});

describe('formatClock', () => {
  it('formats mm:ss.cc', () => {
    expect(formatClock(0)).toBe('00:00.00');
    expect(formatClock(1.7)).toBe('00:01.70');
    expect(formatClock(1.23)).toBe('00:01.23');
    expect(formatClock(59.99)).toBe('00:59.99');
    expect(formatClock(60)).toBe('01:00.00');
    expect(formatClock(125.05)).toBe('02:05.05');
    expect(formatClock(3600)).toBe('60:00.00');
  });
  it('truncates sub-centisecond digits', () => {
    expect(formatClock(0.999)).toBe('00:00.99');
    expect(formatClock(59.999)).toBe('00:59.99');
  });
  it('treats negative and non-finite as zero', () => {
    for (const v of [-1, -0.001, NaN, Infinity, -Infinity]) expect(formatClock(v)).toBe('00:00.00');
  });
});

describe('formatRecordedAt', () => {
  const now = new Date(2026, 9, 11, 15, 30); // Oct 11 2026, 3:30 PM
  it('says Today with the time', () => {
    expect(formatRecordedAt(new Date(2026, 9, 11, 18, 42), now)).toBe('Today, 6:42 PM');
    expect(formatRecordedAt(new Date(2026, 9, 11, 9, 5), now)).toBe('Today, 9:05 AM');
  });
  it('says Yesterday with the time', () => {
    expect(formatRecordedAt(new Date(2026, 9, 10, 7, 0), now)).toBe('Yesterday, 7:00 AM');
  });
  it('handles the midnight boundaries', () => {
    expect(formatRecordedAt(new Date(2026, 9, 11, 0, 0), now)).toBe('Today, 12:00 AM');
    expect(formatRecordedAt(new Date(2026, 9, 10, 23, 59), now)).toBe('Yesterday, 11:59 PM');
    expect(formatRecordedAt(new Date(2026, 9, 9, 23, 59), now)).toBe('Oct 9');
    const justAfterMidnight = new Date(2026, 9, 12, 0, 1);
    expect(formatRecordedAt(new Date(2026, 9, 11, 23, 59), justAfterMidnight)).toBe(
      'Yesterday, 11:59 PM',
    );
  });
  it('uses a short date for older notes, with the year when not this year', () => {
    expect(formatRecordedAt(new Date(2026, 8, 23, 8, 0), now)).toBe('Sep 23');
    expect(formatRecordedAt(new Date(2025, 11, 31, 8, 0), now)).toBe('Dec 31, 2025');
  });
  it('is month-boundary safe', () => {
    const first = new Date(2026, 10, 1, 10, 0);
    expect(formatRecordedAt(new Date(2026, 9, 31, 22, 0), first)).toBe('Yesterday, 10:00 PM');
  });
  it('shows a future date as a short date and an invalid date as empty', () => {
    expect(formatRecordedAt(new Date(2026, 9, 13, 8, 0), now)).toBe('Oct 13');
    expect(formatRecordedAt(new Date(NaN), now)).toBe('');
  });
});
