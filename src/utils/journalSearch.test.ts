import { Dream } from '../types/dream';
import { buildLogItems, buildTagChips, dreamRow, EARLIER_LABEL, filterDreams } from './dreamLog';
import {
  journalCounts,
  journalLabel,
  searchableEntries,
  searchModel,
  untitledLabelOf,
} from './journalSearch';

const mk = (id: string, createdAt: string, extra: Partial<Dream> = {}): Dream => ({
  id,
  createdAt,
  durationMs: 0,
  title: id,
  tags: [],
  ...extra,
});

const NOW = new Date(2026, 9, 10);
const fixtures = (): Dream[] => [
  mk('d-old', '2026-08-02T10:00:00.000Z', { transcript: 'a river of water', tags: ['water'] }),
  mk('legacy', '2026-09-20T10:00:00.000Z', { transcript: 'flying over water', tags: ['flying'] }),
  mk('life-new', '2026-10-05T10:00:00.000Z', {
    journalId: 'life',
    title: '',
    transcript: 'walked by the water',
    tags: ['water', 'walk'],
  }),
  mk('life-sep', '2026-09-25T10:00:00.000Z', { journalId: 'life', tags: ['walk'] }),
  mk('draft-dream', '2026-10-09T10:00:00.000Z', { status: 'draft', tags: ['water'] }),
  mk('draft-life', '2026-10-08T10:00:00.000Z', { status: 'draft', journalId: 'life' }),
  mk('future', '2026-10-07T10:00:00.000Z', { journalId: 'zen', tags: ['water'] }),
  mk('undated', '', { journalId: 'life', tags: ['water'] }),
];

describe('searchableEntries', () => {
  it('keeps finished entries of known journals, newest first, undated last', () => {
    expect(searchableEntries(fixtures()).map((r) => r.id)).toEqual([
      'life-new',
      'life-sep',
      'legacy',
      'd-old',
      'undated',
    ]);
  });
  it('excludes drafts and unknown journals', () => {
    const ids = searchableEntries(fixtures()).map((r) => r.id);
    expect(ids).not.toContain('draft-dream');
    expect(ids).not.toContain('draft-life');
    expect(ids).not.toContain('future');
  });
  it('does not mutate the input', () => {
    const input = fixtures();
    const copy = JSON.parse(JSON.stringify(input));
    searchableEntries(input);
    searchModel(input);
    expect(input).toEqual(copy);
  });
  it('returns an empty list for no records', () => {
    expect(searchableEntries([])).toEqual([]);
  });
});

describe('journalLabel and untitledLabelOf', () => {
  it('labels Dreams, legacy (Dreams) and Life; unknown is empty', () => {
    expect(journalLabel(mk('a', 'x', { journalId: 'dreams' }))).toBe('Dreams');
    expect(journalLabel(mk('b', 'x'))).toBe('Dreams');
    expect(journalLabel(mk('c', 'x', { journalId: 'life' }))).toBe('Life');
    expect(journalLabel(mk('d', 'x', { journalId: 'zen' }))).toBe('');
  });
  it('gives the per-journal untitled label', () => {
    expect(untitledLabelOf(mk('a', 'x'))).toBe('Untitled dream');
    expect(untitledLabelOf(mk('b', 'x', { journalId: 'life' }))).toBe('Untitled entry');
  });
  it('an untitled dated Life entry row uses the short date', () => {
    const life = fixtures().find((r) => r.id === 'life-new')!;
    expect(dreamRow(life, NOW, untitledLabelOf(life)).title).toBe('Oct 5');
    const undated = fixtures().find((r) => r.id === 'undated')!;
    expect(dreamRow({ ...undated, title: '' }, NOW, untitledLabelOf(undated)).title).toBe(
      'Untitled entry',
    );
  });
});

describe('search across journals', () => {
  const model = () => searchModel(fixtures());

  it('matches text across journals', () => {
    const { entries, searchIndex } = model();
    expect(entries).toHaveLength(5);
    const hits = filterDreams(searchIndex, { tags: [], query: 'water' });
    expect(hits.map((r) => r.id)).toEqual(['life-new', 'legacy', 'd-old', 'undated']);
    expect(new Set(hits.map(journalLabel))).toEqual(new Set(['Dreams', 'Life']));
  });
  it('never finds drafts or unknown-journal entries', () => {
    const { searchIndex } = model();
    const hits = filterDreams(searchIndex, { tags: ['water'], query: '' }).map((r) => r.id);
    expect(hits).not.toContain('draft-dream');
    expect(hits).not.toContain('future');
  });
  it('filters by tag across journals', () => {
    const { searchIndex } = model();
    expect(filterDreams(searchIndex, { tags: ['water'], query: '' }).map((r) => r.id)).toEqual([
      'life-new',
      'd-old',
      'undated',
    ]);
    expect(filterDreams(searchIndex, { tags: ['walk'], query: '' }).map((r) => r.id)).toEqual([
      'life-new',
      'life-sep',
    ]);
  });
  it('chip counts equal result counts for every chip', () => {
    const { entries, searchIndex } = model();
    const { all, chips } = buildTagChips(entries, []);
    expect(all).toBe(entries.length);
    for (const chip of chips) {
      const hits = filterDreams(searchIndex, { tags: [chip.tag], query: '' });
      expect(hits).toHaveLength(chip.count);
    }
    expect(chips.find((c) => c.tag === 'water')?.count).toBe(3);
  });
  it('groups the combined list by month, undated under EARLIER', () => {
    const { entries } = model();
    const items = buildLogItems(entries, NOW);
    expect(items.map((i) => (i.type === 'header' ? `# ${i.label}` : i.dream.id))).toEqual([
      '# OCTOBER',
      'life-new',
      '# SEPTEMBER',
      'life-sep',
      'legacy',
      '# AUGUST',
      'd-old',
      `# ${EARLIER_LABEL}`,
      'undated',
    ]);
  });
});

describe('journalCounts', () => {
  const rec = (over: Partial<Dream>) => mk(over.id ?? 'x', '2026-10-01T10:00:00', over);

  it('counts finished entries per journal; legacy records are Dreams; drafts and unknown journals are not counted', () => {
    const counts = journalCounts([
      rec({ id: '1' }),
      rec({ id: '2', journalId: 'dreams' }),
      rec({ id: '3', journalId: 'life' }),
      rec({ id: '4', journalId: 'life', status: 'draft' }),
      rec({ id: '5', status: 'draft' }),
      rec({ id: '6', journalId: 'future' }),
    ]);
    expect(counts).toEqual({ dreams: 2, life: 1 });
  });

  it('ignores journal ids that name Object.prototype members', () => {
    const counts = journalCounts([
      rec({ id: '1', journalId: 'toString' }),
      rec({ id: '2', journalId: 'constructor' }),
      rec({ id: '3', journalId: '__proto__' }),
      rec({ id: '4', journalId: 'hasOwnProperty' }),
      rec({ id: '5', journalId: 'life' }),
    ]);
    expect(counts).toEqual({ dreams: 0, life: 1 });
    expect(Object.keys(counts)).toEqual(['dreams', 'life']);
  });

  it('has a zero for every built-in journal when empty', () => {
    expect(journalCounts([])).toEqual({ dreams: 0, life: 0 });
  });
});
