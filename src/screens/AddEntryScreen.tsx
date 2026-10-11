import { ReactNode, useEffect, useState } from 'react';
import {
  Keyboard,
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
import { JournalMenu, JournalPill } from '../components/JournalPicker';
import { TagInput } from '../components/TagInput';
import { listTags } from '../services/dreamStorage';
import { colors, fonts, spacing } from '../theme';
import { JournalId } from '../types/entry';
import { BUILT_IN_JOURNALS, Journal, journalCopy, titleRequired } from '../utils/journals';

/**
 * Prop contract:
 * - journal: the entry's journal; shown in the pill. Sets whether the check needs a title (Dreams
 *   yes, other kinds no) and the check's label, so it follows the picker live.
 * - journals / onJournalChange: the registry rows the pill's dropdown offers (the parent leaves out
 *   a journal being deleted) and the pick handler. Without onJournalChange the pill is display only.
 * - journalLocked: a reopened draft or a saved entry never moves journals; the pill is a plain
 *   label with no chevron.
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
  journals?: readonly Journal[];
  onJournalChange?: (journalId: JournalId) => void;
  journalLocked?: boolean;
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
  journals = [],
  onJournalChange,
  journalLocked = false,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [topBarBottom, setTopBarBottom] = useState(56);
  const pickable = !!onJournalChange && !journalLocked && journals.length > 0;
  // The menu closes for good when the picker stops being available (a save started, or the entry
  // got locked).
  const showMenu = menuOpen && pickable && !saving;

  useEffect(() => {
    listTags().then(setKnownTags);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={styles.topBar}
          onLayout={(e) => setTopBarBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
        >
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
          <JournalPill
            journal={journal}
            open={showMenu}
            locked={!pickable}
            disabled={saving}
            onPress={() => {
              Keyboard.dismiss();
              setMenuOpen((open) => !open);
            }}
          />
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
        {showMenu && (
          <JournalMenu
            journals={journals}
            selectedId={journal.id}
            top={topBarBottom + spacing.xs}
            onPick={(id) => {
              setMenuOpen(false);
              if (id !== journal.id) onJournalChange?.(id);
            }}
            onClose={() => setMenuOpen(false)}
          />
        )}
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
