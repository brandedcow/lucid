export const MAX_TAG_SUGGESTIONS = 8;

/**
 * Suggestions for the "#query" being typed. Two sources, both already in inline form:
 * - `stored`: every tag of the stored notes, most used first;
 * - `current`: the tags elsewhere in the note being written, by first appearance (the caller
 *   leaves out the word under the cursor).
 * Ranking is deterministic: prefix matches first, then substring matches; inside each of those,
 * stored tags (in the order given), then tags only the current note has (in the order given).
 * Duplicates appear once. An empty query offers everything (up to `max`). An exact match of the
 * query is offered like any other (completing it adds the trailing space).
 */
export function suggestTags(
  stored: readonly string[],
  current: readonly string[],
  query: string,
  max: number = MAX_TAG_SUGGESTIONS,
): string[] {
  const q = query.toLowerCase();
  const all = [...new Set([...stored, ...current])];
  const prefix = all.filter((t) => t.startsWith(q));
  const inner = q ? all.filter((t) => !t.startsWith(q) && t.includes(q)) : [];
  return [...prefix, ...inner].slice(0, max);
}
