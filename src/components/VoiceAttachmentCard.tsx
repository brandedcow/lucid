import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRecordingPlayback } from '../hooks/useRecordingPlayback';
import { colors, spacing } from '../theme';
import { formatDuration } from '../utils/format';
import { isValidWaveform } from '../utils/waveform';
import { SeekBar } from './SeekBar';

type Props = {
  uri: string;
  /** Known length of the recording, used until the player reports its own. */
  durationMs: number;
  /** Loudness peaks (0..1). Missing or invalid (older entries): a plain progress bar instead. */
  waveform?: number[];
  /** Shows the close button. Without it the card cannot be removed. */
  onRemove?: () => void;
  /** Place among several voice notes (1-based). Labels carry "voice note 2 of 3" when count > 1. */
  index?: number;
  count?: number;
  /** Play is off (a recording is in progress). */
  playDisabled?: boolean;
};

/**
 * The voice attachment above an entry's title: play/pause, a waveform that fills left to right as
 * playback advances (a plain progress bar when there is no waveform), the length and, when
 * `onRemove` is given, a close button. Closing only reports the tap; deleting is the owner's call.
 * Mount with `key={uri}` so the player resets when the recording changes.
 */
export function VoiceAttachmentCard({
  uri,
  durationMs,
  waveform,
  onRemove,
  index = 1,
  count = 1,
  playDisabled = false,
}: Props) {
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
  } = useRecordingPlayback(uri, durationMs, playDisabled);
  const bars = isValidWaveform(waveform) ? waveform : null;
  const noun = count > 1 ? `voice note ${index} of ${count}` : 'recording';
  const elapsed = formatDuration(Math.floor(displayPosition));
  const length = formatDuration(Math.round(total));

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${noun}` : `Play ${noun}`}
        onPress={toggle}
        disabled={playDisabled && !playing}
        accessibilityState={{ disabled: playDisabled && !playing }}
        hitSlop={4}
        style={[styles.button, playDisabled && !playing && styles.buttonOff]}
      >
        <Text style={styles.glyph}>{playing ? 'ǁ' : '▶'}</Text>
      </Pressable>
      <SeekBar
        style={styles.track}
        progress={displayProgress}
        peaks={bars}
        onSeek={seekTo}
        scrub={scrub}
        onStep={seekBy}
        disabled={playDisabled}
        label={count > 1 ? `Position of ${noun}` : 'Recording position'}
        valueText={`${elapsed} of ${length}`}
      />
      <Text style={styles.time}>{playing || scrubbing ? `${elapsed} / ${length}` : length}</Text>
      {onRemove && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${noun}`}
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
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
  buttonOff: { opacity: 0.4 },
  glyph: { color: colors.accentDark, fontSize: 14, fontWeight: '700' },
  track: { flex: 1 },
  time: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { color: colors.muted, fontSize: 16 },
});
