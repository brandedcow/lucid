import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Waveform } from '../../components/Waveform';
import { colors, fonts, spacing } from '../../theme';
import { formatDuration, formatToday } from '../../utils/format';

type Props = {
  seconds: number;
  paused: boolean;
  lines: string[];
  onTogglePause: () => void;
  onSave: () => void;
};

const LINE_COLORS = [colors.text, colors.transcriptMid, colors.faint];

export function ListeningView({ seconds, paused, lines, onTogglePause, onSave }: Props) {
  const visible = lines.slice(-3);

  return (
    <>
      <View style={styles.header}>
        <View style={styles.status}>
          <View style={[styles.dot, paused && styles.dotPaused]} />
          <Text style={styles.statusText}>
            {paused ? 'Paused' : 'Listening'} · {formatDuration(seconds)}
          </Text>
        </View>
        <Text style={styles.small}>{formatToday()}</Text>
      </View>

      <View style={styles.transcript}>
        {visible.map((line, i) => {
          const fromEnd = visible.length - 1 - i;
          const isLast = fromEnd === 0;
          return (
            <Text key={line} style={[styles.line, { color: LINE_COLORS[Math.min(fromEnd, 2)] }]}>
              {line}
              {isLast && !paused ? <Text style={styles.cursor}>|</Text> : null}
            </Text>
          );
        })}
      </View>

      <View style={styles.waveWrap}>
        <Waveform active={!paused} />
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Resume' : 'Pause'}
          onPress={onTogglePause}
          style={styles.pause}
        >
          <Text style={styles.pauseGlyph}>{paused ? '▶' : 'ǁ'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onSave} style={styles.save}>
          <Text style={styles.saveLabel}>Save dream</Text>
        </Pressable>
      </View>
      <Text style={styles.caption}>Audio and transcript are both kept</Text>
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
  transcript: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  line: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 28 },
  cursor: { color: '#FF5A4F' },
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
  saveLabel: { color: colors.accentDark, fontSize: 17, fontWeight: '700' },
  caption: {
    color: colors.faint,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
});
