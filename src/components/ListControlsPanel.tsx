import type { ReactNode } from 'react';
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
  /** Text glyph, or `icon` for a drawn one. */
  glyph?: string;
  icon?: ReactNode;
  disabled?: boolean;
  selected?: boolean;
  onPress: () => void;
};

type IconProps = { color: string; size?: number };

/**
 * Indent / outdent glyph: an arrow running into a bar, drawn with Views on a 24pt grid so it uses
 * the theme colour and renders the same on iOS and Android (font arrows may be missing).
 * `flip` mirrors it (outdent).
 */
function IndentIcon({ color, size = 24, flip = false }: IconProps & { flip?: boolean }) {
  const s = size / 24;
  return (
    <View
      testID={flip ? 'outdent-icon' : 'indent-icon'}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, transform: flip ? [{ scaleX: -1 }] : [] }}
    >
      <View
        style={{
          position: 'absolute',
          left: 3 * s,
          top: 11 * s,
          width: 13 * s,
          height: 2 * s,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 9.3 * s,
          top: 8 * s,
          width: 8 * s,
          height: 8 * s,
          borderTopWidth: 2 * s,
          borderRightWidth: 2 * s,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 20 * s,
          top: 5 * s,
          width: 2 * s,
          height: 14 * s,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** To-do glyph: a box with a tick, drawn with Views (the font check mark can render as an emoji). */
function CheckBoxIcon({ color, size = 24 }: IconProps) {
  const s = size / 24;
  return (
    <View
      testID="todo-icon"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <View
        style={{
          position: 'absolute',
          left: 3 * s,
          top: 3 * s,
          width: 18 * s,
          height: 18 * s,
          borderRadius: 3 * s,
          borderWidth: 1.5 * s,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 9.5 * s,
          top: 6 * s,
          width: 5 * s,
          height: 10 * s,
          borderRightWidth: 2 * s,
          borderBottomWidth: 2 * s,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/**
 * One key. A plain Pressable does not take focus, so tapping it leaves the note input focused and
 * its selection intact.
 */
function Key({ label, hint, glyph, icon, disabled = false, selected = false, onPress }: KeyProps) {
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
      {icon ?? <Text style={[styles.glyph, selected && styles.glyphSelected]}>{glyph}</Text>}
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
  const selected = (kind: ListKind) => actions.kind === kind;
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
          icon={<IndentIcon color={colors.text} flip />}
          disabled={disabled || !actions.canOutdent}
          onPress={onOutdent}
        />
        <Key
          label="Indent"
          hint="Moves the line one level in."
          icon={<IndentIcon color={colors.text} />}
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
          icon={<CheckBoxIcon color={selected('checkbox') ? colors.accent : colors.text} />}
          disabled={disabled}
          selected={actions.kind === 'checkbox'}
          onPress={() => onType('checkbox')}
        />
      </View>
      <View style={[styles.row, styles.lastRow]}>
        <View style={styles.abc}>
          <Key
            label="Keyboard"
            hint="Shows the keyboard again."
            glyph="abc"
            disabled={disabled}
            onPress={onKeyboard}
          />
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
