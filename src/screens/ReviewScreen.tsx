import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmotionChips } from '../components/EmotionChips';
import { MicIcon } from '../components/MicIcon';
import { TagInput } from '../components/TagInput';
import { listEmotions, listTags } from '../services/dreamStorage';
import { colors, fonts, spacing } from '../theme';
import { displayEmotions, storeEmotionInput } from '../utils/emotions';
import { countWords, formatDuration } from '../utils/format';

/**
 * Prop contract:
 * - transcript: the final edited text from the session; shown as a 3-line preview.
 * - audio / durationMs: the recording, if any. durationMs is 0 and audio absent for a written dream.
 * - title / emotion / tags / tagDraft and their setters: session state, so edits (including tag text
 *   typed but not yet confirmed) survive Review -> Edit -> Review.
 * - onEditTranscript: go back to Read it back to edit the text (the whole preview card is the button).
 * - onDone / onFinishLater: the parent saves the session (as 'saved' / as a draft) and leaves.
 *   Done is disabled until there is a title; Finish later is available unless a save is in flight.
 * - saving: a save is in flight; Done, Finish later and the back arrow do nothing, and the card and
 *   all fields are locked so a late edit cannot be lost.
 * - onBack: the back arrow; the parent decides where it goes.
 * - date: label shown in the header ("Dream · <date>").
 */
export type ReviewScreenProps = {
  transcript: string;
  audio?: { uri: string; durationMs: number; persisted: boolean };
  durationMs: number;
  title: string;
  onTitleChange: (title: string) => void;
  emotion: string;
  onEmotionChange: (emotion: string) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  tagDraft: string;
  onTagDraftChange: (text: string) => void;
  onEditTranscript: () => void;
  onDone: () => void;
  onFinishLater: () => void;
  saving?: boolean;
  onBack: () => void;
  date?: string;
};

export function ReviewScreen({
  transcript,
  audio,
  durationMs,
  title,
  onTitleChange,
  emotion,
  onEmotionChange,
  tags,
  onTagsChange,
  tagDraft,
  onTagDraftChange,
  onEditTranscript,
  onDone,
  onFinishLater,
  saving = false,
  onBack,
  date,
}: ReviewScreenProps) {
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [knownEmotions, setKnownEmotions] = useState<string[]>([]);

  useEffect(() => {
    listTags().then(setKnownTags);
    listEmotions().then(setKnownEmotions);
  }, []);

  const canDone = title.trim().length > 0 && !saving;
  const words = countWords(transcript);
  const wordLabel = `${words} ${words === 1 ? 'word' : 'words'}`;
  const firstLine =
    transcript
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? 'No text yet';
  const cardLabel = `Edit text. ${firstLine}, ${wordLabel}`;
  const meta = audio
    ? `${formatDuration(Math.round(durationMs / 1000))} · ${wordLabel}`
    : wordLabel;

  return (
    <SafeAreaView style={styles.container}>
      {/* Android: no keyboard behavior here, assuming edge-to-edge/adjustResize already moves the
          content. Unverified on a device; Read it back uses 'padding' on both platforms. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            accessibilityState={{ disabled: saving }}
            onPress={() => {
              if (!saving) onBack();
            }}
            hitSlop={12}
            style={styles.backButton}
          >
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.date}>{date ? `Dream · ${date}` : 'Dream'}</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.field}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              value={title}
              onChangeText={onTitleChange}
              editable={!saving}
              placeholder="Name this dream"
              placeholderTextColor={colors.faint}
              accessibilityLabel="Title"
              autoFocus={title.length === 0}
              maxLength={80}
              returnKeyType="done"
              style={styles.titleInput}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cardLabel}
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={onEditTranscript}
            style={styles.card}
          >
            <Text numberOfLines={3} style={styles.preview}>
              {transcript.trim() ? transcript : 'No text yet'}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaLeft}>
                {audio && <MicIcon color={colors.muted} size={14} />}
                <Text style={styles.meta}>{meta}</Text>
              </View>
              <Text style={styles.edit}>Edit ›</Text>
            </View>
          </Pressable>

          <View style={styles.field} pointerEvents={saving ? 'none' : 'auto'}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>How did it feel?</Text>
              <Text style={styles.optional}>Optional</Text>
            </View>
            <TextInput
              value={displayEmotions(emotion)}
              onChangeText={(text) => onEmotionChange(storeEmotionInput(text))}
              editable={!saving}
              placeholder="Your own word..."
              placeholderTextColor={colors.faint}
              accessibilityLabel="How did it feel?"
              maxLength={120}
              returnKeyType="done"
              style={styles.input}
            />
            <EmotionChips known={knownEmotions} value={emotion} onChange={onEmotionChange} />
          </View>

          <View style={styles.field} pointerEvents={saving ? 'none' : 'auto'}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Tags</Text>
              <Text style={styles.optional}>Optional</Text>
            </View>
            <TagInput
              tags={tags}
              onTagsChange={onTagsChange}
              draft={tagDraft}
              onDraftChange={onTagDraftChange}
              suggestions={knownTags}
            />
          </View>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canDone }}
              disabled={!canDone}
              onPress={onDone}
              style={[styles.done, !canDone && styles.doneDisabled]}
            >
              <Text style={styles.doneLabel}>{saving ? 'Saving…' : 'Done'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={onFinishLater}
              hitSlop={8}
              style={styles.later}
            >
              <Text style={styles.laterLabel}>Finish later</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  backButton: { width: 32 },
  back: { color: colors.text, fontSize: 24 },
  date: { color: colors.muted, fontSize: 13 },
  content: { padding: spacing.lg, gap: spacing.lg },
  field: { gap: spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: colors.faint, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  optional: { color: colors.faint, fontSize: 12 },
  titleInput: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 32,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  preview: { color: colors.text, fontFamily: fonts.serif, fontSize: 16, lineHeight: 24 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { color: colors.muted, fontSize: 13 },
  edit: { color: colors.muted, fontSize: 13 },
  input: {
    color: colors.text,
    fontSize: 16,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  footer: { gap: spacing.md, paddingTop: spacing.md },
  done: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneDisabled: { opacity: 0.4 },
  doneLabel: { color: colors.accentDark, fontSize: 17, fontWeight: '700' },
  later: { alignItems: 'center', paddingVertical: spacing.sm },
  laterLabel: { color: colors.muted, fontSize: 14 },
});
