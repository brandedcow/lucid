import { suggestTags } from './tagSuggestions';

const known = ['dream', 'flying', 'water', 'waterfall', 'sea-water', 'lucid'];

describe('suggestTags', () => {
  it('offers everything for an empty query, capped', () => {
    expect(suggestTags(known, '').matches).toEqual(known);
    expect(suggestTags(known, '', 2).matches).toEqual(['dream', 'flying']);
    expect(suggestTags(known, '').create).toBeNull();
  });

  it('puts prefix matches before substring matches, keeping the given order', () => {
    expect(suggestTags(known, 'wat').matches).toEqual(['water', 'waterfall', 'sea-water']);
  });

  it('matches case-insensitively', () => {
    expect(suggestTags(known, 'FLY').matches).toEqual(['flying']);
  });

  it('offers a create hint for a new token, and none for an exact existing tag', () => {
    expect(suggestTags(known, 'wolf')).toEqual({ matches: [], create: 'wolf' });
    expect(suggestTags(known, 'wat').create).toBe('wat');
    const exact = suggestTags(known, 'water');
    expect(exact.create).toBeNull();
    expect(exact.matches[0]).toBe('water');
  });

  it('gives no create hint for digits only or an over-long token', () => {
    expect(suggestTags(known, '123').create).toBeNull();
    expect(suggestTags(known, 'a'.repeat(41)).create).toBeNull();
    expect(suggestTags(known, 'a'.repeat(40)).create).toBe('a'.repeat(40));
  });

  it('ignores duplicates in the known list', () => {
    expect(suggestTags(['a', 'a', 'ab'], 'a').matches).toEqual(['a', 'ab']);
  });
});
