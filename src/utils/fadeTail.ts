export type FadedWord = { word: string; opacity: number };

/** Dimmest opacity. Text #F5F2EC at this opacity on #0D1017 keeps about 3:1 contrast. */
export const FADE_FLOOR = 0.38;

/**
 * The last `maxWords` words of a transcript, each with an opacity: the newest word is 1,
 * older words step down evenly (by rank, not by position on screen) to `floor`.
 */
export function fadeTail(transcript: string, maxWords = 50, floor = FADE_FLOOR): FadedWord[] {
  const words = transcript.split(/\s+/).filter(Boolean).slice(-maxWords);
  const steps = Math.max(1, maxWords - 1);
  return words.map((word, i) => {
    const rank = words.length - 1 - i;
    return { word, opacity: Math.max(floor, 1 - (rank / steps) * (1 - floor)) };
  });
}
