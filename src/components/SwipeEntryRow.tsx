import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { colors, spacing } from '../theme';
import { Dream } from '../types/dream';
import { dreamRow } from '../utils/dreamLog';
import { Journal, JournalCopy } from '../utils/journals';
import { EntryRow } from './EntryRow';
import { SwipeAction, SwipeActionRow, useSingleOpenRow } from './SwipeActionRow';
import { TodayEntryRow } from './TodayEntryRow';

export { useSingleOpenRow };

/**
 * An `EntryRow` that reveals a Delete action when swiped left (and exposes it as an accessibility
 * action). Props: `dream` and its Journal's `copy`; `onOpenDream` / `onOpenDraft` as for `EntryRow`;
 * `onDelete(dream, closeRow)` when Delete is used; `onRowWillOpen` / `onRowClosed` from
 * `useSingleOpenRow`; `deleting` dims this row; `swipeLocked` disables swiping while any delete is in flight.
 * `variant`: 'card' (default, the Dream log) or 'today' (a flat full-width `TodayEntryRow` with an opaque
 * background, no radius or margin, so the red Delete action does not bleed).
 */
export const SwipeEntryRow = memo(function SwipeEntryRow({
  dream,
  journals,
  copy,
  onOpenDream,
  onOpenDraft,
  onDelete,
  onRowWillOpen,
  onRowClosed,
  deleting,
  swipeLocked,
  journalLabel,
  variant = 'card',
}: {
  dream: Dream;
  /** The journal registry, for the row's kind. */
  journals: readonly Journal[];
  copy: JournalCopy;
  onOpenDream: (id: string) => void;
  onOpenDraft: (dream: Dream) => void;
  onDelete: (dream: Dream, closeRow: () => void) => void;
  onRowWillOpen: (row: Swipeable) => void;
  onRowClosed: (row: Swipeable) => void;
  /** This row's dream is being deleted. */
  deleting: boolean;
  /** Some delete is in flight, so no row can be swiped. */
  swipeLocked: boolean;
  /** Optional journal name ("Dream", "Life") shown on the card, for lists that mix journals. */
  journalLabel?: string;
  /** 'card' (default) or the flat 'today' row. */
  variant?: 'card' | 'today';
}) {
  const row = useMemo(() => dreamRow(dream, new Date(), copy.untitled), [dream, copy]);

  const swipeable = !swipeLocked && !deleting;
  const actions = useMemo<SwipeAction[]>(
    () => [
      {
        key: 'delete',
        label: 'Delete',
        accessibilityLabel: copy.deleteRowLabel(row.title),
        onPress: (closeRow) => onDelete(dream, closeRow),
        destructive: true,
      },
    ],
    [copy, row.title, onDelete, dream],
  );

  const isToday = variant === 'today';
  const Row = isToday ? TodayEntryRow : EntryRow;

  return (
    <SwipeActionRow
      actions={actions}
      disabled={!swipeable}
      flat={isToday}
      containerStyle={isToday ? styles.swipeRowToday : styles.swipeRow}
      onRowWillOpen={onRowWillOpen}
      onRowClosed={onRowClosed}
    >
      {({ closeRow }) => (
        <Row
          dream={dream}
          journals={journals}
          untitled={copy.untitled}
          onOpenDream={onOpenDream}
          onOpenDraft={onOpenDraft}
          deleting={deleting}
          onAccessibilityDelete={swipeable ? () => onDelete(dream, closeRow) : undefined}
          journalLabel={journalLabel}
          flush
        />
      )}
    </SwipeActionRow>
  );
});

const styles = StyleSheet.create({
  // The margin sits on the swipe container, so the revealed action is exactly as tall as the card.
  swipeRow: { marginBottom: spacing.sm + 2, borderRadius: 16 },
  // Flat full-width row: no margin or radius; the opaque background hides the action until swiped.
  swipeRowToday: { backgroundColor: colors.background },
});
