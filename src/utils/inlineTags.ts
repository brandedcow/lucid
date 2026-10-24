import { excludedRanges, fenceStates, splitLines } from './markdownSpans';
import { normalizeTag } from './tags';

/**
 * Inline "#tag" parsing for note text. Pure functions, hand-written scanner
 * (no lookbehind, no \p{} escapes: Hermes support is unverified).
 *
 * Grammar: a tag is "#" followed by 1 to 40 tag characters (counted in code
 * points, after trailing "-" and "_" are trimmed). The "#" must be at the text
 * start or follow whitespace or one of ( [ { " '. A tag character is any
 * non-whitespace character that is not a terminator. A token of only digits is
 * not a tag. A run longer than 40 characters is not a tag at all (it is not
 * truncated). Tags are stored lowercase via normalizeTag; no Unicode
 * normalization is applied.
 *
 * A match that touches any range from `excludedRanges` (fenced code, inline code, link and image
 * destinations, wikilink bodies) is dropped entirely, never truncated. `scanTags`, `activeToken`
 * and the editor tokenizer all use that one rule, so they cannot disagree.
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

/** True when `[start, end)` intersects one of `ranges` (sorted, non-overlapping). */
function touchesRange(
  ranges: readonly (readonly [number, number])[],
  start: number,
  end: number,
): boolean {
  let lo = 0;
  let hi = ranges.length;
  // First range that ends after `start`.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid][1] > start) hi = mid;
    else lo = mid + 1;
  }
  return lo < ranges.length && ranges[lo][0] < end;
}

function codePointLength(s: string): number {
  return Array.from(s).length;
}

/** Finds every inline tag with its offsets, in order of appearance (duplicates kept). */
export function scanTags(text: string): TagMatch[] {
  const out: TagMatch[] = [];
  const excluded = excludedRanges(text);
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
      const end = i + 1 + trimmed.length;
      if (!touchesRange(excluded, i, end)) out.push({ start: i, end, tag: normalizeTag(trimmed) });
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
  if (touchesRange(excludedRanges(text), s - 1, e)) return null;
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
 * Turns an old stored tag into a single inline token: whitespace and terminator characters become
 * "-" (a run becomes one), then trailing "-" and "_" are trimmed. "v1.2" becomes "v1-2". Returns ''
 * when nothing usable is left.
 */
function sanitizeForInline(raw: string): string {
  let out = '';
  let pendingGap = false;
  for (const ch of Array.from(normalizeTag(raw))) {
    if (!isTagChar(ch)) {
      pendingGap = true;
      continue;
    }
    if (pendingGap) out += '-';
    pendingGap = false;
    out += ch;
  }
  // A gap at the very end is dropped, like any trailing "-" or "_".
  return out.replace(/[-_]+$/, '');
}

/**
 * The inline form of a stored tag ("bad dream" becomes "bad-dream", "v1.2" becomes "v1-2"), or null
 * when it cannot be an inline tag (empty, only digits, over 40 characters).
 */
export function inlineTagFor(raw: string): string | null {
  const conv = sanitizeForInline(raw);
  if (!conv) return null;
  const m = scanTags('#' + conv);
  if (m.length !== 1 || m[0].end !== conv.length + 1 || m[0].tag !== conv) return null;
  return conv;
}

/**
 * The inline forms (no "#") of the stored `tags` that `body` does not already contain, in order,
 * without duplicates. Uses the same conversion as `materializeTags`; tags that cannot be inline
 * tags are dropped.
 */
export function missingInlineTags(body: string, tags: readonly string[]): string[] {
  const present = inlineTags(body);
  const add: string[] = [];
  for (const raw of tags) {
    const conv = inlineTagFor(raw);
    if (conv === null) continue;
    if (present.indexOf(conv) !== -1 || add.indexOf(conv) !== -1) continue;
    add.push(conv);
  }
  return add;
}

/**
 * The closing fence line (backticks only) needed when `body` ends inside an unclosed fenced code
 * block, or null. Without it an appended tag line would itself be code and never be recognised.
 */
function openFenceCloser(body: string): string | null {
  if (body.indexOf('```') === -1) return null;
  const lines = splitLines(body).map((l) => l.text);
  const states = fenceStates(lines);
  let opener = -1;
  states.forEach((st, i) => {
    if (st === 'fence') opener = opener === -1 ? i : -1;
  });
  if (opener === -1) return null;
  const ticks = (lines[opener].match(/`+/) ?? ['```'])[0].length;
  return '`'.repeat(Math.max(3, ticks));
}

/**
 * Appends tags missing from `body` as a final line of "#tag" tokens. Whitespace and terminator
 * characters in a tag become hyphens (a run becomes one; trailing "-" and "_" are trimmed), so
 * "bad dream" becomes #bad-dream and "v1.2" becomes #v1-2. Tags that are then empty, only digits or
 * over 40 characters are dropped. Tags already present in the body (by the same conversion) are
 * skipped. Returns `body` unchanged if nothing is added. A body that ends inside an unclosed fenced
 * code block gets a closing fence line first, so the tag line is not swallowed by the fence.
 */
export function materializeTags(body: string, tags: string[]): string {
  const add = missingInlineTags(body, tags);
  if (add.length === 0) return body;
  const line = add.map((t) => '#' + t).join(' ');
  if (body === '') return line;
  const close = openFenceCloser(body);
  return body + (body.endsWith('\n') ? '' : '\n') + (close === null ? '' : close + '\n') + line;
}
