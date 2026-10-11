import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '../theme';

/**
 * Props:
 * - `autoOpenDreamCapture`: whether the app opens to dream capture on launch.
 * - `onChangeAutoOpenDreamCapture(value)`: the switch was toggled.
 * - `onBack()`: the back arrow.
 */
type Props = {
  autoOpenDreamCapture: boolean;
  onChangeAutoOpenDreamCapture: (value: boolean) => void;
  onBack: () => void;
};

const ROW_LABEL = 'Open dream capture on launch';

export function SettingsScreen({
  autoOpenDreamCapture,
  onChangeAutoOpenDreamCapture,
  onBack,
}: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Today"
          onPress={onBack}
          hitSlop={12}
          style={styles.backButton}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>
      </View>

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.label}>{ROW_LABEL}</Text>
          <Text style={styles.helper}>When off, the app opens to Today.</Text>
        </View>
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={ROW_LABEL}
          accessibilityState={{ checked: autoOpenDreamCapture }}
          value={autoOpenDreamCapture}
          onValueChange={onChangeAutoOpenDreamCapture}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.text}
          ios_backgroundColor={colors.border}
        />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  rowText: { flex: 1, gap: spacing.xs },
  label: { color: colors.text, fontSize: 17 },
  helper: { color: colors.muted, fontSize: 14 },
});
