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
 * If the text being typed (after the last comma or semicolon) is the start of `word`, the word
 * replaces it, so tapping "Calm" after typing "ca" gives "calm", not "ca, calm". Anything else
 * being typed is kept and the word is added after it. Words are joined with ", ". The remaining
 * words keep the case the user typed.
 */
export function toggleEmotion(field: string, word: string): string {
  const target = word.trim().toLowerCase();
  // A word containing a separator would be stored as several words and could never be matched
  // or removed as one, so leave the field alone.
  if (!target || SEPARATOR.test(word) || splitEmotions(word).length === 0) return field;
  const segments = field.split(SEPARATOR);
  const parts = segments.map((p) => p.trim()).filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === target)) {
    return parts.filter((p) => p.toLowerCase() !== target).join(', ');
  }
  const last = (segments[segments.length - 1] ?? '').trim().toLowerCase();
  if (last && target.startsWith(last)) {
    const done = segments
      .slice(0, -1)
      .map((p) => p.trim())
      .filter(Boolean);
    return [...done, word.trim()].join(', ');
  }
  return [...parts, word.trim()].join(', ');
}

/**
 * The emotion field as shown: the first letter of each comma or semicolon separated entry is
 * capitalized ("calm, a bit uneasy" shows "Calm, A bit uneasy"). Display only; the stored value
 * stays lowercase. The result is always exactly as long as the input (a letter whose uppercase
 * form is longer is left alone), so a cursor position in the field never shifts.
 */
export function displayEmotions(s: string): string {
  return s.replace(/(^|[,;])(\s*)([^\s,;])/gu, (_m, sep: string, space: string, ch: string) => {
    const upper = ch.toUpperCase();
    return `${sep}${space}${upper.length === ch.length ? upper : ch}`;
  });
}

/**
 * What to store for text typed into the emotion field: lowercase, unless lowercasing would change
 * the length (a few letters do), in which case the text is kept as typed so the cursor never moves.
 */
export function storeEmotionInput(text: string): string {
  const lower = text.toLowerCase();
  return lower.length === text.length ? lower : text;
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
