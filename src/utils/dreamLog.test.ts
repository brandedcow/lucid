import { colors } from '../theme';
import { Dream } from '../types/dream';
import {
  buildLogItems,
  buildSearchIndex,
  buildTagChips,
  dreamRow,
  filterDreams,
  limitChips,
  tagChipLabel,
  toggleTag,
  transcriptPreview,
} from './dreamLog';

const NOW = new Date(2026, 9, 6, 12, 0);

let n = 0;
function dream(over: Partial<Dream> & { at?: Date }): Dream {
  n += 1;
  const { at, ...rest } = over;
  return {
    id: `d${n}`,
    createdAt: (at ?? new Date(2026, 9, 1, 8, 0)).toISOString(),
    durationMs: 0,
    title: `Dream ${n}`,
    tags: [],
    ...rest,
  };
}

const legacy = (o: Record<string, unknown>) => ({ id: 'x', ...o }) as unknown as Dream;

describe('buildLogItems', () => {
  it('groups by month with uppercase labels, drafts mixed by date', () => {
    const a = dream({ at: new Date(2026, 9, 4, 6, 0) });
    const draft = dream({ at: new Date(2026, 9, 2, 6, 0), status: 'draft' });
    const b = dream({ at: new Date(2026, 8, 27, 23, 59) });
    const items = buildLogItems([a, draft, b], NOW);
    expect(items.map((i) => (i.type === 'header' ? i.label : i.dream.id))).toEqual([
      'OCTOBER',
      a.id,
      draft.id,
      'SEPTEMBER',
      b.id,
    ]);
    expect(items[0]).toMatchObject({ type: 'header', key: '2026-10' });
  });

  it('adds the year when not the current year', () => {
    const items = buildLogItems([dream({ at: new Date(2025, 11, 31, 23, 30) })], NOW);
    expect(items[0]).toMatchObject({ label: 'DECEMBER 2025', key: '2025-12' });
  });

  it('puts missing and invalid dates in a final EARLIER bucket', () => {
    const ok = dream({ at: new Date(2026, 9, 4) });
    const bad = dream({ createdAt: 'nonsense' });
    const missing = legacy({ title: 't' });
    const items = buildLogItems([bad, ok, missing], NOW);
    expect(items.map((i) => (i.type === 'header' ? i.label : i.dream.id))).toEqual([
      'OCTOBER',
      ok.id,
      'EARLIER',
      bad.id,
      'x',
    ]);
  });

  it('returns nothing for no dreams', () => {
    expect(buildLogItems([], NOW)).toEqual([]);
  });
});

describe('buildTagChips', () => {
  const dreams = [
    dream({ tags: ['water', 'stairs'] }),
    dream({ tags: ['water'], status: 'draft' }),
    dream({ tags: ['stairs', 'zoo'] }),
    dream({ tags: ['water', 'apple'] }),
    dream({}),
  ];

  it('counts including drafts, ranked by count then alphabetically', () => {
    const { all, chips } = buildTagChips(dreams, []);
    expect(all).toBe(5);
    expect(chips.map((c) => [c.tag, c.count])).toEqual([
      ['water', 3],
      ['stairs', 2],
      ['apple', 1],
      ['zoo', 1],
    ]);
    expect(chips.every((c) => !c.selected)).toBe(true);
  });

  it('counts a repeated tag once per dream', () => {
    const { chips } = buildTagChips([dream({ tags: ['a', 'a'] })], []);
    expect(chips).toEqual([{ tag: 'a', count: 1, selected: false }]);
  });

  it('caps the chips but always shows selected tags', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      dream({ tags: [`t${String(i).padStart(2, '0')}`] }),
    );
    expect(buildTagChips(many, []).chips).toHaveLength(20);
    const { chips } = buildTagChips(many, ['t24']);
    expect(chips).toHaveLength(21);
    expect(chips.find((c) => c.tag === 't24')).toMatchObject({ selected: true, count: 1 });
  });

  it('shows a selected tag that no dream has, with count 0', () => {
    const { chips } = buildTagChips(dreams, ['gone']);
    expect(chips[chips.length - 1]).toEqual({ tag: 'gone', count: 0, selected: true });
  });

  it('handles legacy dreams without tags', () => {
    expect(buildTagChips([legacy({})], []).chips).toEqual([]);
  });

  it('labels with a middle dot', () => {
    expect(tagChipLabel('water', 6)).toBe('water · 6');
  });
});

describe('toggleTag', () => {
  it('adds, keeps order, and removes', () => {
    expect(toggleTag([], 'a')).toEqual(['a']);
    expect(toggleTag(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleTag(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
  it('does not mutate', () => {
    const sel = ['a'];
    toggleTag(sel, 'b');
    expect(sel).toEqual(['a']);
  });
});

describe('search and filter', () => {
  const water = dream({
    title: 'Swimming in the library',
    transcript: 'The whole ground floor was flooded',
    emotion: 'curious',
    tags: ['water', 'library'],
  });
  const train = dream({ title: 'Missed the train', emotion: 'afraid, late', tags: ['train'] });
  const draft = dream({ title: '', status: 'draft', transcript: 'a red door', tags: ['water'] });
  const cafe = dream({ title: 'Café', transcript: 'naïve résumé' });
  const index = buildSearchIndex([water, train, draft, cafe, legacy({})]);
  const ids = (q: string, tags: string[] = []) =>
    filterDreams(index, { query: q, tags }).map((d) => d.id);

  it('returns everything for an empty query and no tags', () => {
    expect(ids('')).toHaveLength(5);
    expect(ids('   ')).toHaveLength(5);
  });
  it('matches substrings, ignoring case', () => {
    expect(ids('WAT')).toEqual([water.id, draft.id]);
    expect(ids('libr')).toEqual([water.id]);
  });
  it('requires every word (AND), in any order', () => {
    expect(ids('flooded swimming')).toEqual([water.id]);
    expect(ids('flooded train')).toEqual([]);
  });
  it('searches emotion, tags, transcript and drafts', () => {
    expect(ids('afraid')).toEqual([train.id]);
    expect(ids('late')).toEqual([train.id]);
    expect(ids('red door')).toEqual([draft.id]);
  });
  it('ignores accents', () => {
    expect(ids('cafe')).toEqual([cafe.id]);
    expect(ids('café')).toEqual([cafe.id]);
    expect(ids('naive resume')).toEqual([cafe.id]);
  });
  it('still works when normalize is unavailable or throws', () => {
    const spy = jest.spyOn(String.prototype, 'normalize').mockImplementation(() => {
      throw new Error('no normalize');
    });
    try {
      const idx = buildSearchIndex([water]);
      expect(filterDreams(idx, { query: 'Water', tags: [] })).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
  it('tag filter needs ALL selected tags', () => {
    expect(ids('', ['water'])).toEqual([water.id, draft.id]);
    expect(ids('', ['water', 'library'])).toEqual([water.id]);
    expect(ids('', ['water', 'train'])).toEqual([]);
    expect(ids('', ['nobody-has-this'])).toEqual([]);
  });
  it('compares tags exactly as stored', () => {
    expect(ids('', ['Water'])).toEqual([]);
  });
  it('combines search and tags with AND', () => {
    expect(ids('red', ['water'])).toEqual([draft.id]);
    expect(ids('train', ['water'])).toEqual([]);
  });
});

describe('transcriptPreview', () => {
  it('collapses whitespace', () => {
    expect(transcriptPreview('  a \n\n b\t c ')).toBe('a b c');
  });
  it('is empty without text', () => {
    expect(transcriptPreview(undefined)).toBe('');
    expect(transcriptPreview('  ')).toBe('');
  });
  it('leaves text at the limit alone and cuts longer text with an ellipsis', () => {
    expect(transcriptPreview('x'.repeat(160))).toBe('x'.repeat(160));
    expect(transcriptPreview('x'.repeat(161))).toBe(`${'x'.repeat(160)}…`);
  });
  it('never splits an emoji at the boundary', () => {
    const text = `${'x'.repeat(159)}😀😀`;
    expect(transcriptPreview(text)).toBe(`${'x'.repeat(159)}😀…`);
  });
  it('truncates a very long transcript correctly', () => {
    const text = `${'word '.repeat(100_000)}end`;
    const out = transcriptPreview(text);
    expect(out).toBe(`${'word '.repeat(32).trimEnd()}…`);
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('word word')).toBe(true);
  });
  it('leaves no lone surrogate when an emoji straddles the work bound', () => {
    // With max 2 the bound is 8 units: 7 letters then an emoji whose high surrogate is unit 8.
    const out = transcriptPreview(`${'x'.repeat(7)}😀 tail`, 2);
    expect(out).toBe('xx…');
    expect(out).not.toMatch(/[\uD800-\uDFFF]/);
    // A whole emoji at the cut is kept.
    expect(transcriptPreview('😀😀😀', 2)).toBe('😀😀…');
  });
});

describe('limitChips', () => {
  it('shows at most 2 emotions then tags, max 4, with overflow', () => {
    const r = limitChips({ emotions: ['A', 'B', 'C'], tags: ['t1', 't2', 't3'] });
    expect(r.visible.map((c) => c.label)).toEqual(['A', 'B', 't1', 't2']);
    expect(r.visible.map((c) => c.kind)).toEqual(['emotion', 'emotion', 'tag', 'tag']);
    expect(r.overflow).toBe(2);
  });
  it('has no overflow when everything fits', () => {
    expect(limitChips({ emotions: ['A'], tags: ['t'] })).toEqual({
      visible: [
        { kind: 'emotion', label: 'A' },
        { kind: 'tag', label: 't' },
      ],
      overflow: 0,
    });
  });
  it('handles no chips', () => {
    expect(limitChips({ emotions: [], tags: [] })).toEqual({ visible: [], overflow: 0 });
  });
});

describe('dreamRow', () => {
  it('uses the title and capitalizes emotions before tags', () => {
    const row = dreamRow(
      dream({
        title: 'The endless hallway',
        at: new Date(2026, 9, 4, 6, 42),
        emotion: 'uneasy, curious',
        tags: ['water', 'stairs'],
        transcript: 'I was back\n\nat the house',
      }),
      NOW,
    );
    expect(row).toMatchObject({
      title: 'The endless hallway',
      isDraft: false,
      weekday: 'SUN',
      day: 4,
      dateLabel: 'Oct 4',
      preview: 'I was back at the house',
      subline: '',
      draftSuffix: '',
      chips: { emotions: ['Uneasy', 'Curious'], tags: ['water', 'stairs'] },
    });
  });

  it('shows the short date for an untitled finished dream, with the year when not current', () => {
    expect(dreamRow(dream({ title: '', at: new Date(2026, 8, 23) }), NOW).title).toBe('Sep 23');
    expect(dreamRow(dream({ title: '  ', at: new Date(2025, 8, 23) }), NOW).title).toBe(
      'Sep 23, 2025',
    );
  });

  it('handles drafts with and without audio', () => {
    const bare = dreamRow(dream({ title: '', status: 'draft', transcript: 'text' }), NOW);
    expect(bare).toMatchObject({
      title: 'Untitled dream',
      draftSuffix: '',
      subline: 'Draft',
      isDraft: true,
      hasAudio: false,
      preview: '',
    });
    const audio = dreamRow(
      dream({ title: '', status: 'draft', audioFileName: 'a.m4a', durationMs: 34_400 }),
      NOW,
    );
    expect(audio).toMatchObject({
      title: 'Untitled dream',
      draftSuffix: ' · 0:34',
      hasAudio: true,
    });
    const titled = dreamRow(
      dream({ title: 'Hall', status: 'draft', audioFileName: 'a.m4a', durationMs: 65_000 }),
      NOW,
    );
    expect(titled).toMatchObject({ title: 'Hall', draftSuffix: ' · 1:05', subline: 'Draft' });
  });

  it('never throws on legacy shapes', () => {
    const shapes = [
      {},
      { createdAt: 'garbage' },
      { createdAt: null, title: null, tags: null, transcript: 5, emotion: 7 },
      { createdAt: new Date(2026, 9, 4).toISOString(), durationMs: undefined },
      { createdAt: new Date(2026, 9, 4).toISOString(), status: 'draft', durationMs: NaN },
    ];
    for (const s of shapes) expect(() => dreamRow(legacy(s), NOW)).not.toThrow();
    expect(dreamRow(legacy({}), NOW)).toMatchObject({
      title: 'Untitled dream',
      weekday: '',
      day: null,
      dateLabel: '',
      preview: '',
      isDraft: false,
      hasAudio: false,
      chips: { emotions: [], tags: [] },
    });
    expect(buildTagChips(shapes.map(legacy), [])).toEqual({ all: 5, chips: [] });
    expect(buildLogItems(shapes.map(legacy), NOW).length).toBeGreaterThan(0);
    expect(() => buildSearchIndex(shapes.map(legacy))).not.toThrow();
  });
});

describe('theme tokens', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  it('draft red has at least 4.5:1 contrast on the card and page backgrounds', () => {
    expect(ratio(colors.draft, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(colors.draft, colors.background)).toBeGreaterThanOrEqual(4.5);
  });
  it('emotion chip text is readable on its chip', () => {
    expect(ratio(colors.emotionChipText, colors.emotionChipBg)).toBeGreaterThanOrEqual(4.5);
  });
});
