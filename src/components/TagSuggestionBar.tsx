import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../theme';

type Props = {
  /** Existing tags to offer (without "#"). */
  matches: string[];
  /** A suggestion was tapped: complete the token with this tag. */
  onPick: (tag: string) => void;
};

/**
 * A single row of tag pills that scrolls sideways, shown in the bottom dock above the toolbar while
 * a "#tag" is being typed. Taps keep the keyboard open (`keyboardShouldPersistTaps="always"`: this
 * scroll view is outside the page's own).
 */
export function TagSuggestionBar({ matches, onPick }: Props) {
  if (matches.length === 0) return null;
  return (
    <ScrollView
      testID="tag-suggestions"
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.row}
    >
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
  text: { color: colors.accent, fontWeight: '600', fontSize: 14 },
});
