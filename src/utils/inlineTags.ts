import { normalizeTag } from './tags';

/**
 * Inline "#tag" parsing for dream text. Pure functions, hand-written scanner
 * (no lookbehind, no \p{} escapes: Hermes support is unverified).
 *
 * Grammar: a tag is "#" followed by 1 to 40 tag characters (counted in code
 * points, after trailing "-" and "_" are trimmed). The "#" must be at the text
 * start or follow whitespace or one of ( [ { " '. A tag character is any
 * non-whitespace character that is not a terminator. A token of only digits is
 * not a tag. A run longer than 40 characters is not a tag at all (it is not
 * truncated). Tags are stored lowercase via normalizeTag; no Unicode
 * normalization is applied.
 */

export const MAX_TAG_LENGTH = 40;

export interface TagMatch {
  /** UTF-16 offset of the "#". */
  start: number;
  /** UTF-16 offset just past the last tag character (trailing -/_ excluded). */
  end: number;
  /** Normalized tag, without "#". */
  tag: string;
}

export interface ActiveToken {
  /** UTF-16 offset of the "#". */
  start: number;
  /** UTF-16 offset just past the run of tag characters. */
  end: number;
  /** Text typed after "#", normalized (lowercase). May be empty. */
  query: string;
}

const TERMINATORS = '.,;:!?()[]{}<>"\'“”‘’…/\\|@#$%^&*+=~';
const OPENERS = '([{"\'';

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function isTagChar(ch: string): boolean {
  return !isWhitespace(ch) && TERMINATORS.indexOf(ch) === -1;
}

/** True when a "#" at `index` may start a tag (by what precedes it). */
function canStartAt(text: string, index: number): boolean {
  if (index === 0) return true;
  const prev = text[index - 1];
  return isWhitespace(prev) || OPENERS.indexOf(prev) !== -1;
}

function codePointLength(s: string): number {
  return Array.from(s).length;
}

/** Finds every inline tag with its offsets, in order of appearance (duplicates kept). */
export function scanTags(text: string): TagMatch[] {
  const out: TagMatch[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '#' || !canStartAt(text, i)) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < text.length && isTagChar(text[j])) j += 1;
    const run = text.slice(i + 1, j);
    const trimmed = run.replace(/[-_]+$/, '');
    const len = codePointLength(trimmed);
    if (len >= 1 && len <= MAX_TAG_LENGTH && !/^[0-9]+$/.test(trimmed)) {
      out.push({ start: i, end: i + 1 + trimmed.length, tag: normalizeTag(trimmed) });
    }
    i = j > i + 1 ? j : i + 1;
  }
  return out;
}

/** Unique normalized tags in order of first appearance. */
export function inlineTags(text: string): string[] {
  const seen: string[] = [];
  for (const m of scanTags(text)) {
    if (seen.indexOf(m.tag) === -1) seen.push(m.tag);
  }
  return seen;
}

/**
 * The "#..." token the cursor is inside of or at the end of (at least the "#"
 * must be before the cursor). Returns null otherwise. Not subject to the
 * length or digits rules: the user is still typing.
 */
export function activeToken(text: string, cursor: number): ActiveToken | null {
  if (cursor < 0 || cursor > text.length) return null;
  let s = cursor;
  while (s > 0 && isTagChar(text[s - 1])) s -= 1;
  if (s === 0 || text[s - 1] !== '#' || !canStartAt(text, s - 1)) return null;
  let e = cursor;
  while (e < text.length && isTagChar(text[e])) e += 1;
  return { start: s - 1, end: e, query: normalizeTag(text.slice(s, e)) };
}

/** Whitespace runs become hyphens so the tag survives as a single token. */
function hyphenate(tag: string): string {
  return normalizeTag(tag).replace(/\s+/g, '-');
}

/**
 * Replaces the whole token with "#tag" plus one trailing space (not doubled if
 * a space already follows). The cursor lands after that space. Whitespace in
 * `tag` is hyphenated.
 */
export function completeToken(
  text: string,
  token: { start: number; end: number },
  tag: string,
): { text: string; cursor: number } {
  const before = text.slice(0, token.start);
  const after = text.slice(token.end);
  const insert = '#' + hyphenate(tag);
  const space = after.startsWith(' ') ? '' : ' ';
  return {
    text: before + insert + space + after,
    cursor: before.length + insert.length + 1,
  };
}

/** Inserts "#" at the cursor, adding a leading space when it would not parse otherwise. */
export function insertHash(text: string, cursor: number): { text: string; cursor: number } {
  const c = Math.max(0, Math.min(cursor, text.length));
  const needsSpace = c > 0 && !canStartAt(text, c);
  const ins = (needsSpace ? ' ' : '') + '#';
  return { text: text.slice(0, c) + ins + text.slice(c), cursor: c + ins.length };
}

/**
 * Appends tags missing from `body` as a final line of "#tag" tokens. Spaces in
 * a tag become hyphens. Tags that cannot be written as an inline token (empty,
 * only digits, containing a terminator such as "." or "/", over 40 characters,
 * or ending in -/_) are dropped. Tags already present in the body (by
 * normalized comparison) are skipped. Returns `body` unchanged if nothing is added.
 */
export function materializeTags(body: string, tags: string[]): string {
  const present = inlineTags(body);
  const add: string[] = [];
  for (const raw of tags) {
    const conv = hyphenate(raw);
    if (!conv) continue;
    const m = scanTags('#' + conv);
    if (m.length !== 1 || m[0].end !== conv.length + 1 || m[0].tag !== conv) continue;
    if (present.indexOf(conv) !== -1 || add.indexOf(conv) !== -1) continue;
    add.push(conv);
  }
  if (add.length === 0) return body;
  const line = add.map((t) => '#' + t).join(' ');
  if (body === '') return line;
  return body + (body.endsWith('\n') ? '' : '\n') + line;
}
