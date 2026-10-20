import { highlightRanges } from './noteHighlight';
import { ParsedQuery } from './noteSearch';
import { markdownLines, plainLineText } from './markdownLines';

/** docs/product.md does not give a preview length; this is the default for the note list. */
export const DEFAULT_PREVIEW_LENGTH = 120;

/** The cleaned text after the title line, before any cut. */
function previewSource(body: string): string {
  const lines = markdownLines(body).slice(1);
  return lines.map(plainLineText).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * The text after the title line, for the note list: markers removed, every run of whitespace
 * (including line breaks) collapsed to one space, trimmed. Longer than `maxLength` characters
 * (counted in code points) it is cut and ends with "…" (the ellipsis counts toward `maxLength`).
 * Tags are kept as written.
 */
export function notePreview(body: string, maxLength: number = DEFAULT_PREVIEW_LENGTH): string {
  const text = previewSource(body);
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

/** Code points of context kept before the first match in a snippet. */
const SNIPPET_LEAD = 30;

/**
 * What a search result row shows under the title. When the first match in the cleaned text after
 * the title lies inside the normal preview (or there is no visible match: only in the title, a
 * tag-less miss, or markdown syntax that is stripped), this is `notePreview(body, maxLength)`.
 * Otherwise an excerpt of at most `maxLength` code points (the "…" markers count): it starts at a
 * word boundary about 30 characters before the match, with "…" before it, and "…" after it when
 * the text goes on.
 */
export function matchSnippet(
  body: string,
  parsed: ParsedQuery,
  maxLength: number = DEFAULT_PREVIEW_LENGTH,
): string {
  const preview = notePreview(body, maxLength);
  if (maxLength <= 2) return preview;
  const text = previewSource(body);
  const ranges = highlightRanges(text, parsed);
  if (ranges.length === 0) return preview;
  const chars = Array.from(text);
  if (chars.length <= maxLength) return preview;
  const matchStart = Array.from(text.slice(0, ranges[0][0])).length;
  const matchEnd = Array.from(text.slice(0, ranges[0][1])).length;
  // The preview shows the first maxLength - 1 characters, then "…".
  if (matchEnd <= maxLength - 1) return preview;

  let start = Math.max(0, matchStart - SNIPPET_LEAD);
  if (start > 0 && !/\s/.test(chars[start - 1])) {
    let next = start;
    while (next < matchStart && !/\s/.test(chars[next])) next += 1;
    if (next < matchStart) start = next + 1;
  }
  const lead = start > 0 ? 1 : 0;
  // Room for text: leave one slot for the trailing "…" unless the text ends within the window.
  let room = maxLength - lead;
  const endsInside = start + room >= chars.length;
  if (!endsInside) room -= 1;
  const body_ = chars
    .slice(start, start + room)
    .join('')
    .trimEnd();
  return `${lead ? '…' : ''}${body_}${endsInside ? '' : '…'}`;
}
