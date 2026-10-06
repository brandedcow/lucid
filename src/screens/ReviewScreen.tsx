import { useEffect, useState } from 'react';
import {
  Alert,
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
import { RecordingPlayer } from '../components/RecordingPlayer';
import { TagInput } from '../components/TagInput';
import { discardRecording, listTags, saveDream } from '../services/dreamStorage';
import { colors, fonts, spacing } from '../theme';
import { addTag } from '../utils/tags';

/**
 * Prop contract (stable; the Review rewrite in a later chunk keeps these names):
 * - transcript: the final edited text from the session; saved with the dream.
 * - audio / durationMs: the recording, if any. durationMs is 0 and audio absent for a written dream.
 *   audio.persisted is true for a reopened draft's permanent file, which is never discarded here.
 * - title / emotion / tags and their setters: session state, so edits survive Review -> Edit -> Review.
 * - onEditTranscript: go back to Read it back to edit the text.
 * - onDone: the finished dream was saved (status 'saved').
 * - onFinishLater / date: not used yet (arrive with the rewrite: save as a draft; header date label).
 * - onBack: the back arrow; the parent decides where it goes.
 * - onRerecord: temporary; called after an unsaved cache recording was deleted (removed by the rewrite).
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
  onEditTranscript: () => void;
  onDone: () => void;
  onFinishLater?: () => void;
  onBack: () => void;
  date?: string;
  onRerecord: () => void;
};

export function ReviewScreen({
  transcript,
  audio,
  durationMs,
  title,
  onTitleChange: setTitle,
  emotion,
  onEmotionChange: setEmotion,
  tags,
  onTagsChange: setTags,
  onEditTranscript,
  onDone,
  onBack,
  onRerecord,
}: ReviewScreenProps) {
  const [draft, setDraft] = useState('');
  const [known, setKnown] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listTags().then(setKnown);
  }, []);

  const canSave = title.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // Include a tag that was typed but not yet confirmed.
      await saveDream({
        // A reopened draft's audio is already in permanent storage.
        ...(audio && !audio.persisted ? { recordingUri: audio.uri } : {}),
        durationMs,
        details: { title, emotion, tags: addTag(tags, draft), transcript },
        status: 'saved',
      });
      onDone();
    } catch {
      Alert.alert('Could not save your dream', 'Please try again.');
      setSaving(false);
    }
  };

  const confirmRerecord = () =>
    Alert.alert('Delete this recording?', 'It will be deleted and cannot be recovered.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete and record again',
        style: 'destructive',
        onPress: () => {
          if (audio && !audio.persisted) discardRecording(audio.uri);
          onRerecord();
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={12}
          >
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onEditTranscript} hitSlop={12}>
            <Text style={styles.editLink}>Edit text</Text>
          </Pressable>
        </View>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title this dream"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Title"
            autoFocus
            maxLength={80}
            returnKeyType="done"
            style={styles.titleInput}
          />

          <View style={styles.field}>
            <Text style={styles.label}>Emotion</Text>
            <TextInput
              value={emotion}
              onChangeText={setEmotion}
              placeholder="How did it feel? (optional)"
              placeholderTextColor={colors.faint}
              maxLength={120}
              returnKeyType="done"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Tags</Text>
            <TagInput
              tags={tags}
              onTagsChange={setTags}
              draft={draft}
              onDraftChange={setDraft}
              suggestions={known}
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {audio && <RecordingPlayer uri={audio.uri} durationMs={audio.durationMs} />}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            disabled={!canSave}
            onPress={save}
            style={[styles.save, !canSave && styles.saveDisabled]}
          >
            <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save dream'}</Text>
          </Pressable>
          {audio && !audio.persisted && (
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={confirmRerecord}
              hitSlop={8}
              style={styles.rerecord}
            >
              <Text style={styles.rerecordLabel}>Delete and record again</Text>
            </Pressable>
          )}
        </View>
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
  back: { color: colors.text, fontSize: 24 },
  editLink: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  content: { padding: spacing.lg, gap: spacing.xl },
  field: { gap: spacing.sm },
  label: { color: colors.faint, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  titleInput: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 36,
    paddingVertical: spacing.sm,
  },
  input: {
    color: colors.text,
    fontSize: 16,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  footer: { padding: spacing.lg, gap: spacing.md },
  save: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.4 },
  saveLabel: { color: colors.accentDark, fontSize: 17, fontWeight: '700' },
  rerecord: { alignItems: 'center', paddingVertical: spacing.sm },
  rerecordLabel: { color: colors.muted, fontSize: 14 },
});
