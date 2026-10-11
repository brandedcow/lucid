import { normalizeTag, tagsByUse } from './tags';

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

describe('tagsByUse', () => {
  it('orders by use, then alphabetically, and tolerates missing tags', () => {
    const records = [{ tags: ['b', 'a'] }, { tags: ['b'] }, {}, { tags: ['c', 'a'] }];
    expect(tagsByUse(records)).toEqual(['a', 'b', 'c']);
    expect(tagsByUse(null)).toEqual([]);
  });
});
