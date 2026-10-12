import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

/**
 * A "..." button with a Delete menu.
 *
 * Render it as the LAST child of a full-screen container whose top bar has `paddingTop:
 * spacing.sm` and `paddingHorizontal: spacing.lg`: it covers that container (so the backdrop
 * catches taps anywhere) and puts the button at the top-right of the bar. The menu is an
 * in-screen overlay, not a Modal, so an Alert opened right after picking an item still shows on iOS.
 *
 * - onDelete is optional; the menu shows only the items it is given (the add-entry page gives only
 *   onDelete).
 * - top / right: where the button sits (default: the bar of a screen with its own top bar at the
 *   edge; the add-entry page puts it left of its check). The card follows the button.
 * - disabled: items are disabled and the menu closes (the screen is busy deleting).
 * - deleteDisabled: only the Delete item is disabled and dimmed (default false); the button stays
 *   usable.
 */
type Props = {
  onDelete?: () => void;
  disabled?: boolean;
  deleteDisabled?: boolean;
  /** Wording for the item label; defaults to the Dream wording ("Delete dream"). */
  deleteLabel?: string;
  /** The visible text of the Delete item; defaults to "Delete". */
  deleteText?: string;
  /** Offsets of the button from the container's top and right edge. */
  top?: number;
  right?: number;
};

export function OverflowMenu({
  onDelete,
  disabled = false,
  deleteDisabled = false,
  deleteLabel = 'Delete dream',
  deleteText = 'Delete',
  top = BAR_TOP,
  right = BAR_RIGHT,
}: Props) {
  const [open, setOpen] = useState(false);
  const visible = open && !disabled;

  // Going disabled closes the menu for good (it does not reopen when re-enabled).
  if (disabled && open) setOpen(false);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  const pick = (callback: () => void) => {
    setOpen(false);
    callback();
  };

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More options"
        accessibilityState={{ expanded: visible, disabled }}
        disabled={disabled}
        onPress={() => setOpen((o) => !o)}
        style={[styles.button, { top, right }]}
      >
        <View style={styles.dots}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </Pressable>
      {visible && (
        <View accessibilityViewIsModal style={styles.layer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={() => setOpen(false)}
            style={styles.backdrop}
          />
          <View testID="overflow-menu-card" style={[styles.card, { top: top + 44, right }]}>
            {onDelete && (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityLabel={deleteLabel}
                accessibilityState={{ disabled: disabled || deleteDisabled }}
                disabled={disabled || deleteDisabled}
                onPress={() => pick(onDelete)}
                style={styles.item}
              >
                <Text style={[styles.itemText, styles.delete, deleteDisabled && styles.dimmed]}>
                  {deleteText}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const BAR_TOP = spacing.sm;
const BAR_RIGHT = spacing.lg;

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill },
  backdrop: { ...StyleSheet.absoluteFill },
  button: {
    position: 'absolute',
    top: BAR_TOP,
    right: BAR_RIGHT,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  dots: { gap: 4, alignItems: 'center', paddingRight: 8 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.text },
  card: {
    position: 'absolute',
    top: BAR_TOP + 44,
    right: BAR_RIGHT,
    minWidth: 160,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  itemText: { color: colors.text, fontSize: 16 },
  delete: { color: colors.draft },
  dimmed: { opacity: 0.4 },
});
