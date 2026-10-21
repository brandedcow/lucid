import { scanTags } from './inlineTags';
import {
  fenceStates,
  inlineSpans,
  isRuleLine,
  splitLines,
  type FenceState,
  type InlineSpan,
} from './markdownSpans';

/**
 * Line tokenizer for the note editor's live markdown styling. Pure; no library. Markers stay in
 * the output as separate `marker` runs (so a TextInput can show them dimmed) and tags come only
 * from `scanTags`. Every character of a line lands in exactly one run, so the run texts of a line
 * concatenate back to the original line, and lines joined with their `eol` rebuild the body.
 *
 * Scope (docs/product.md): `#` / `##` / `###` headings, `---` rules, fenced code blocks, `- ` / `* `
 * bullets, `1. ` numbered lists, `- [ ]` / `- [x]` checkboxes, `>` quotes, inline `**bold**`,
 * `*italic*`, `` `code` ``, links, images, `[[wikilinks]]` and `#tag`. Structure shared with the
 * tag exclusions (fences, spans) lives in `markdownSpans`.
 */

export type LineKind =
  | 'plain'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'numbered'
  | 'checkbox'
  | 'quote'
  | 'rule'
  | 'fence'
  | 'code';

/** What a link-like run points at: a web link, an image, or a `[[wikilink]]` target. */
export interface RunLink {
  kind: 'web' | 'image' | 'wiki';
  /** The URL, or the trimmed wikilink target. */
  target: string;
}

export interface MarkdownRun {
  text: string;
  /** A markdown marker (`##`, `- [ ]`, `**`...), to be shown dimmed. */
  marker?: boolean;
  bold?: boolean;
  italic?: boolean;
  /** A `#tag` word, including its "#". */
  tag?: boolean;
  /** Text of an inline code span or a fenced code line (never parsed further). */
  code?: boolean;
  /** The visible text (or alt, or wikilink target) of a link, image or wikilink. */
  link?: RunLink;
}

export interface MarkdownLine {
  kind: LineKind;
  /** For `checkbox` lines: true for `[x]` / `[X]`. */
  checked?: boolean;
  runs: MarkdownRun[];
  /** The line terminator that followed this line in the body ("\n", "\r\n", "\r" or "" for the last). */
  eol: string;
}

const HEADING = /^(#{1,3}) /;
// `(?!\()` keeps `- [x](http://a)` a bullet with a link.
const CHECKBOX = /^(\s*)([-*]) \[([ xX])\](?!\() ?/;
const BULLET = /^(\s*)[-*] /;
const NUMBERED = /^(\s*)\d+\. /;
const QUOTE = /^(\s*)> ?/;

function isSpace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

/** Splits `rest` of a line into styled runs. `from` is the offset of `rest` in the full line. */
class InlineBuilder {
  runs: MarkdownRun[] = [];

  private readonly byStart = new Map<number, InlineSpan>();

  constructor(
    private readonly line: string,
    private readonly tags: Map<number, number>,
    private readonly spans: readonly InlineSpan[],
  ) {
    for (const span of spans) this.byStart.set(span.start, span);
  }

  /** True when `j` lies inside a span that does not also contain `from` (the scope's start). */
  private isProtected(j: number, from: number): boolean {
    return this.spans.some((s) => s.start <= j && j < s.end && !(s.start <= from && from < s.end));
  }

  private push(text: string, style: Omit<MarkdownRun, 'text'>): void {
    if (text === '') return;
    const last = this.runs[this.runs.length - 1];
    if (
      last &&
      !!last.marker === !!style.marker &&
      !!last.bold === !!style.bold &&
      !!last.italic === !!style.italic &&
      !!last.tag === !!style.tag &&
      !!last.code === !!style.code &&
      last.link?.kind === style.link?.kind &&
      last.link?.target === style.link?.target
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
      if (j > from && !isSpace(this.line[j - 1]) && clean && !this.isProtected(j, from)) return j;
      j = this.line.indexOf(delim, j + 1);
    }
    return -1;
  }

  /** A link-like span with its visible text styled by `inner`. Brackets and `](url)` are markers. */
  private span(
    span: InlineSpan,
    style: (extra?: Omit<MarkdownRun, 'text'>) => Omit<MarkdownRun, 'text'>,
    bold: boolean,
    italic: boolean,
  ): void {
    const line = this.line;
    if (span.kind === 'code') {
      this.push(line.slice(span.start, span.start + span.ticks), style({ marker: true }));
      this.push(line.slice(span.start + span.ticks, span.end - span.ticks), style({ code: true }));
      this.push(line.slice(span.end - span.ticks, span.end), style({ marker: true }));
    } else if (span.kind === 'wiki') {
      this.push('[[', style({ marker: true }));
      this.push(
        line.slice(span.start + 2, span.end - 2),
        style({ link: { kind: 'wiki', target: span.target } }),
      );
      this.push(']]', style({ marker: true }));
    } else {
      this.push(line.slice(span.start, span.textStart), style({ marker: true }));
      this.run(span.textStart, span.textEnd, bold, italic, {
        kind: span.kind === 'image' ? 'image' : 'web',
        target: span.url,
      });
      this.push(line.slice(span.textEnd, span.end), style({ marker: true }));
    }
  }

  run(start: number, end: number, bold: boolean, italic: boolean, link?: RunLink): void {
    const style = (extra: Omit<MarkdownRun, 'text'> = {}): Omit<MarkdownRun, 'text'> => ({
      ...(bold ? { bold: true } : {}),
      ...(italic ? { italic: true } : {}),
      ...(link ? { link } : {}),
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
      const span = this.byStart.get(pos);
      if (span && span.end <= end) {
        this.span(span, style, bold, italic);
        pos = span.end;
        continue;
      }
      if (this.line.startsWith('**', pos) && !isSpace(this.line[pos + 2]) && !bold) {
        const close = this.findClose('**', pos + 2, end);
        if (close !== -1) {
          this.push('**', style({ marker: true }));
          this.run(pos + 2, close, true, italic, link);
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
          this.run(pos + 1, close, bold, true, link);
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

interface LineClass {
  kind: LineKind;
  checked?: boolean;
  indentEnd: number;
  prefixEnd: number;
}

/** The kind and prefix geometry of a line that is not inside a fenced block. */
function classifyLine(line: string): LineClass {
  let m: RegExpMatchArray | null;
  if (isRuleLine(line)) return { kind: 'rule', indentEnd: 0, prefixEnd: line.length };
  if ((m = line.match(HEADING))) {
    const kind = m[1].length === 1 ? 'heading1' : m[1].length === 2 ? 'heading2' : 'heading3';
    return { kind, indentEnd: 0, prefixEnd: m[0].length };
  }
  if ((m = line.match(CHECKBOX))) {
    return {
      kind: 'checkbox',
      checked: m[3] !== ' ',
      indentEnd: m[1].length,
      prefixEnd: m[0].length,
    };
  }
  if ((m = line.match(BULLET))) {
    return { kind: 'bullet', indentEnd: m[1].length, prefixEnd: m[0].length };
  }
  if ((m = line.match(NUMBERED))) {
    return { kind: 'numbered', indentEnd: m[1].length, prefixEnd: m[0].length };
  }
  if ((m = line.match(QUOTE))) {
    return { kind: 'quote', indentEnd: m[1].length, prefixEnd: m[0].length };
  }
  return { kind: 'plain', indentEnd: 0, prefixEnd: 0 };
}

function tokenizeLine(line: string, eol: string, state: FenceState | null): MarkdownLine {
  if (state === 'fence') return { kind: 'fence', runs: [{ text: line, marker: true }], eol };
  if (state === 'code') {
    return { kind: 'code', runs: line === '' ? [] : [{ text: line, code: true }], eol };
  }
  const { kind, checked, indentEnd, prefixEnd } = classifyLine(line);
  if (kind === 'rule') return { kind, runs: [{ text: line, marker: true }], eol };

  const spans = inlineSpans(line);
  // scanTags applies the same excluded ranges, so tag runs equal scanTags(body) by construction.
  const tags = new Map<number, number>();
  for (const m of scanTags(line)) tags.set(m.start, m.end);

  const builder = new InlineBuilder(line, tags, spans);
  if (indentEnd > 0) builder.run(0, indentEnd, false, false);
  const runs = builder.runs;
  if (prefixEnd > indentEnd) runs.push({ text: line.slice(indentEnd, prefixEnd), marker: true });
  builder.run(prefixEnd, line.length, false, false);

  const out: MarkdownLine = { kind, runs, eol };
  if (checked !== undefined) out.checked = checked;
  return out;
}

export interface ListPrefix {
  kind: 'bullet' | 'numbered' | 'checkbox';
  /** Leading whitespace. */
  indent: string;
  /** The marker exactly as written: '- ', '* ', '12. ', '- [ ] ', '- [x]' (checkbox trailing space is optional). */
  marker: string;
  /** Bullet and checkbox lines. */
  bullet?: '-' | '*';
  /** Numbered lines. */
  number?: number;
  /** Checkbox lines. */
  checked?: boolean;
  /** indent + marker length: the offset where the content starts. */
  length: number;
}

/**
 * The list prefix of a single line (no line ending), or null for plain lines, headings, quotes and
 * rules. Uses the same patterns as the tokenizer, so both agree on what counts as a list item.
 * A line inside a fenced block is only known from the body: pass its `kind` (from
 * `markdownLineKinds`) and `rule`, `fence` and `code` lines give null.
 */
export function parseListPrefix(line: string, kind?: LineKind): ListPrefix | null {
  if (kind === 'rule' || kind === 'fence' || kind === 'code') return null;
  if (isRuleLine(line)) return null;
  let m: RegExpMatchArray | null;
  if ((m = line.match(CHECKBOX))) {
    return {
      kind: 'checkbox',
      indent: m[1],
      marker: m[0].slice(m[1].length),
      bullet: m[2] as '-' | '*',
      checked: m[3] !== ' ',
      length: m[0].length,
    };
  }
  if ((m = line.match(BULLET))) {
    return {
      kind: 'bullet',
      indent: m[1],
      marker: m[0].slice(m[1].length),
      bullet: m[0].trimStart()[0] as '-' | '*',
      length: m[0].length,
    };
  }
  if ((m = line.match(NUMBERED))) {
    const marker = m[0].slice(m[1].length);
    return {
      kind: 'numbered',
      indent: m[1],
      marker,
      number: parseInt(marker, 10),
      length: m[0].length,
    };
  }
  return null;
}

/** Tokenizes a note body into lines of styled runs. Accepts "\n", "\r\n" and "\r" line endings. */
export function markdownLines(body: string): MarkdownLine[] {
  const slices = splitLines(body);
  const states = fenceStates(slices.map((s) => s.text));
  return slices.map((s, i) => tokenizeLine(s.text, s.eol, states[i]));
}

/** The kind of each line of a body (same lines and same fence pre-pass as `markdownLines`). */
export function markdownLineKinds(body: string): LineKind[] {
  const slices = splitLines(body);
  const states = fenceStates(slices.map((s) => s.text));
  return slices.map((s, i) => states[i] ?? classifyLine(s.text).kind);
}

/** The text of a line without its markdown markers (tags and their "#" are kept). */
export function plainLineText(line: MarkdownLine): string {
  return line.runs
    .filter((r) => !r.marker)
    .map((r) => r.text)
    .join('');
}
