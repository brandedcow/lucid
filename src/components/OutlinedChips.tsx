import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { RowChip } from '../utils/dreamLog';

type Props = {
  /** Every chip to show, already capitalized, emotions first then tags. Never truncated. */
  chips: RowChip[];
};

/** Outlined, rounded chips in a wrapping row (Today rows). Emotions and tags look the same. Display only. */
export function OutlinedChips({ chips }: Props) {
  if (chips.length === 0) return null;
  return (
    <View testID="outlined-chips" style={styles.wrap}>
      {chips.map((chip) => (
        <View key={`${chip.kind}:${chip.label}`} style={styles.chip}>
          <Text style={styles.text}>{chip.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.faint,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  text: { color: colors.muted, fontSize: 13 },
});
