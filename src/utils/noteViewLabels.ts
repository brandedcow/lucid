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

/** The text shown when a view has no notes. */
export function emptyText(view: NoteView): string {
  switch (view.kind) {
    case 'all':
      return 'No notes yet. Tap + to write one.';
    case 'today':
      return 'Nothing written today.';
    case 'todo':
      return 'No notes with checkboxes.';
    case 'untagged':
      return 'No untagged notes.';
    case 'pinned':
      return 'No pinned notes.';
    case 'tag':
      return `No notes with #${view.tag}.`;
    case 'trash':
      return 'Deleted notes will appear here.';
  }
}

/** Tags by use: count descending, then alphabetical. Does not mutate the input. */
export function tagsByUse(counts: readonly TagCount[]): TagCount[] {
  return [...counts].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
