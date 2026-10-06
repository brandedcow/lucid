import { Session } from '../hooks/useDreamSession';

/** True when leaving would lose a recording or text the user has not saved anywhere. */
export function hasAtStake(session: Session): boolean {
  return !!session.audio || session.transcript.trim().length > 0;
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

/** Where the Review back-arrow (and Android back) goes. */
export function reviewBack(session: Session): 'readItBack' | 'draftToList' {
  return session.origin === 'draft' ? 'draftToList' : 'readItBack';
}
