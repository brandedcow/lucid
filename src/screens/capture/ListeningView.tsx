import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Waveform } from '../../components/Waveform';
import { colors, fonts, spacing } from '../../theme';
import { formatDuration, formatToday } from '../../utils/format';

type Props = {
  durationMs: number;
  level: number;
  paused: boolean;
  saving: boolean;
  onTogglePause: () => void;
  onSave: () => void;
};

export function ListeningView({ durationMs, level, paused, saving, onTogglePause, onSave }: Props) {
  const time = formatDuration(Math.floor(durationMs / 1000));

  return (
    <>
      <View style={styles.header}>
        <View style={styles.status}>
          <View style={[styles.dot, paused && styles.dotPaused]} />
          <Text style={styles.statusText}>{paused ? 'Paused' : 'Listening'}</Text>
        </View>
        <Text style={styles.small}>{formatToday()}</Text>
      </View>

      <View style={styles.center}>
        <Text style={styles.timer}>{time}</Text>
      </View>

      <View style={styles.waveWrap}>
        <Waveform level={level} active={!paused} />
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Resume' : 'Pause'}
          disabled={saving}
          onPress={onTogglePause}
          style={styles.pause}
        >
          <Text style={styles.pauseGlyph}>{paused ? '▶' : 'ǁ'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={onSave}
          style={[styles.save, saving && styles.saving]}
        >
          <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save dream'}</Text>
        </Pressable>
      </View>
      <Text style={styles.caption}>Your recording is saved on this device</Text>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  small: { color: colors.muted, fontSize: 13 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  dotPaused: { opacity: 0.35 },
  statusText: { color: colors.text, fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  timer: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 64,
    fontVariant: ['tabular-nums'],
  },
  waveWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pause: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseGlyph: { color: colors.text, fontSize: 18, fontWeight: '700' },
  save: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saving: { opacity: 0.6 },
  saveLabel: { color: colors.accentDark, fontSize: 17, fontWeight: '700' },
  caption: {
    color: colors.faint,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
});
