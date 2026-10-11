import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRecordingPlayback } from '../hooks/useRecordingPlayback';
import { colors, spacing } from '../theme';
import { formatDuration } from '../utils/format';
import { SeekBar } from './SeekBar';

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
  /** Place among several voice notes (1-based); labels say "voice note 2 of 3" when count > 1. */
  index?: number;
  count?: number;
};

/** Play/pause with elapsed time and a progress bar for a single recording. */
export function RecordingPlayer({ uri, durationMs, label, compact, index = 1, count = 1 }: Props) {
  const {
    playing,
    total,
    toggle,
    seekTo,
    seekBy,
    scrub,
    scrubbing,
    displayProgress,
    displayPosition,
  } = useRecordingPlayback(uri, durationMs);
  const elapsed = formatDuration(Math.floor(displayPosition));
  const length = formatDuration(Math.round(total));
  const seekBar = (style?: object) => (
    <SeekBar
      style={style}
      progress={displayProgress}
      peaks={null}
      onSeek={seekTo}
      scrub={scrub}
      onStep={seekBy}
      label={count > 1 ? `Position of ${noun}` : 'Recording position'}
      valueText={`${elapsed} of ${length}`}
    />
  );

  const noun = count > 1 ? `voice note ${index} of ${count}` : 'recording';
  if (compact) {
    return (
      <View style={styles.compactRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? `Pause ${noun}` : `Play ${noun}`}
          onPress={toggle}
          style={styles.compactButton}
        >
          <Text style={styles.compactGlyph}>{playing ? 'ǁ' : '▶'}</Text>
        </Pressable>
        {seekBar(styles.compactBar)}
        <Text style={styles.time}>{playing || scrubbing ? `${elapsed} / ${length}` : length}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${noun}` : `Play ${noun}`}
        onPress={toggle}
        style={styles.button}
      >
        <Text style={styles.glyph}>{playing ? 'ǁ' : '▶'}</Text>
      </Pressable>
      <View style={styles.track}>
        {seekBar()}
        {label ? (
          <Text style={styles.label}>{label}</Text>
        ) : (
          <Text style={styles.time}>
            {elapsed} / {length}
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
