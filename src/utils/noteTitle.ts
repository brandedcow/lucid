import { markdownLines } from './markdownLines';

export const UNTITLED = 'Untitled';

/**
 * A note's title: its first line with markdown markers removed (heading `#`s, list and checkbox
 * markers, the quote marker, `**` and `*`, code backticks, link brackets and destinations, `[[`
 * `]]`). A link or image keeps its text (`[Foo](u)` is "Foo"), a wikilink its body (`[[ Foo ]]` is
 * "Foo"), inline code its text. "Untitled" when that line is empty or holds only tags, a rule
 * (`---`), a fence line, or an image without alt text. A note whose first line is a fence is
 * Untitled even if later lines have text. Derived each time, never stored. Tags next to other
 * words stay in the title. A tag-looking wikilink body is not a tag (`[[#x]]` is "#x", while the
 * note `#x` is Untitled).
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
