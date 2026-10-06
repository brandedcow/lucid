import { capitalizeFirst } from './capitalizeFirst';

describe('capitalizeFirst', () => {
  it('returns an empty string for an empty string', () => {
    expect(capitalizeFirst('')).toBe('');
  });

  it('capitalizes a single letter', () => {
    expect(capitalizeFirst('a')).toBe('A');
  });

  it('leaves an already capitalized word alone', () => {
    expect(capitalizeFirst('Fear')).toBe('Fear');
  });

  it('does not change a leading space or non-letter', () => {
    expect(capitalizeFirst(' fear')).toBe(' fear');
    expect(capitalizeFirst('1st')).toBe('1st');
  });

  it('keeps the rest of a multi-word string as typed', () => {
    expect(capitalizeFirst('flying over mY house')).toBe('Flying over mY house');
  });
});
