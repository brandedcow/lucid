import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRecordingPlayback } from '../hooks/useRecordingPlayback';
import { colors, spacing } from '../theme';
import { formatDuration } from '../utils/format';
import { isValidWaveform } from '../utils/waveform';

type Props = {
  uri: string;
  /** Known length of the recording, used until the player reports its own. */
  durationMs: number;
  /** Loudness peaks (0..1). Missing or invalid (older entries): a plain progress bar instead. */
  waveform?: number[];
  /** Shows the close button. Without it the card cannot be removed. */
  onRemove?: () => void;
};

const WAVE_HEIGHT = 32;

/**
 * The voice attachment above an entry's title: play/pause, a waveform that fills left to right as
 * playback advances (a plain progress bar when there is no waveform), the length and, when
 * `onRemove` is given, a close button. Closing only reports the tap; deleting is the owner's call.
 * Mount with `key={uri}` so the player resets when the recording changes.
 */
export function VoiceAttachmentCard({ uri, durationMs, waveform, onRemove }: Props) {
  const { playing, position, total, progress, toggle } = useRecordingPlayback(uri, durationMs);
  const bars = isValidWaveform(waveform) ? waveform : null;
  const percent = Math.round(progress * 100);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause recording' : 'Play recording'}
        onPress={toggle}
        hitSlop={4}
        style={styles.button}
      >
        <Text style={styles.glyph}>{playing ? 'ǁ' : '▶'}</Text>
      </Pressable>
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Recording progress"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        {bars ? (
          <View style={styles.wave}>
            {bars.map((peak, i) => (
              <View
                key={i}
                testID="wave-bar"
                style={[
                  styles.waveBar,
                  { height: Math.max(3, peak * WAVE_HEIGHT) },
                  (i + 0.5) / bars.length <= progress ? styles.barFilled : styles.barEmpty,
                ]}
              />
            ))}
          </View>
        ) : (
          <View style={styles.bar}>
            <View testID="progress-fill" style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
        )}
      </View>
      <Text style={styles.time}>
        {playing
          ? `${formatDuration(Math.floor(position))} / ${formatDuration(Math.round(total))}`
          : formatDuration(Math.round(total))}
      </Text>
      {onRemove && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove recording"
          onPress={onRemove}
          hitSlop={8}
          style={styles.close}
        >
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
      )}
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: colors.accentDark, fontSize: 14, fontWeight: '700' },
  track: { flex: 1, justifyContent: 'center', minHeight: WAVE_HEIGHT },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: WAVE_HEIGHT },
  waveBar: { flex: 1, borderRadius: 2 },
  barFilled: { backgroundColor: colors.accent },
  barEmpty: { backgroundColor: colors.border },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
  time: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { color: colors.muted, fontSize: 16 },
});
