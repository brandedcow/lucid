import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { JournalError } from '../services/journalStorage';
import { colors, fonts, spacing } from '../theme';
import {
  JOURNAL_NAME_MAX,
  JournalNameProblem,
  normalizeJournalName,
  validateJournalName,
} from '../utils/journalName';

/** All wording of the name sheet, in one place. */
export const NEW_JOURNAL_COPY = {
  title: 'New journal',
  submit: 'Create',
  cancel: 'Cancel',
  placeholder: 'Journal name',
  empty: 'Give the journal a name.',
  tooLong: `Use ${JOURNAL_NAME_MAX} characters or fewer.`,
  duplicate: (name: string) => `A journal named "${name}" already exists.`,
  saveFailed: "Couldn't save the journal. Please try again.",
  closeLabel: 'Close',
} as const;

/**
 * A bottom sheet with one text field that asks for a journal name. Used to create a journal; the
 * props let a later rename reuse it.
 *
 * It is an in-screen overlay, not a Modal (like AddEntryMenu), so render it inside the
 * SafeAreaProvider, over a full-screen container. It does not animate.
 *
 * - visible: shown or not. Hiding it forgets the typed name; showing it starts from `initialName`.
 * - onClose: Cancel, the backdrop and Android back (not while saving); also called after a
 *   successful `onSubmit`, unless the sheet was hidden meanwhile.
 * - onSubmit(name): gets the normalized name. Resolves on success. A rejection keeps the sheet
 *   open with the name kept and an inline error (a JournalError for a bad name shows its reason).
 * - existing: ALL journals (built-in ones too), for the name check.
 * - excludeId: a journal that may keep its own name (the one being renamed).
 * - initialName, title ("New journal"), submitLabel ("Create"): wording and start value.
 *
 * "Give the journal a name" shows only after a submit attempt on an empty name; "too long" and
 * "already exists" show as soon as they apply. Create is disabled while the name is empty or
 * invalid and while saving; everything is locked while saving.
 */
type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  existing: readonly { id: string; name: string }[];
  excludeId?: string;
  initialName?: string;
  title?: string;
  submitLabel?: string;
};

export function NewJournalSheet({ visible, ...rest }: Props) {
  // The inner sheet holds the state, so hiding unmounts it and the next opening starts fresh.
  return visible ? <Sheet {...rest} /> : null;
}

function problemMessage(reason: JournalNameProblem, name: string): string {
  switch (reason) {
    case 'empty':
      return NEW_JOURNAL_COPY.empty;
    case 'too-long':
      return NEW_JOURNAL_COPY.tooLong;
    case 'duplicate':
      return NEW_JOURNAL_COPY.duplicate(name);
  }
}

function Sheet({
  onClose,
  onSubmit,
  existing,
  excludeId,
  initialName = '',
  title = NEW_JOURNAL_COPY.title,
  submitLabel = NEW_JOURNAL_COPY.submit,
}: Omit<Props, 'visible'>) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const [name, setName] = useState(initialName);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  // The message of a failed save (or a bad name found by the storage); cleared when typing.
  const [failure, setFailure] = useState<string | null>(null);
  const mounted = useRef(true);
  const savingRef = useRef(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Android back closes the sheet; it is swallowed while saving.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!savingRef.current) closeRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const result = validateJournalName(name, existing, excludeId);
  const shown = normalizeJournalName(name);
  let message: string | null = failure;
  if (!message && !result.ok && (result.reason !== 'empty' || attempted)) {
    message = problemMessage(result.reason, shown);
  }

  const submit = async () => {
    if (savingRef.current) return;
    if (!result.ok) {
      setAttempted(true);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFailure(null);
    try {
      await onSubmit(result.name);
      if (mounted.current) onClose();
    } catch (e) {
      if (!mounted.current) return;
      setFailure(
        e instanceof JournalError && e.code === 'invalid-name' && e.reason
          ? problemMessage(e.reason, shown)
          : NEW_JOURNAL_COPY.saveFailed,
      );
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const cancel = () => {
    if (!savingRef.current) onClose();
  };

  // Swipe down on the grabber and the title dismisses the sheet (and the keyboard) like Cancel. The
  // input below is not wired, so text selection and its touches are untouched.
  const sheetHeight = useRef(0);
  const swipe = useSheetDismiss({
    onDismiss: () => {
      Keyboard.dismiss();
      cancel();
    },
    enabled: !saving,
    getHeight: () => sheetHeight.current,
  });

  // Android only: edge-to-edge means the window does not resize for the keyboard, so
  // KeyboardAvoidingView does nothing there and the IME would cover the sheet. Lift it by the
  // keyboard height plus the system bar inset (the rule AddEntryMenu uses); the sheet's own bottom
  // padding then drops its inset share. iOS keeps KeyboardAvoidingView and is unchanged.
  const keyboardLift = Platform.OS === 'android' && keyboard.visible ? keyboard.height : 0;

  return (
    <View accessibilityViewIsModal style={styles.layer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={NEW_JOURNAL_COPY.closeLabel}
        disabled={saving}
        onPress={cancel}
        style={[styles.layer, styles.backdrop]}
      />
      <KeyboardAvoidingView
        pointerEvents="box-none"
        style={[
          styles.avoider,
          keyboardLift > 0 && { paddingBottom: keyboardLift + insets.bottom },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View
          onLayout={(e) => {
            sheetHeight.current = e.nativeEvent.layout.height;
          }}
          style={[
            styles.sheet,
            { paddingBottom: (keyboardLift > 0 ? 0 : insets.bottom) + spacing.lg },
            { transform: [{ translateY: swipe.dragY }] },
          ]}
        >
          <View testID="sheet-grabber" style={styles.grabberTarget} {...swipe.panHandlers}>
            <View style={styles.grabber} importantForAccessibility="no" />
          </View>
          <Text style={styles.title} accessibilityRole="header" {...swipe.panHandlers}>
            {title}
          </Text>
          <TextInput
            value={name}
            onChangeText={(text) => {
              setName(text);
              setFailure(null);
            }}
            onSubmitEditing={() => void submit()}
            editable={!saving}
            autoFocus
            placeholder={NEW_JOURNAL_COPY.placeholder}
            placeholderTextColor={colors.faint}
            accessibilityLabel={NEW_JOURNAL_COPY.placeholder}
            autoCapitalize="sentences"
            autoCorrect={false}
            returnKeyType="done"
            submitBehavior="submit"
            style={styles.input}
          />
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.message, !message && styles.messageEmpty]}
          >
            {message ?? ''}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={NEW_JOURNAL_COPY.cancel}
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={cancel}
              style={[styles.button, styles.cancel, saving && styles.dim]}
            >
              <Text style={styles.cancelText}>{NEW_JOURNAL_COPY.cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
              accessibilityState={{ disabled: saving || !result.ok, busy: saving }}
              disabled={saving || !result.ok}
              onPress={() => void submit()}
              style={[styles.button, styles.submit, (saving || !result.ok) && styles.dim]}
            >
              <Text style={styles.submitText}>{submitLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // A taller touch target around the 4 px bar; the negative margin keeps the layout unchanged.
  grabberTarget: { paddingVertical: 12, marginVertical: -12 },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.faint,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 22,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 18,
  },
  message: { color: colors.draft, fontSize: 14, paddingTop: spacing.sm, minHeight: 28 },
  messageEmpty: { opacity: 0 },
  actions: { flexDirection: 'row', gap: spacing.sm + 2, paddingTop: spacing.md },
  button: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  cancelText: { color: colors.text, fontSize: 17 },
  submit: { backgroundColor: colors.accent },
  submitText: { color: colors.accentDark, fontSize: 17, fontWeight: '600' },
  dim: { opacity: 0.5 },
});
