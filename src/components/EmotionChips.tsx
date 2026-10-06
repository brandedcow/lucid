import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { capitalizeFirst } from '../utils/capitalizeFirst';
import { splitEmotions, suggestEmotions, toggleEmotion } from '../utils/emotions';

const MAX_CHIPS = 8;

type Props = {
  /** Emotion words used before (lowercase), most used first. */
  known: string[];
  /** The emotion field as typed. */
  value: string;
  onChange: (value: string) => void;
};

/**
 * Quick picks made from earlier emotion words. Tapping one adds it to the field; tapping one that
 * is already in the field removes it. Shown capitalized; the stored word stays lowercase.
 */
export function EmotionChips({ known, value, onChange }: Props) {
  const present = new Set(splitEmotions(value));
  // A last segment that is already a whole known word (just tapped) is not a prefix to narrow by.
  const last = (value.split(/[,;]/).pop() ?? '').trim().toLowerCase();
  const complete = last !== '' && known.some((w) => w.trim().toLowerCase() === last);
  const offered = new Set(suggestEmotions(known, complete ? `${value},` : value));
  const lower = [...new Set(known.map((w) => w.trim().toLowerCase()).filter(Boolean))];
  const words = lower.filter((w) => present.has(w) || offered.has(w)).slice(0, MAX_CHIPS);
  if (words.length === 0) return null;

  return (
    <View style={styles.row}>
      {words.map((word) => {
        const selected = present.has(word);
        return (
          <Pressable
            key={word}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(toggleEmotion(value, word))}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={selected ? styles.chipSelectedLabel : styles.chipLabel}>
              {capitalizeFirst(word)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.muted, fontSize: 14 },
  chipSelectedLabel: { color: colors.accentDark, fontSize: 14, fontWeight: '600' },
});
