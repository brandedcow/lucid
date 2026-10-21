import { fenceStates, splitLines } from './markdownSpans';

const CHECKBOX_LINE = /^\s*[-*] \[[ xX]\]/;

/**
 * True when any line of the body is a markdown checkbox (`- [ ]`, `- [x]`, also with `*`). A
 * checkbox inside a fenced code block is code, not a Todo.
 */
export function hasTodo(body: string): boolean {
  const lines = splitLines(body).map((l) => l.text);
  // Fences need a backtick run; skip the pre-pass for the common case.
  const states = body.indexOf('```') === -1 ? null : fenceStates(lines);
  return lines.some(
    (line, i) => (states === null || states[i] === null) && CHECKBOX_LINE.test(line),
  );
}
