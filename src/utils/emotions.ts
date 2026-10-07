const SEPARATOR = /[,;]/;

/** The longest a single emotion can be; longer text is cut. */
export const MAX_EMOTION_LENGTH = 40;

/** Splits a stored emotion on commas and semicolons only (never spaces). Lowercase, trimmed, unique. */
export function splitEmotions(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(SEPARATOR)) {
    const word = part.trim().toLowerCase();
    if (word) seen.add(word);
  }
  return [...seen];
}

/**
 * Adds the emotion(s) in `raw` to `emotions`. `raw` is split on commas and semicolons; each part is
 * trimmed, lowercased, has inner spaces collapsed and is cut to MAX_EMOTION_LENGTH. Empty parts and
 * duplicates (ignoring case) are skipped. Returns the same array when nothing was added.
 */
export function addEmotions(emotions: string[], raw: string): string[] {
  const next = [...emotions];
  for (const part of raw.split(SEPARATOR)) {
    const word = part.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_EMOTION_LENGTH).trim();
    if (word && !next.includes(word)) next.push(word);
  }
  return next.length === emotions.length ? emotions : next;
}

/** The stored emotion string for a list of emotions: joined with ", ". */
export function joinEmotions(emotions: string[]): string {
  return emotions.join(', ');
}

/**
 * The emotion string to save: the stored text plus any emotion typed but not yet confirmed. With
 * nothing pending the stored text is returned untouched, so an old free-text emotion is not rewritten.
 */
export function withPendingEmotion(emotion: string, draft: string): string {
  if (draft.trim().length === 0) return emotion;
  return joinEmotions(addEmotions(splitEmotions(emotion), draft));
}
