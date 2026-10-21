import { localDateKey, msUntilNextDay } from './today';

// Local-time constructors, so the tests hold in any time zone.
const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0): Date =>
  new Date(y, m - 1, d, h, min, s, ms);
const iso = (date: Date): string => date.toISOString();

describe('localDateKey', () => {
  it('formats local year, month and day with zero padding', () => {
    expect(localDateKey(at(2026, 1, 5, 12))).toBe('2026-01-05');
    expect(localDateKey(at(2026, 12, 31, 12))).toBe('2026-12-31');
  });

  it('uses the local day, not the UTC day, for late evening and early morning times', () => {
    // These are the same local day in every zone, though their UTC date can differ.
    expect(localDateKey(at(2026, 10, 10, 23, 30))).toBe('2026-10-10');
    expect(localDateKey(at(2026, 10, 10, 0, 30))).toBe('2026-10-10');
    expect(localDateKey(new Date(iso(at(2026, 10, 10, 23, 30))))).toBe('2026-10-10');
  });

  it('splits days at local midnight', () => {
    expect(localDateKey(at(2026, 10, 10, 23, 59, 59, 999))).toBe('2026-10-10');
    expect(localDateKey(at(2026, 10, 11, 0, 0, 0, 0))).toBe('2026-10-11');
  });
});

describe('msUntilNextDay', () => {
  it('is one second at 23:59:59', () => {
    expect(msUntilNextDay(at(2026, 10, 10, 23, 59, 59))).toBe(1000);
  });

  it('is a full day (or the DST-adjusted length) at local midnight', () => {
    const now = at(2026, 10, 10);
    expect(msUntilNextDay(now)).toBe(at(2026, 10, 11).getTime() - now.getTime());
    expect(msUntilNextDay(now)).toBeGreaterThanOrEqual(23 * 3600_000);
    expect(msUntilNextDay(now)).toBeLessThanOrEqual(25 * 3600_000);
  });

  it('rolls over month ends and year ends', () => {
    expect(msUntilNextDay(at(2026, 1, 31, 23, 0))).toBe(3600_000);
    expect(msUntilNextDay(at(2026, 12, 31, 18, 30))).toBe(5.5 * 3600_000);
    expect(msUntilNextDay(at(2028, 2, 28, 18, 0))).toBe(6 * 3600_000);
    expect(msUntilNextDay(at(2028, 2, 29, 23, 0))).toBe(3600_000);
  });

  it('lands on the next local midnight on DST transition days (when the test zone has them)', () => {
    // US and EU changeover dates for 2026; in a zone without DST these are plain days.
    for (const [m, d] of [
      [3, 8],
      [11, 1],
      [3, 29],
      [10, 25],
    ]) {
      const now = at(2026, m, d, 12);
      const target = new Date(now.getTime() + msUntilNextDay(now));
      expect(localDateKey(target)).toBe(localDateKey(at(2026, m, d + 1, 12)));
      expect([target.getHours(), target.getMinutes(), target.getSeconds()]).toEqual([0, 0, 0]);
    }
  });
});
