import { StyleSheet, View } from 'react-native';

type Props = { color: string; size?: number };

/** Simple microphone glyph drawn with Views (avoids an icon-library dependency). */
export function MicIcon({ color, size = 28 }: Props) {
  const s = size / 28;
  const stroke = 2.5 * s;
  return (
    <View style={styles.wrap}>
      <View
        style={{
          width: 12 * s,
          height: 18 * s,
          borderRadius: 6 * s,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          width: 20 * s,
          height: 10 * s,
          marginTop: -6 * s,
          borderWidth: stroke,
          borderTopWidth: 0,
          borderBottomLeftRadius: 10 * s,
          borderBottomRightRadius: 10 * s,
          borderColor: color,
        }}
      />
      <View style={{ width: stroke, height: 4 * s, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center' } });
