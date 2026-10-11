import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../theme';

type Props = {
  /** Existing tags to offer (without "#"). */
  matches: string[];
  /** A new tag being typed, offered as a `Create #tag` hint (first), or null. */
  create: string | null;
  /** A suggestion was tapped: complete the token with this tag. */
  onPick: (tag: string) => void;
  /** The create hint was tapped: nothing to do but put the bar away. */
  onDismiss: () => void;
};

/**
 * A single row of tag pills that scrolls sideways, shown in the bottom dock above the toolbar while
 * a "#tag" is being typed. Taps keep the keyboard open (`keyboardShouldPersistTaps="always"`: this
 * scroll view is outside the page's own).
 */
export function TagSuggestionBar({ matches, create, onPick, onDismiss }: Props) {
  if (matches.length === 0 && create === null) return null;
  return (
    <ScrollView
      testID="tag-suggestions"
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.row}
    >
      {create !== null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Create #${create}`}
          onPress={onDismiss}
          style={[styles.pill, styles.createPill]}
        >
          <Text style={styles.createText}>Create #{create}</Text>
        </Pressable>
      )}
      {matches.map((tag) => (
        <Pressable
          key={tag}
          accessibilityRole="button"
          accessibilityLabel={`Tag #${tag}`}
          onPress={() => onPick(tag)}
          style={styles.pill}
        >
          <Text style={styles.text}>#{tag}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0 },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  pill: {
    backgroundColor: colors.emotionChipBg,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  createPill: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  text: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  createText: { color: colors.muted, fontSize: 14 },
});
