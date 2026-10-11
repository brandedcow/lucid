/** The notes list never shows less than one card plus its gap (a card is 56pt, the gap 8pt). */
export const MIN_CARD_AREA = 64;
/** The notes list is capped at this share of the visible page height. */
export const NOTES_FRACTION = 0.25;
/** The body keeps at least this much height. */
export const BODY_MIN = 96;

/**
 * The height of the voice notes list on the add-entry page.
 *
 * - container: the measured visible height of the page area (it already shrinks with the keyboard).
 * - dateAndTitle: everything that is not notes, panel or body and takes height (date, title, the
 *   container's padding and the gaps between the blocks).
 * - panel: the height of the pinned recording panel (0 when not recording).
 * - naturalNotes: the full content height of all the cards (0 when there are none).
 *
 * The cap is max(MIN_CARD_AREA, 25% of container). It shrinks further, but never below
 * MIN_CARD_AREA, so the body keeps BODY_MIN. A list shorter than the cap (one note) is not capped.
 * An unmeasured container (0 or not finite) returns the natural height, uncapped.
 */
export function layoutBudget({
  container,
  dateAndTitle,
  panel,
  naturalNotes,
}: {
  container: number;
  dateAndTitle: number;
  panel: number;
  naturalNotes: number;
}): number {
  const natural = Number.isFinite(naturalNotes) ? Math.max(0, naturalNotes) : 0;
  if (!Number.isFinite(container) || container <= 0) return natural;
  const cap = Math.max(MIN_CARD_AREA, Math.round(NOTES_FRACTION * container));
  const room = container - Math.max(0, dateAndTitle) - Math.max(0, panel) - BODY_MIN;
  const allowed = Math.max(MIN_CARD_AREA, Math.min(cap, room));
  return Math.min(natural, allowed);
}
