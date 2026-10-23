import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import type { ListActions, ListKind } from '../utils/markdownList';

type Props = {
  actions: ListActions;
  /** Locks every control (a leave or delete is in flight). */
  disabled: boolean;
  /** Content height, from `panelContentHeight`; the panel fills it. */
  height: number;
  onIndent: () => void;
  onOutdent: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onType: (kind: ListKind) => void;
  /** Back to the system keyboard. */
  onKeyboard: () => void;
};

type KeyProps = {
  label: string;
  hint: string;
  glyph: string;
  disabled?: boolean;
  selected?: boolean;
  onPress: () => void;
};

/**
 * One key. A plain Pressable does not take focus, so tapping it leaves the note input focused and
 * its selection intact.
 */
function Key({ label, hint, glyph, disabled = false, selected = false, onPress }: KeyProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      focusable={false}
      style={[styles.key, selected && styles.selected, disabled && styles.disabled]}
    >
      <Text style={[styles.glyph, selected && styles.glyphSelected]}>{glyph}</Text>
    </Pressable>
  );
}

/**
 * The list controls, shown in place of the keyboard: outdent, indent, move up, move down; the
 * three list types; and an "abc" key that returns to the keyboard. Props only, so the parent owns
 * the editor and the sizing.
 */
export function ListControlsPanel({
  actions,
  disabled,
  height,
  onIndent,
  onOutdent,
  onMoveUp,
  onMoveDown,
  onType,
  onKeyboard,
}: Props) {
  const moveHint = 'Moves the line above or below its neighbour.';
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="List controls"
      style={[styles.panel, { height }]}
    >
      <View style={styles.row}>
        <Key
          label="Outdent"
          hint="Moves the line one level out."
          glyph="⇤"
          disabled={disabled || !actions.canOutdent}
          onPress={onOutdent}
        />
        <Key
          label="Indent"
          hint="Moves the line one level in."
          glyph="⇥"
          disabled={disabled || !actions.canIndent}
          onPress={onIndent}
        />
        <Key
          label="Move up"
          hint={moveHint}
          glyph="↑"
          disabled={disabled || !actions.canMoveUp}
          onPress={onMoveUp}
        />
        <Key
          label="Move down"
          hint={moveHint}
          glyph="↓"
          disabled={disabled || !actions.canMoveDown}
          onPress={onMoveDown}
        />
      </View>
      <View style={styles.row}>
        <Key
          label="Bulleted list"
          hint="Turns the line into a bullet, or removes the bullet."
          glyph="•"
          disabled={disabled}
          selected={actions.kind === 'bullet'}
          onPress={() => onType('bullet')}
        />
        <Key
          label="Numbered list"
          hint="Turns the line into a numbered item, or removes the number."
          glyph="1."
          disabled={disabled}
          selected={actions.kind === 'numbered'}
          onPress={() => onType('numbered')}
        />
        <Key
          label="To-do list"
          hint="Turns the line into a to-do, or removes the checkbox."
          glyph="☑"
          disabled={disabled}
          selected={actions.kind === 'checkbox'}
          onPress={() => onType('checkbox')}
        />
      </View>
      <View style={[styles.row, styles.lastRow]}>
        <View style={styles.abc}>
          <Key label="Keyboard" hint="Shows the keyboard again." glyph="abc" onPress={onKeyboard} />
        </View>
        <View style={styles.spacer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  row: { flex: 1, flexDirection: 'row', gap: spacing.sm },
  lastRow: { alignItems: 'flex-end' },
  abc: { width: 96, height: '100%', maxHeight: 56 },
  spacer: { flex: 1 },
  key: {
    flex: 1,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  selected: { backgroundColor: colors.highlight, borderColor: colors.accent },
  disabled: { opacity: 0.4 },
  glyph: { color: colors.text, fontSize: 22 },
  glyphSelected: { color: colors.accent },
});
