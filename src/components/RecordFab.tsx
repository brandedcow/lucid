import { Pressable, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { NEW_NOTE_FAB_SIZE } from './NewNoteButton';
import { WaveformIcon } from './WaveformIcon';

/**
 * How far the button reaches up from the bottom of the page's scroll viewport (the viewport already
 * sits above the bottom inset): its offset from the bottom plus its size.
 */
export const recordFabClearance = spacing.md + NEW_NOTE_FAB_SIZE;

type Props = {
  onPress: () => void;
  /** The safe-area bottom inset, supplied by the caller. */
  bottomInset?: number;
};

/**
 * The round waveform button at the bottom right of a note in reading mode; it starts a voice note
 * like the toolbar's mic. It has no disabled state: when it must not act, it is not rendered.
 */
export function RecordFab({ onPress, bottomInset = 0 }: Props) {
  return (
    <Pressable
      testID="record-fab"
      accessibilityRole="button"
      accessibilityLabel="Record voice note"
      accessibilityHint="Starts a voice note."
      onPress={onPress}
      style={[styles.fab, { bottom: bottomInset + spacing.md }]}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <WaveformIcon color={colors.accentDark} size={28} />
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
    // It floats over scrolling text, unlike the list's + button, so it gets a modest shadow.
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
