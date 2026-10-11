import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { colors, spacing } from '../theme';
import { Dream } from '../types/dream';
import { dreamRow } from '../utils/dreamLog';
import { Journal, JournalCopy } from '../utils/journals';
import { EntryRow } from './EntryRow';
import { TodayEntryRow } from './TodayEntryRow';

/**
 * Keeps at most one swipe row open. Pass `onRowWillOpen` / `onRowClosed` to every
 * `SwipeEntryRow` in a list; call `closeOpenRow()` when anything else happens (scroll, opening an entry).
 */
export function useSingleOpenRow() {
  const openRow = useRef<Swipeable | null>(null);
  const onRowWillOpen = useCallback((row: Swipeable) => {
    if (openRow.current && openRow.current !== row) openRow.current.close();
    openRow.current = row;
  }, []);
  const onRowClosed = useCallback((row: Swipeable) => {
    if (openRow.current === row) openRow.current = null;
  }, []);
  const closeOpenRow = useCallback(() => {
    openRow.current?.close();
  }, []);
  return { onRowWillOpen, onRowClosed, closeOpenRow };
}

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
  const swipeRef = useRef<Swipeable>(null);
  // While closed, the Delete action sits behind the card and must stay out of the screen reader.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const row = swipeRef.current;
    return () => {
      if (row) onRowClosed(row);
    };
  }, [onRowClosed]);
  const row = useMemo(() => dreamRow(dream, new Date(), copy.untitled), [dream, copy]);

  const swipeable = !swipeLocked && !deleting;
  const deleteDream = () => {
    onDelete(dream, () => swipeRef.current?.close());
  };

  const isToday = variant === 'today';
  const Row = isToday ? TodayEntryRow : EntryRow;
  const card = (
    <Row
      dream={dream}
      journals={journals}
      untitled={copy.untitled}
      onOpenDream={onOpenDream}
      onOpenDraft={onOpenDraft}
      deleting={deleting}
      onAccessibilityDelete={swipeable ? deleteDream : undefined}
      journalLabel={journalLabel}
      flush
    />
  );

  return (
    <Swipeable
      ref={swipeRef}
      enabled={swipeable}
      overshootRight={false}
      containerStyle={isToday ? styles.swipeRowToday : styles.swipeRow}
      onSwipeableWillOpen={() => {
        setRevealed(true);
        if (swipeRef.current) onRowWillOpen(swipeRef.current);
      }}
      onSwipeableClose={() => {
        setRevealed(false);
        if (swipeRef.current) onRowClosed(swipeRef.current);
      }}
      renderRightActions={() => (
        <View
          style={styles.actionWrap}
          accessibilityElementsHidden={!revealed}
          importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.deleteRowLabel(row.title)}
            onPress={deleteDream}
            style={[styles.deleteAction, isToday && styles.deleteActionToday]}
          >
            <Text style={styles.deleteLabel}>Delete</Text>
          </Pressable>
        </View>
      )}
    >
      {card}
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  // The margin sits on the swipe container, so the revealed action is exactly as tall as the card.
  swipeRow: { marginBottom: spacing.sm + 2, borderRadius: 16 },
  // Flat full-width row: no margin or radius; the opaque background hides the action until swiped.
  swipeRowToday: { backgroundColor: colors.background },
  actionWrap: { width: 96, alignItems: 'stretch' },
  deleteAction: {
    flex: 1,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.draft,
  },
  deleteActionToday: { borderRadius: 0 },
  deleteLabel: { color: colors.accentDark, fontSize: 16, fontWeight: '700' },
});
