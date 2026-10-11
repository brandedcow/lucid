import { ReactNode, useEffect, useState } from 'react';
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
import { TagInput } from '../components/TagInput';
import { listTags } from '../services/dreamStorage';
import { colors, fonts, spacing } from '../theme';
import { BUILT_IN_JOURNALS, Journal, journalCopy, titleRequired } from '../utils/journals';

/**
 * Prop contract:
 * - journal: the entry's journal; shown in the pill (display only for now). Sets whether the
 *   check needs a title (Dreams yes, other kinds no) and the check's label.
 * - title / body / tags / tagDraft and their setters: session state (the body is stored as the
 *   entry's transcript). There is no emotion field here.
 * - date: the date line ("Sunday, October 6").
 * - onSave: the check; the parent saves a finished entry. Disabled until there is a title when the
 *   journal requires one, and while a save is in flight.
 * - onBack: the back arrow; the parent decides what it does (leave prompt, close).
 * - saving: a save is in flight; the check and back do nothing and the fields are locked.
 * - autoFocus: focus the title on open (a new entry).
 * - attachment: slot above the title for the voice attachment card (later).
 * - toolbar: slot at the bottom, above the keyboard, for undo / redo / mic / # (later).
 */
export type AddEntryScreenProps = {
  journal?: Journal;
  title: string;
  onTitleChange: (title: string) => void;
  body: string;
  onBodyChange: (body: string) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  tagDraft: string;
  onTagDraftChange: (text: string) => void;
  date: string;
  onSave: () => void;
  onBack: () => void;
  saving?: boolean;
  autoFocus?: boolean;
  attachment?: ReactNode;
  toolbar?: ReactNode;
};

export function AddEntryScreen({
  journal = BUILT_IN_JOURNALS[0],
  title,
  onTitleChange,
  body,
  onBodyChange,
  tags,
  onTagsChange,
  tagDraft,
  onTagDraftChange,
  date,
  onSave,
  onBack,
  saving = false,
  autoFocus = false,
  attachment,
  toolbar,
}: AddEntryScreenProps) {
  const copy = journalCopy(journal);
  const canSave = (!titleRequired(journal.kind) || title.trim().length > 0) && !saving;
  const [knownTags, setKnownTags] = useState<string[]>([]);

  useEffect(() => {
    listTags().then(setKnownTags);
  }, []);

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
            accessibilityState={{ disabled: saving }}
            onPress={() => {
              if (!saving) onBack();
            }}
            hitSlop={12}
            style={styles.iconButton}
          >
            <Text style={styles.back}>←</Text>
          </Pressable>
          <View accessibilityLabel={`Journal: ${journal.name}`} style={styles.pill}>
            <Text style={styles.pillLabel} numberOfLines={1}>
              {journal.name}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.saveButton}
            accessibilityState={{ disabled: !canSave }}
            disabled={!canSave}
            onPress={onSave}
            hitSlop={8}
            style={[styles.check, !canSave && styles.checkDisabled]}
          >
            <Text style={styles.checkMark}>✓</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {attachment}
          <Text style={styles.date}>{date}</Text>
          <TextInput
            value={title}
            onChangeText={onTitleChange}
            editable={!saving}
            placeholder="Title..."
            placeholderTextColor={colors.faint}
            accessibilityLabel="Title"
            autoFocus={autoFocus}
            maxLength={80}
            returnKeyType="next"
            style={styles.titleInput}
          />
          <TextInput
            value={body}
            onChangeText={onBodyChange}
            editable={!saving}
            placeholder="Start writing..."
            placeholderTextColor={colors.faint}
            accessibilityLabel="Entry text"
            multiline
            textAlignVertical="top"
            style={styles.bodyInput}
          />
          <View pointerEvents={saving ? 'none' : 'auto'}>
            <TagInput
              tags={tags}
              onTagsChange={onTagsChange}
              draft={tagDraft}
              onDraftChange={onTagDraftChange}
              suggestions={knownTags}
              disabled={saving}
            />
          </View>
        </ScrollView>
        {toolbar}
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
  iconButton: { width: 40 },
  back: { color: colors.text, fontSize: 24 },
  pill: {
    maxWidth: '60%',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillLabel: { color: colors.text, fontSize: 14 },
  check: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDisabled: { opacity: 0.4 },
  checkMark: { color: colors.accentDark, fontSize: 20, fontWeight: '700' },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  date: { color: colors.muted, fontSize: 13 },
  titleInput: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 32,
    paddingVertical: spacing.sm,
  },
  bodyInput: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 26,
    minHeight: 160,
    paddingVertical: spacing.sm,
  },
});
