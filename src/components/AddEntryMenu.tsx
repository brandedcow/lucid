import { ReactNode, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { JournalId } from '../types/entry';
import { Journal, journalCopy } from '../utils/journals';
import { PlusIcon } from './TodayIcons';

/** Diameter of the + button; screens use it to pad their lists clear of it. */
export const FAB_SIZE = 56;

/**
 * A floating "+" button (bottom right) that opens a popover of journals; picking one calls onPick.
 *
 * Render it as the LAST child of a full-screen container: it covers that container (so the backdrop
 * catches taps anywhere) but its layer is box-none, so taps beside the button reach the screen. The
 * menu is an in-screen overlay, not a Modal, so an Alert opened right after picking still shows on iOS.
 *
 * - bottomInset: the safe-area bottom inset, supplied by the screen.
 * - disabled: the button is disabled and the menu closes for good (it does not reopen when re-enabled).
 * - footer: extra content after the journal rows, inside the card.
 */
type Props = {
  journals: readonly Journal[];
  onPick: (journalId: JournalId) => void;
  disabled?: boolean;
  bottomInset?: number;
  footer?: ReactNode;
};

export function AddEntryMenu({
  journals,
  onPick,
  disabled = false,
  bottomInset = 0,
  footer,
}: Props) {
  const [open, setOpen] = useState(false);
  const visible = open && !disabled;

  if (disabled && open) setOpen(false);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  const pick = (journalId: JournalId) => {
    setOpen(false);
    onPick(journalId);
  };

  const fabBottom = bottomInset + spacing.md;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add entry"
        accessibilityState={{ expanded: visible, disabled }}
        disabled={disabled}
        onPress={() => setOpen((o) => !o)}
        style={[styles.fab, { bottom: fabBottom }]}
      >
        <PlusIcon color={colors.accentDark} />
      </Pressable>
      {visible && (
        <View accessibilityViewIsModal style={styles.layer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={() => setOpen(false)}
            style={styles.layer}
          />
          <View style={[styles.card, { bottom: fabBottom + FAB_SIZE + spacing.sm }]}>
            {journals.map((journal) => {
              const hint = journalCopy(journal.kind).newButton;
              return (
                <Pressable
                  key={journal.id}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`${journal.name}, ${hint}`}
                  onPress={() => pick(journal.id)}
                  style={styles.item}
                >
                  <Text style={styles.itemText}>{journal.name}</Text>
                  <Text style={styles.itemHint}>{hint}</Text>
                </Pressable>
              );
            })}
            {footer}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    right: spacing.lg,
    minWidth: 200,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  itemText: { color: colors.text, fontSize: 16 },
  itemHint: { color: colors.muted, fontSize: 13 },
});
