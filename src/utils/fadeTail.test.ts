import { colors } from '../theme';
import { FADE_FLOOR, fadeTail } from './fadeTail';

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('fadeTail', () => {
  it('gives the newest word full opacity', () => {
    const out = fadeTail('one two three');
    expect(out.map((w) => w.word)).toEqual(['one', 'two', 'three']);
    expect(out[2].opacity).toBe(1);
  });

  it('never gets brighter going back in time and never drops below the floor', () => {
    const text = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ');
    const out = fadeTail(text, 50, 0.4);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].opacity).toBeLessThanOrEqual(out[i].opacity);
    }
    expect(Math.min(...out.map((w) => w.opacity))).toBeGreaterThanOrEqual(0.4);
    expect(out[0].opacity).toBeCloseTo(0.4);
  });

  it('returns only the last maxWords words', () => {
    const out = fadeTail('a b c d e f', 3);
    expect(out.map((w) => w.word)).toEqual(['d', 'e', 'f']);
  });

  it('returns nothing for empty or blank text', () => {
    expect(fadeTail('')).toEqual([]);
    expect(fadeTail(' \n\t ')).toEqual([]);
  });

  it('handles repeated spaces and newlines', () => {
    expect(fadeTail('  one   two\n\nthree ').map((w) => w.word)).toEqual(['one', 'two', 'three']);
  });

  it('keeps all opacities the same when only the last word is rewritten', () => {
    const a = fadeTail('the red boat');
    const b = fadeTail('the red goat');
    expect(a.map((w) => w.opacity)).toEqual(b.map((w) => w.opacity));
    expect(a.map((w) => w.word)).not.toEqual(b.map((w) => w.word));
    expect(a[0]).toEqual(b[0]);
  });

  it('keeps the dimmest word at about 3:1 contrast on the app background', () => {
    const bg = hex(colors.background);
    const fg = hex(colors.text);
    const blended = fg.map((v, i) => v * FADE_FLOOR + bg[i] * (1 - FADE_FLOOR));
    const ratio = (lum(blended) + 0.05) / (lum(bg) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});
