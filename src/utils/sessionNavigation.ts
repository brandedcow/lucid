import type { Session } from '../hooks/useDreamSession';
import type { EntryType } from '../types/entry';
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
