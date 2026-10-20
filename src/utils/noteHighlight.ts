import { scanTags } from './inlineTags';
import { fold, ParsedQuery } from './noteSearch';

/** A half-open range `[start, end)` of UTF-16 offsets in the original string. */
export type Range = readonly [number, number];

export type TextPart = { text: string; match: boolean };

type Folded = {
  /** The folded text: the concatenation of `fold()` of every code point. */
  text: string;
  /** For each UTF-16 unit of `text`, the original offset where its code point starts. */
  starts: number[];
  /** For each UTF-16 unit of `text`, the original offset just past its code point. */
  ends: number[];
};

/**
 * Folds `text` one code point at a time (same `fold()` as `searchResults`, including its guarded
 * fallback when `String.prototype.normalize` is missing) and remembers which original code point
 * each folded unit came from. Folding can change length (`İ`, precomposed accents, Hangul, a
 * combining mark folds to nothing), so folded offsets must never be used on the original string.
 */
function foldWithMap(text: string): Folded {
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  let lastFirstUnit = 0;
  for (const ch of Array.from(text)) {
    const f = fold(ch);
    if (f === '') {
      // A combining mark folds to nothing: it belongs to the character before it, so a hit on
      // that character covers the mark too (never splits "e" from its accent).
      for (let i = lastFirstUnit; i < ends.length; i += 1) ends[i] = offset + ch.length;
      offset += ch.length;
      continue;
    }
    lastFirstUnit = starts.length;
    for (let i = 0; i < f.length; i += 1) {
      starts.push(offset);
      ends.push(offset + ch.length);
    }
    folded += f;
    offset += ch.length;
  }
  return { text: folded, starts, ends };
}

/** Every occurrence (overlaps included) of `needle` in `folded`, as original ranges. */
function occurrences(folded: Folded, needle: string): Range[] {
  const out: Range[] = [];
  if (needle === '') return out;
  let from = 0;
  for (;;) {
    const at = folded.text.indexOf(needle, from);
    if (at === -1) return out;
    out.push([folded.starts[at], folded.ends[at + needle.length - 1]]);
    from = at + 1;
  }
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/**
 * The parts of `text` that matched the query, as merged, sorted `[start, end)` ranges over the
 * original string, each covering whole original characters. Words match anywhere (folded: case and
 * accents ignored, as in `searchResults`); a tag term matches the start of a tag token ("#" plus
 * the typed prefix). A word that folds to nothing (a lone combining mark) highlights nothing.
 */
export function highlightRanges(text: string, parsed: ParsedQuery): Range[] {
  if (text === '' || (parsed.words.length === 0 && parsed.tagTerms.length === 0)) return [];
  const ranges: Range[] = [];
  if (parsed.words.length > 0) {
    const folded = foldWithMap(text);
    for (const word of parsed.words) {
      // A loop, not push(...): spreading a huge match list overflows the call stack.
      for (const r of occurrences(folded, fold(word))) ranges.push(r);
    }
  }
  if (parsed.tagTerms.length > 0) {
    const terms = parsed.tagTerms.map(fold).filter((t) => t !== '');
    for (const m of scanTags(text)) {
      const bodyStart = m.start + 1;
      const folded = foldWithMap(text.slice(bodyStart, m.end));
      for (const term of terms) {
        if (!folded.text.startsWith(term)) continue;
        ranges.push([m.start, bodyStart + folded.ends[term.length - 1]]);
      }
    }
  }
  return mergeRanges(ranges);
}

/** Splits `text` into alternating plain and matched parts. No empty parts; '' gives []. */
export function splitByRanges(text: string, ranges: readonly Range[]): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (s > at) parts.push({ text: text.slice(at, s), match: false });
    if (e > s) parts.push({ text: text.slice(s, e), match: true });
    at = Math.max(at, e);
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false });
  return parts;
}

/** `splitByRanges(text, highlightRanges(text, parsed))`. */
export function highlightParts(text: string, parsed: ParsedQuery): TextPart[] {
  return splitByRanges(text, highlightRanges(text, parsed));
}
