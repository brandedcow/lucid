import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '../theme';

export const RECENTLY_DELETED_COPY = {
  title: 'Recently Deleted',
  back: 'Back to notes',
  empty: 'Deleted notes will appear here.',
} as const;

/**
 * Recently Deleted, a stub in chunk 7a (the list, restore and Delete forever arrive in 7b).
 * Props: `onBack()`, the back arrow.
 */
export function RecentlyDeletedScreen({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={RECENTLY_DELETED_COPY.back}
          onPress={onBack}
          hitSlop={12}
          style={styles.backButton}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {RECENTLY_DELETED_COPY.title}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.empty}>{RECENTLY_DELETED_COPY.empty}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.text, fontSize: 24 },
  title: { color: colors.text, fontFamily: fonts.serif, fontSize: 34 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { color: colors.muted, fontSize: 16, textAlign: 'center' },
});
