import {
  addEmotions,
  joinEmotions,
  MAX_EMOTION_LENGTH,
  splitEmotions,
  withPendingEmotion,
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

describe('addEmotions', () => {
  it('adds a trimmed, lowercased emotion', () => {
    expect(addEmotions([], '  Calm ')).toEqual(['calm']);
    expect(addEmotions(['calm'], 'Uneasy')).toEqual(['calm', 'uneasy']);
  });

  it('keeps a multi-word emotion as one', () => {
    expect(addEmotions([], 'a  bit   Uneasy')).toEqual(['a bit uneasy']);
  });

  it('splits on commas and semicolons', () => {
    expect(addEmotions([], 'calm, Uneasy; joy')).toEqual(['calm', 'uneasy', 'joy']);
  });

  it('ignores empty text and duplicates, returning the same array', () => {
    const list = ['calm'];
    expect(addEmotions(list, '')).toBe(list);
    expect(addEmotions(list, ' , ; ')).toBe(list);
    expect(addEmotions(list, 'CALM')).toBe(list);
    expect(addEmotions([], 'calm, Calm')).toEqual(['calm']);
  });

  it('cuts one emotion to the maximum length', () => {
    const [word] = addEmotions([], 'x'.repeat(100));
    expect(word).toHaveLength(MAX_EMOTION_LENGTH);
  });
});

describe('joinEmotions', () => {
  it('joins with a comma and a space', () => {
    expect(joinEmotions(['calm', 'uneasy'])).toBe('calm, uneasy');
    expect(joinEmotions([])).toBe('');
  });
});

describe('withPendingEmotion', () => {
  it('returns the stored text untouched when nothing is pending', () => {
    expect(withPendingEmotion('A bit uneasy;Calm', '')).toBe('A bit uneasy;Calm');
    expect(withPendingEmotion('calm', '  ')).toBe('calm');
  });

  it('adds the pending emotion to the stored ones, lowercase and joined', () => {
    expect(withPendingEmotion('', 'Calm')).toBe('calm');
    expect(withPendingEmotion('calm', 'Uneasy, joy')).toBe('calm, uneasy, joy');
    expect(withPendingEmotion('a bit uneasy, calm', 'Calm')).toBe('a bit uneasy, calm');
  });
});
