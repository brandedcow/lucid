import { Pressable, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';

/** Diameter of the + button; the list pads itself clear of it. */
export const NEW_NOTE_FAB_SIZE = 56;

/**
 * Bottom padding the note list needs so its last row can scroll clear of the + button: the
 * button's own offset from the bottom (inset + spacing.md), its size, and a gap above it.
 */
export function listClearance(bottomInset: number): number {
  return bottomInset + spacing.md + NEW_NOTE_FAB_SIZE + spacing.lg;
}

type Props = {
  onPress: () => void;
  disabled?: boolean;
  /** The safe-area bottom inset, supplied by the caller. */
  bottomInset?: number;
};

/** The round "+" button at the bottom right of the note list. Always shown; `disabled` greys it. */
export function NewNoteButton({ onPress, disabled = false, bottomInset = 0 }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New note"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.fab, { bottom: bottomInset + spacing.md }, disabled && styles.disabled]}
    >
      <View style={styles.plus} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={[styles.bar, styles.barH]} />
        <View style={[styles.bar, styles.barV]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: NEW_NOTE_FAB_SIZE,
    height: NEW_NOTE_FAB_SIZE,
    borderRadius: NEW_NOTE_FAB_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  plus: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', borderRadius: 1, backgroundColor: colors.accentDark },
  barH: { width: 20, height: 3 },
  barV: { width: 3, height: 20 },
});
