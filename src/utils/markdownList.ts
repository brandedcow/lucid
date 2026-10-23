import {
  INDENT_UNIT,
  removeIndentUnit,
  splitLines,
  type EditResult,
  type LineInfo,
  type Sel,
} from './markdownEdit';
import {
  markdownLineKinds,
  parseListPrefix,
  type LineKind,
  type ListPrefix,
} from './markdownLines';

/**
 * Pure list transforms for the note editor's list controls: indent / outdent, move up / down,
 * change list type and renumbering. No React. Every function returns an `EditResult` or null
 * (null = not applicable, which drives a disabled control), never throws, and uses UTF-16 offsets.
 * Each line keeps its own line ending (LF, CRLF or CR); only line content ever moves.
 */

export type ListKind = 'bullet' | 'numbered' | 'checkbox';
export type ListActions = {
  /** True when a line touched by the selection is a list item. */
  onList: boolean;
  /** The kind shared by the touched list items; 'mixed' when they differ; null when none is a list item. */
  kind: ListKind | 'mixed' | null;
  canIndent: boolean;
  canOutdent: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

type Doc = {
  text: string;
  lines: LineInfo[];
  kinds: LineKind[];
  prefixes: (ListPrefix | null)[];
};

/** `soft`: a position at the very start of the replaced range stays there (renumbering). */
type Edit = { at: number; removed: number; text: string; soft?: boolean };

function analyze(text: string): Doc {
  const lines = splitLines(text);
  const kinds = markdownLineKinds(text);
  return {
    text,
    lines,
    kinds,
    prefixes: lines.map((l, i) => parseListPrefix(l.text, kinds[i])),
  };
}

/** Indent width as the reading view counts it: a tab is 2 columns, anything else 1. */
function indentWidth(indent: string): number {
  let w = 0;
  for (const ch of indent) w += ch === '\t' ? 2 : 1;
  return w;
}

function normalize(text: string, sel: Sel): Sel | null {
  if (!Number.isFinite(sel.start) || !Number.isFinite(sel.end)) return null;
  const a = Math.min(Math.max(Math.trunc(sel.start), 0), text.length);
  const b = Math.min(Math.max(Math.trunc(sel.end), 0), text.length);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** Indexes of the lines the selection touches (same rule as `indentLines`). */
function touchedLines(doc: Doc, sel: Sel): number[] {
  const out: number[] = [];
  const collapsed = sel.start === sel.end;
  for (const [i, l] of doc.lines.entries()) {
    const lineEnd = l.end + l.eol.length;
    if (collapsed) {
      if (sel.start >= l.start && (sel.start < lineEnd || l.eol === '')) out.push(i);
    } else if (sel.start < lineEnd && sel.end > l.start) {
      out.push(i);
    }
    if (l.start > sel.end) break;
  }
  return out;
}

const isFenced = (k: LineKind) => k === 'fence' || k === 'code';

/** Lines the type and indent controls leave alone: headings, quotes, rules and fenced lines. */
const SKIP_TYPE = (k: LineKind) =>
  k === 'heading1' ||
  k === 'heading2' ||
  k === 'heading3' ||
  k === 'quote' ||
  k === 'rule' ||
  isFenced(k);
const isBlank = (l: LineInfo) => l.text.trim() === '';

/**
 * Applies non-overlapping `edits` (ascending) and maps `sel` through them. An endpoint inside a
 * replaced range goes to the end of its replacement; an endpoint at or after the end of a range
 * shifts by its length change.
 */
function applyEdits(text: string, sel: Sel, edits: Edit[]): EditResult {
  const sorted = [...edits].sort((x, y) => x.at - y.at);
  const parts: string[] = [];
  let last = 0;
  for (const e of sorted) {
    parts.push(text.slice(last, e.at), e.text);
    last = e.at + e.removed;
  }
  parts.push(text.slice(last));
  const map = (pos: number) => {
    let shift = 0;
    for (const e of sorted) {
      if (pos < e.at || (e.soft && pos === e.at)) break;
      if (pos >= e.at + e.removed) {
        shift += e.text.length - e.removed;
      } else {
        return e.at + shift + e.text.length;
      }
    }
    return pos + shift;
  };
  return { text: parts.join(''), selection: { start: map(sel.start), end: map(sel.end) } };
}

/* ---------------------------------------------------------------- numbered runs */

type NumRun = { head: number; start: number; members: number[] };

/**
 * The runs of numbered siblings. A run is the numbered items at one indent width; deeper items do
 * not end it; a blank or non-list line, a shallower list line, or a non-numbered list item at the
 * same indent does. One pass, O(n).
 */
function numberedRuns(doc: Doc): NumRun[] {
  const runs: NumRun[] = [];
  const stack: { width: number; run: NumRun | null }[] = [];
  for (const [i, p] of doc.prefixes.entries()) {
    if (!p) {
      stack.length = 0;
      continue;
    }
    const w = indentWidth(p.indent);
    while (stack.length > 0 && stack[stack.length - 1].width > w) stack.pop();
    let entry = stack[stack.length - 1];
    if (!entry || entry.width !== w) {
      entry = { width: w, run: null };
      stack.push(entry);
    }
    if (p.kind === 'numbered') {
      if (!entry.run) {
        entry.run = { head: i, start: p.number!, members: [] };
        runs.push(entry.run);
      }
      entry.run.members.push(i);
    } else {
      entry.run = null;
    }
  }
  return runs;
}

function renumberEdits(
  doc: Doc,
  runs: NumRun[],
  touched: ReadonlySet<number>,
  startFor: (run: NumRun) => number,
): Edit[] {
  const edits: Edit[] = [];
  for (const run of runs) {
    if (!run.members.some((m) => touched.has(m))) continue;
    const start = startFor(run);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(start + run.members.length)) continue;
    for (const [k, m] of run.members.entries()) {
      const p = doc.prefixes[m]!;
      if (p.number === start + k) continue;
      edits.push({
        at: doc.lines[m].start + p.indent.length,
        removed: p.marker.indexOf('.'),
        text: String(start + k),
        soft: true,
      });
    }
  }
  return edits;
}

/**
 * Renumbers the numbered runs that contain any of the `touched` line indexes: sequential from the
 * run's first number. Runs without a touched line are never rewritten. Null when nothing changes.
 */
export function renumber(text: string, sel: Sel, touched: readonly number[]): EditResult | null {
  const s = normalize(text, sel);
  if (!s) return null;
  const doc = analyze(text);
  const edits = renumberEdits(doc, numberedRuns(doc), new Set(touched), (r) => r.start);
  return edits.length === 0 ? null : applyEdits(text, s, edits);
}

/**
 * Renumbers after a transform that kept the line count. Touched runs are those of the changed
 * lines in the old text and in the new one. A run whose first line is the same line slot as before
 * keeps its old start number (so moving an item to the top of a run does not change where it
 * starts). A run with a new first line starts at that line's own number after a move
 * (`freshHead: 'own'`), and at 1 after indent / type changes (`'one'`: a nested list created by
 * indent, or the tail after an item toggled off, restarts; there the old head must also have the
 * same indent width to count as unchanged).
 */
function withRenumber(
  before: Doc,
  after: EditResult,
  changed: readonly number[],
  freshHead: 'own' | 'one',
): EditResult {
  const next = analyze(after.text);
  if (next.lines.length !== before.lines.length) return after;
  const oldRuns = numberedRuns(before);
  const touched = new Set(changed);
  const oldStart = new Map<number, { start: number; width: number }>();
  for (const run of oldRuns) {
    oldStart.set(run.head, {
      start: run.start,
      width: indentWidth(before.prefixes[run.head]!.indent),
    });
    if (run.members.some((m) => touched.has(m))) for (const m of run.members) touched.add(m);
  }
  const edits = renumberEdits(next, numberedRuns(next), touched, (r) => {
    const old = oldStart.get(r.head);
    if (freshHead === 'own') return old ? old.start : r.start;
    const width = indentWidth(next.prefixes[r.head]!.indent);
    return old && old.width === width ? old.start : 1;
  });
  return edits.length === 0 ? after : applyEdits(after.text, after.selection, edits);
}

/* ---------------------------------------------------------------- indent / outdent */

/** Touched lines a type or indent change applies to: not fenced; blank lines only for a caret. */
function eligibleLines(doc: Doc, sel: Sel, skip: (k: LineKind) => boolean): number[] {
  const collapsed = sel.start === sel.end;
  return touchedLines(doc, sel).filter(
    (i) => !skip(doc.kinds[i]) && (collapsed || !isBlank(doc.lines[i])),
  );
}

function planIndent(
  doc: Doc,
  sel: Sel,
  outdent: boolean,
): { edits: Edit[]; changed: number[] } | null {
  const edits: Edit[] = [];
  const changed: number[] = [];
  for (const i of eligibleLines(doc, sel, SKIP_TYPE)) {
    const l = doc.lines[i];
    if (!outdent) {
      edits.push({ at: l.start, removed: 0, text: INDENT_UNIT });
    } else {
      const removed = l.text.length - removeIndentUnit(l.text).length;
      if (removed === 0) continue;
      edits.push({ at: l.start, removed, text: '' });
    }
    changed.push(i);
  }
  return edits.length === 0 ? null : { edits, changed };
}

/**
 * Indents (or outdents) the line(s) touched by the selection by one level, without their
 * sub-items. Works on list items, paragraphs and (for a caret only) blank lines; headings, quotes,
 * rules and fenced lines are skipped; no depth limit. Null at indent 0 for outdent, or when no
 * line applies. Renumbers the numbered runs it
 * touches.
 */
export function indentItem(text: string, sel: Sel, outdent = false): EditResult | null {
  const s = normalize(text, sel);
  if (!s) return null;
  const doc = analyze(text);
  const plan = planIndent(doc, s, outdent);
  if (!plan) return null;
  return withRenumber(doc, applyEdits(text, s, plan.edits), plan.changed, 'one');
}

/* ---------------------------------------------------------------- move */

function planMove(
  doc: Doc,
  sel: Sel,
  dir: 'up' | 'down',
): { item: number; a: number; b: number } | null {
  const touched = touchedLines(doc, sel);
  if (touched.length !== 1) return null;
  const i = touched[0];
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= doc.lines.length) return null;
  if (!doc.prefixes[i] || !doc.prefixes[j]) return null;
  return { item: i, a: Math.min(i, j), b: Math.max(i, j) };
}

/**
 * Moves the list item line at the selection one line up or down, swapping with the neighbour
 * when that is also a list line (sub-items stay where they are). The text keeps its length and
 * every line ending stays in its slot. The selection moves with the item, keeping its offset in
 * the line. Null for a selection over several lines, at the first / last line, or next to a
 * non-list line. Renumbers the numbered runs it touches.
 */
export function moveItem(text: string, sel: Sel, dir: 'up' | 'down'): EditResult | null {
  const s = normalize(text, sel);
  if (!s) return null;
  const doc = analyze(text);
  const plan = planMove(doc, s, dir);
  if (!plan) return null;
  const upper = doc.lines[plan.a];
  const lower = doc.lines[plan.b];
  const item = doc.lines[plan.item];
  // Where the item's text lands. The selection touches only the item, so only it is mapped; an
  // endpoint past the end of the item's text (in its line ending, or at the start of the next
  // line when a range ends the touched line) goes to the end of the moved text.
  const newStart =
    plan.item === plan.a ? upper.start + lower.text.length + upper.eol.length : upper.start;
  const map = (pos: number) => newStart + Math.min(Math.max(pos - item.start, 0), item.text.length);
  const moved =
    text.slice(0, upper.start) +
    lower.text +
    upper.eol +
    upper.text +
    text.slice(upper.end + upper.eol.length + lower.text.length);
  return withRenumber(
    doc,
    { text: moved, selection: { start: map(s.start), end: map(s.end) } },
    [plan.a, plan.b],
    'own',
  );
}

/* ---------------------------------------------------------------- list type */

function newMarker(kind: ListKind, p: ListPrefix | null): string {
  const bullet = p?.bullet ?? '-';
  if (kind === 'bullet') return `${bullet} `;
  if (kind === 'checkbox') return `${bullet} [ ] `;
  return '1. ';
}

function planType(doc: Doc, sel: Sel, kind: ListKind): { edits: Edit[]; changed: number[] } | null {
  const lines = eligibleLines(doc, sel, SKIP_TYPE);
  if (lines.length === 0) return null;
  const off = lines.every((i) => doc.prefixes[i]?.kind === kind);
  const edits: Edit[] = [];
  const changed: number[] = [];
  for (const i of lines) {
    const p = doc.prefixes[i];
    const l = doc.lines[i];
    if (off) {
      edits.push({ at: l.start + p!.indent.length, removed: p!.marker.length, text: '' });
    } else if (p?.kind !== kind) {
      const indentLen = p ? p.indent.length : l.text.match(/^\s*/)![0].length;
      edits.push({
        at: l.start + indentLen,
        removed: p ? p.marker.length : 0,
        text: newMarker(kind, p),
      });
    } else {
      continue;
    }
    changed.push(i);
  }
  return edits.length === 0 ? null : { edits, changed };
}

/**
 * Sets the list type of the line(s) touched by the selection (blank lines only for a caret).
 * Indent is kept; a plain line gains a marker; checkbox -> bullet / numbered drops the checked
 * state; any item -> checkbox gives '- [ ] '. If every applicable line already has `kind`, the
 * marker is removed instead (toggle). Headings, quotes, rules and fenced lines are skipped; null
 * when nothing applies. Renumbers the numbered runs it touches.
 */
export function setListType(text: string, sel: Sel, kind: ListKind): EditResult | null {
  const s = normalize(text, sel);
  if (!s) return null;
  const doc = analyze(text);
  const plan = planType(doc, s, kind);
  if (!plan) return null;
  return withRenumber(doc, applyEdits(text, s, plan.edits), plan.changed, 'one');
}

/* ---------------------------------------------------------------- button states */

/** What the list controls should show for the selection, derived by planning without applying. */
export function listActions(text: string, sel: Sel): ListActions {
  const none: ListActions = {
    onList: false,
    kind: null,
    canIndent: false,
    canOutdent: false,
    canMoveUp: false,
    canMoveDown: false,
  };
  const s = normalize(text, sel);
  if (!s) return none;
  const doc = analyze(text);
  const kinds = new Set<ListKind>();
  for (const i of touchedLines(doc, s)) {
    const p = doc.prefixes[i];
    if (p) kinds.add(p.kind);
  }
  return {
    onList: kinds.size > 0,
    kind: kinds.size === 0 ? null : kinds.size === 1 ? [...kinds][0] : 'mixed',
    canIndent: planIndent(doc, s, false) !== null,
    canOutdent: planIndent(doc, s, true) !== null,
    canMoveUp: planMove(doc, s, 'up') !== null,
    canMoveDown: planMove(doc, s, 'down') !== null,
  };
}
