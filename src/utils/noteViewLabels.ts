import type { TagSortOrder } from '../services/settingsStorage';
import { NoteView, TagCount } from './noteViews';

/** The page title for a view: "All Notes", "Today", "Todo", "Untagged", "Pinned", "#tag". */
export function viewTitle(view: NoteView): string {
  switch (view.kind) {
    case 'all':
      return 'All Notes';
    case 'today':
      return 'Today';
    case 'todo':
      return 'Todo';
    case 'untagged':
      return 'Untagged';
    case 'pinned':
      return 'Pinned';
    case 'tag':
      return `#${view.tag}`;
    case 'trash':
      return 'Recently Deleted';
  }
}

/** Tags by use: count descending, then alphabetical. Does not mutate the input. */
export function tagsByUse(counts: readonly TagCount[]): TagCount[] {
  return [...counts].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Tags in the chosen order: `alpha` (as `tagCounts` returns them) or `count` (`tagsByUse`). Does not mutate the input. */
export function sortTags(tags: readonly TagCount[], order: TagSortOrder): TagCount[] {
  if (order === 'count') return tagsByUse(tags);
  return [...tags].sort(
    (a, b) => a.tag.localeCompare(b.tag) || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0),
  );
}
