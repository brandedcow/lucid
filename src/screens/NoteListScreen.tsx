import { ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { focusNode } from '../components/NotesDrawer';
import { NewNoteButton, listClearance } from '../components/NewNoteButton';
import { NoteRow } from '../components/NoteRow';
import { SwipeNoteRow } from '../components/SwipeNoteRow';
import { useSingleOpenRow } from '../components/SwipeActionRow';
import { Note } from '../services/notesStorage';
import { colors, fonts, spacing } from '../theme';
import { NoteView } from '../utils/noteViews';
import { NoteRowData, noteRow } from '../utils/noteRow';

/** The views whose empty text the list can show (Recently Deleted has its own screen). */
export type ListEmptyKind = Exclude<NoteView, { kind: 'trash' }>;

/** A one-off line above the list about the import of earlier notes. The provider supplies the text. */
export type MigrationNotice =
  | { kind: 'working' }
  | { kind: 'info'; text: string; onDismiss: () => void }
  | { kind: 'retry'; text: string; onRetry: () => void };

export const LIST_COPY = {
  openMenu: 'Open menu',
  unreadable: 'Your notes could not be read. Nothing was changed.',
  working: 'Bringing in your earlier notes...',
  dismiss: 'Dismiss',
  tryAgain: 'Try again',
} as const;

/** The empty-list lines: a first line and, for All Notes only, a hint line. */
export function listEmptyLines(kind: ListEmptyKind): { text: string; hint?: string } {
  switch (kind.kind) {
    case 'all':
      return { text: 'No notes yet.', hint: 'Tap + to write one.' };
    case 'today':
      return { text: 'Nothing written today.' };
    case 'todo':
      return { text: 'No notes with checkboxes.' };
    case 'untagged':
      return { text: 'No untagged notes.' };
    case 'pinned':
      return { text: 'No pinned notes.' };
    case 'tag':
      return { text: `No notes with #${kind.tag}.` };
  }
}

type Props = {
  /** The view title, shown as the page header ("All Notes", "#dreams"). */
  title: string;
  /** The notes to list, newest edit first as given; null = still loading. */
  notes: Note[] | null;
  now: Date;
  indexStatus: 'ok' | 'unreadable';
  emptyKind: ListEmptyKind;
  migrationNotice?: MigrationNotice | null;
  onOpenNote: (id: string) => void;
  onNewNote: () => void;
  onOpenMenu: () => void;
  newNoteDisabled?: boolean;
  /** Extra header content at the right (7c puts the search icon here). */
  rightSlot?: ReactNode;
  /** True while the drawer is open: the list is hidden from screen readers and the swipe is off. */
  drawerOpen?: boolean;
  /** Swipe Pin: set a note's pinned state. Swipe rows need both this and `onDeleteNote`; without them rows do not swipe. */
  onPinNote?: (id: string, pinned: boolean) => void;
  /** Swipe Delete: move a note to Recently Deleted. No confirmation here; the caller decides. */
  onDeleteNote?: (id: string) => void;
  /** True while an action is in flight: rows cannot be swiped. */
  swipeDisabled?: boolean;
  /** Called with true when a swipe row opens and false when none is open (the drawer swipe waits). */
  onRowOpenChange?: (open: boolean) => void;
};

/** Three bars drawn with Views. Hidden from screen readers; the button names it. */
function MenuIcon() {
  return (
    <View style={styles.menuBox} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
    </View>
  );
}

function NoticeLine({ notice }: { notice: MigrationNotice }) {
  const text = notice.kind === 'working' ? LIST_COPY.working : notice.text;
  const action =
    notice.kind === 'info'
      ? { label: LIST_COPY.dismiss, onPress: notice.onDismiss }
      : notice.kind === 'retry'
        ? { label: LIST_COPY.tryAgain, onPress: notice.onRetry }
        : null;
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <Text style={styles.noticeText}>{text}</Text>
      {action && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={styles.noticeButton}
        >
          <Text style={styles.noticeButtonText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The note list page. Props only: it reads no storage. Header (menu button, view title, `rightSlot`),
 * an optional migration line, then the list or one of: nothing (loading), the unreadable message
 * (replaces the list), or the empty text. The "+" button floats at the bottom right. The drawer
 * swipe lives in `NotesRoute`, around this page.
 */
export function NoteListScreen({
  title,
  notes,
  now,
  indexStatus,
  emptyKind,
  migrationNotice = null,
  onOpenNote,
  onNewNote,
  onOpenMenu,
  newNoteDisabled = false,
  rightSlot,
  drawerOpen = false,
  onPinNote,
  onDeleteNote,
  swipeDisabled = false,
  onRowOpenChange,
}: Props) {
  const insets = useSafeAreaInsets();

  const swipeEnabled = onPinNote !== undefined && onDeleteNote !== undefined;
  const rowsInert = swipeDisabled || drawerOpen;
  // At most one row is open; scrolling, opening a note or the drawer closes it.
  const {
    onRowWillOpen: singleWillOpen,
    onRowClosed: singleClosed,
    closeOpenRow,
  } = useSingleOpenRow();
  // Which rows are open, so the route knows when the drawer swipe must wait.
  const openRows = useRef(new Set<unknown>());
  const reportedOpen = useRef(false);
  const report = useCallback(() => {
    const open = openRows.current.size > 0;
    if (open !== reportedOpen.current) {
      reportedOpen.current = open;
      onRowOpenChange?.(open);
    }
  }, [onRowOpenChange]);
  const onRowWillOpen = useCallback(
    (row: Parameters<typeof singleWillOpen>[0]) => {
      // Added first: the row it closes reports itself closed, which must not dip to "none open".
      openRows.current.add(row);
      singleWillOpen(row);
      report();
    },
    [singleWillOpen, report],
  );
  const onRowClosed = useCallback(
    (row: Parameters<typeof singleClosed>[0]) => {
      singleClosed(row);
      openRows.current.delete(row);
      report();
    },
    [singleClosed, report],
  );
  // Screen-reader focus goes back to the menu button when the drawer closes.
  const menuRef = useRef<View>(null);
  const wasDrawerOpen = useRef(false);
  useEffect(() => {
    if (wasDrawerOpen.current && !drawerOpen) focusNode(menuRef.current);
    wasDrawerOpen.current = drawerOpen;
  }, [drawerOpen]);
  useEffect(() => {
    if (drawerOpen) closeOpenRow();
  }, [drawerOpen, closeOpenRow]);
  const handleOpen = useCallback(
    (id: string) => {
      closeOpenRow();
      onOpenNote(id);
    },
    [closeOpenRow, onOpenNote],
  );

  const renderItem = useCallback(
    ({ item }: { item: Note }) => {
      const row: NoteRowData = noteRow(item, now);
      if (onPinNote === undefined || onDeleteNote === undefined) {
        return <NoteRow row={row} onOpen={onOpenNote} />;
      }
      return (
        <SwipeNoteRow
          row={row}
          onOpen={handleOpen}
          onPin={onPinNote}
          onDelete={onDeleteNote}
          disabled={rowsInert}
          onRowWillOpen={onRowWillOpen}
          onRowClosed={onRowClosed}
        />
      );
    },
    [now, onOpenNote, handleOpen, onPinNote, onDeleteNote, rowsInert, onRowWillOpen, onRowClosed],
  );
  const keyExtractor = useCallback((n: Note) => n.id, []);
  // Stable between renders so the list re-renders its rows only when `now` or the inert flag changes.
  const contentStyle = useMemo(
    () => ({ paddingBottom: listClearance(insets.bottom) }),
    [insets.bottom],
  );
  const extraData = useMemo(() => ({ now, rowsInert }), [now, rowsInert]);

  let body: ReactNode = null;
  if (indexStatus === 'unreadable') {
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{LIST_COPY.unreadable}</Text>
      </View>
    );
  } else if (notes === null) {
    body = null;
  } else if (notes.length === 0) {
    const lines = listEmptyLines(emptyKind);
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{lines.text}</Text>
        {lines.hint && <Text style={styles.emptyHint}>{lines.hint}</Text>}
      </View>
    );
  } else {
    body = (
      <FlatList
        testID="note-list"
        data={notes}
        extraData={extraData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onScrollBeginDrag={swipeEnabled ? closeOpenRow : undefined}
        initialNumToRender={12}
        windowSize={9}
        contentContainerStyle={contentStyle}
      />
    );
  }

  return (
    <View style={styles.container} testID="note-list-screen">
      <SafeAreaView
        style={styles.safe}
        edges={['top', 'left', 'right']}
        importantForAccessibility={drawerOpen ? 'no-hide-descendants' : 'auto'}
      >
        <View style={styles.header}>
          <Pressable
            ref={menuRef}
            accessibilityRole="button"
            accessibilityLabel={LIST_COPY.openMenu}
            onPress={onOpenMenu}
            style={styles.iconButton}
          >
            <MenuIcon />
          </Pressable>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <View style={styles.right}>{rightSlot}</View>
        </View>
        {migrationNotice && <NoticeLine notice={migrationNotice} />}
        <View style={styles.body}>{body}</View>
      </SafeAreaView>
      <NewNoteButton onPress={onNewNote} disabled={newNoteDisabled} bottomInset={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: colors.text, fontFamily: fonts.serif, fontSize: 28 },
  right: { minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  body: { flex: 1 },
  menuBox: { width: 22, height: 18, justifyContent: 'space-between' },
  menuBar: { height: 2, borderRadius: 1, backgroundColor: colors.muted },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  noticeText: { flex: 1, color: colors.muted, fontSize: 14 },
  noticeButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  noticeButtonText: { color: colors.accent, fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: 4 },
  emptyText: { color: colors.muted, fontSize: 16, textAlign: 'center' },
  emptyHint: { color: colors.faint, fontSize: 14, textAlign: 'center' },
});
