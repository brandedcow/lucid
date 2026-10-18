import { markdownLines } from './markdownLines';

export const UNTITLED = 'Untitled';

/**
 * A note's title: its first line with markdown markers removed (heading `#`s, list and checkbox
 * markers, the quote marker, `**` and `*`). "Untitled" when that line is empty or holds only
 * tags. Derived each time, never stored. Tags next to other words stay in the title.
 */
export function noteTitle(body: string): string {
  const first = markdownLines(body)[0];
  const text = first.runs
    .filter((r) => !r.marker && !r.tag)
    .map((r) => r.text)
    .join('')
    .trim();
  if (text === '') return UNTITLED;
  return first.runs
    .filter((r) => !r.marker)
    .map((r) => r.text)
    .join('')
    .trim();
}
