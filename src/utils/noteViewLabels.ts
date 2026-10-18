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
