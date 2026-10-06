import { splitEmotions, suggestEmotions, toggleEmotion } from './emotions';

describe('splitEmotions', () => {
  it('splits on commas and semicolons, trims and lowercases', () => {
    expect(splitEmotions('Uneasy, calm;  Joy ')).toEqual(['uneasy', 'calm', 'joy']);
  });

  it('keeps spaces inside a phrase', () => {
    expect(splitEmotions('a bit uneasy')).toEqual(['a bit uneasy']);
  });

  it('drops empty parts and duplicates', () => {
    expect(splitEmotions(',, calm, Calm ;')).toEqual(['calm']);
    expect(splitEmotions('   ')).toEqual([]);
  });
});

describe('toggleEmotion', () => {
  it('sets the word when the field is empty', () => {
    expect(toggleEmotion('', 'calm')).toBe('calm');
    expect(toggleEmotion('  ', 'calm')).toBe('calm');
  });

  it('appends with a comma separator', () => {
    expect(toggleEmotion('uneasy', 'calm')).toBe('uneasy, calm');
    expect(toggleEmotion('uneasy, ', 'calm')).toBe('uneasy, calm');
  });

  it('removes a word already present, ignoring case', () => {
    expect(toggleEmotion('Uneasy, calm', 'uneasy')).toBe('calm');
    expect(toggleEmotion('calm', 'calm')).toBe('');
  });

  it('keeps a multi-word phrase intact', () => {
    expect(toggleEmotion('a bit uneasy; tired', 'tired')).toBe('a bit uneasy');
  });
});

describe('suggestEmotions', () => {
  const known = ['calm', 'uneasy', 'joy', 'cold', 'curious'];

  it('suggests everything for an empty field', () => {
    expect(suggestEmotions(known, '')).toEqual(known);
  });

  it('excludes words already in the field', () => {
    expect(suggestEmotions(known, 'calm, ')).toEqual(['uneasy', 'joy', 'cold', 'curious']);
  });

  it('filters by the segment being typed', () => {
    expect(suggestEmotions(known, 'calm, C')).toEqual(['cold', 'curious']);
    expect(suggestEmotions(known, 'u')).toEqual(['uneasy']);
  });

  it('returns at most 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => `w${i}`);
    expect(suggestEmotions(many, '')).toHaveLength(8);
  });
});
