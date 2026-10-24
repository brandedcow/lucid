import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../theme';
import type { TitleEntry } from '../utils/noteLinks';

const ROW_HEIGHT = 44;
const MAX_VISIBLE_ROWS = 4;

type Props = {
  /** Note titles to offer, best match first. */
  matches: readonly TitleEntry[];
  /** A title was tapped: complete the link with this note. */
  onPick: (entry: TitleEntry) => void;
};

/**
 * A vertical list of note titles (at most four rows visible, then it scrolls), shown in the bottom
 * dock above the toolbar while a "[[link" is being typed. Taps keep the keyboard open
 * (`keyboardShouldPersistTaps="always"`: this scroll view is outside the page's own).
 */
export function WikiLinkSuggestionBar({ matches, onPick }: Props) {
  if (matches.length === 0) return null;
  return (
    <ScrollView
      testID="wikilink-suggestions"
      keyboardShouldPersistTaps="always"
      style={[styles.bar, { maxHeight: ROW_HEIGHT * MAX_VISIBLE_ROWS }]}
      contentContainerStyle={styles.list}
    >
      {matches.map((entry) => (
        <Pressable
          key={entry.id}
          accessibilityRole="button"
          accessibilityLabel={entry.title}
          onPress={() => onPick(entry)}
          style={styles.row}
        >
          <Text style={styles.text} numberOfLines={1}>
            {entry.title}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0 },
  list: { paddingHorizontal: spacing.lg },
  row: { minHeight: ROW_HEIGHT, justifyContent: 'center' },
  text: { color: colors.accent, fontWeight: '600', fontSize: 15 },
});
