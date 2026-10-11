import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { WaveformIcon } from './WaveformIcon';

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  micDisabled: boolean;
  onMic: () => void;
  onTags: () => void;
  /** Locks every button (a save is in flight). */
  disabled?: boolean;
};

type ButtonProps = {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
};

function ToolbarButton({ label, disabled, onPress, children }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={[styles.button, disabled && styles.disabled]}
    >
      {children}
    </Pressable>
  );
}

/** The bar under the page: undo, redo, record a voice note, tags. Four equal cells with dividers. */
export function EntryToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  micDisabled,
  onMic,
  onTags,
  disabled = false,
}: Props) {
  return (
    <View style={styles.bar}>
      <ToolbarButton label="Undo" disabled={disabled || !canUndo} onPress={onUndo}>
        <Text style={styles.glyph}>↶</Text>
      </ToolbarButton>
      <View style={styles.divider} />
      <ToolbarButton label="Redo" disabled={disabled || !canRedo} onPress={onRedo}>
        <Text style={styles.glyph}>↷</Text>
      </ToolbarButton>
      <View style={styles.divider} />
      <ToolbarButton label="Record voice note" disabled={disabled || micDisabled} onPress={onMic}>
        <WaveformIcon color={colors.text} size={22} />
      </ToolbarButton>
      <View style={styles.divider} />
      <ToolbarButton label="Add tags" disabled={disabled} onPress={onTags}>
        <Text style={styles.glyph}>#</Text>
      </ToolbarButton>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  button: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  divider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.border },
  glyph: { color: colors.text, fontSize: 22 },
});
