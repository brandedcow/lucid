import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const BARS = 17;
const MAX_HEIGHT = 28;
const IDLE_LEVEL = 0.1;

type Props = {
  /** Current input level, 0..1. */
  level: number;
  active: boolean;
};

export function Waveform({ level, active }: Props) {
  const [history, setHistory] = useState<number[]>(() => Array(BARS).fill(IDLE_LEVEL));
  const latest = useRef(level);

  useEffect(() => {
    latest.current = level;
  }, [level]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setHistory((prev) => [...prev.slice(1), Math.max(IDLE_LEVEL, latest.current)]);
    }, 100);
    return () => clearInterval(id);
  }, [active]);

  // Paused: show flat bars without touching state; live levels resume on unpause.
  const shown = active ? history : history.map(() => IDLE_LEVEL);

  return (
    <View style={styles.row}>
      {shown.map((value, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: Math.max(3, value * MAX_HEIGHT), opacity: 0.3 + (i / BARS) * 0.7 },
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
