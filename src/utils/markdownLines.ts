import { scanTags } from './inlineTags';

/**
 * Line tokenizer for the note editor's live markdown styling. Pure; no library. Markers stay in
 * the output as separate `marker` runs (so a TextInput can show them dimmed) and tags come only
 * from `scanTags`. Every character of a line lands in exactly one run, so the run texts of a line
 * concatenate back to the original line, and lines joined with their `eol` rebuild the body.
 *
 * Scope (docs/product.md): `#` / `##` headings, `- ` / `* ` bullets, `1. ` numbered lists,
 * `- [ ]` / `- [x]` checkboxes, `>` quotes, inline `**bold**`, `*italic*` and `#tag`.
 */

export type LineKind =
  'plain' | 'heading1' | 'heading2' | 'bullet' | 'numbered' | 'checkbox' | 'quote';

export interface MarkdownRun {
  text: string;
  /** A markdown marker (`##`, `- [ ]`, `**`...), to be shown dimmed. */
  marker?: boolean;
  bold?: boolean;
  italic?: boolean;
  /** A `#tag` word, including its "#". */
  tag?: boolean;
}

export interface MarkdownLine {
  kind: LineKind;
  /** For `checkbox` lines: true for `[x]` / `[X]`. */
  checked?: boolean;
  runs: MarkdownRun[];
  /** The line terminator that followed this line in the body ("\n", "\r\n", "\r" or "" for the last). */
  eol: string;
}

const HEADING = /^(#{1,2}) /;
const CHECKBOX = /^(\s*)([-*]) \[([ xX])\] ?/;
const BULLET = /^(\s*)[-*] /;
const NUMBERED = /^(\s*)\d+\. /;
const QUOTE = /^(\s*)> ?/;

function isSpace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

/** Splits `rest` of a line into styled runs. `from` is the offset of `rest` in the full line. */
class InlineBuilder {
  runs: MarkdownRun[] = [];

  constructor(
    private readonly line: string,
    private readonly tags: Map<number, number>,
  ) {}

  private push(text: string, style: Omit<MarkdownRun, 'text'>): void {
    if (text === '') return;
    const last = this.runs[this.runs.length - 1];
    if (
      last &&
      !!last.marker === !!style.marker &&
      !!last.bold === !!style.bold &&
      !!last.italic === !!style.italic &&
      !!last.tag === !!style.tag
    ) {
      last.text += text;
      return;
    }
    this.runs.push({ text, ...style });
  }

  /** Finds the closing `delim` for an opener whose content starts at `from`. -1 if none. */
  private findClose(delim: string, from: number, end: number): number {
    for (let j = this.line.indexOf(delim, from); j !== -1 && j + delim.length <= end;) {
      const single = delim === '*';
      const clean = !single || (this.line[j - 1] !== '*' && this.line[j + 1] !== '*');
      if (j > from && !isSpace(this.line[j - 1]) && clean) return j;
      j = this.line.indexOf(delim, j + 1);
    }
    return -1;
  }

  run(start: number, end: number, bold: boolean, italic: boolean): void {
    const style = (extra: Omit<MarkdownRun, 'text'> = {}): Omit<MarkdownRun, 'text'> => ({
      ...(bold ? { bold: true } : {}),
      ...(italic ? { italic: true } : {}),
      ...extra,
    });
    let pos = start;
    while (pos < end) {
      const tagEnd = this.tags.get(pos);
      if (tagEnd !== undefined && tagEnd <= end) {
        this.push(this.line.slice(pos, tagEnd), style({ tag: true }));
        pos = tagEnd;
        continue;
      }
      if (this.line.startsWith('**', pos) && !isSpace(this.line[pos + 2]) && !bold) {
        const close = this.findClose('**', pos + 2, end);
        if (close !== -1) {
          this.push('**', style({ marker: true }));
          this.run(pos + 2, close, true, italic);
          this.push('**', style({ marker: true }));
          pos = close + 2;
          continue;
        }
      } else if (
        this.line[pos] === '*' &&
        this.line[pos + 1] !== '*' &&
        !isSpace(this.line[pos + 1]) &&
        !italic
      ) {
        const close = this.findClose('*', pos + 1, end);
        if (close !== -1) {
          this.push('*', style({ marker: true }));
          this.run(pos + 1, close, bold, true);
          this.push('*', style({ marker: true }));
          pos = close + 1;
          continue;
        }
      }
      this.push(this.line[pos], style());
      pos += 1;
    }
  }
}

function tokenizeLine(line: string, eol: string): MarkdownLine {
  const tags = new Map<number, number>();
  for (const m of scanTags(line)) tags.set(m.start, m.end);

  let kind: LineKind = 'plain';
  let checked: boolean | undefined;
  let prefixEnd = 0;
  let indentEnd = 0;
  let m: RegExpMatchArray | null;
  if ((m = line.match(HEADING))) {
    kind = m[1].length === 1 ? 'heading1' : 'heading2';
    prefixEnd = m[0].length;
  } else if ((m = line.match(CHECKBOX))) {
    kind = 'checkbox';
    checked = m[3] !== ' ';
    indentEnd = m[1].length;
    prefixEnd = m[0].length;
  } else if ((m = line.match(BULLET))) {
    kind = 'bullet';
    indentEnd = m[1].length;
    prefixEnd = m[0].length;
  } else if ((m = line.match(NUMBERED))) {
    kind = 'numbered';
    indentEnd = m[1].length;
    prefixEnd = m[0].length;
  } else if ((m = line.match(QUOTE))) {
    kind = 'quote';
    indentEnd = m[1].length;
    prefixEnd = m[0].length;
  }

  const builder = new InlineBuilder(line, tags);
  if (indentEnd > 0) builder.run(0, indentEnd, false, false);
  const runs = builder.runs;
  if (prefixEnd > indentEnd) runs.push({ text: line.slice(indentEnd, prefixEnd), marker: true });
  builder.run(prefixEnd, line.length, false, false);

  const out: MarkdownLine = { kind, runs, eol };
  if (checked !== undefined) out.checked = checked;
  return out;
}

/** Tokenizes a note body into lines of styled runs. Accepts "\n", "\r\n" and "\r" line endings. */
export function markdownLines(body: string): MarkdownLine[] {
  const out: MarkdownLine[] = [];
  const re = /\r\n|\n|\r/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    out.push(tokenizeLine(body.slice(last, match.index), match[0]));
    last = match.index + match[0].length;
  }
  out.push(tokenizeLine(body.slice(last), ''));
  return out;
}

/** The text of a line without its markdown markers (tags and their "#" are kept). */
export function plainLineText(line: MarkdownLine): string {
  return line.runs
    .filter((r) => !r.marker)
    .map((r) => r.text)
    .join('');
}
