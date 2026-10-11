import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRecordingPlayback } from '../hooks/useRecordingPlayback';
import { colors, spacing } from '../theme';
import { formatDuration } from '../utils/format';

type Props = {
  uri: string;
  /** Known length of the recording, used until the player reports its own. */
  durationMs: number;
  /** Replaces the elapsed/total time line with this text (e.g. a card caption). */
  label?: string;
  /**
   * One row for the Dream entry: outlined play button, progress bar, time. No label. The time
   * shows the total at rest and "elapsed / total" while playing. Mount with `key={dream.id}` so
   * it resets between dreams.
   */
  compact?: boolean;
};

/** Play/pause with elapsed time and a progress bar for a single recording. */
export function RecordingPlayer({ uri, durationMs, label, compact }: Props) {
  const { playing, position, total, progress, toggle } = useRecordingPlayback(uri, durationMs);

  if (compact) {
    const elapsed = formatDuration(Math.floor(position));
    const length = formatDuration(Math.round(total));
    return (
      <View style={styles.compactRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause recording' : 'Play recording'}
          onPress={toggle}
          style={styles.compactButton}
        >
          <Text style={styles.compactGlyph}>{playing ? 'ǁ' : '▶'}</Text>
        </Pressable>
        <View style={[styles.bar, styles.compactBar]}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.time}>{playing ? `${elapsed} / ${length}` : length}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause recording' : 'Play recording'}
        onPress={toggle}
        style={styles.button}
      >
        <Text style={styles.glyph}>{playing ? 'ǁ' : '▶'}</Text>
      </Pressable>
      <View style={styles.track}>
        <View style={styles.bar}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        {label ? (
          <Text style={styles.label}>{label}</Text>
        ) : (
          <Text style={styles.time}>
            {formatDuration(Math.floor(position))} / {formatDuration(Math.round(total))}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: colors.accentDark, fontSize: 16, fontWeight: '700' },
  track: { flex: 1, gap: spacing.sm },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
  label: { color: colors.muted, fontSize: 13 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  compactButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactGlyph: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  compactBar: { flex: 1 },
  time: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
});
