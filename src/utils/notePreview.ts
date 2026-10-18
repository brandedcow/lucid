import { markdownLines, plainLineText } from './markdownLines';

/** docs/product.md does not give a preview length; this is the default for the note list. */
export const DEFAULT_PREVIEW_LENGTH = 120;

/**
 * The text after the title line, for the note list: markers removed, every run of whitespace
 * (including line breaks) collapsed to one space, trimmed. Longer than `maxLength` characters
 * (counted in code points) it is cut and ends with "…" (the ellipsis counts toward `maxLength`).
 * Tags are kept as written.
 */
export function notePreview(body: string, maxLength: number = DEFAULT_PREVIEW_LENGTH): string {
  const lines = markdownLines(body).slice(1);
  const text = lines.map(plainLineText).join(' ').replace(/\s+/g, ' ').trim();
  if (maxLength <= 0) return '';
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  return (
    chars
      .slice(0, maxLength - 1)
      .join('')
      .trimEnd() + '…'
  );
}
