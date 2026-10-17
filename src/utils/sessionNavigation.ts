import type { EntryType, JournalId } from '../types/entry';
import { kindCopy } from './journals';

/** Text of the confirmation App shows when leaving an edit that has changes. */
export const DISCARD_CHANGES_TITLE = 'Discard changes?';
/** The Dreams wording; use `discardChangesMessage(kind)` for a journal-aware one. */
export const DISCARD_CHANGES_MESSAGE = 'Your changes to this dream will be lost.';
export const discardChangesMessage = (kind: EntryType): string =>
  kindCopy(kind).discardChangesMessage;
export const DISCARD_CHANGES_KEEP = 'Keep editing';
export const DISCARD_CHANGES_DISCARD = 'Discard';

/** The leave prompt on the add-entry page when it holds something typed. */
export const LEAVE_ENTRY_TITLE = 'Save a draft?';
export const LEAVE_ENTRY_MESSAGE = 'Keep what you wrote to finish later, or discard it.';
export const LEAVE_ENTRY_SAVE_DRAFT = 'Save draft';
export const LEAVE_ENTRY_DISCARD = 'Discard';
export const LEAVE_ENTRY_KEEP = 'Keep writing';

/**
 * Where the add-entry page (a new entry, a draft or a stored entry) returns to after a save, a
 * discard or a leave.
 */
export type FlowReturn = 'today' | 'log' | 'search' | 'settings';

export type BackInput = {
  screen: 'add' | 'log' | 'journals' | 'search' | 'today' | 'settings';
  /** log: the open log's journal. */
  journalId: JournalId;
  /** log only: the log's search field is open. */
  searchOpen?: boolean;
  /** add only: this entry's delete is in flight, so Back does nothing. */
  entryDeleting?: boolean;
};

/**
 * Where Back (the on-screen arrow and Android hardware back) goes from a screen.
 * - `exit`: leave the app (Android only; only Today).
 * - `closeSearch`: close the log's search field first.
 * - `today`: the Today page.
 * - `journals`: Journals home (a log, or Search, whose view App also resets).
 * - `none`: ignore Back (the open entry is being deleted).
 * - `chain`: the add-entry page keeps its own rules (App's `backFromAdd`: the leave prompts, a
 *   running recording's discard confirm, and No dream on an empty launch page).
 */
export type BackTarget =
  | { to: 'exit' }
  | { to: 'closeSearch' }
  | { to: 'today' }
  | { to: 'journals' }
  | { to: 'chain' }
  | { to: 'none' };

export function backTarget(input: BackInput): BackTarget {
  switch (input.screen) {
    case 'today':
      return { to: 'exit' };
    case 'settings':
    case 'journals':
      return { to: 'today' };
    case 'log':
      return input.searchOpen ? { to: 'closeSearch' } : { to: 'journals' };
    case 'search':
      return { to: 'journals' };
    case 'add':
      return input.entryDeleting ? { to: 'none' } : { to: 'chain' };
  }
}
