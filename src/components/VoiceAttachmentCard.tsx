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
  /** Place among several voice notes (1-based). Labels carry "voice note 2 of 3" when count > 1. */
  index?: number;
  count?: number;
  /** Play is off (a recording is in progress). */
  playDisabled?: boolean;
  /** Tapping the card (not its play or close button) opens the voice note. Without it the card has no open target. */
  onOpen?: () => void;
};
const WAVE_HEIGHT = 32;

/**
 * The voice attachment above a note's body: play/pause, a static waveform that fills left to
 * right as playback advances (a plain progress bar when there is no waveform; it is a display, not
 * seekable), the length and, when `onRemove` is given, a close button. When `onOpen` is given the
 * rest of the card is a button ("Open voice note N of M"). Closing only reports the tap; deleting
 * is the owner's call.
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
  onOpen,
}: Props) {
  const { playing, total, toggle, displayProgress, displayPosition } = useRecordingPlayback(
    uri,
    durationMs,
    playDisabled,
  );
  const bars = isValidWaveform(waveform) ? waveform : null;
  const noun = count > 1 ? `voice note ${index} of ${count}` : 'recording';
  const elapsed = formatDuration(Math.floor(displayPosition));
  const length = formatDuration(Math.round(total));

  return (
    <View style={styles.card}>
      {onOpen && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${noun}`}
          onPress={onOpen}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={styles.row} pointerEvents="box-none">
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
        <View
          style={styles.track}
          pointerEvents="none"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={count > 1 ? `Position of ${noun}` : 'Recording position'}
          accessibilityValue={{ text: `${elapsed} of ${length}` }}
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
                    (i + 0.5) / bars.length <= displayProgress ? styles.barFilled : styles.barEmpty,
                  ]}
                />
              ))}
            </View>
          ) : (
            <View style={styles.bar}>
              <View
                testID="progress-fill"
                style={[styles.fill, { width: `${displayProgress * 100}%` }]}
              />
            </View>
          )}
        </View>
        <Text style={styles.time}>{playing ? `${elapsed} / ${length}` : length}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, backgroundColor: colors.surface },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
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
  track: { flex: 1, minHeight: 40, justifyContent: 'center' },
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
