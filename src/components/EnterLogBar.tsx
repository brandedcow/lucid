import { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { copyText } from '../services/clipboard';
import { clearEnterLog, getEnterLog, isEnterLogOn, subscribeEnterLog } from './NoteBodyInput';

/**
 * DEV-ONLY bar for the Enter-in-list diagnostic. Renders nothing unless the Enter log is on
 * (__DEV__ and EXPO_PUBLIC_ENTER_LOG=1). Mounted by NoteEditorScreen at the top of the bottom dock,
 * outside the scroll content. Buttons are not focusable, so tapping them leaves the keyboard and
 * the text input's focus alone. The log holds only key names, lengths and offsets, never text.
 */
export function EnterLogBar() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const on = isEnterLogOn();
  useEffect(() => {
    if (!on) return undefined;
    const off = subscribeEnterLog(bump);
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [on]);
  if (!on) return null;
  const lines = getEnterLog();
  const copy = () => {
    void copyText(getEnterLog().join('\n')).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <View testID="enter-log-bar" style={styles.bar}>
      <Text style={styles.label}>{`Enter log (${lines.length})`}</Text>
      <Pressable
        testID="enter-log-copy"
        accessibilityRole="button"
        focusable={false}
        onPress={copy}
        style={styles.button}
      >
        <Text style={styles.buttonText}>{copied ? 'Copied' : 'Copy log'}</Text>
      </Pressable>
      <Pressable
        testID="enter-log-clear"
        accessibilityRole="button"
        focusable={false}
        onPress={clearEnterLog}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Clear log</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: '#111111',
  },
  label: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  button: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#FFD60A',
  },
  buttonText: { color: '#000000', fontSize: 15, fontWeight: '700' },
});
