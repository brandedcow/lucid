import { addTag, normalizeTag, tagsByUse } from './tags';

describe('normalizeTag', () => {
  it('trims, lowercases and strips leading #', () => {
    expect(normalizeTag('  #Water ')).toBe('water');
  });

  it('collapses inner whitespace', () => {
    expect(normalizeTag('Flying   Home')).toBe('flying home');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeTag('   ')).toBe('');
    expect(normalizeTag('#')).toBe('');
  });
});

describe('addTag', () => {
  it('appends a new normalized tag', () => {
    expect(addTag(['water'], ' Falling ')).toEqual(['water', 'falling']);
  });

  it('ignores duplicates after normalization', () => {
    const tags = ['water'];
    expect(addTag(tags, '#WATER')).toBe(tags);
  });

  it('ignores blank input', () => {
    const tags = ['water'];
    expect(addTag(tags, '  ')).toBe(tags);
  });
});

describe('tagsByUse', () => {
  it('orders by use, then alphabetically, and tolerates missing tags', () => {
    const records = [{ tags: ['b', 'a'] }, { tags: ['b'] }, {}, { tags: ['c', 'a'] }];
    expect(tagsByUse(records)).toEqual(['a', 'b', 'c']);
    expect(tagsByUse(null)).toEqual([]);
  });
});
