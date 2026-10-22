import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import type { NoteEditor } from '../hooks/useNoteEditor';
import { WaveformIcon } from './WaveformIcon';

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  micDisabled: boolean;
  onMic: () => void;
  onTags: () => void;
  /** From `useNoteEditor().checkboxAction`: sets the checkbox button's label and disabled state. */
  checkboxAction: NoteEditor['checkboxAction'];
  onCheckbox: () => void;
  /** Locks every button (a leave or delete is in flight). */
  disabled?: boolean;
  /** Disables only the tags and checkbox buttons (reading mode). Undo, redo and mic are unchanged. */
  formatDisabled?: boolean;
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

/** Label of the checkbox button for an editor's `checkboxAction`. */
export function checkboxLabel(action: NoteEditor['checkboxAction']): string {
  if (action === 'check') return 'Check item';
  if (action === 'uncheck') return 'Uncheck item';
  return 'Add checkbox';
}

/**
 * The bar under the note: undo, redo, record a voice note, tags, checkbox. Five equal cells with
 * dividers. Indent and outdent exist in the editor hook but are not on the bar.
 */
export function NoteToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  micDisabled,
  onMic,
  onTags,
  checkboxAction,
  onCheckbox,
  disabled = false,
  formatDisabled = false,
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
      <ToolbarButton label="Add tags" disabled={disabled || formatDisabled} onPress={onTags}>
        <Text style={styles.glyph}>#</Text>
      </ToolbarButton>
      <View style={styles.divider} />
      <ToolbarButton
        label={checkboxLabel(checkboxAction)}
        disabled={disabled || formatDisabled || checkboxAction === 'none'}
        onPress={onCheckbox}
      >
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
