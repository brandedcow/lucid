import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** Magnifier drawn with Views (no icon library). Hidden from screen readers; the button names it. */
export function SearchIcon() {
  return (
    <View style={styles.iconBox} importantForAccessibility="no-hide-descendants">
      <View style={styles.lens} />
      <View style={styles.handle} />
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: { width: 22, height: 22 },
  lens: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.muted,
  },
  handle: {
    position: 'absolute',
    right: 1,
    bottom: 3,
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.muted,
    transform: [{ rotate: '45deg' }],
  },
});
