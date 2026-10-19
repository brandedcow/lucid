import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { DeletedRowData } from '../utils/deletedRow';

type Props = {
  row: DeletedRowData;
  /** True while a restore or delete is running: both buttons are disabled. */
  busy?: boolean;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
};

export const DELETED_ROW_COPY = {
  restore: 'Restore',
  deleteForever: 'Delete forever',
} as const;

/**
 * One row of Recently Deleted. The row itself cannot be opened; it shows the title (one line), the
 * preview (two lines), when it was deleted, and two buttons: Restore and Delete forever. No fixed
 * heights, so large text wraps.
 */
function DeletedNoteRowImpl({ row, busy = false, onRestore, onDeleteForever }: Props) {
  return (
    <View style={styles.row} testID={`deleted-row-${row.id}`}>
      <View accessible accessibilityLabel={row.a11yLabel} style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {row.title}
        </Text>
        {row.preview !== '' && (
          <Text style={styles.preview} numberOfLines={2}>
            {row.preview}
          </Text>
        )}
        {row.deleted !== '' && <Text style={styles.deleted}>{row.deleted}</Text>}
      </View>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${DELETED_ROW_COPY.restore} ${row.title}`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => onRestore(row.id)}
          style={[styles.button, busy && styles.disabled]}
        >
          <Text style={styles.restoreText}>{DELETED_ROW_COPY.restore}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${row.title} forever`}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => onDeleteForever(row.id)}
          style={[styles.button, busy && styles.disabled]}
        >
          <Text style={styles.deleteText}>{DELETED_ROW_COPY.deleteForever}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const DeletedNoteRow = memo(DeletedNoteRowImpl);

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  text: { gap: spacing.xs },
  title: { color: colors.text, fontFamily: fonts.serif, fontSize: 18 },
  preview: { color: colors.muted, fontSize: 15 },
  deleted: { color: colors.faint, fontSize: 12 },
  buttons: { flexDirection: 'row', gap: spacing.lg },
  button: { minHeight: 44, justifyContent: 'center', paddingRight: spacing.sm },
  disabled: { opacity: 0.4 },
  restoreText: { color: colors.accent, fontSize: 15 },
  deleteText: { color: colors.draft, fontSize: 15 },
});
