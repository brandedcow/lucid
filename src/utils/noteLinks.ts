import type { Note } from '../services/notesStorage';
import { excludedRanges, inlineSpans, MAX_WIKILINK_LENGTH } from './markdownSpans';
import { isLive } from './noteViews';
import { noteTitle, UNTITLED } from './noteTitle';

/**
 * Pure logic for `[[wikilinks]]` between notes: a title index, link resolution, finding the `[[`
 * being typed, completing it and matching titles for a picker. No UI and no navigation. Hand-written
 * scanners; no regex lookbehind and no \p{} escapes (Hermes support is unverified). All offsets are
 * UTF-16 offsets into the note body.
 *
 * Title key: `noteTitle(body)` lower-cased, runs of whitespace collapsed to one space, trimmed. No
 * diacritic folding ("Café" and "Cafe" are different titles).
 */

/** One title in the index: the note that owns it. */
export interface TitleEntry {
  /** Normalised lookup key. */
  key: string;
  /** The owning note's id. */
  id: string;
  /** Display title, `noteTitle(body)` as is (not lower-cased). */
  title: string;
  /** The owning note's `updatedAt` as stored, if any (can be missing or invalid). */
  updatedAt: string | undefined;
}

/**
 * Title index. `byKey` looks a normalised key up (one entry per distinct key: the winner).
 * `entries` holds the same winners for iteration (the picker), ordered newest `updatedAt` first
 * (invalid or missing dates last, ties by id ascending), so it is deterministic.
 */
export interface TitleIndex {
  byKey: ReadonlyMap<string, TitleEntry>;
  entries: readonly TitleEntry[];
}

type IndexedNote = Pick<Note, 'id' | 'body'> & Partial<Pick<Note, 'updatedAt' | 'deletedAt'>>;

/** Normalises a title for lookup (see the file comment). */
export function titleKey(title: string): string {
  return title.replace(/\s+/g, ' ').trim().toLowerCase();
}

function time(value: unknown): number {
  if (typeof value !== 'string') return -Infinity;
  const t = Date.parse(value);
  return Number.isNaN(t) ? -Infinity : t;
}

/** Negative when `a` should come before `b`: newer first, invalid dates last, then id ascending. */
function compareEntries(a: TitleEntry, b: TitleEntry): number {
  const ta = time(a.updatedAt);
  const tb = time(b.updatedAt);
  if (ta !== tb) return ta > tb ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Builds the index from the live (not trashed) notes. Untitled notes are left out. When several
 * notes share a key the one that sorts first (newest `updatedAt`, then smaller id) wins.
 *
 * `overrideCurrent` is the open note as the editor holds it: its `body` replaces the stored body of
 * the note with that id, because the edit may not be saved yet. The stored `updatedAt` is kept. If
 * no live stored note has that id (a new, unsaved note) it is added with no date, unless a stored
 * copy with that id is in Recently Deleted, in which case the override is ignored.
 */
export function buildTitleIndex(
  notes: readonly IndexedNote[],
  overrideCurrent?: { id: string; body: string },
): TitleIndex {
  const candidates: TitleEntry[] = [];
  let overrideSeen = false;
  let overrideTrashed = false;
  for (const n of notes) {
    const isCurrent = overrideCurrent !== undefined && n.id === overrideCurrent.id;
    if (isCurrent && overrideCurrent) {
      overrideSeen = true;
      if (!isLive(n as Note)) overrideTrashed = true;
    }
    if (!isLive(n as Note)) continue;
    const body = isCurrent && overrideCurrent ? overrideCurrent.body : n.body;
    candidates.push(entryFor(n.id, body, n.updatedAt));
  }
  if (overrideCurrent && !overrideSeen && !overrideTrashed) {
    candidates.push(entryFor(overrideCurrent.id, overrideCurrent.body, undefined));
  }
  const entries: TitleEntry[] = [];
  const byKey = new Map<string, TitleEntry>();
  for (const e of candidates.sort(compareEntries)) {
    if (e.title === UNTITLED || e.key === '' || byKey.has(e.key)) continue;
    byKey.set(e.key, e);
    entries.push(e);
  }
  return { byKey, entries };
}

function entryFor(id: string, body: string, updatedAt: string | undefined): TitleEntry {
  const title = noteTitle(typeof body === 'string' ? body : '');
  return { key: titleKey(title), id, title, updatedAt };
}

export type WikiResolution =
  | { kind: 'existing'; id: string; title: string }
  | { kind: 'missing'; title: string }
  | { kind: 'invalid' };

/**
 * Resolves a link target to a note. Callers must pass `link.target` from the tokenizer (the
 * trimmed target), never the raw run text, which still has its spaces.
 *
 * - `invalid`: the target's own title is Untitled (empty, or only a tag such as `[[#x]]`: a note
 *   whose first line is `#x` is Untitled, so such a link could never be created or found). Never
 *   offer to create a note for it.
 * - `existing`: a note with that title exists. A self-link (the match is `currentId`) also gives
 *   `existing` with the current id; the caller decides what to do.
 * - `missing`: no such note; `title` is the display text (the trimmed target's title) to create it
 *   with.
 */
export function resolveWikilink(
  index: TitleIndex,
  target: string,
  currentId?: string,
): WikiResolution {
  void currentId; // A self-link resolves like any other match; kept so callers can pass it.
  const title = noteTitle(target);
  if (title === UNTITLED) return { kind: 'invalid' };
  const hit = index.byKey.get(titleKey(title));
  if (hit) return { kind: 'existing', id: hit.id, title: hit.title };
  return { kind: 'missing', title };
}

/** A collapsed or ranged selection in UTF-16 offsets. */
export interface WikiSelection {
  start: number;
  end: number;
}

/** The `[[...` being typed. */
export interface ActiveWikiToken {
  /** Offset of the first `[`. */
  start: number;
  /** Offset just past the text a completion replaces (past an existing `]]` after the caret). */
  end: number;
  /**
   * Text between `[[` and the caret with leading whitespace removed only. Leading space is typing
   * noise ("[[ foo"); trailing space is kept because it is part of what the user typed.
   */
  query: string;
}

function isHigh(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
function isLow(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * The unfinished `[[` the caret is in, or null. Needs a collapsed caret on ONE line with no `[` or
 * `]` between the `[[` and the caret, a `[[` not preceded by another `[`, a caret not inside a
 * surrogate pair, and no excluded range (fenced code, inline code, link destinations) touching
 * the text from `[[` to the caret. The body of the wikilink being edited is not excluded: with the
 * caret inside an existing `[[foo|bar]]`, `end` is the end of that whole link; otherwise `end`
 * extends over a `]]` directly after the caret (so completion never doubles it).
 */
export function activeWikiToken(text: string, selection: WikiSelection): ActiveWikiToken | null {
  const caret = selection.start;
  if (selection.end !== caret || caret < 2 || caret > text.length) return null;
  if (isLow(text.charCodeAt(caret)) && isHigh(text.charCodeAt(caret - 1))) return null;
  let i = caret;
  while (i > 0) {
    const ch = text[i - 1];
    if (ch === '[' || ch === ']' || ch === '\n' || ch === '\r') break;
    i -= 1;
  }
  // text[i - 1] must be the second "[" of "[[".
  if (i < 2 || text[i - 1] !== '[' || text[i - 2] !== '[') return null;
  const start = i - 2;
  if (start > 0 && text[start - 1] === '[') return null;
  let lineStart = start;
  while (lineStart > 0 && text[lineStart - 1] !== '\n' && text[lineStart - 1] !== '\r') {
    lineStart -= 1;
  }
  let lineEnd = caret;
  while (lineEnd < text.length && text[lineEnd] !== '\n' && text[lineEnd] !== '\r') lineEnd += 1;
  const line = text.slice(lineStart, lineEnd);

  let end = caret;
  let ownBody: [number, number] | null = null;
  for (const span of inlineSpans(line)) {
    if (span.kind === 'wiki' && span.start === start - lineStart) {
      end = lineStart + span.end;
      ownBody = [lineStart + span.start + 2, lineStart + span.end - 2];
      break;
    }
  }
  if (ownBody === null && text.startsWith(']]', caret)) end = caret + 2;
  if (end < caret) return null;

  for (const [a, b] of excludedRanges(text)) {
    if (ownBody !== null && a === ownBody[0] && b === ownBody[1]) continue;
    if (a < caret && b > start) return null;
    if (a >= caret) break;
  }
  return { start, end, query: text.slice(start + 2, caret).replace(/^\s+/, '') };
}

/**
 * Replaces `[start, end)` with `[[title]]` and puts the caret right after the `]]`. The title is
 * trimmed first. Rejected (the input text comes back unchanged and `selection` is null) when the
 * title contains `[`, `]` or a line break, is empty after trimming, or is longer than the
 * wikilink limit (`MAX_WIKILINK_LENGTH`), because none of those can be written as a valid link.
 * On success `selection` is a collapsed caret.
 */
export function completeWikiToken(
  text: string,
  token: { start: number; end: number },
  title: string,
): { text: string; selection: WikiSelection | null } {
  const t = title.trim();
  if (t === '' || t.length > MAX_WIKILINK_LENGTH || /[[\]\r\n]/.test(t)) {
    return { text, selection: null };
  }
  const insert = '[[' + t + ']]';
  const pos = token.start + insert.length;
  return {
    text: text.slice(0, token.start) + insert + text.slice(token.end),
    selection: { start: pos, end: pos },
  };
}

/**
 * Titles for the picker, from the index's winners, at most `limit` rows. An empty query gives the
 * most recently edited first (the order of `index.entries`). Otherwise prefix matches first, then
 * substring matches, case-insensitive on the normalised key, each group newest first. The query is
 * normalised like a key (whitespace collapsed, trimmed). Left out: the note `currentId`, and titles
 * containing `[` or `]` (they cannot be written as a link). Untitled notes are not in the index.
 */
export function matchTitles(
  index: TitleIndex,
  query: string,
  limit: number,
  currentId?: string,
): TitleEntry[] {
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const q = titleKey(query);
  const prefix: TitleEntry[] = [];
  const inner: TitleEntry[] = [];
  for (const e of index.entries) {
    if (e.id === currentId || /[[\]]/.test(e.title)) continue;
    if (q === '') prefix.push(e);
    else if (e.key.startsWith(q)) prefix.push(e);
    else if (e.key.indexOf(q) !== -1) inner.push(e);
  }
  return prefix.concat(inner).slice(0, max);
}
