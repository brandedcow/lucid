import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** Closed book drawn with Views (no icon library). Hidden from screen readers; the button names it. */
export function BookIcon() {
  return (
    <View style={styles.box} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={styles.cover} />
      <View style={styles.spine} />
    </View>
  );
}

/** Gear drawn with Views: a ring with a dot. Hidden from screen readers; the button names it. */
export function GearIcon() {
  return (
    <View style={styles.box} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={styles.ring}>
        <View style={styles.hub} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  cover: {
    width: 16,
    height: 20,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: colors.muted,
  },
  spine: {
    position: 'absolute',
    left: 6,
    top: 1,
    width: 2,
    height: 20,
    backgroundColor: colors.muted,
  },
  ring: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 4,
    borderStyle: 'dotted',
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hub: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: colors.muted },
});
