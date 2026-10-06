const SEPARATOR = /[,;]/;
const MAX_SUGGESTIONS = 8;

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
 * Adds `word` to the emotion field, or removes it if already present (matched ignoring case).
 * Words are joined with ", ". The remaining words keep the case the user typed.
 */
export function toggleEmotion(field: string, word: string): string {
  const target = word.trim().toLowerCase();
  // A word containing a separator would be stored as several words and could never be matched
  // or removed as one, so leave the field alone.
  if (!target || SEPARATOR.test(word) || splitEmotions(word).length === 0) return field;
  const parts = field
    .split(SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === target)) {
    return parts.filter((p) => p.toLowerCase() !== target).join(', ');
  }
  return [...parts, word.trim()].join(', ');
}

/**
 * Known emotion words to suggest while typing: skips words already in the field, matches the
 * start of the segment being typed, and returns at most 8 in the order given.
 */
export function suggestEmotions(known: string[], field: string): string[] {
  const present = new Set(splitEmotions(field));
  const segments = field.split(SEPARATOR);
  const prefix = (segments[segments.length - 1] ?? '').trim().toLowerCase();
  const words = [...new Set(known.map((w) => w.trim().toLowerCase()).filter(Boolean))];
  return words
    .filter((word) => !present.has(word) && word.startsWith(prefix))
    .slice(0, MAX_SUGGESTIONS);
}
