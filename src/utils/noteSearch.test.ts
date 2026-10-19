import { Note } from '../services/notesStorage';
import { monthSections, parseQuery, searchChips, searchResults } from './noteSearch';

const note = (id: string, body: string, over: Partial<Note> = {}): Note => ({
  id,
  createdAt: '2026-10-01T09:00:00',
  updatedAt: '2026-10-01T09:00:00',
  body,
  ...over,
});
const ids = (ns: Note[]) => ns.map((n) => n.id);

describe('parseQuery', () => {
  it('splits words, lowercases and ignores extra spaces', () => {
    expect(parseQuery('  Red   FOX \n')).toEqual({ words: ['red', 'fox'], tagTerms: [] });
  });
  it('reads #word as a tag term', () => {
    expect(parseQuery('#Dreams fox')).toEqual({ words: ['fox'], tagTerms: ['dreams'] });
  });
  it('treats a lone # and digits-only #123 as words', () => {
    expect(parseQuery('# #123')).toEqual({ words: ['#', '#123'], tagTerms: [] });
  });
  it('blank gives nothing', () => {
    expect(parseQuery('   ')).toEqual({ words: [], tagTerms: [] });
  });
});

describe('searchResults', () => {
  const all = [
    note('a', 'Fox trip\nwent to the woods #travel #dreams'),
    note('b', 'Grocery list\nfox food'),
    note('c', 'Café notes #dreamy'),
    note('d', 'Deleted fox #travel', { deletedAt: '2026-10-02T00:00:00' }),
    note('e', 'Pinned fox', { pinned: true }),
  ];

  it('returns [] for a blank query with no chips', () => {
    expect(searchResults(all, '  ', [])).toEqual([]);
  });
  it('requires every word (AND) and matches the title line', () => {
    expect(ids(searchResults(all, 'fox woods'))).toEqual(['a']);
    expect(ids(searchResults(all, 'grocery'))).toEqual(['b']);
  });
  it('is case-insensitive', () => {
    expect(ids(searchResults(all, 'GROCERY'))).toEqual(['b']);
  });
  it('matches a tag term as a prefix of a tag', () => {
    expect(ids(searchResults(all, '#dream'))).toEqual(['a', 'c']);
    expect(ids(searchResults(all, '#dreams'))).toEqual(['a']);
    expect(ids(searchResults(all, '#ream'))).toEqual([]);
  });
  it('combines tag terms and words', () => {
    expect(ids(searchResults(all, '#travel woods'))).toEqual(['a']);
    expect(ids(searchResults(all, '#travel grocery'))).toEqual([]);
  });
  it('chips match a tag exactly', () => {
    expect(ids(searchResults(all, '', ['dreams']))).toEqual(['a']);
    expect(ids(searchResults(all, '', ['dream']))).toEqual([]);
  });
  it('chips plus words', () => {
    expect(ids(searchResults(all, 'woods', ['travel']))).toEqual(['a']);
    expect(ids(searchResults(all, 'grocery', ['travel']))).toEqual([]);
  });
  it('never returns Recently Deleted notes', () => {
    expect(ids(searchResults(all, 'fox'))).not.toContain('d');
    expect(ids(searchResults(all, '#travel'))).toEqual(['a']);
    expect(ids(searchResults(all, '', ['travel']))).toEqual(['a']);
  });
  it('keeps input order and does not reorder pinned notes', () => {
    expect(ids(searchResults(all, 'fox'))).toEqual(['a', 'b', 'e']);
  });
  it('does not mutate the input', () => {
    const copy = [...all];
    searchResults(all, 'fox');
    expect(all).toEqual(copy);
  });
  it('folds accents both ways', () => {
    expect(ids(searchResults(all, 'cafe'))).toEqual(['c']);
    expect(ids(searchResults([note('x', 'cafe au lait')], 'CAFÉ'))).toEqual(['x']);
  });

  describe('without String.prototype.normalize', () => {
    const original = String.prototype.normalize;
    beforeEach(() => {
      // Simulate an engine that lacks it.
      (String.prototype as unknown as { normalize?: unknown }).normalize = undefined;
    });
    afterEach(() => {
      String.prototype.normalize = original;
    });

    it('falls back to lowercase-only matching without throwing', () => {
      expect(typeof String.prototype.normalize).toBe('undefined');
      expect(ids(searchResults(all, 'FOX WOODS'))).toEqual(['a']);
      expect(ids(searchResults(all, 'café'))).toEqual(['c']);
      expect(ids(searchResults(all, 'cafe'))).toEqual([]);
    });
  });
});

describe('monthSections', () => {
  const NOW = new Date('2026-10-18T12:00:00');
  const at = (id: string, updatedAt: string) => note(id, id, { updatedAt });

  it('is empty for no notes', () => {
    expect(monthSections([], NOW)).toEqual([]);
  });
  it('groups consecutive notes by local month, without the current year', () => {
    const s = monthSections(
      [
        at('a', '2026-10-05T10:00:00'),
        at('b', '2026-10-01T00:00:00'),
        at('c', '2026-09-30T23:59:59'),
      ],
      NOW,
    );
    expect(s.map((x) => x.title)).toEqual(['OCTOBER', 'SEPTEMBER']);
    expect(s[0].data.map((n) => n.id)).toEqual(['a', 'b']);
    expect(s[1].data.map((n) => n.id)).toEqual(['c']);
  });
  it('uses the local month at the midnight boundary (no toISOString)', () => {
    const s = monthSections([at('a', '2026-11-01T00:00:00'), at('b', '2026-10-31T23:59:59')], NOW);
    expect(s.map((x) => x.title)).toEqual(['NOVEMBER', 'OCTOBER']);
  });
  it('adds the year when it is not the current year', () => {
    const s = monthSections([at('a', '2025-10-05T10:00:00')], NOW);
    expect(s[0].title).toBe('OCTOBER 2025');
  });
  it('puts invalid or missing dates under EARLIER, last', () => {
    const bad = { ...at('x', 'nope') };
    const missing = { ...at('y', '') } as Note;
    delete (missing as Partial<Note>).updatedAt;
    const s = monthSections([bad, at('a', '2026-10-05T10:00:00'), missing], NOW);
    expect(s.map((x) => x.title)).toEqual(['OCTOBER', 'EARLIER']);
    expect(s[1].data.map((n) => n.id)).toEqual(['x', 'y']);
  });
  it('keeps keys unique when a month repeats non-consecutively', () => {
    const s = monthSections(
      [
        at('a', '2026-10-05T10:00:00'),
        at('b', '2026-09-05T10:00:00'),
        at('c', '2026-10-01T10:00:00'),
      ],
      NOW,
    );
    expect(new Set(s.map((x) => x.key)).size).toBe(3);
  });
});

describe('searchChips', () => {
  const tc = (tag: string, count: number) => ({ tag, count });

  it('orders by count then alphabetical', () => {
    expect(searchChips([tc('b', 1), tc('a', 1), tc('c', 5)], [])).toEqual([
      tc('c', 5),
      tc('a', 1),
      tc('b', 1),
    ]);
  });
  it('caps at the limit (default 20)', () => {
    const many = Array.from({ length: 30 }, (_, i) => tc(`t${String(i).padStart(2, '0')}`, 1));
    expect(searchChips(many, [])).toHaveLength(20);
    expect(searchChips(many, [], 3)).toHaveLength(3);
  });
  it('always includes selected tags, first, even beyond the cap or gone', () => {
    const many = Array.from({ length: 30 }, (_, i) => tc(`t${String(i).padStart(2, '0')}`, 30 - i));
    const out = searchChips(many, ['t29', 'gone'], 2);
    expect(out.map((c) => c.tag)).toEqual(['t29', 'gone', 't00', 't01']);
    expect(out[0].count).toBe(1);
    expect(out[1].count).toBe(0);
  });
  it('does not duplicate a selected tag that is also in the top', () => {
    const out = searchChips([tc('a', 3), tc('b', 2)], ['b']);
    expect(out.map((c) => c.tag)).toEqual(['b', 'a']);
  });
});
