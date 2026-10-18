import type { EntryType } from '../types/entry';
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

export type LeaveInput = {
  /** How the open session began: a new entry, a stored draft, or an edit of a stored entry. */
  origin: 'new' | 'draft' | 'edit';
  /** Something is typed, recorded or attached (`entryHasContent`). */
  hasContent: boolean;
  /** An edit differs from what was opened (`entryHasEdits`). */
  hasEdits: boolean;
  /** A stored recording was closed and not yet removed (`hasPendingAudioRemoval`). */
  pendingAudioRemoval: boolean;
  /** The page's recorder is starting or running. */
  recording: boolean;
  /** A save is in flight. */
  saving: boolean;
  /** The open entry is being deleted. */
  deleting: boolean;
};

/** The left-edge zone (points) where the app's own back swipe may start on a page that asks. */
export const BACK_EDGE_ZONE = 20;
/** How far (points) that swipe must travel to open the prompt. */
export const BACK_EDGE_DISTANCE = 40;
/** Or how fast (points per ms) it must be moving on release. */
export const BACK_EDGE_VELOCITY = 0.5;

/** Whether a moving touch is the back edge swipe: started in the edge zone, mostly horizontal. */
export function startsBackEdgeSwipe(g: { x0: number; dx: number; dy: number }): boolean {
  return g.x0 <= BACK_EDGE_ZONE && g.dx > 10 && g.dx > Math.abs(g.dy) * 2;
}

/** Whether a released back edge swipe went far or fast enough to open the prompt. */
export function completesBackEdgeSwipe(g: { dx: number; vx: number }): boolean {
  return g.dx >= BACK_EDGE_DISTANCE || g.vx >= BACK_EDGE_VELOCITY;
}

/**
 * True when Back on the add-entry page would leave at once, with no prompt, no recording discard
 * confirm and no ignored press. The Add route does not prevent removal then (the system pops it
 * and the leave's side effects run from a listener) and the native iOS swipe is on; otherwise every
 * removal goes to `backFromAdd` and the native swipe is off (the back edge swipe replaces it).
 * Mirrors the branches of App's `backFromAdd`; keep the two in step.
 */
export function leavesWithoutPrompt(input: LeaveInput): boolean {
  if (input.recording || input.saving || input.deleting) return false;
  if (input.origin === 'edit') return !input.hasEdits;
  return !input.hasContent && !input.pendingAudioRemoval;
}

export type BackInput = {
  screen: 'add' | 'today';
  /** add only: this entry's delete is in flight, so Back does nothing. */
  entryDeleting?: boolean;
};

/**
 * Where Back (the on-screen arrow and Android hardware back) goes from a screen. (A log, Search and
 * Settings are routes: the navigator pops them.)
 * - `exit`: leave the app (Android only; only Today).
 * - `none`: ignore Back (the open entry is being deleted).
 * - `chain`: the add-entry page keeps its own rules (App's `backFromAdd`: the leave prompts, a
 *   running recording's discard confirm, and No dream on an empty launch page).
 */
export type BackTarget = { to: 'exit' } | { to: 'chain' } | { to: 'none' };

export function backTarget(input: BackInput): BackTarget {
  switch (input.screen) {
    case 'today':
      return { to: 'exit' };
    case 'add':
      return input.entryDeleting ? { to: 'none' } : { to: 'chain' };
  }
}
