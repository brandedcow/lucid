import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecordingPlayer } from '../components/RecordingPlayer';
import { colors, fonts, spacing } from '../theme';

/**
 * Prop contract (stable; a later chunk restyles this screen without changing it):
 * - text / onChangeText: the session transcript, controlled by the parent.
 * - audio: the recording to play back, if there is one (absent for Write instead).
 * - autoFocus: focus the text box on entry (Write instead with empty text only).
 * - onContinue: go on to Review. Enabled when the text is not blank or audio exists.
 * - onBack: the back arrow; the parent decides where it goes (and any confirmation).
 * - date: header date label.
 */
export type ReadItBackScreenProps = {
  text: string;
  onChangeText: (text: string) => void;
  audio?: { uri: string; durationMs: number };
  autoFocus: boolean;
  onContinue: () => void;
  onBack: () => void;
  date: string;
};

// Minimal working version; restyled per the mockup in a later chunk.
export function ReadItBackScreen({
  text,
  onChangeText,
  audio,
  autoFocus,
  onContinue,
  onBack,
  date,
}: ReadItBackScreenProps) {
  const canContinue = text.trim().length > 0 || !!audio;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={12}
          >
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.date}>{date}</Text>
        </View>

        <Text style={styles.heading}>Read it back</Text>

        <TextInput
          value={text}
          onChangeText={onChangeText}
          placeholder="Write your dream"
          placeholderTextColor={colors.faint}
          accessibilityLabel="Dream text"
          autoFocus={autoFocus}
          multiline
          scrollEnabled
          textAlignVertical="top"
          style={styles.input}
        />

        <View style={styles.footer}>
          {audio && <RecordingPlayer uri={audio.uri} durationMs={audio.durationMs} />}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
            disabled={!canContinue}
            onPress={onContinue}
            style={[styles.continue, !canContinue && styles.continueDisabled]}
          >
            <Text style={styles.continueLabel}>Continue</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  back: { color: colors.text, fontSize: 24 },
  date: { color: colors.muted, fontSize: 13 },
  heading: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 32,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    lineHeight: 26,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  footer: { padding: spacing.lg, gap: spacing.md },
  continue: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueDisabled: { opacity: 0.4 },
  continueLabel: { color: colors.accentDark, fontSize: 17, fontWeight: '700' },
});
