import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { KeyboardHideIcon } from './KeyboardHideIcon';
import { ListIcon } from './ListIcon';
import { WaveformIcon } from './WaveformIcon';

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Stops editing: hides the keyboard and shows the note. */
  onDismissKeyboard: () => void;
  micDisabled: boolean;
  onMic: () => void;
  onTags: () => void;
  /** The list controls panel is showing in place of the keyboard (the list button is selected). */
  listPanelOpen: boolean;
  /** Shows the list controls in place of the keyboard, or brings the keyboard back. */
  onListPanel: () => void;
  /** Locks every button (a leave or delete is in flight). */
  disabled?: boolean;
};

type ButtonProps = {
  label: string;
  hint?: string;
  selected?: boolean;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
};

function ToolbarButton({
  label,
  hint,
  selected = false,
  disabled,
  onPress,
  children,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={[styles.button, selected && styles.selected, disabled && styles.disabled]}
    >
      {children}
    </Pressable>
  );
}

/**
 * The bar under the note, shown only while editing: undo, redo, hide keyboard, record a voice note,
 * tags, list controls (shows the list panel in place of the keyboard). Six equal cells with dividers.
 */
export function NoteToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDismissKeyboard,
  micDisabled,
  onMic,
  onTags,
  listPanelOpen,
  onListPanel,
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
      <ToolbarButton
        label="Hide keyboard"
        hint="Stops editing and shows the note."
        disabled={disabled}
        onPress={onDismissKeyboard}
      >
        <KeyboardHideIcon color={colors.text} size={26} />
      </ToolbarButton>
      <View style={styles.divider} />
      <ToolbarButton label="Record voice note" disabled={disabled || micDisabled} onPress={onMic}>
        <WaveformIcon color={colors.text} size={22} />
      </ToolbarButton>
      <View style={styles.divider} />
      <ToolbarButton label="Add tags" disabled={disabled} onPress={onTags}>
        <Text style={styles.glyph}>#</Text>
      </ToolbarButton>
      <View style={styles.divider} />
      <ToolbarButton
        label="List controls"
        hint="Shows list buttons in place of the keyboard."
        selected={listPanelOpen}
        disabled={disabled}
        onPress={onListPanel}
      >
        <ListIcon color={listPanelOpen ? colors.accent : colors.text} size={24} />
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
  selected: { backgroundColor: colors.highlight, borderRadius: 12 },
  disabled: { opacity: 0.4 },
  divider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.border },
  glyph: { color: colors.text, fontSize: 22 },
});
