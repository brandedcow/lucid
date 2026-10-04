import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const BARS = 17;
const MAX_HEIGHT = 28;
const IDLE_LEVEL = 0.15;

type Props = { active: boolean };

// TODO: drive from real microphone metering instead of random levels.
export function Waveform({ active }: Props) {
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(IDLE_LEVEL));

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setLevels((prev) => [...prev.slice(1), 0.2 + Math.random() * 0.8]);
    }, 120);
    return () => clearInterval(id);
  }, [active]);

  // Paused: show flat bars without touching state; the live levels resume on unpause.
  const shown = active ? levels : levels.map(() => IDLE_LEVEL);

  return (
    <View style={styles.row}>
      {shown.map((level, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: Math.max(3, level * MAX_HEIGHT), opacity: 0.3 + (i / BARS) * 0.7 },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, height: MAX_HEIGHT },
  bar: { width: 3, borderRadius: 2, backgroundColor: colors.accent },
});
