import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '../theme';

/**
 * Props:
 * - `autoOpenDreamCapture`: whether the app opens to dream capture on launch.
 * - `onChangeAutoOpenDreamCapture(value)`: the switch was toggled.
 * - `onlineTranscription`: whether voice notes may be transcribed on Apple's / Google's servers
 *   when this phone cannot do it itself (default off).
 * - `onChangeOnlineTranscription(value)`: turning it ON is called only after the user confirms the
 *   Alert; turning it OFF is called at once.
 * - `onBack()`: the back arrow.
 */
type Props = {
  autoOpenDreamCapture: boolean;
  onChangeAutoOpenDreamCapture: (value: boolean) => void;
  onlineTranscription: boolean;
  onChangeOnlineTranscription: (value: boolean) => void;
  onBack: () => void;
};

const ROW_LABEL = 'Open dream capture on launch';
const ONLINE_LABEL = 'Transcribe voice notes online';

// The provider is named for the platform: iOS speech recognition is Apple's, Android's is Google's.
const provider = () => (Platform.OS === 'ios' ? 'Apple' : 'Google');

export function SettingsScreen({
  autoOpenDreamCapture,
  onChangeAutoOpenDreamCapture,
  onlineTranscription,
  onChangeOnlineTranscription,
  onBack,
}: Props) {
  // OFF is immediate. ON needs a confirmation naming the provider; Cancel changes and saves nothing.
  const changeOnline = (value: boolean) => {
    if (!value) {
      onChangeOnlineTranscription(false);
      return;
    }
    Alert.alert(
      'Allow online transcription?',
      `When this phone can't transcribe a voice note by itself, Lucid will send that note's audio to ${provider()}'s speech service to turn it into text. Their privacy policy applies, and Lucid can't control how they handle it. Audio is only sent when you tap Transcribe. You can turn this off at any time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Turn on', onPress: () => onChangeOnlineTranscription(true) },
      ],
    );
  };

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

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.label}>{ONLINE_LABEL}</Text>
          <Text style={styles.helper}>
            {`Off: voice notes are transcribed only on this phone. On: if this phone can't do it, a note's audio is sent to ${provider()} to be transcribed.`}
          </Text>
        </View>
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={ONLINE_LABEL}
          accessibilityState={{ checked: onlineTranscription }}
          value={onlineTranscription}
          onValueChange={changeOnline}
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
