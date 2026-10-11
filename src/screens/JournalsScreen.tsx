import {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddEntryMenu, FAB_SIZE } from '../components/AddEntryMenu';
import { SearchIcon } from '../components/SearchIcon';
import { SwipeActionRow, SwipeAction, useSingleOpenRow } from '../components/SwipeActionRow';
import { colors, fonts, spacing } from '../theme';
import { JournalId } from '../types/entry';
import { isBuiltInJournal, Journal, kindCopy } from '../utils/journals';

/**
 * Props:
 * - `journals`: the journals to list, in display order.
 * - `counts`: finished entries per journal, computed by the parent. `null` while loading (no count
 *   line is shown).
 * - `unreadable`: the saved entries could not be read. Cards stay tappable, without counts, and a
 *   message sits under the header.
 * - `onOpenJournal(id)`: a journal card was tapped.
 * - `onSearch()`: the search button was tapped (search across all journals).
 * - `onDeleteJournal(id)`: optional. When given, a custom journal's card can be swiped to reveal Delete
 *   (also a screen-reader action). Dreams and Life are never swipeable. The parent confirms and deletes.
 * - `onRenameJournal(id)`: optional. When given, a custom journal's card also reveals Rename (before
 *   Delete; also a screen-reader action). The parent opens the name sheet.
 * - `deletingId`: the journal being deleted. Its card is dimmed, inert and reads "Deleting...";
 *   every card's swipe is locked until it ends.
 *
 * - `onNewEntry(journalId)` / `onNewJournal()`: optional. When `onNewEntry` is given, the same "+" button and
 *   Add entry sheet as on Today show at the bottom right (hidden while `deletingId` is set); picking a journal
 *   calls `onNewEntry`, "New journal" (sheet closed) calls `onNewJournal`.
 *
 * - `nameSheetOpen`: a name sheet (new or rename) is open; the "+" button is not shown.
 *
 * - `onBack()`: optional. When given, a back arrow ("Back to Today") shows at the top left.
 */
type Props = {
  journals: readonly Journal[];
  counts: Record<JournalId, number> | null;
  unreadable?: boolean;
  onOpenJournal: (id: JournalId) => void;
  onSearch: () => void;
  onBack?: () => void;
  onDeleteJournal?: (id: JournalId) => void;
  onRenameJournal?: (id: JournalId) => void;
  deletingId?: JournalId | null;
  onNewEntry?: (id: JournalId) => void;
  onNewJournal?: () => void;
  nameSheetOpen?: boolean;
};

/** "12 dreams", "1 dream", "No dreams yet"; "5 entries", "1 entry", "No entries yet". */
export function countLabel(journal: Journal, count: number): string {
  const dream = journal.kind === 'dream';
  if (count === 0) return dream ? 'No dreams yet' : 'No entries yet';
  if (dream) return count === 1 ? '1 dream' : `${count} dreams`;
  return count === 1 ? '1 entry' : `${count} entries`;
}

export function JournalsScreen({
  journals,
  counts,
  unreadable = false,
  onOpenJournal,
  onSearch,
  onBack,
  onDeleteJournal,
  onRenameJournal,
  deletingId = null,
  onNewEntry,
  onNewJournal,
  nameSheetOpen = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const showCounts = counts !== null && !unreadable;
  const { onRowWillOpen, onRowClosed, closeOpenRow } = useSingleOpenRow();
  const locked = deletingId !== null;
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={[styles.header, onBack && styles.headerWithBack]}>
          {onBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to Today"
              onPress={onBack}
              hitSlop={12}
              style={styles.backButton}
            >
              <Text style={styles.back}>←</Text>
            </Pressable>
          )}
          <Text style={[styles.title, onBack && styles.titleWithBack]} accessibilityRole="header">
            Journals
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search all journals"
            onPress={onSearch}
            style={styles.searchButton}
          >
            <SearchIcon />
          </Pressable>
        </View>

        {unreadable && <Text style={styles.unreadable}>{kindCopy('journal').unreadableLog}</Text>}

        <ScrollView
          testID="journals-list"
          contentContainerStyle={[
            styles.list,
            onNewEntry && { paddingBottom: insets.bottom + spacing.md + FAB_SIZE + spacing.lg },
          ]}
          onScrollBeginDrag={closeOpenRow}
        >
          {journals.map((journal) => {
            const count = showCounts ? (counts[journal.id] ?? 0) : null;
            const deleting = journal.id === deletingId;
            const line = deleting
              ? 'Deleting...'
              : count === null
                ? null
                : countLabel(journal, count);
            const card = (extra?: {
              accessibilityActions?: AccessibilityActionInfo[];
              onAccessibilityAction?: (e: AccessibilityActionEvent) => void;
            }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  deleting
                    ? `${journal.name}, deleting`
                    : line === null
                      ? journal.name
                      : `${journal.name}, ${line}`
                }
                accessibilityState={deleting ? { disabled: true } : undefined}
                disabled={deleting}
                onPress={() => {
                  closeOpenRow();
                  onOpenJournal(journal.id);
                }}
                style={[styles.card, deleting && styles.deleting]}
                {...extra}
              >
                <View style={styles.cardMain}>
                  <Text style={styles.cardTitle}>{journal.name}</Text>
                  {line !== null && <Text style={styles.count}>{line}</Text>}
                </View>
                <Text style={styles.chevron} importantForAccessibility="no-hide-descendants">
                  ›
                </Text>
              </Pressable>
            );
            // Only a user-created journal can be renamed or deleted: Dreams and Life stay plain cards.
            if ((!onDeleteJournal && !onRenameJournal) || isBuiltInJournal(journal.id)) {
              return <View key={journal.id}>{card()}</View>;
            }
            // Rename first, Delete last (at the far right edge).
            const actions: SwipeAction[] = [];
            if (onRenameJournal) {
              actions.push({
                key: 'rename',
                label: 'Rename',
                accessibilityLabel: `Rename ${journal.name}`,
                onPress: (closeRow) => {
                  closeRow();
                  onRenameJournal(journal.id);
                },
              });
            }
            if (onDeleteJournal) {
              actions.push({
                key: 'delete',
                label: 'Delete',
                accessibilityLabel: `Delete ${journal.name}`,
                destructive: true,
                onPress: (closeRow) => {
                  closeRow();
                  onDeleteJournal(journal.id);
                },
              });
            }
            return (
              <SwipeActionRow
                key={journal.id}
                actions={actions}
                disabled={locked}
                onRowWillOpen={onRowWillOpen}
                onRowClosed={onRowClosed}
                testID={`journal-row-${journal.id}`}
              >
                {({ accessibilityActions, onAccessibilityAction }) =>
                  card({ accessibilityActions, onAccessibilityAction })
                }
              </SwipeActionRow>
            );
          })}
        </ScrollView>
      </SafeAreaView>
      {onNewEntry && !nameSheetOpen && (
        <AddEntryMenu
          journals={journals.filter((j) => j.id !== deletingId)}
          onPick={onNewEntry}
          onNewJournal={onNewJournal}
          disabled={deletingId != null}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingTop: spacing.sm,
  },
  headerWithBack: { paddingLeft: spacing.sm },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.text, fontSize: 24 },
  titleWithBack: { flex: 1, marginLeft: spacing.xs },
  title: { color: colors.text, fontFamily: fonts.serif, fontSize: 34 },
  searchButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  unreadable: {
    color: colors.muted,
    fontSize: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm + 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 88,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  deleting: { opacity: 0.45 },
  cardMain: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.text, fontFamily: fonts.serif, fontSize: 26 },
  count: { color: colors.muted, fontSize: 14 },
  chevron: { color: colors.muted, fontSize: 24 },
});
