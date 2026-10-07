/** Splits a transcript into paragraphs on blank lines. A single line break stays inside its paragraph. */
export function splitParagraphs(text: string | undefined): string[] {
  if (typeof text !== 'string' || !text) return [];
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
