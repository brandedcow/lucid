import { colors } from '../theme';

export type FadedWord = { word: string; color: string };

export type FadeOptions = {
  /** How many of the newest words to return. */
  maxWords?: number;
  /** Newest words held at full strength (the newest `hold + 1` words are exactly `fg`). */
  hold?: number;
  /** Words over which the fade runs, after the held words. */
  fadeWords?: number;
  /** Dimmest strength (0 to 1). */
  floor?: number;
  fg?: string;
  bg?: string;
};

/** Dimmest strength. Text #F5F2EC at this strength on #0D1017 keeps about 3:1 contrast. */
export const FADE_FLOOR = 0.38;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** `fg` at strength `a` over `bg`, as an opaque 7-char uppercase hex colour. */
export function blend(fg: string, bg: string, a: number): string {
  const f = channels(fg);
  const b = channels(bg);
  const out = f.map((v, i) => Math.round(v * a + b[i] * (1 - a)));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const relativeLuminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two hex colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The last `maxWords` words of a transcript, each with a solid colour pre-blended against the
 * background. The newest `hold + 1` words are full strength; older words fade linearly over
 * `fadeWords` to `floor`, and everything older stays at the floor (by rank, not screen position).
 */
export function fadeTail(transcript: string, opts: FadeOptions = {}): FadedWord[] {
  const {
    maxWords = 60,
    hold = 2,
    fadeWords = 14,
    floor = FADE_FLOOR,
    fg = colors.text,
    bg = colors.background,
  } = opts;
  const words = transcript.split(/\s+/).filter(Boolean).slice(-maxWords);
  const n = words.length;
  return words.map((word, i) => {
    const rank = n - 1 - i;
    const t = Math.min(1, Math.max(0, (rank - hold) / fadeWords));
    const a = 1 - (1 - floor) * t;
    return { word, color: blend(fg, bg, a) };
  });
}
