import { suggestTags } from './tagSuggestions';

const stored = ['dream', 'flying', 'water', 'waterfall', 'sea-water', 'lucid'];

describe('suggestTags', () => {
  it('offers everything for an empty query, capped', () => {
    expect(suggestTags(stored, [], '')).toEqual(stored);
    expect(suggestTags(stored, [], '', 2)).toEqual(['dream', 'flying']);
  });

  it('puts prefix matches before substring matches, keeping the given order', () => {
    expect(suggestTags(stored, [], 'wat')).toEqual(['water', 'waterfall', 'sea-water']);
  });

  it('matches case-insensitively', () => {
    expect(suggestTags(stored, [], 'FLY')).toEqual(['flying']);
  });

  it('offers nothing for a word nothing matches (no create hint)', () => {
    expect(suggestTags(stored, [], 'wolf')).toEqual([]);
  });

  it('offers an exact match like any other', () => {
    expect(suggestTags(stored, [], 'water')[0]).toBe('water');
  });

  it('works with an empty library, from the current entry alone', () => {
    expect(suggestTags([], ['dream', 'dusk', 'night'], 'd')).toEqual(['dream', 'dusk']);
    expect(suggestTags([], [], 'd')).toEqual([]);
  });

  it('ranks stored before current-only inside a tier, deduped', () => {
    expect(suggestTags(['dusk', 'dream'], ['dawn', 'dream', 'adrift'], 'd')).toEqual([
      'dusk',
      'dream',
      'dawn',
      'adrift',
    ]);
  });
});
