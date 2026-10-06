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
import { FinishedRecording } from '../hooks/useDreamRecorder';
import { discardRecording, listTags, saveDream } from '../services/dreamStorage';
import { colors, fonts, spacing } from '../theme';
import { addTag } from '../utils/tags';

type Props = {
  recording: FinishedRecording;
  onSaved: () => void;
  /** Called after the unsaved recording has been deleted; returns to capture. */
  onRerecord: () => void;
};

export function ReviewScreen({ recording, onSaved, onRerecord }: Props) {
  const [title, setTitle] = useState('');
  const [emotion, setEmotion] = useState('');
  const [tags, setTags] = useState<string[]>([]);
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
      await saveDream(recording.uri, recording.durationMs, {
        title,
        emotion,
        tags: addTag(tags, draft),
      });
      onSaved();
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
          discardRecording(recording.uri);
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
          <RecordingPlayer uri={recording.uri} durationMs={recording.durationMs} />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            disabled={!canSave}
            onPress={save}
            style={[styles.save, !canSave && styles.saveDisabled]}
          >
            <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save dream'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={confirmRerecord}
            hitSlop={8}
            style={styles.rerecord}
          >
            <Text style={styles.rerecordLabel}>Delete and record again</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
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
