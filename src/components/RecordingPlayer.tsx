import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { formatDuration } from '../utils/format';

type Props = {
  uri: string;
  /** Known length of the recording, used until the player reports its own. */
  durationMs: number;
  /** Replaces the elapsed/total time line with this text (e.g. a card caption). */
  label?: string;
};

/** Play/pause with elapsed time and a progress bar for a single recording. */
export function RecordingPlayer({ uri, durationMs, label }: Props) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const total = status.duration > 0 ? status.duration : durationMs / 1000;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (status.duration > 0 && status.currentTime >= status.duration - 0.25) {
      await player.seekTo(0);
    }
    player.play();
  };

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause recording' : 'Play recording'}
        onPress={toggle}
        style={styles.button}
      >
        <Text style={styles.glyph}>{status.playing ? 'ǁ' : '▶'}</Text>
      </Pressable>
      <View style={styles.track}>
        <View style={styles.bar}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        {label ? (
          <Text style={styles.label}>{label}</Text>
        ) : (
          <Text style={styles.time}>
            {formatDuration(Math.floor(status.currentTime))} / {formatDuration(Math.round(total))}
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
  time: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
});
