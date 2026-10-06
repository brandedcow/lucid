import type { Session } from '../hooks/useDreamSession';

/** True when leaving would lose a recording or text the user has not saved anywhere. */
export function hasAtStake(session: Session): boolean {
  return !!session.audio || session.transcript.trim().length > 0;
}

/** True when saving a draft would keep something: audio, text, a title, an emotion or any tag. */
export function hasSomethingToKeep(session: Session): boolean {
  return (
    hasAtStake(session) ||
    session.title.trim().length > 0 ||
    session.emotion.trim().length > 0 ||
    session.tags.length > 0 ||
    session.tagDraft.trim().length > 0
  );
}

export type ReadItBackBack = 'review' | 'confirmDiscard' | 'capture' | 'list';

/**
 * Where the Read it back back-arrow (and Android back) goes.
 * `fromReview` is true only when the screen was opened with Edit on Review.
 */
export function readItBackBack(session: Session, fromReview: boolean): ReadItBackBack {
  if (fromReview) return 'review';
  if (session.origin === 'draft') return 'list';
  return hasAtStake(session) ? 'confirmDiscard' : 'capture';
}

/**
 * Where the Review back-arrow (and Android back) goes. While a save is in flight it goes nowhere,
 * so leaving cannot race the save.
 */
export function reviewBack(
  session: Session,
  saving = false,
): 'blocked' | 'readItBack' | 'draftToList' {
  if (saving) return 'blocked';
  return session.origin === 'draft' ? 'draftToList' : 'readItBack';
}
