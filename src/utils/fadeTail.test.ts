import { colors } from '../theme';
import { FADE_FLOOR, blend, contrastRatio, fadeTail } from './fadeTail';

const fg = colors.text;
const bg = colors.background;
const channels = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const sum = (c: string) => channels(c).reduce((a, b) => a + b, 0);
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('blend', () => {
  it('returns the foreground at 1 and the background at 0', () => {
    expect(blend(fg, bg, 1)).toBe(fg);
    expect(blend(fg, bg, 0)).toBe(bg);
  });

  it('mixes per channel with rounding', () => {
    expect(blend('#FFFFFF', '#000000', 0.5)).toBe('#808080');
  });
});

describe('fadeTail', () => {
  it('returns words in order with the newest at the foreground colour exactly', () => {
    const out = fadeTail('one two three');
    expect(out.map((w) => w.word)).toEqual(['one', 'two', 'three']);
    expect(out[2].color).toBe(fg);
  });

  it('holds the newest hold + 1 words at the foreground colour', () => {
    const out = fadeTail(words(20));
    expect(out.slice(-3).map((w) => w.color)).toEqual([fg, fg, fg]);
    expect(out[out.length - 4].color).not.toBe(fg);
  });

  it('only returns solid opaque hex colours, never opacity', () => {
    const out = fadeTail(words(80));
    for (const w of out) {
      expect(w.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(w).not.toHaveProperty('opacity');
    }
  });

  it('never gets brighter going back in time', () => {
    const out = fadeTail(words(80));
    for (let i = 1; i < out.length; i++) {
      expect(sum(out[i - 1].color)).toBeLessThanOrEqual(sum(out[i].color));
    }
  });

  it('reaches the floor at rank 16 and stays there for older words', () => {
    const out = fadeTail(words(60));
    const floorColor = blend(fg, bg, FADE_FLOOR);
    expect(out[0].color).toBe(floorColor);
    expect(out[60 - 1 - 16].color).toBe(floorColor);
    expect(out[60 - 1 - 15].color).not.toBe(floorColor);
  });

  it('shows visible tiers in a short transcript', () => {
    const out = fadeTail(words(10));
    expect(new Set(out.map((w) => w.color)).size).toBeGreaterThanOrEqual(3);
    // Oldest of 10 is rank 9: alpha 1 - 0.62 * (7 / 14) = 0.69.
    expect(out[0].color).toBe(blend(fg, bg, 0.69));
    const spread = (sum(fg) - sum(out[0].color)) / (sum(fg) - sum(bg));
    expect(spread).toBeGreaterThanOrEqual(0.25);
  });

  it('keeps the floor colour at 3:1 contrast or better on the app background', () => {
    const ratio = contrastRatio(blend(fg, bg, FADE_FLOOR), bg);
    // Measured at 3.31.
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it('returns only the last 60 words by default', () => {
    const out = fadeTail(words(100));
    expect(out).toHaveLength(60);
    expect(out[0].word).toBe('w40');
    expect(out[59].word).toBe('w99');
  });

  it('honours maxWords', () => {
    expect(fadeTail('a b c d e f', { maxWords: 3 }).map((w) => w.word)).toEqual(['d', 'e', 'f']);
  });

  it('works for a single word', () => {
    expect(fadeTail('hello')).toEqual([{ word: 'hello', color: fg }]);
  });

  it('returns nothing for empty or blank text', () => {
    expect(fadeTail('')).toEqual([]);
    expect(fadeTail(' \n\t ')).toEqual([]);
  });

  it('handles repeated spaces and newlines', () => {
    expect(fadeTail('  one   two\n\nthree ').map((w) => w.word)).toEqual(['one', 'two', 'three']);
  });

  it('keeps earlier colours the same when only the last word is rewritten', () => {
    const a = fadeTail('the red boat');
    const b = fadeTail('the red goat');
    expect(a.map((w) => w.color)).toEqual(b.map((w) => w.color));
    expect(a.map((w) => w.word)).not.toEqual(b.map((w) => w.word));
  });
});
