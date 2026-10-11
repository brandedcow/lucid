import type { Session } from '../hooks/useDreamSession';
import { DREAMS_JOURNAL, type EntryType, type JournalId } from '../types/entry';
import { journalCopy } from './journals';

/** True when leaving would lose a recording or text the user has not saved anywhere. */
export function hasAtStake(session: Session): boolean {
  return !!session.audio || session.transcript.trim().length > 0;
}

/** True when saving a draft would keep something: audio, text, a title, an emotion (or emotion text being typed) or any tag. */
export function hasSomethingToKeep(session: Session): boolean {
  return (
    hasAtStake(session) ||
    session.title.trim().length > 0 ||
    session.emotion.trim().length > 0 ||
    session.emotionDraft.trim().length > 0 ||
    session.tags.length > 0 ||
    session.tagDraft.trim().length > 0
  );
}

/**
 * True when an 'edit' session differs from the dream as it was opened: title, transcript and
 * emotion (each trimmed, case kept), tags (an ordered array, so reordering counts), or emotion or
 * tag text typed but not confirmed. False when there is no baseline.
 */
export function hasEdits(session: Session): boolean {
  const { baseline } = session;
  if (!baseline) return false;
  if (session.tagDraft.trim().length > 0 || session.emotionDraft.trim().length > 0) return true;
  return (
    session.title.trim() !== baseline.title.trim() ||
    session.transcript.trim() !== baseline.transcript.trim() ||
    session.emotion.trim() !== baseline.emotion.trim() ||
    session.tags.length !== baseline.tags.length ||
    session.tags.some((tag, i) => tag !== baseline.tags[i])
  );
}

/** Text of the confirmation App shows when leaving an edit that has changes. */
export const DISCARD_CHANGES_TITLE = 'Discard changes?';
/** The Dreams wording; use `discardChangesMessage(kind)` for a journal-aware one. */
export const DISCARD_CHANGES_MESSAGE = 'Your changes to this dream will be lost.';
export const discardChangesMessage = (kind: EntryType): string =>
  journalCopy(kind).discardChangesMessage;
export const DISCARD_CHANGES_KEEP = 'Keep editing';
export const DISCARD_CHANGES_DISCARD = 'Discard';

export type ReadItBackBack = 'review' | 'confirmDiscard' | 'capture' | 'list';

/**
 * Where the Read it back back-arrow (and Android back) goes.
 * `fromReview` is true only when the screen was opened with Edit on Review. Read it back reached
 * from an edit session always returns to Review: no confirmation, nothing discarded.
 */
export function readItBackBack(session: Session, fromReview: boolean): ReadItBackBack {
  if (fromReview || session.origin === 'edit') return 'review';
  if (session.origin === 'draft') return 'list';
  return hasAtStake(session) ? 'confirmDiscard' : 'capture';
}

/**
 * Where the Review back-arrow (and Android back) goes. While a save is in flight it goes nowhere,
 * so leaving cannot race the save. 'editBack' leaves an edit: App confirms only when `hasEdits`.
 */
export function reviewBack(
  session: Session,
  saving = false,
): 'blocked' | 'readItBack' | 'draftToList' | 'editBack' {
  if (saving) return 'blocked';
  if (session.origin === 'edit') return 'editBack';
  return session.origin === 'draft' ? 'draftToList' : 'readItBack';
}

export type BackInput = {
  screen: 'capture' | 'readItBack' | 'review' | 'log' | 'detail' | 'journals' | 'search';
  /**
   * capture: the journal being captured. log: the open log's journal. detail: the journal of the
   * open entry (read with `journalOf`).
   */
  journalId: JournalId;
  /** log only: the log's search field is open. */
  searchOpen?: boolean;
  /** capture only: a recording is running (or being finished). */
  captureBusy?: boolean;
  /** detail only: where the entry was opened from. */
  detailFrom?: 'log' | 'search';
  /** detail only: a delete started from this entry is in flight. */
  detailDeleting?: boolean;
};

/**
 * Where Back (the on-screen arrow and Android hardware back) goes from a screen.
 * - `exit`: leave the app (Android only; Dreams capture and Journals home have no arrow).
 * - `none`: Back does nothing (a recording is running on Life capture, or an entry's delete runs).
 * - `closeSearch`: close the log's search field first.
 * - `journals`: Journals home (a log, or Search, whose view App also resets).
 * - `search`: the Search results, state kept.
 * - `log`: that journal's log.
 * - `chain`: Read it back and Review keep their own rules (`readItBackBack`, `reviewBack`).
 */
export type BackTarget =
  | { to: 'exit' }
  | { to: 'none' }
  | { to: 'closeSearch' }
  | { to: 'journals' }
  | { to: 'search' }
  | { to: 'log'; journalId: JournalId }
  | { to: 'chain' };

export function backTarget(input: BackInput): BackTarget {
  switch (input.screen) {
    case 'capture':
      if (input.journalId === DREAMS_JOURNAL) return { to: 'exit' };
      return input.captureBusy ? { to: 'none' } : { to: 'log', journalId: input.journalId };
    case 'journals':
      return { to: 'exit' };
    case 'log':
      return input.searchOpen ? { to: 'closeSearch' } : { to: 'journals' };
    case 'search':
      return { to: 'journals' };
    case 'detail':
      if (input.detailDeleting) return { to: 'none' };
      return input.detailFrom === 'search'
        ? { to: 'search' }
        : { to: 'log', journalId: input.journalId };
    case 'readItBack':
    case 'review':
      return { to: 'chain' };
  }
}
