import { useEffect, useState } from 'react';
import {
  Keyboard,
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
import { formatDuration } from '../utils/format';

/**
 * Prop contract (stable):
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

/** True while the on-screen keyboard is showing. */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

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
  const keyboardVisible = useKeyboardVisible();

  const handleContinue = () => {
    Keyboard.dismiss();
    onContinue();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={12}
            style={styles.headerSide}
          >
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.date}>Dream · {date}</Text>
          <View style={styles.headerSide} />
        </View>

        <Text accessibilityRole="header" style={styles.heading}>
          Read it back
        </Text>
        <Text style={styles.subtitle}>
          Fix anything that came out wrong, and add what comes back to you.
        </Text>

        <TextInput
          value={text}
          onChangeText={onChangeText}
          placeholder="Type what you remember"
          placeholderTextColor={colors.faint}
          accessibilityLabel="Dream text"
          autoFocus={autoFocus}
          multiline
          scrollEnabled
          textAlignVertical="top"
          style={styles.input}
        />

        <View style={styles.footer}>
          {audio && !keyboardVisible && (
            <RecordingPlayer
              uri={audio.uri}
              durationMs={audio.durationMs}
              label={`Original recording · ${formatDuration(Math.round(audio.durationMs / 1000))} · always kept`}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue"
            accessibilityState={{ disabled: !canContinue }}
            disabled={!canContinue}
            onPress={handleContinue}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerSide: { width: 40 },
  back: { color: colors.text, fontSize: 24 },
  date: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 13 },
  heading: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 34,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 20,
    lineHeight: 30,
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
