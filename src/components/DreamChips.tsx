import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { RowChip } from '../utils/dreamLog';

type Props = {
  /**
   * Already limited and capitalized chips: the `visible` list from `limitChips` in
   * utils/dreamLog.ts (emotions first, then tags). Pass its `overflow` as well.
   */
  chips: RowChip[];
  /** How many more chips exist than are shown; rendered as "+N" when above 0. */
  overflow?: number;
};

/** Small pill chips for a dream row or entry. Display only; the whole group reads as one element. */
export function DreamChips({ chips, overflow = 0 }: Props) {
  if (chips.length === 0 && overflow <= 0) return null;

  const emotions = chips.filter((c) => c.kind === 'emotion').map((c) => c.label);
  const tags = chips.filter((c) => c.kind === 'tag').map((c) => c.label);
  const parts: string[] = [];
  if (emotions.length > 0) parts.push(`Feelings: ${emotions.join(', ')}.`);
  if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}.`);
  if (overflow > 0) parts.push(`${overflow} more.`);

  return (
    <View testID="dream-chips" style={styles.wrap} accessible accessibilityLabel={parts.join(' ')}>
      {chips.map((chip) => (
        <View
          key={`${chip.kind}:${chip.label}`}
          style={[styles.chip, chip.kind === 'emotion' ? styles.emotion : styles.tag]}
        >
          <Text style={chip.kind === 'emotion' ? styles.emotionText : styles.tagText}>
            {chip.label}
          </Text>
        </View>
      ))}
      {overflow > 0 && (
        <View style={[styles.chip, styles.tag]}>
          <Text style={styles.tagText}>{`+${overflow}`}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  emotion: { backgroundColor: colors.emotionChipBg },
  tag: { backgroundColor: colors.tagChipBg },
  emotionText: { color: colors.emotionChipText, fontSize: 12, fontWeight: '600' },
  tagText: { color: colors.muted, fontSize: 12 },
});
