import { MAX_TAG_LENGTH } from './inlineTags';

export const MAX_TAG_SUGGESTIONS = 8;

export interface TagSuggestions {
  /** Existing tags to offer: prefix matches first, then substring matches, in the order given. */
  matches: string[];
  /** The typed text, shown as a `Create #typed` hint, or null when it is empty, already an existing tag, or cannot be a tag. */
  create: string | null;
}

/**
 * Suggestions for the "#query" being typed. `known` is every existing tag, most used first; that
 * order is kept inside each group. An empty query offers everything (up to the cap). An exact match
 * of the query is offered like any other (completing it adds the trailing space) and no create
 * hint is shown for it. A query of only digits or over 40 characters is not a tag, so no hint.
 */
export function suggestTags(
  known: readonly string[],
  query: string,
  max: number = MAX_TAG_SUGGESTIONS,
): TagSuggestions {
  const q = query.toLowerCase();
  const unique = [...new Set(known)];
  const prefix = unique.filter((t) => t.startsWith(q));
  const inner = q ? unique.filter((t) => !t.startsWith(q) && t.includes(q)) : [];
  const matches = [...prefix, ...inner].slice(0, max);
  const validNew =
    q.length > 0 &&
    Array.from(q).length <= MAX_TAG_LENGTH &&
    !/^[0-9]+$/.test(q) &&
    !unique.includes(q);
  return { matches, create: validNew ? q : null };
}
