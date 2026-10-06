import {
  displayEmotions,
  splitEmotions,
  storeEmotionInput,
  suggestEmotions,
  toggleEmotion,
} from './emotions';

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

  it('leaves the field alone for a word with a separator or no usable text', () => {
    expect(toggleEmotion('', 'a, b')).toBe('');
    expect(toggleEmotion('a', 'b;c')).toBe('a');
    expect(toggleEmotion('a', '')).toBe('a');
    expect(toggleEmotion('a', ' , ')).toBe('a');
  });
});

describe('toggleEmotion with a partial word typed', () => {
  it('replaces the start of the word being typed', () => {
    expect(toggleEmotion('ca', 'calm')).toBe('calm');
    expect(toggleEmotion('CA', 'Calm')).toBe('Calm');
    expect(toggleEmotion('calm, un', 'uneasy')).toBe('calm, uneasy');
    expect(toggleEmotion('calm; un', 'uneasy')).toBe('calm, uneasy');
  });

  it('replaces the start of a multi-word phrase', () => {
    expect(toggleEmotion('a bit', 'a bit uneasy')).toBe('a bit uneasy');
    expect(toggleEmotion('calm, a bit', 'a bit uneasy')).toBe('calm, a bit uneasy');
  });

  it('appends when nothing is being typed', () => {
    expect(toggleEmotion('', 'calm')).toBe('calm');
    expect(toggleEmotion('uneasy,', 'calm')).toBe('uneasy, calm');
    expect(toggleEmotion('uneasy, ', 'calm')).toBe('uneasy, calm');
    expect(toggleEmotion('uneasy; ', 'calm')).toBe('uneasy, calm');
  });

  it('appends when the text being typed is not the start of the word', () => {
    expect(toggleEmotion('xyz', 'calm')).toBe('xyz, calm');
    expect(toggleEmotion('calmer', 'calm')).toBe('calmer, calm');
  });

  it('still removes a word that is already there', () => {
    expect(toggleEmotion('calm', 'calm')).toBe('');
    expect(toggleEmotion('uneasy, calm', 'Calm')).toBe('uneasy');
  });

  it('never leaves the partial word in the result', () => {
    expect(splitEmotions(toggleEmotion('ca', 'calm'))).toEqual(['calm']);
  });
});

describe('displayEmotions', () => {
  it('capitalizes the first letter of each entry', () => {
    expect(displayEmotions('calm, uneasy')).toBe('Calm, Uneasy');
    expect(displayEmotions('calm;uneasy')).toBe('Calm;Uneasy');
  });

  it('capitalizes only the first letter of a multi-word entry', () => {
    expect(displayEmotions('a bit uneasy')).toBe('A bit uneasy');
    expect(displayEmotions('calm, a bit uneasy')).toBe('Calm, A bit uneasy');
  });

  it('handles empty entries, spaces and a trailing separator, keeping the length', () => {
    for (const s of ['', ' ', ',', 'calm, ', ' calm ,, uneasy', 'ca, ', ';x']) {
      expect(displayEmotions(s)).toHaveLength(s.length);
    }
    expect(displayEmotions(' calm ,, uneasy')).toBe(' Calm ,, Uneasy');
    expect(displayEmotions('calm, ')).toBe('Calm, ');
  });

  it('leaves a letter alone when its uppercase form is longer', () => {
    expect(displayEmotions('ßad')).toBe('ßad');
  });

  it('does not change the stored value', () => {
    const stored = 'calm, uneasy';
    displayEmotions(stored);
    expect(stored).toBe('calm, uneasy');
  });
});

describe('storeEmotionInput', () => {
  it('lowercases what was typed', () => {
    expect(storeEmotionInput('Calm, Uneasy')).toBe('calm, uneasy');
  });

  it('keeps the text as typed when lowercasing would change its length', () => {
    expect(storeEmotionInput('İ')).toBe('İ');
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

  it('normalizes the known words: trim, lowercase, drop empties, dedupe', () => {
    expect(suggestEmotions(['Calm', ' calm', '', 'x'], '')).toEqual(['calm', 'x']);
  });

  it('returns at most 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => `w${i}`);
    expect(suggestEmotions(many, '')).toHaveLength(8);
  });
});
