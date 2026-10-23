import { markdownLineKinds, parseListPrefix, type LineKind } from './markdownLines';

/**
 * Pure markdown edit helpers for the note editor: list continuation on Enter, checkbox toggle and
 * list indent/outdent. No React. All offsets are UTF-16 code units. Lines end at "\n", "\r\n" or
 * "\r"; an existing line ending is preserved.
 */

export type Sel = { start: number; end: number };
export type EditResult = { text: string; selection: Sel };
export type LineInfo = { start: number; end: number; text: string; eol: string };

export const INDENT_UNIT = '  ';

export function splitLines(text: string): LineInfo[] {
  const out: LineInfo[] = [];
  const re = /\r\n|\n|\r/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: last, end: m.index, text: text.slice(last, m.index), eol: m[0] });
    last = m.index + m[0].length;
  }
  out.push({ start: last, end: text.length, text: text.slice(last), eol: '' });
  return out;
}

/** The line containing `offset` (`end` excludes the line ending). An offset inside a "\r\n" belongs to its line. */
export function lineAt(text: string, offset: number): LineInfo {
  const lines = splitLines(text);
  for (const l of lines) {
    if (offset < l.end + l.eol.length) return l;
  }
  return lines[lines.length - 1];
}

/** The kind of `line` (a line of `text` from `splitLines` / `lineAt`). */
function kindAtLine(text: string, line: LineInfo): LineKind {
  const kinds = markdownLineKinds(text);
  const index = splitLines(text).findIndex((l) => l.start === line.start);
  return kinds[index];
}

const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;

export function removeIndentUnit(indent: string): string {
  if (indent.startsWith('\t')) return indent.slice(1);
  let n = 0;
  while (n < 2 && indent[n] === ' ') n += 1;
  return indent.slice(n);
}

/**
 * Called after the user typed Enter. `next` must be `prev` with exactly one "\n" inserted (at
 * `caretBefore` when that is consistent, otherwise at the diff position). Returns the continued
 * list, or null to leave the plain newline alone.
 */
export function continueList(prev: string, next: string, caretBefore?: number): EditResult | null {
  if (next.length !== prev.length + 1) return null;
  let c: number;
  if (
    caretBefore !== undefined &&
    Number.isInteger(caretBefore) &&
    caretBefore >= 0 &&
    caretBefore <= prev.length &&
    prev.slice(0, caretBefore) + '\n' + prev.slice(caretBefore) === next
  ) {
    c = caretBefore;
  } else {
    let head = 0;
    while (head < prev.length && prev[head] === next[head]) head += 1;
    if (next[head] !== '\n' || next.slice(0, head) + next.slice(head + 1) !== prev) return null;
    c = head;
  }
  if (c > 0 && c < prev.length && isLow(prev.charCodeAt(c)) && isHigh(prev.charCodeAt(c - 1))) {
    return null;
  }

  const line = lineAt(prev, c);
  const offset = c - line.start;
  if (offset > line.text.length) return null; // inside a "\r\n"
  const p = parseListPrefix(line.text, kindAtLine(prev, line));
  if (!p) return null;
  if (offset < p.length) return null; // newline above the item stays plain
  if (p.kind === 'numbered' && !Number.isSafeInteger(p.number! + 1)) return null;

  const eol = prev.includes('\r\n') ? '\r\n' : '\n';
  const rest = line.text.slice(p.length);

  if (c === line.end && rest.trim() === '') {
    // Empty item: no newline. Outdent one level, or drop the marker.
    const outdented = removeIndentUnit(p.indent);
    const newLine = outdented !== p.indent ? outdented + line.text.slice(p.indent.length) : '';
    return {
      text: prev.slice(0, line.start) + newLine + prev.slice(line.end),
      selection: { start: line.start + newLine.length, end: line.start + newLine.length },
    };
  }

  let nextMarker: string;
  if (p.kind === 'numbered') nextMarker = `${p.number! + 1}. `;
  else if (p.kind === 'checkbox') nextMarker = `${p.bullet} [ ] `;
  else nextMarker = `${p.bullet} `;
  const insert = eol + p.indent + nextMarker;
  const caret = c + insert.length;
  let base = prev;
  if (p.kind === 'numbered') {
    const renumbered = renumberFollowing(prev, line, p.indent, p.number! + 1);
    if (renumbered === null) return null;
    base = renumbered;
  }
  return {
    text: base.slice(0, c) + insert + base.slice(c),
    selection: { start: caret, end: caret },
  };
}

/**
 * After a new numbered item (number `newNumber - 1`) was added below `line`, renumbers the items
 * that follow it in the same run, one after another from `newNumber + 1`. The run is the following
 * numbered lines with the same indent; deeper lines are skipped untouched, and it ends at a blank
 * line, a non-list line, a bullet or checkbox at the same indent, or a line with a smaller indent.
 * Only digits after `line.end` change, so offsets up to the insertion point stay valid. Null if a
 * number would not be a safe integer.
 */
function renumberFollowing(
  prev: string,
  line: LineInfo,
  indent: string,
  newNumber: number,
): string | null {
  const lines = splitLines(prev);
  const kinds = markdownLineKinds(prev);
  const edits: { at: number; len: number; value: string }[] = [];
  let n = newNumber;
  for (let i = lines.findIndex((l) => l.start === line.start) + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.text.trim() === '') break;
    const q = parseListPrefix(l.text, kinds[i]);
    if (!q || q.indent.length < indent.length) break;
    if (q.indent.length > indent.length) continue;
    if (q.kind !== 'numbered' || q.indent !== indent) break;
    n += 1;
    if (!Number.isSafeInteger(n)) return null;
    edits.push({ at: l.start + q.indent.length, len: q.marker.indexOf('.'), value: String(n) });
  }
  let out = prev;
  for (let k = edits.length - 1; k >= 0; k -= 1) {
    const e = edits[k];
    out = out.slice(0, e.at) + e.value + out.slice(e.at + e.len);
  }
  return out;
}

type TogglePlan = {
  action: 'check' | 'uncheck' | 'add';
  line: LineInfo;
  oldLen: number;
  newPrefix: string;
};

function planToggle(text: string, sel: Sel): TogglePlan | null {
  const line = lineAt(text, sel.start);
  const kind = kindAtLine(text, line);
  if (
    kind === 'heading1' ||
    kind === 'heading2' ||
    kind === 'heading3' ||
    kind === 'quote' ||
    kind === 'rule' ||
    kind === 'fence' ||
    kind === 'code'
  ) {
    return null;
  }
  const p = parseListPrefix(line.text, kind);
  if (p?.kind === 'checkbox') {
    const action = p.checked ? 'uncheck' : 'check';
    const mark = p.checked ? ' ' : 'x';
    return {
      action,
      line,
      oldLen: p.length,
      newPrefix: p.indent + p.marker.replace(/\[[ xX]\]/, `[${mark}]`),
    };
  }
  if (p) {
    // A bullet keeps its own char; numbered items become '- [ ] '.
    const bullet = p.kind === 'bullet' ? p.bullet : '-';
    return { action: 'add', line, oldLen: p.length, newPrefix: `${p.indent}${bullet} [ ] ` };
  }
  const indent = line.text.match(/^\s*/)![0];
  return { action: 'add', line, oldLen: indent.length, newPrefix: `${indent}- [ ] ` };
}

/**
 * Toggles the checkbox on the line containing `offset` (for tapping a box in the reading view).
 * Only an existing checkbox is toggled: null for any other line, including code lines.
 */
export function toggleCheckboxAtLine(text: string, offset: number): EditResult | null {
  const sel = { start: offset, end: offset };
  const plan = planToggle(text, sel);
  if (!plan || plan.action === 'add') return null;
  return applyToggle(text, sel, plan);
}

function applyToggle(text: string, sel: Sel, plan: TogglePlan): EditResult {
  const { line, oldLen, newPrefix } = plan;
  const oldEnd = line.start + oldLen;
  const delta = newPrefix.length - oldLen;
  const map = (pos: number) => {
    if (pos < line.start) return pos;
    // An endpoint inside the old prefix goes to the end of the new one.
    if (pos < oldEnd) return line.start + newPrefix.length;
    return pos + delta;
  };
  return {
    text: text.slice(0, line.start) + newPrefix + text.slice(oldEnd),
    selection: { start: map(sel.start), end: map(sel.end) },
  };
}

/**
 * Where a caret at `caret` in `prev` belongs after `prev` became `next` (an edit by something other
 * than the user's own caret, e.g. an autocorrect). Unlike cursorAfterEdit it keeps a caret that was
 * after the changed region after it: `next` minus `prev` is the span [head, regionEnd) of `prev`
 * (common head, then common suffix limited so they cannot overlap). A caret at or before the head
 * is unchanged, one at or after regionEnd shifts by the length change, one inside the span goes to
 * the end of the new span. Always within `next`, never inside a surrogate pair.
 */
export function mapCaretThroughEdit(prev: string, next: string, caret: number): number {
  const max = Math.min(prev.length, next.length);
  let head = 0;
  while (head < max && prev[head] === next[head]) head += 1;
  let tail = 0;
  while (tail < max - head && prev[prev.length - 1 - tail] === next[next.length - 1 - tail]) {
    tail += 1;
  }
  const regionEnd = prev.length - tail;
  let mapped: number;
  if (caret <= head) mapped = caret;
  else if (caret >= regionEnd) mapped = caret + (next.length - prev.length);
  else mapped = next.length - tail;
  mapped = Math.max(0, Math.min(mapped, next.length));
  if (
    mapped > 0 &&
    mapped < next.length &&
    next.charCodeAt(mapped) >= 0xdc00 &&
    next.charCodeAt(mapped) <= 0xdfff &&
    next.charCodeAt(mapped - 1) >= 0xd800 &&
    next.charCodeAt(mapped - 1) <= 0xdbff
  ) {
    mapped -= 1;
  }
  return mapped;
}
