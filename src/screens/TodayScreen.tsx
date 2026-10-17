import { type ComponentProps, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  type GestureResponderEvent,
  PanResponder,
  type PanResponderGestureState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fabListClearance } from '../components/AddEntryMenu';
import { JournalsDrawer } from '../components/JournalsDrawer';
import { SwipeEntryRow, useSingleOpenRow } from '../components/SwipeEntryRow';
import { BookIcon, GearIcon } from '../components/TodayIcons';
import { colors, fonts, spacing } from '../theme';
import { JournalId } from '../types/entry';
import { Entry, hasAudio } from '../types/dream';
import { confirmDeleteDream } from '../utils/confirmDelete';
import { formatToday } from '../utils/format';
import { journalLabel } from '../utils/journalSearch';
import {
  Journal,
  journalCopy,
  journalOf,
  journalOrDefault,
  kindCopy,
  kindOf,
} from '../utils/journals';
import { entriesToday } from '../utils/today';

/** All wording of the Today page, in one place. */
export const TODAY_COPY = {
  title: 'Today',
  openJournals: 'Open Journals',
  openSettings: 'Open Settings',
  noDream: 'No dream today',
  nothingYet: 'Nothing here yet today.',
  nothingElse: 'Nothing else yet today.',
} as const;

/**
 * The Today hub: only entries created on `todayKey` (local YYYY-MM-DD), from every journal,
 * drafts included, newest first.
 *
 * Props:
 * - `journals`: the journal registry; entries of other journals are not shown.
 * - `dreams`: every stored record (all journals). `null` while loading.
 * - `todayKey`: the local day to show.
 * - `skippedToday`: the user chose "No dream" today; shows a quiet line when no Dream entry or draft exists today.
 * - `unreadable`: the saved entries could not be read.
 * - `onOpenEntry(dream)` / `onOpenDraft(dream)`: a finished entry / a draft was tapped.
 * - `onDeleteDream(dream)`: Delete was used on a row (swipe or screen-reader action) and confirmed
 *   here, with the row's own journal wording. The parent deletes.
 * - `deletingId`: the entry being deleted; its row is dimmed and swiping is off everywhere.
 * - `onOpenJournals()` / `onOpenSettings()`: the header icons (book left, gear right). A swipe from
 *   the left edge of the page also calls `onOpenJournals`.
 * - `journalsOpen` / `onCloseJournals()`: whether the Journals drawer is open (App owns it) and how it
 *   closes. The drawer is rendered here, over the page, from `drawer`.
 * - `journalsDisabled`: opening the drawer (button and edge swipe) does nothing, e.g. while a delete runs.
 * - `drawer`: the drawer's content props (its `open` and `onClose` come from the two props above).
 */
type Props = {
  journals: readonly Journal[];
  dreams: Entry[] | null;
  todayKey: string;
  skippedToday: boolean;
  unreadable?: boolean;
  onOpenEntry: (dream: Entry) => void;
  onOpenDraft: (dream: Entry) => void;
  onDeleteDream: (dream: Entry) => void;
  deletingId?: string | null;
  onOpenJournals: () => void;
  onOpenSettings: () => void;
  journalsOpen?: boolean;
  onCloseJournals?: () => void;
  journalsDisabled?: boolean;
  drawer?: Omit<ComponentProps<typeof JournalsDrawer>, 'open' | 'onClose'>;
};

/** A drag counts as the edge swipe only when it starts this close to the left edge of the screen. */
export const EDGE_SWIPE_ZONE = 20;
/** How far right the edge drag must travel before it opens the drawer. */
export const EDGE_SWIPE_DISTANCE = 40;

/** Whether a moving touch is the left-edge swipe: started in the edge zone and mostly horizontal. */
export function startsEdgeSwipe(g: Pick<PanResponderGestureState, 'x0' | 'dx' | 'dy'>): boolean {
  return g.x0 <= EDGE_SWIPE_ZONE && g.dx > 10 && g.dx > Math.abs(g.dy) * 2;
}

/** Whether a finished edge swipe went far enough to open the drawer. */
export function opensDrawer(g: Pick<PanResponderGestureState, 'dx'>): boolean {
  return g.dx >= EDGE_SWIPE_DISTANCE;
}

type Item = { type: 'skip' } | { type: 'entry'; dream: Entry };

export function TodayScreen({
  journals,
  dreams,
  todayKey,
  skippedToday,
  unreadable = false,
  onOpenEntry,
  onOpenDraft,
  onDeleteDream,
  deletingId = null,
  onOpenJournals,
  onOpenSettings,
  journalsOpen = false,
  onCloseJournals,
  journalsDisabled = false,
  drawer,
}: Props) {
  const insets = useSafeAreaInsets();
  // The edge swipe reads the latest values through a ref, so the responder is created once.
  const edge = useRef({ open: onOpenJournals, off: journalsDisabled || journalsOpen });
  useEffect(() => {
    edge.current = { open: onOpenJournals, off: journalsDisabled || journalsOpen };
  });
  // The handlers only read `edge` when a touch happens, never while rendering.
  const edgeResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        // Capture, so a swipe that starts at the very edge is not taken by a row underneath.
        onMoveShouldSetPanResponderCapture: (_e: GestureResponderEvent, g) =>
          !edge.current.off && startsEdgeSwipe(g),
        onPanResponderRelease: (_e, g) => {
          if (!edge.current.off && opensDrawer(g)) edge.current.open();
        },
      }),
    [],
  );
  const rows = useMemo(
    () => entriesToday(journals, dreams ?? [], todayKey),
    [journals, dreams, todayKey],
  );
  const showSkip = skippedToday && !rows.some((r) => journalOf(r) === 'dreams');
  const items = useMemo<Item[]>(
    () => [
      ...(showSkip ? [{ type: 'skip' } as const] : []),
      ...rows.map((dream) => ({ type: 'entry', dream }) as const),
    ],
    [showSkip, rows],
  );

  const openEntryRef = useRef(onOpenEntry);
  const openDraftRef = useRef(onOpenDraft);
  const deleteRef = useRef(onDeleteDream);
  useEffect(() => {
    openEntryRef.current = onOpenEntry;
    openDraftRef.current = onOpenDraft;
    deleteRef.current = onDeleteDream;
  });
  const confirmOpen = useRef(false);
  const { onRowWillOpen, onRowClosed, closeOpenRow } = useSingleOpenRow();

  const entryById = useRef(new Map<string, Entry>());
  useEffect(() => {
    entryById.current = new Map(rows.map((r) => [r.id, r]));
  }, [rows]);
  const handleOpenEntry = useCallback(
    (id: string) => {
      closeOpenRow();
      const dream = entryById.current.get(id);
      if (dream) openEntryRef.current(dream);
    },
    [closeOpenRow],
  );
  const handleOpenDraft = useCallback(
    (dream: Entry) => {
      closeOpenRow();
      openDraftRef.current(dream);
    },
    [closeOpenRow],
  );
  const handleDelete = useCallback(
    (dream: Entry, closeRow: () => void) => {
      if (confirmOpen.current) return;
      confirmOpen.current = true;
      confirmDeleteDream({
        hasAudio: hasAudio(dream),
        kind: kindOf(journals, journalOf(dream)),
        onClose: () => {
          confirmOpen.current = false;
          closeRow();
        },
        onConfirm: () => deleteRef.current(dream),
      });
    },
    [journals],
  );

  const renderItem = useCallback(
    ({ item }: { item: Item }) =>
      item.type === 'skip' ? (
        <Text style={styles.skipLine}>{TODAY_COPY.noDream}</Text>
      ) : (
        <SwipeEntryRow
          variant="today"
          dream={item.dream}
          journals={journals}
          copy={journalCopy(journalOrDefault(journals, journalOf(item.dream)))}
          journalLabel={journalLabel(journals, item.dream)}
          onOpenDream={handleOpenEntry}
          onOpenDraft={handleOpenDraft}
          onDelete={handleDelete}
          onRowWillOpen={onRowWillOpen}
          onRowClosed={onRowClosed}
          deleting={deletingId === item.dream.id}
          swipeLocked={deletingId !== null}
        />
      ),
    [
      journals,
      handleOpenEntry,
      handleOpenDraft,
      handleDelete,
      onRowWillOpen,
      onRowClosed,
      deletingId,
    ],
  );
  const keyExtractor = useCallback(
    (item: Item) => (item.type === 'skip' ? 'skip' : `d:${item.dream.id}`),
    [],
  );

  let body = null;
  if (dreams === null) {
    body = null;
  } else if (rows.length > 0) {
    body = (
      <FlatList
        testID="today-list"
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListFooterComponent={<View testID="today-end-rule" style={styles.endRule} />}
        contentContainerStyle={[styles.list, { paddingBottom: fabListClearance(insets.bottom) }]}
        onScrollBeginDrag={closeOpenRow}
      />
    );
  } else if (unreadable && dreams.length === 0) {
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyBody}>{kindCopy('journal').unreadableLog}</Text>
      </View>
    );
  } else {
    body = (
      <View style={styles.empty}>
        {showSkip && <Text style={styles.skipLine}>{TODAY_COPY.noDream}</Text>}
        <Text style={styles.emptyBody}>
          {showSkip ? TODAY_COPY.nothingElse : TODAY_COPY.nothingYet}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="today-screen" {...edgeResponder.panHandlers}>
      <SafeAreaView
        style={styles.safe}
        edges={['top', 'left', 'right']}
        importantForAccessibility={journalsOpen ? 'no-hide-descendants' : 'auto'}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={TODAY_COPY.openJournals}
            accessibilityState={journalsDisabled ? { disabled: true } : undefined}
            disabled={journalsDisabled}
            onPress={onOpenJournals}
            style={styles.iconButton}
          >
            <BookIcon />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title} accessibilityRole="header">
              {TODAY_COPY.title}
            </Text>
            <Text style={styles.date}>{formatToday(new Date(`${todayKey}T12:00:00`))}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={TODAY_COPY.openSettings}
            onPress={onOpenSettings}
            style={styles.iconButton}
          >
            <GearIcon />
          </Pressable>
        </View>

        <View style={styles.body}>{body}</View>
      </SafeAreaView>
      {drawer && (
        <JournalsDrawer {...drawer} open={journalsOpen} onClose={onCloseJournals ?? (() => {})} />
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
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { color: colors.text, fontFamily: fonts.serif, fontSize: 30 },
  date: { color: colors.muted, fontSize: 14 },
  body: { flex: 1 },
  // No horizontal padding: each row owns its own 24pt padding and top hairline.
  list: { paddingTop: spacing.md },
  endRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  skipLine: {
    color: colors.muted,
    fontSize: 16,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  empty: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  emptyBody: { color: colors.muted, fontSize: 16 },
});
