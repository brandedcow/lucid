/**
 * Shared markdown structure for notes: which lines are fenced code, which lines are rules, and
 * which inline spans (code, links, images, `[[wikilinks]]`) a line contains. Pure; hand-written
 * scanners, no regex lookbehind and no \p{} escapes (Hermes support is unverified, see
 * inlineTags.ts). `markdownLines` (editor styling) and `excludedRanges` (where `#tags` must not
 * be scanned) both read from here, so they cannot disagree.
 *
 * Grammar (everything is line-local except fences):
 * - Fence: up to 3 spaces, 3 or more backticks, an optional info string without backticks. It
 *   closes at a line of up to 3 spaces, at least as many backticks and nothing else but spaces.
 *   An unclosed fence runs to the end of the body.
 * - Rule: 3 or more `-`, `*` or `_` of one kind, only that character and spaces on the line.
 * - Inline code: a backtick run of length n closes at the next run of exactly n; unclosed is text.
 * - Link `[text](url)`: text non-empty with no `[` or `]`; url non-empty, no whitespace, one level
 *   of balanced parentheses. Image `![alt](url)`: same, alt may be empty. Code spans inside link
 *   text are recognised; nested links and images are not.
 * - Wikilink `[[target]]`: target (trimmed) non-empty, at most 200 characters, no `[` or `]`.
 */

export const MAX_WIKILINK_LENGTH = 200;

/** A line of a body with its terminator and the UTF-16 offset where it starts. */
export interface LineSlice {
  text: string;
  /** "\n", "\r\n", "\r" or "" for the last line. */
  eol: string;
  start: number;
}

/** Splits a body on "\n", "\r\n" and "\r". Always returns at least one (possibly empty) line. */
export function splitLines(body: string): LineSlice[] {
  const out: LineSlice[] = [];
  const re = /\r\n|\n|\r/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    out.push({ text: body.slice(last, match.index), eol: match[0], start: last });
    last = match.index + match[0].length;
  }
  out.push({ text: body.slice(last), eol: '', start: last });
  return out;
}

export type FenceState = 'fence' | 'code';

const FENCE_OPEN = /^ {0,3}(`{3,})[^`]*$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}) *$/;

/**
 * Per line: 'fence' for an opening or closing fence line, 'code' for a line inside a fenced block,
 * null for every other line.
 */
export function fenceStates(lines: readonly string[]): (FenceState | null)[] {
  const out: (FenceState | null)[] = [];
  let open = 0;
  for (const line of lines) {
    if (open === 0) {
      const m = line.match(FENCE_OPEN);
      if (m) {
        open = m[1].length;
        out.push('fence');
      } else {
        out.push(null);
      }
    } else {
      const m = line.match(FENCE_CLOSE);
      if (m && m[1].length >= open) {
        open = 0;
        out.push('fence');
      } else {
        out.push('code');
      }
    }
  }
  return out;
}

const RULE = /^ {0,3}([-*_])(?: *\1){2,} *$/;

/** True for a horizontal rule line (`---`, `***`, `___`, `- - -`, `* * *`). */
export function isRuleLine(line: string): boolean {
  return RULE.test(line);
}

export interface CodeSpan {
  kind: 'code';
  start: number;
  end: number;
  /** Length of the backtick run at each end. */
  ticks: number;
}

export interface LinkSpan {
  kind: 'link' | 'image';
  start: number;
  end: number;
  /** Visible text (or alt) is `[textStart, textEnd)`; `](url)` is `[textEnd, end)`. */
  textStart: number;
  textEnd: number;
  url: string;
}

export interface WikiSpan {
  kind: 'wiki';
  start: number;
  end: number;
  /** The text between the brackets, `[start + 2, end - 2)`. */
  target: string;
}

export type InlineSpan = CodeSpan | LinkSpan | WikiSpan;

function findTickClose(line: string, from: number, to: number, n: number): number {
  let i = from;
  while (i < to) {
    if (line[i] !== '`') {
      i += 1;
      continue;
    }
    let m = 1;
    while (i + m < to && line[i + m] === '`') m += 1;
    if (m === n) return i;
    i += m;
  }
  return -1;
}

/** `b` is the index of "[". Returns the span geometry or null. */
function matchLink(
  line: string,
  b: number,
  to: number,
  allowEmptyText: boolean,
): { textEnd: number; end: number; url: string } | null {
  let j = b + 1;
  while (j < to && line[j] !== ']') {
    if (line[j] === '[') return null;
    j += 1;
  }
  if (j >= to || j + 1 >= to || line[j + 1] !== '(') return null;
  if (j === b + 1 && !allowEmptyText) return null;
  let k = j + 2;
  let depth = 1;
  for (; k < to; k++) {
    const ch = line[k];
    if (/\s/.test(ch)) return null;
    if (ch === '(') {
      depth += 1;
      if (depth > 2) return null;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (k >= to || k === j + 2) return null;
  return { textEnd: j, end: k + 1, url: line.slice(j + 2, k) };
}

function matchWiki(line: string, i: number, to: number): WikiSpan | null {
  let j = i + 2;
  while (j < to && line[j] !== ']' && line[j] !== '[') j += 1;
  if (j + 1 >= to || line[j] !== ']' || line[j + 1] !== ']') return null;
  const target = line.slice(i + 2, j).trim();
  if (target === '' || target.length > MAX_WIKILINK_LENGTH) return null;
  return { kind: 'wiki', start: i, end: j + 2, target };
}

function scanSpans(line: string, from: number, to: number, nested: boolean, out: InlineSpan[]) {
  let i = from;
  while (i < to) {
    const ch = line[i];
    if (ch === '`') {
      let n = 1;
      while (i + n < to && line[i + n] === '`') n += 1;
      const close = findTickClose(line, i + n, to, n);
      if (close !== -1) {
        out.push({ kind: 'code', start: i, end: close + n, ticks: n });
        i = close + n;
      } else {
        i += n;
      }
      continue;
    }
    if (!nested) {
      if (ch === '!' && line[i + 1] === '[') {
        const m = matchLink(line, i + 1, to, true);
        if (m) {
          out.push({
            kind: 'image',
            start: i,
            end: m.end,
            textStart: i + 2,
            textEnd: m.textEnd,
            url: m.url,
          });
          scanSpans(line, i + 2, m.textEnd, true, out);
          i = m.end;
          continue;
        }
      } else if (ch === '[') {
        const w = line[i + 1] === '[' ? matchWiki(line, i, to) : null;
        if (w) {
          out.push(w);
          i = w.end;
          continue;
        }
        const m = matchLink(line, i, to, false);
        if (m) {
          out.push({
            kind: 'link',
            start: i,
            end: m.end,
            textStart: i + 1,
            textEnd: m.textEnd,
            url: m.url,
          });
          scanSpans(line, i + 1, m.textEnd, true, out);
          i = m.end;
          continue;
        }
      }
    }
    i += 1;
  }
}

function mayHaveSpans(text: string): boolean {
  return text.indexOf('`') !== -1 || text.indexOf('](') !== -1 || text.indexOf('[[') !== -1;
}

/**
 * The inline spans of one line (no line ending), sorted by start. A link or image is followed by
 * the code spans inside its text, so spans can nest by one level but never overlap otherwise.
 */
export function inlineSpans(line: string): InlineSpan[] {
  if (!mayHaveSpans(line)) return [];
  const out: InlineSpan[] = [];
  scanSpans(line, 0, line.length, false, out);
  return out;
}

/** Half-open ranges inside one line where tags must not be scanned. */
function spanExclusions(span: InlineSpan): [number, number][] {
  if (span.kind === 'code') return [[span.start, span.end]];
  if (span.kind === 'wiki') return [[span.start + 2, span.end - 2]];
  return [[span.textEnd + 1, span.end]];
}

/**
 * Half-open UTF-16 ranges `[start, end)` of `text` (a whole body or a single line) where `#tags`
 * must not be recognised, sorted and non-overlapping: whole lines of fenced code (fence lines
 * included, line endings excluded), inline code spans, the `(destination)` of links and images,
 * and the body of `[[wikilinks]]`.
 */
export function excludedRanges(text: string): readonly [number, number][] {
  if (!mayHaveSpans(text)) return [];
  const slices = splitLines(text);
  const states = fenceStates(slices.map((s) => s.text));
  const out: [number, number][] = [];
  slices.forEach((s, i) => {
    if (states[i] !== null) {
      if (s.text.length > 0) out.push([s.start, s.start + s.text.length]);
      return;
    }
    for (const span of inlineSpans(s.text)) {
      for (const [a, b] of spanExclusions(span)) out.push([s.start + a, s.start + b]);
    }
  });
  return out.sort((x, y) => x[0] - y[0]);
}
