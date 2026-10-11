import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { JournalId } from '../types/entry';
import { Journal } from '../utils/journals';

/**
 * The journal pill of the add-entry page and its dropdown, in two parts so the screen can place
 * the menu over the page:
 * - `JournalPill`: a button with a chevron that opens the menu, or (when `locked`) a plain label
 *   with no chevron and no press.
 * - `JournalMenu`: an in-screen overlay (not a Modal, like AddEntryMenu): a backdrop that closes
 *   on tap and a list under the top bar. Picking a row calls `onPick` and closes; Android back
 *   closes it first. Render it as the last child of the full-screen container.
 */
type PillProps = {
  journal: Journal;
  /** Open when the menu is showing (announced as expanded). */
  open: boolean;
  /** No dropdown: a reopened draft or a saved entry never moves journals. */
  locked: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function JournalPill({ journal, open, locked, disabled = false, onPress }: PillProps) {
  if (locked) {
    return (
      <View accessibilityLabel={`Journal: ${journal.name}`} style={styles.pill}>
        <Text style={styles.pillLabel} numberOfLines={1}>
          {journal.name}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Journal: ${journal.name}`}
      accessibilityHint="Choose a journal"
      accessibilityState={{ expanded: open, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[styles.pill, styles.pillRow]}
    >
      <Text style={[styles.pillLabel, styles.pillText]} numberOfLines={1}>
        {journal.name}
      </Text>
      <Text style={styles.chevron} importantForAccessibility="no-hide-descendants">
        {open ? '▴' : '▾'}
      </Text>
    </Pressable>
  );
}

type MenuProps = {
  journals: readonly Journal[];
  selectedId: JournalId;
  /** Distance from the top of the page to the top of the list (the bottom of the top bar). */
  top: number;
  onPick: (journalId: JournalId) => void;
  onClose: () => void;
};

export function JournalMenu({ journals, selectedId, top, onPick, onClose }: MenuProps) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  return (
    <View accessibilityViewIsModal style={styles.layer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close journal list"
        onPress={onClose}
        style={styles.layer}
      />
      <View accessibilityLabel="Journals" style={[styles.menu, { top }]}>
        {journals.map((journal) => {
          const selected = journal.id === selectedId;
          return (
            <Pressable
              key={journal.id}
              accessibilityRole="menuitem"
              accessibilityLabel={journal.name}
              accessibilityState={{ selected }}
              onPress={() => onPick(journal.id)}
              style={styles.row}
            >
              <Text style={styles.rowText} numberOfLines={1}>
                {journal.name}
              </Text>
              {selected && (
                <Text style={styles.tick} importantForAccessibility="no-hide-descendants">
                  ✓
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill },
  pill: {
    maxWidth: '60%',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pillText: { flexShrink: 1 },
  pillLabel: { color: colors.text, fontSize: 14 },
  chevron: { color: colors.muted, fontSize: 12 },
  menu: {
    position: 'absolute',
    alignSelf: 'center',
    minWidth: 200,
    maxWidth: '80%',
    maxHeight: '60%',
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowText: { color: colors.text, fontSize: 17, flexShrink: 1 },
  tick: { color: colors.accent, fontSize: 16 },
});
