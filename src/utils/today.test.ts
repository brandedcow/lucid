import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS, Journal } from './journals';
import { dayStatus, entriesToday, launchScreen, localDateKey, msUntilNextDay } from './today';

const mk = (id: string, createdAt: string, extra: Partial<Dream> = {}): Dream => ({
  id,
  createdAt,
  durationMs: 0,
  title: id,
  tags: [],
  ...extra,
});

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

describe('entriesToday with a custom journal', () => {
  const TODAY = '2026-10-10';
  const gratitude: Journal = { id: 'j_x', name: 'Gratitude', kind: 'journal' };
  const records = [
    mk('c', iso(at(2026, 10, 10, 9)), { journalId: 'j_x' }),
    mk('d', iso(at(2026, 10, 10, 8))),
  ];

  it('shows the custom journal only when it is registered; unknown ids stay hidden', () => {
    expect(
      entriesToday([...BUILT_IN_JOURNALS, gratitude], records, TODAY).map((r) => r.id),
    ).toEqual(['c', 'd']);
    expect(entriesToday(BUILT_IN_JOURNALS, records, TODAY).map((r) => r.id)).toEqual(['d']);
  });
});

describe('entriesToday', () => {
  const TODAY = '2026-10-10';

  it('keeps entries created on the local day, across the 23:59 / 00:00 boundary', () => {
    const records = [
      mk('before', iso(at(2026, 10, 9, 23, 59, 59, 999))),
      mk('first', iso(at(2026, 10, 10, 0, 0, 0, 0))),
      mk('last', iso(at(2026, 10, 10, 23, 59, 59, 999))),
      mk('after', iso(at(2026, 10, 11, 0, 0, 0, 0))),
    ];
    expect(entriesToday(BUILT_IN_JOURNALS, records, TODAY).map((r) => r.id)).toEqual([
      'last',
      'first',
    ]);
  });

  it('sorts newest first, flat across journals', () => {
    const records = [
      mk('a', iso(at(2026, 10, 10, 8)), { journalId: 'life' }),
      mk('b', iso(at(2026, 10, 10, 20))),
      mk('c', iso(at(2026, 10, 10, 12)), { journalId: 'dreams' }),
    ];
    expect(entriesToday(BUILT_IN_JOURNALS, records, TODAY).map((r) => r.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('includes drafts', () => {
    const records = [
      mk('draft', iso(at(2026, 10, 10, 9)), { status: 'draft' }),
      mk('done', iso(at(2026, 10, 10, 8))),
    ];
    expect(entriesToday(BUILT_IN_JOURNALS, records, TODAY).map((r) => r.id)).toEqual([
      'draft',
      'done',
    ]);
  });

  it('treats a record with no journalId as Dreams (shown)', () => {
    const legacy = mk('legacy', iso(at(2026, 10, 10, 9)));
    expect(legacy.journalId).toBeUndefined();
    expect(entriesToday(BUILT_IN_JOURNALS, [legacy], TODAY)).toEqual([legacy]);
  });

  it('hides entries of an unknown journal', () => {
    const records = [
      mk('zen', iso(at(2026, 10, 10, 9)), { journalId: 'zen' }),
      mk('life', iso(at(2026, 10, 10, 8)), { journalId: 'life' }),
    ];
    expect(entriesToday(BUILT_IN_JOURNALS, records, TODAY).map((r) => r.id)).toEqual(['life']);
  });

  it('does not count an invalid or missing createdAt as today', () => {
    const records = [
      mk('empty', ''),
      mk('garbage', 'not a date'),
      mk('missing', undefined as unknown as string),
      mk('ok', iso(at(2026, 10, 10, 9))),
    ];
    expect(entriesToday(BUILT_IN_JOURNALS, records, TODAY).map((r) => r.id)).toEqual(['ok']);
  });

  it('returns an empty list for no records and does not mutate the input', () => {
    expect(entriesToday(BUILT_IN_JOURNALS, [], TODAY)).toEqual([]);
    const records = [
      mk('a', iso(at(2026, 10, 10, 8))),
      mk('b', iso(at(2026, 10, 10, 20))),
      mk('old', iso(at(2026, 10, 9, 20))),
    ];
    const before = records.map((r) => r.id);
    entriesToday(BUILT_IN_JOURNALS, records, TODAY);
    expect(records.map((r) => r.id)).toEqual(before);
  });
});

describe('dayStatus', () => {
  const TODAY = '2026-10-10';
  const todayIso = iso(at(2026, 10, 10, 9));

  it('is false and false with no entries and no skip', () => {
    expect(dayStatus([], null, TODAY)).toEqual({ dreamToday: false, skippedToday: false });
  });

  it('does not count a draft Dream', () => {
    const r = [mk('d', todayIso, { status: 'draft' })];
    expect(dayStatus(r, null, TODAY).dreamToday).toBe(false);
  });

  it('does not count a Life entry, finished or draft', () => {
    const r = [
      mk('l', todayIso, { journalId: 'life' }),
      mk('ld', todayIso, { journalId: 'life', status: 'draft' }),
    ];
    expect(dayStatus(r, null, TODAY).dreamToday).toBe(false);
  });

  it('counts a finished Dream from today, with or without journalId', () => {
    expect(dayStatus([mk('d', todayIso)], null, TODAY).dreamToday).toBe(true);
    expect(dayStatus([mk('d', todayIso, { journalId: 'dreams' })], null, TODAY).dreamToday).toBe(
      true,
    );
  });

  it('does not count a finished Dream from another day or with a bad date', () => {
    const r = [mk('y', iso(at(2026, 10, 9, 23, 59))), mk('bad', 'nope'), mk('empty', '')];
    expect(dayStatus(r, null, TODAY).dreamToday).toBe(false);
  });

  it('reports a skip only when the marker date is today', () => {
    expect(dayStatus([], TODAY, TODAY)).toEqual({ dreamToday: false, skippedToday: true });
    expect(dayStatus([], '2026-10-09', TODAY).skippedToday).toBe(false);
    expect(dayStatus([], null, TODAY).skippedToday).toBe(false);
  });

  it('reports both when there is a dream and a skip', () => {
    expect(dayStatus([mk('d', todayIso)], TODAY, TODAY)).toEqual({
      dreamToday: true,
      skippedToday: true,
    });
  });
});

describe('launchScreen', () => {
  const bools = [false, true];
  for (const dreamToday of bools) {
    for (const skippedToday of bools) {
      for (const autoOpen of bools) {
        const expected = autoOpen && !dreamToday && !skippedToday ? 'add' : 'today';
        it(`dreamToday=${dreamToday} skippedToday=${skippedToday} autoOpen=${autoOpen} -> ${expected}`, () => {
          expect(launchScreen({ dreamToday, skippedToday, autoOpen })).toBe(expected);
        });
      }
    }
  }

  it('opens the Dreams add-entry page only for the one open-and-undone combination', () => {
    expect(launchScreen({ dreamToday: false, skippedToday: false, autoOpen: true })).toBe('add');
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
