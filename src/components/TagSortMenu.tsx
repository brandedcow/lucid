import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TagSortOrder } from '../services/settingsStorage';
import { colors, spacing } from '../theme';

/**
 * The tag-sort menu of the Notes drawer: a small card that opens upward from the footer's sort button.
 *
 * Render it as the LAST child of the drawer panel's `SafeAreaView`: it is a full-size layer over the
 * panel (a "Close sort menu" backdrop and the card), an in-screen overlay and not a Modal. It must not
 * be a child of the footer positioned outside the footer's bounds (Android does not deliver touches
 * there). The trigger button lives in the drawer; this component only draws the open layer.
 *
 * - `open` / `onOpenChange`: the parent owns whether it is open. Picking an item calls `onChange`, then closes.
 * - `value`: the current order, marked `selected`.
 * - `disabled`: nothing opens (and an open menu draws nothing).
 * - `bottom` / `right`: where the card sits, measured from the layer's bottom and right edges.
 * - Android Back closes the menu first (its listener is registered only while open, after the drawer's).
 */
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: TagSortOrder;
  onChange: (order: TagSortOrder) => void;
  disabled?: boolean;
  bottom: number;
  right: number;
};

const ITEMS: readonly { order: TagSortOrder; label: string; text: string }[] = [
  { order: 'alpha', label: 'Sort tags alphabetically', text: 'A to Z' },
  { order: 'count', label: 'Sort tags by number of notes', text: 'Most notes' },
];

export function TagSortMenu({
  open,
  onOpenChange,
  value,
  onChange,
  disabled = false,
  bottom,
  right,
}: Props) {
  const visible = open && !disabled;

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onOpenChange(false);
      return true;
    });
    return () => sub.remove();
  }, [visible, onOpenChange]);

  if (!visible) return null;
  return (
    <View testID="tag-sort-menu" accessibilityViewIsModal style={styles.layer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close sort menu"
        onPress={() => onOpenChange(false)}
        style={styles.backdrop}
      />
      <View testID="tag-sort-menu-card" style={[styles.card, { bottom, right }]}>
        {ITEMS.map((item) => (
          <Pressable
            key={item.order}
            accessibilityRole="menuitem"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: value === item.order }}
            onPress={() => {
              onChange(item.order);
              onOpenChange(false);
            }}
            style={styles.item}
          >
            <Text style={styles.itemText}>{item.text}</Text>
            {value === item.order && (
              <Text style={styles.check} importantForAccessibility="no-hide-descendants">
                ✓
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill },
  backdrop: { ...StyleSheet.absoluteFill },
  card: {
    position: 'absolute',
    minWidth: 180,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  itemText: { color: colors.text, fontSize: 16 },
  check: { color: colors.accent, fontSize: 16, marginLeft: spacing.md },
});
