export type CaretScrollInput = {
  /** Y of the top of the caret's line, in the scroll content's coordinates. */
  caretTop: number;
  /** Height of one text line. */
  lineHeight: number;
  /** Current scroll offset. */
  scrollY: number;
  /** Visible height of the scroller (already excludes the keyboard and the dock). */
  viewportHeight: number;
  /** Breathing room kept above and below the caret line. */
  margin: number;
};

/**
 * The scroll offset that puts the caret line inside the visible band (a `margin` above and below
 * it), or null when it already is, or when the viewport is not measured yet. Moves as little as
 * possible. If the band is smaller than one line plus the margins, the line's top wins.
 */
export function offsetToRevealCaret(input: CaretScrollInput): number | null {
  const { caretTop, lineHeight, scrollY, viewportHeight, margin } = input;
  if (!(viewportHeight > 0)) return null;
  const top = caretTop - margin;
  const bottom = caretTop + lineHeight + margin;
  if (top < scrollY) return Math.max(0, top);
  if (bottom > scrollY + viewportHeight) return Math.max(0, Math.min(top, bottom - viewportHeight));
  return null;
}

/** Phase 1: the caret is at the end of the text, so its line is the last line of the body. */
export function caretTopAtBodyEnd(body: { y: number; height: number }, lineHeight: number): number {
  return body.y + body.height - lineHeight;
}
