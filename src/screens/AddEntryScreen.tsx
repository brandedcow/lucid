import { ReactNode, useState } from 'react';
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
import { TaggedBodyInput } from '../components/TaggedBodyInput';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { JournalMenu, JournalPill } from '../components/JournalPicker';
import { colors, fonts, spacing } from '../theme';
import { JournalId } from '../types/entry';
import { BUILT_IN_JOURNALS, Journal, journalCopy, titleRequired } from '../utils/journals';
import { BODY_MIN, layoutBudget } from '../utils/entryLayout';

type Selection = { start: number; end: number };

/**
 * Prop contract:
 * - journal: the entry's journal; shown in the pill. Sets whether the check needs a title (Dreams
 *   yes, other kinds no) and the check's label, so it follows the picker live.
 * - journals / onJournalChange: the registry rows the pill's dropdown offers (the parent leaves out
 *   a journal being deleted) and the pick handler. Without onJournalChange the pill is display only.
 * - journalLocked: a reopened draft or a saved entry never moves journals; the pill is a plain
 *   label with no chevron.
 * - title / body and their setters: session state (the body is stored as the entry's transcript;
 *   tags are `#tag` words typed in it). There is no emotion field here.
 * - date: the date line ("Sunday, October 6").
 * - onSave: the check; the parent saves a finished entry. Disabled until there is a title when the
 *   journal requires one, and while a save is in flight.
 * - onBack: the back arrow; the parent decides what it does (leave prompt, close).
 * - saving: a save is in flight; the check and back do nothing and the fields are locked.
 * - autoFocus: focus the title on open (a new entry).
 * - saveDisabled: the check is off for a reason the page does not know (a recording is running).
 * - attachment: slot above the title for the saved voice note cards (see AddEntryWithVoice). It sits in
 *   a scroll view of its own capped at about 25% of the visible page height (never less than one
 *   card; one note is not capped), so the notes cannot push the typing area off the screen.
 * - recordingPanel: slot pinned below the capped notes list (the live recording controls), outside
 *   its scroll so they are never scrolled away.
 *
 *   There is no page-level scroll view: the date, title, notes and panel stay put and the body fills
 *   the rest and scrolls inside itself (a native multiline input keeps its own caret visible).
 * - suggestions: slot directly above the toolbar for the tag suggestion bar (see AddEntryWithVoice).
 * - toolbar: slot at the bottom for undo / redo / mic / # (see AddEntryWithVoice). It sits in the
 *   bottom dock, which is lifted above the keyboard (explicit padding on Android, where edge-to-edge
 *   means the window does not resize; KeyboardAvoidingView on iOS) and above the bottom safe-area
 *   inset when the keyboard is closed.
 * - onBodyBlur: the body lost focus (ends a typing step in the undo history).
 * - onBodyFocus: the body gained focus (the tag suggestion bar only shows while it has focus).
 * - onBodySelectionChange: the body's cursor / selection moved (the page tracks it for the # button).
 * - bodySelection: forces the body's cursor (set after the # button or a tag suggestion changes the
 *   text); leave undefined otherwise so the input manages it. The body input is a TaggedBodyInput:
 *   it has no `value` prop, so a programmatic change to `body` (undo, redo, the # button, a tag
 *   completion) remounts it.
 * - bodyFocusSignal: focuses the body each time this number changes (the # button).
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
  date: string;
  onSave: () => void;
  onBack: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  autoFocus?: boolean;
  attachment?: ReactNode;
  recordingPanel?: ReactNode;
  suggestions?: ReactNode;
  toolbar?: ReactNode;
  onBodyBlur?: () => void;
  onBodyFocus?: () => void;
  onBodySelectionChange?: (selection: Selection) => void;
  bodySelection?: Selection;
  bodyFocusSignal?: number;
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
  date,
  onSave,
  onBack,
  saving = false,
  saveDisabled = false,
  autoFocus = false,
  attachment,
  recordingPanel,
  suggestions,
  toolbar,
  onBodyBlur,
  onBodyFocus,
  onBodySelectionChange,
  bodySelection,
  bodyFocusSignal = 0,
}: AddEntryScreenProps) {
  const copy = journalCopy(journal);
  const canSave =
    (!titleRequired(journal.kind) || title.trim().length > 0) && !saving && !saveDisabled;
  const keyboard = useKeyboardInset();
  const { bottom: bottomInset } = useSafeAreaInsets();
  // The dock's bottom padding. Android: the keyboard height plus the system bar inset while open (the
  // window does not resize under edge-to-edge, and RN reports the IME height minus the system bar
  // inset), else the system bar inset. iOS: KeyboardAvoidingView already lifts the
  // page, so only the home-indicator inset while the keyboard is closed.
  const dockPadding =
    Platform.OS === 'android'
      ? keyboard.visible
        ? keyboard.height + bottomInset
        : bottomInset
      : keyboard.visible
        ? 0
        : bottomInset;
  const [menuOpen, setMenuOpen] = useState(false);
  const [topBarBottom, setTopBarBottom] = useState(56);
  // Measured heights for the notes cap (0 until the first layout, which means uncapped).
  const [containerHeight, setContainerHeight] = useState(0);
  const [dateTitleHeight, setDateTitleHeight] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const [notesNatural, setNotesNatural] = useState(0);
  const hasPanel = recordingPanel != null && recordingPanel !== false;
  const hasNotes = attachment != null && attachment !== false;
  // Padding and the gaps between the blocks (notes, panel, date and title, body) are not measured
  // separately; they count as fixed space next to the measured date and title.
  const blocks = 2 + (hasNotes ? 1 : 0) + (hasPanel ? 1 : 0);
  const notesHeight =
    hasNotes && containerHeight > 0 && notesNatural > 0
      ? layoutBudget({
          container: containerHeight,
          dateAndTitle: dateTitleHeight + 2 * spacing.lg + (blocks - 1) * spacing.md,
          panel: hasPanel ? panelHeight : 0,
          naturalNotes: notesNatural,
        })
      : undefined;
  const pickable = !!onJournalChange && !journalLocked && journals.length > 0;
  // The menu closes for good when the picker stops being available (a save started, or the entry
  // got locked).
  const showMenu = menuOpen && pickable && !saving;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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

        <View
          testID="entry-page"
          style={styles.flex}
          onLayout={(e) => setContainerHeight(Math.round(e.nativeEvent.layout.height))}
        >
          <View style={styles.content}>
            {hasNotes && (
              <ScrollView
                testID="entry-notes"
                style={[styles.notes, notesHeight !== undefined && { height: notesHeight }]}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                onContentSizeChange={(_w, h) => setNotesNatural(Math.round(h))}
              >
                {attachment}
              </ScrollView>
            )}
            {hasPanel && (
              <View
                testID="entry-recording-panel"
                onLayout={(e) => setPanelHeight(Math.round(e.nativeEvent.layout.height))}
              >
                {recordingPanel}
              </View>
            )}
            <View
              testID="entry-date-title"
              style={styles.dateTitle}
              onLayout={(e) => setDateTitleHeight(Math.round(e.nativeEvent.layout.height))}
            >
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
            </View>
            <TaggedBodyInput
              text={body}
              onChangeText={onBodyChange}
              onBlur={onBodyBlur}
              onFocus={onBodyFocus}
              onSelectionChange={onBodySelectionChange}
              selection={bodySelection}
              focusSignal={bodyFocusSignal}
              editable={!saving}
              placeholder="Start writing..."
              placeholderTextColor={colors.faint}
              accessibilityLabel="Entry text"
              testID="entry-body"
              style={styles.bodyInput}
            />
          </View>
        </View>
        <View testID="entry-bottom-dock" style={{ paddingBottom: dockPadding }}>
          {suggestions}
          {toolbar}
        </View>
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
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
  // Sized by layoutBudget once measured; until then it only stops growing past its content.
  notes: { flexGrow: 0, flexShrink: 0 },
  dateTitle: { gap: spacing.md },
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
    flex: 1,
    minHeight: BODY_MIN,
    textAlignVertical: 'top',
    paddingVertical: spacing.sm,
  },
});
