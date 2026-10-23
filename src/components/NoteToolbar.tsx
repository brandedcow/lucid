import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import type { ListActions } from '../utils/markdownList';
import { KeyboardHideIcon } from './KeyboardHideIcon';
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
  /** From `useNoteEditor().listActions.kind`: sets the checkbox button's label. */
  listKind: ListActions['kind'];
  onCheckbox: () => void;
  /** Locks every button (a leave or delete is in flight). */
  disabled?: boolean;
};

type ButtonProps = {
  label: string;
  hint?: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
};

function ToolbarButton({ label, hint, disabled, onPress, children }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
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

/** Label of the checkbox button: pressing it again on a to-do list removes the checkboxes. */
export function checkboxLabel(kind: ListActions['kind']): string {
  return kind === 'checkbox' ? 'Remove checkbox' : 'Add checkbox';
}

/**
 * The bar under the note, shown only while editing: undo, redo, hide keyboard, record a voice note,
 * tags, to-do list (interim cell; the list panel replaces it). Six equal cells with dividers.
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
  listKind,
  onCheckbox,
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
      <ToolbarButton label={checkboxLabel(listKind)} disabled={disabled} onPress={onCheckbox}>
        <Text style={styles.glyph}>☑</Text>
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
