import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** How many bars (or dots) the row shows. */
export const RECORDING_WAVEFORM_BARS = 40;
const HEIGHT = 48;
const MIN_BAR = 3;

type Props = {
  /** True while recording: red bars from `levels`. False: a flat dotted line. */
  recording: boolean;
  /** Recent microphone levels (0..1), oldest first. Only the newest bars' worth are drawn. */
  levels?: readonly number[];
};

/**
 * The recording panel's waveform row. Idle it is a flat dotted line; while recording it is red bars
 * built from the newest level samples, so the shape scrolls in from the right as sound is heard.
 * Decorative: hidden from screen readers (the timer carries the state).
 */
export function RecordingWaveform({ recording, levels = [] }: Props) {
  const wrapper = {
    accessible: false,
    importantForAccessibility: 'no' as const,
  };
  if (!recording) {
    return (
      <View testID="recording-waveform-idle" style={styles.row} {...wrapper}>
        {Array.from({ length: RECORDING_WAVEFORM_BARS }, (_, i) => (
          <View key={i} testID="idle-dot" style={styles.dot} />
        ))}
      </View>
    );
  }
  const recent = levels.slice(-RECORDING_WAVEFORM_BARS);
  const padded = [...Array<number>(RECORDING_WAVEFORM_BARS - recent.length).fill(0), ...recent];
  return (
    <View testID="recording-waveform-live" style={styles.row} {...wrapper}>
      {padded.map((level, i) => {
        const clamped = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
        return (
          <View
            key={i}
            testID="live-bar"
            style={[styles.bar, { height: Math.max(MIN_BAR, Math.round(clamped * HEIGHT)) }]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.faint },
  bar: { width: 3, borderRadius: 1.5, backgroundColor: colors.draft },
});
