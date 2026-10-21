import { markdownLines, parseListPrefix, type MarkdownRun } from './markdownLines';
import { fenceStates, inlineSpans, splitLines } from './markdownSpans';

/**
 * Block model for the reading view: one block per SOURCE line of a Body, so a tap can be mapped
 * back to an offset. Pure and UI-free. Built on the editor tokenizer (`markdownLines`), so the
 * reading view and the editor agree on what each line is.
 */

/** What the renderer should draw for a line. */
export type BlockKind =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'numbered'
  | 'checkbox'
  | 'quote'
  | 'rule'
  | 'fence'
  | 'codeLine'
  | 'image'
  | 'paragraph'
  | 'blank';

export interface MarkdownBlock {
  kind: BlockKind;
  /** UTF-16 offset in the Body where the line content starts. */
  startOffset: number;
  /** UTF-16 offset where the line content ends (the line terminator is excluded). */
  endOffset: number;
  /** List indent level (leading whitespace width / 2, a tab counting as 2) for list items, else 0. */
  depth: number;
  /** For `checkbox` blocks: true for `[x]` / `[X]`; undefined otherwise. */
  checked?: boolean;
  /** The tokenizer runs of the line, markers included (flagged `marker`) so the renderer can skip them. */
  runs: MarkdownRun[];
  /** For `image` blocks: the alt text (may be empty). */
  alt?: string;
  /** For `image` blocks: the raw URL, not yet checked with `safeImageUrl`. */
  url?: string;
}

function indentWidth(indent: string): number {
  let w = 0;
  for (const ch of indent) w += ch === '\t' ? 2 : 1;
  return w;
}

/** The own-line image of a trimmed line (exactly one `![alt](url)`), or null. */
function ownLineImage(line: string): { alt: string; url: string } | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  const first = inlineSpans(trimmed)[0];
  if (!first || first.kind !== 'image' || first.start !== 0 || first.end !== trimmed.length) {
    return null;
  }
  return { alt: trimmed.slice(first.textStart, first.textEnd), url: first.url };
}

/** Splits a Body into one block per source line (always at least one). */
export function markdownBlocks(body: string): MarkdownBlock[] {
  const slices = splitLines(body);
  const tokens = markdownLines(body);
  const states = fenceStates(slices.map((s) => s.text));
  return slices.map((slice, i) => {
    const token = tokens[i];
    const base = { startOffset: slice.start, endOffset: slice.start + slice.text.length };
    const runs = token.runs;
    switch (token.kind) {
      case 'fence':
        return { kind: 'fence', ...base, depth: 0, runs };
      case 'code':
        return { kind: 'codeLine', ...base, depth: 0, runs };
      case 'heading1':
      case 'heading2':
      case 'heading3':
      case 'rule':
      case 'quote':
        return { kind: token.kind, ...base, depth: 0, runs };
      case 'bullet':
      case 'numbered':
      case 'checkbox': {
        const prefix = parseListPrefix(slice.text, token.kind);
        const depth = prefix ? Math.floor(indentWidth(prefix.indent) / 2) : 0;
        const block: MarkdownBlock = { kind: token.kind, ...base, depth, runs };
        if (token.kind === 'checkbox') block.checked = token.checked === true;
        return block;
      }
      default: {
        if (states[i] === null) {
          const img = ownLineImage(slice.text);
          if (img) return { kind: 'image', ...base, depth: 0, runs, alt: img.alt, url: img.url };
        }
        const kind = slice.text.trim() === '' ? 'blank' : 'paragraph';
        return { kind, ...base, depth: 0, runs };
      }
    }
  });
}
