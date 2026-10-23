import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NoteBodyInput, type NoteBodyInputProps } from '../components/NoteBodyInput';
import { OverflowMenu } from '../components/OverflowMenu';
import { recordFabClearance } from '../components/RecordFab';
import { useCaretFollow } from '../hooks/useCaretFollow';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import type { NoteEditor } from '../hooks/useNoteEditor';
import { colors, iconCircle, spacing } from '../theme';

const BODY_MIN_HEIGHT = 160;

/** The body's empty-state text, shared with the reading view. */
export const BODY_PLACEHOLDER = 'Start writing...';

/** The editor the page binds to; `inputProps` may also carry NoteBodyInput's `onRemount`. */
export type ScreenEditor = Omit<NoteEditor, 'inputProps'> & {
  inputProps: NoteEditor['inputProps'] & Pick<NoteBodyInputProps, 'onRemount'>;
};

export type NoteEditorBanner = {
  kind: 'saveError' | 'inTrash' | 'unreadable';
  onRetry?: () => void;
  onLeave?: () => void;
};

const BANNER_TEXT: Record<NoteEditorBanner['kind'], string> = {
  saveError: "Couldn't save this note. Your text is still here.",
  inTrash: 'This note is in Recently Deleted, so changes are not saved.',
  unreadable:
    "Your notes could not be read, so this note can't be saved right now. Your text is still here.",
};

/**
 * Prop contract (layout only; the parent owns the session and wires the slots):
 * - date: the date line ("Sunday, October 6").
 * - onBack: the back arrow ("Back to notes"); the parent decides what it does (leave and save).
 * - stored: the note exists in the store. The "..." menu (Pin / Unpin, Delete note) shows only then.
 * - pinned / onTogglePin / onDelete / menuDisabled: the menu's items and its disabled state.
 * - banner: a notice under the top bar (live region). saveError offers "Try again" (onRetry),
 *   inTrash offers "Leave" (onLeave), unreadable has no button.
 * - editor: from useNoteEditor; the body input is bound to it as is.
 * - locked: a leave or delete is in flight. The body is not editable and the back arrow, menu and
 *   banner buttons are disabled. (The toolbar slot is the parent's; give NoteToolbar `disabled`.)
 * - autoFocus: a new note focuses the body once on open (editor.focus()). A stored note does not.
 * - attachment: slot at the top of the page flow (saved voice note cards).
 * - recordingPanel: while set it takes the bottom dock; suggestions and toolbar are not shown.
 * - suggestions / toolbar: slots in the bottom dock, lifted above the keyboard (explicit padding on
 *   Android, KeyboardAvoidingView on iOS) and above the bottom inset when the keyboard is closed.
 *
 * Modes (all optional; the defaults keep the page a plain editing page):
 * - mode: 'editing' (default) shows the body input; 'reading' shows `readingView` in its place when
 *   it is set. There is no Edit / Done button: the parent enters editing from a tap in the reading
 *   view and returns to reading from the toolbar's Hide keyboard button or a keyboard hide.
 * - fab: a floating button, given the bottom inset; rendered only in reading mode (the parent also
 *   gates it). With one, the reading content gets bottom padding so the last line scrolls clear of
 *   it. The 24pt gap above the button is padding, so it is not tappable to edit.
 * - revealRequest: while editing, once the keyboard height is known, scrolls so the tapped reading
 *   row (y in the body) sits a third of the way down the viewport. Each new token is handled once.
 *
 * The page is one ScrollView (keyboardShouldPersistTaps="handled") that follows the caret.
 */
export type NoteEditorScreenProps = {
  date: string;
  onBack: () => void;
  /** Accessibility label of the back arrow; defaults to "Back to notes". */
  backLabel?: string;
  stored: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onDelete: () => void;
  menuDisabled: boolean;
  banner?: NoteEditorBanner;
  editor: ScreenEditor;
  locked: boolean;
  autoFocus: boolean;
  attachment?: ReactNode;
  recordingPanel?: ReactNode;
  suggestions?: ReactNode;
  toolbar?: ReactNode;
  mode?: 'reading' | 'editing';
  readingView?: ReactNode;
  fab?: (bottomInset: number) => ReactNode;
  revealRequest?: { y: number; token: number };
};

export function NoteEditorScreen({
  date,
  onBack,
  backLabel = 'Back to notes',
  stored,
  pinned,
  onTogglePin,
  onDelete,
  menuDisabled,
  banner,
  editor,
  locked,
  autoFocus,
  attachment,
  recordingPanel,
  suggestions,
  toolbar,
  mode = 'editing',
  readingView,
  fab,
  revealRequest,
}: NoteEditorScreenProps) {
  const keyboard = useKeyboardInset();
  const { bottom: bottomInset } = useSafeAreaInsets();
  // Android: the keyboard height plus the system bar inset while open (edge-to-edge does not resize
  // the window), else the inset. iOS: KeyboardAvoidingView lifts the page, so only the home
  // indicator inset while the keyboard is closed.
  const dockPadding =
    Platform.OS === 'android'
      ? keyboard.visible
        ? keyboard.height + bottomInset
        : bottomInset
      : keyboard.visible
        ? 0
        : bottomInset;
  const pageScrollRef = useRef<ScrollView>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [bodyLayout, setBodyLayout] = useState<{ y: number; height: number } | null>(null);
  const { onScroll } = useCaretFollow({
    scrollRef: pageScrollRef,
    bodyLayout,
    text: editor.inputProps.text,
    selection: editor.selection,
    focused: editor.focused,
    keyboardHeight: keyboard.height,
    viewportHeight,
  });

  // A reveal request is handled once its token is new, while editing and the keyboard is up.
  const revealed = useRef(0);
  useEffect(() => {
    if (!revealRequest || revealRequest.token === revealed.current) return;
    if (mode !== 'editing' || keyboard.height <= 0 || !bodyLayout) return;
    revealed.current = revealRequest.token;
    const y = Math.max(0, bodyLayout.y + revealRequest.y - viewportHeight / 3);
    pageScrollRef.current?.scrollTo({ y, animated: false });
  }, [revealRequest, mode, keyboard.height, bodyLayout, viewportHeight]);

  // A new note focuses the body once, when the screen opens.
  useEffect(() => {
    // editor.focus only bumps a counter (a functional state update), so the mount-time closure is safe.
    if (autoFocus) editor.focus();
    // Once on mount: a later change of autoFocus is not a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFab = mode === 'reading' && fab != null;
  const hasPanel = recordingPanel != null && recordingPanel !== false;
  const hasAttachment = attachment != null && attachment !== false;
  const bannerAction =
    banner?.kind === 'saveError'
      ? { label: 'Try again', onPress: banner.onRetry }
      : banner?.kind === 'inTrash'
        ? { label: 'Leave', onPress: banner.onLeave }
        : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            accessibilityState={{ disabled: locked }}
            disabled={locked}
            onPress={onBack}
            hitSlop={12}
            style={styles.iconButton}
          >
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.date} numberOfLines={1}>
            {date}
          </Text>
        </View>

        {banner && (
          <View
            testID="note-banner"
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={styles.banner}
          >
            <Text style={styles.bannerText}>{BANNER_TEXT[banner.kind]}</Text>
            {bannerAction && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={bannerAction.label}
                accessibilityState={{ disabled: locked }}
                disabled={locked}
                onPress={bannerAction.onPress}
                hitSlop={8}
                style={styles.bannerButton}
              >
                <Text style={styles.bannerButtonText}>{bannerAction.label}</Text>
              </Pressable>
            )}
          </View>
        )}

        <ScrollView
          ref={pageScrollRef}
          testID="note-page"
          style={styles.flex}
          contentContainerStyle={showFab ? [styles.content, styles.contentWithFab] : styles.content}
          keyboardShouldPersistTaps="handled"
          onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {hasAttachment && <View testID="note-attachment">{attachment}</View>}
          <View
            testID="note-body-wrap"
            style={mode === 'reading' && readingView ? styles.flexGrow : undefined}
            onLayout={(e) =>
              setBodyLayout({ y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })
            }
          >
            {mode === 'reading' && readingView ? (
              readingView
            ) : (
              <NoteBodyInput
                {...editor.inputProps}
                editable={!locked}
                placeholder={BODY_PLACEHOLDER}
                placeholderTextColor={colors.faint}
                testID="note-body"
                style={styles.bodyInput}
              />
            )}
          </View>
        </ScrollView>
        <View testID="note-bottom-dock" style={{ paddingBottom: dockPadding }}>
          {hasPanel ? (
            <View testID="note-recording-panel" style={styles.recordingSlot}>
              {recordingPanel}
            </View>
          ) : (
            <>
              {suggestions}
              {toolbar}
            </>
          )}
        </View>
        {showFab && fab(bottomInset)}
        {stored && (
          <OverflowMenu
            items={[
              {
                key: 'pin',
                label: pinned ? 'Unpin' : 'Pin',
                onPress: onTogglePin,
              },
            ]}
            onDelete={onDelete}
            disabled={menuDisabled || locked}
            deleteLabel="Delete note"
            deleteText="Delete note"
            top={spacing.md}
            right={spacing.lg}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    // Room on the right for the "..." button, which is drawn over the bar.
    paddingRight: spacing.lg + iconCircle + spacing.sm,
    minHeight: iconCircle + spacing.md,
  },
  iconButton: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  back: { color: colors.text, fontSize: 24 },
  date: { flex: 1, color: colors.muted, fontSize: 13, marginLeft: spacing.sm },
  banner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bannerText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  bannerButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  bannerButtonText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
  contentWithFab: { paddingBottom: recordFabClearance + spacing.lg },
  recordingSlot: { paddingHorizontal: spacing.lg },
  bodyInput: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 26,
    minHeight: BODY_MIN_HEIGHT,
    textAlignVertical: 'top',
    paddingVertical: spacing.sm,
  },
});
