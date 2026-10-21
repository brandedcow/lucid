import { markdownLines, parseListPrefix } from './markdownLines';

/**
 * Pure markdown edit helpers for the note editor: list continuation on Enter, checkbox toggle and
 * list indent/outdent. No React. All offsets are UTF-16 code units. Lines end at "\n", "\r\n" or
 * "\r"; an existing line ending is preserved.
 */

export type Sel = { start: number; end: number };
export type EditResult = { text: string; selection: Sel };
export type LineInfo = { start: number; end: number; text: string; eol: string };

const INDENT_UNIT = '  ';

function splitLines(text: string): LineInfo[] {
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

const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;

function removeIndentUnit(indent: string): string {
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
  const p = parseListPrefix(line.text);
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
  return {
    text: prev.slice(0, c) + insert + prev.slice(c),
    selection: { start: caret, end: caret },
  };
}

type TogglePlan = {
  action: 'check' | 'uncheck' | 'add';
  line: LineInfo;
  oldLen: number;
  newPrefix: string;
};

function planToggle(text: string, sel: Sel): TogglePlan | null {
  const line = lineAt(text, sel.start);
  const kind = markdownLines(line.text)[0].kind;
  if (kind === 'heading1' || kind === 'heading2' || kind === 'quote') return null;
  const p = parseListPrefix(line.text);
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

/** What the checkbox toggle would do to the line at `sel.start`. */
export function checkboxAction(text: string, sel: Sel): 'check' | 'uncheck' | 'add' | 'none' {
  return planToggle(text, sel)?.action ?? 'none';
}

/**
 * Toggles the checkbox on the line at `sel.start`: unchecked -> checked -> unchecked; a bullet,
 * numbered or plain line gains an unchecked box. Never removes a checkbox. Null for headings and
 * quotes.
 */
export function toggleCheckbox(text: string, sel: Sel): EditResult | null {
  const plan = planToggle(text, sel);
  if (!plan) return null;
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

/** Indents (or outdents) the list lines touched by the selection by one level (two spaces). */
export function indentLines(text: string, sel: Sel, outdent = false): EditResult | null {
  const lines = splitLines(text);
  const edits: { at: number; removed: number; inserted: number }[] = [];
  for (const l of lines) {
    const lineEnd = l.end + l.eol.length;
    const touches =
      sel.start === sel.end
        ? sel.start >= l.start && (sel.start < lineEnd || lineEnd === text.length)
        : sel.start < lineEnd && sel.end > l.start;
    if (!touches || !parseListPrefix(l.text)) continue;
    if (!outdent) {
      edits.push({ at: l.start, removed: 0, inserted: INDENT_UNIT.length });
    } else {
      const removed = l.text.length - removeIndentUnit(l.text).length;
      if (removed > 0) edits.push({ at: l.start, removed, inserted: 0 });
    }
  }
  if (edits.length === 0) return null;

  let out = '';
  let last = 0;
  for (const e of edits) {
    out += text.slice(last, e.at) + (e.inserted ? INDENT_UNIT : '');
    last = e.at + e.removed;
  }
  out += text.slice(last);

  const map = (pos: number) => {
    let shift = 0;
    for (const e of edits) {
      if (pos >= e.at + e.removed) shift += e.inserted - e.removed;
      else if (pos > e.at) shift += e.at + e.inserted - pos;
    }
    return pos + shift;
  };
  return { text: out, selection: { start: map(sel.start), end: map(sel.end) } };
}
