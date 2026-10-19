import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { colors } from '../theme';
import { NoteRowData } from '../utils/noteRow';
import { NoteRow } from './NoteRow';
import { SwipeAction, SwipeActionRow } from './SwipeActionRow';

export const SWIPE_NOTE_COPY = {
  pin: 'Pin',
  unpin: 'Unpin',
  delete: 'Delete',
  pinLabel: 'Pin note',
  unpinLabel: 'Unpin note',
  deleteLabel: 'Delete note',
} as const;

/**
 * A `NoteRow` that reveals Pin/Unpin and Delete when swiped left, and exposes both as screen-reader
 * actions. Pressing an action closes the row first, then calls `onPin(id, !row.pinned)` or
 * `onDelete(id)`. Delete asks for no confirmation here; the caller decides what happens. `disabled`
 * makes the row inert. `onRowWillOpen` / `onRowClosed` come from `useSingleOpenRow`.
 */
export const SwipeNoteRow = memo(function SwipeNoteRow({
  row,
  onOpen,
  onPin,
  onDelete,
  disabled = false,
  onRowWillOpen,
  onRowClosed,
}: {
  row: NoteRowData;
  onOpen: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
  onRowWillOpen: (row: Swipeable) => void;
  onRowClosed: (row: Swipeable) => void;
}) {
  const { id, pinned } = row;
  const actions = useMemo<SwipeAction[]>(
    () => [
      {
        key: 'pin',
        label: pinned ? SWIPE_NOTE_COPY.unpin : SWIPE_NOTE_COPY.pin,
        accessibilityLabel: pinned ? SWIPE_NOTE_COPY.unpinLabel : SWIPE_NOTE_COPY.pinLabel,
        onPress: (closeRow) => {
          closeRow();
          onPin(id, !pinned);
        },
      },
      {
        key: 'delete',
        label: SWIPE_NOTE_COPY.delete,
        accessibilityLabel: SWIPE_NOTE_COPY.deleteLabel,
        onPress: (closeRow) => {
          closeRow();
          onDelete(id);
        },
        destructive: true,
      },
    ],
    [id, pinned, onPin, onDelete],
  );

  return (
    <SwipeActionRow
      actions={actions}
      disabled={disabled}
      flat
      containerStyle={styles.container}
      onRowWillOpen={onRowWillOpen}
      onRowClosed={onRowClosed}
    >
      {({ accessibilityActions, onAccessibilityAction }) => (
        <NoteRow
          row={row}
          onOpen={onOpen}
          accessibilityActions={accessibilityActions}
          onAccessibilityAction={onAccessibilityAction}
        />
      )}
    </SwipeActionRow>
  );
});

const styles = StyleSheet.create({
  // Opaque, so the actions behind the row are not visible through it.
  container: { backgroundColor: colors.background },
});
