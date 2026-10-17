import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  AccessibilityInfo,
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchIcon } from './SearchIcon';
import { SwipeActionRow, SwipeAction, useSingleOpenRow } from './SwipeActionRow';
import { colors, fonts, spacing } from '../theme';
import { JournalId } from '../types/entry';
import { isBuiltInJournal, Journal, kindCopy } from '../utils/journals';

/**
 * The Journals drawer: a left-side panel over the Today page (not a Modal, so Alerts and the name
 * sheets still show above it). App owns whether it is open; Today renders it and opens it.
 *
 * Props:
 * - `open`: whether the drawer is open. It slides in from the left over ~220 ms with a dimmed
 *   backdrop, and out again before unmounting. With Reduce Motion on it appears and disappears
 *   without animation.
 * - `onClose()`: the backdrop was tapped or Android Back was pressed (the drawer handles Back
 *   itself while open, ahead of the app's own back handling).
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
 * - `onNewJournal()`: optional. When given, a "New journal" row sits below the cards.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  journals: readonly Journal[];
  counts: Record<JournalId, number> | null;
  unreadable?: boolean;
  onOpenJournal: (id: JournalId) => void;
  onSearch: () => void;
  onNewJournal?: () => void;
  onDeleteJournal?: (id: JournalId) => void;
  onRenameJournal?: (id: JournalId) => void;
  deletingId?: JournalId | null;
};

/** "12 dreams", "1 dream", "No dreams yet"; "5 entries", "1 entry", "No entries yet". */
export function countLabel(journal: Journal, count: number): string {
  const dream = journal.kind === 'dream';
  if (count === 0) return dream ? 'No dreams yet' : 'No entries yet';
  if (dream) return count === 1 ? '1 dream' : `${count} dreams`;
  return count === 1 ? '1 entry' : `${count} entries`;
}

const ANIMATION_MS = 220;
const MAX_WIDTH = 360;
/** The drawer's share of the window width (capped at MAX_WIDTH). */
const WIDTH_FRACTION = 0.84;

export function JournalsDrawer({
  open,
  onClose,
  journals,
  counts,
  unreadable = false,
  onOpenJournal,
  onSearch,
  onNewJournal,
  onDeleteJournal,
  onRenameJournal,
  deletingId = null,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(windowWidth * WIDTH_FRACTION, MAX_WIDTH);
  const showCounts = counts !== null && !unreadable;
  const { onRowWillOpen, onRowClosed, closeOpenRow } = useSingleOpenRow();
  const locked = deletingId !== null;

  // `mounted` keeps the panel on screen while it slides out.
  const [mounted, setMounted] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const reduceMotion = useRef(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduceMotion.current = on;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotion.current = on;
    });
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  // Mounted from the first open frame; the effect below only runs the animation.
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    const animateTo = (to: 0 | 1, onDone?: () => void) => {
      if (reduceMotion.current) {
        progress.stopAnimation();
        progress.setValue(to);
        onDone?.();
        return;
      }
      Animated.timing(progress, {
        toValue: to,
        duration: ANIMATION_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDone?.();
      });
    };
    if (open) {
      wasOpen.current = true;
      animateTo(1);
    } else if (wasOpen.current) {
      closeOpenRow();
      animateTo(0, () => setMounted(false));
    }
  }, [open, progress, closeOpenRow]);

  const close = useCallback(() => {
    closeOpenRow();
    onClose();
  }, [closeOpenRow, onClose]);

  // While open, Back closes the drawer first (this listener is added after the app's own, so it runs
  // first).
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [open, close]);

  if (!open && !mounted) return null;

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  return (
    <View testID="journals-drawer" accessibilityViewIsModal style={styles.layer}>
      <Animated.View style={[styles.layer, { opacity: progress }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close journals"
          onPress={close}
          style={[styles.layer, styles.backdrop]}
        />
      </Animated.View>
      <Animated.View
        testID="journals-drawer-panel"
        style={[styles.panel, { width, transform: [{ translateX }] }]}
      >
        <SafeAreaView style={styles.safe} edges={['top', 'left']}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
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
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
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
            {onNewJournal && (
              <View style={styles.newRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="New journal"
                  disabled={locked}
                  onPress={() => {
                    closeOpenRow();
                    onNewJournal();
                  }}
                  style={styles.newButton}
                >
                  <Text style={styles.newPlus} importantForAccessibility="no-hide-descendants">
                    +
                  </Text>
                  <Text style={styles.newText}>New journal</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
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
  newRow: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  newPlus: { color: colors.accent, fontSize: 24 },
  newText: { color: colors.text, fontSize: 18 },
});
