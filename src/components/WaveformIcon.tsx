import { StyleSheet, View } from 'react-native';

type Props = { color: string; size?: number };

const BARS = [8, 16, 24, 14, 8];

/** Small waveform glyph: five rounded bars drawn with Views (no icon-library dependency). */
export function WaveformIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  const w = 3 * s;
  return (
    <View testID="waveform-icon" style={[styles.wrap, { height: 24 * s, gap: 2.5 * s }]}>
      {BARS.map((h, i) => (
        <View
          key={i}
          testID="waveform-bar"
          style={{ width: w, height: h * s, borderRadius: w / 2, backgroundColor: color }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flexDirection: 'row', alignItems: 'center' } });
