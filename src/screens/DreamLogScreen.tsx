import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DreamChips } from '../components/DreamChips';
import { MicIcon } from '../components/MicIcon';
import { IndexStatus } from '../hooks/useDreamLibrary';
import { LogView } from '../hooks/useLogView';
import { colors, fonts, spacing } from '../theme';
import { Dream, hasAudio } from '../types/dream';
import { confirmDeleteDream } from '../utils/confirmDelete';
import {
  buildLogItems,
  buildSearchIndex,
  buildTagChips,
  DreamRow,
  dreamRow,
  filterDreams,
  limitChips,
  LogItem,
  tagChipLabel,
} from '../utils/dreamLog';
import { formatEntryDateTime } from '../utils/format';
import { BUILT_IN_JOURNALS, Journal, JournalCopy, journalCopy } from '../utils/journals';

/**
 * Props:
 * - `dreams`: stored dreams, newest first, drafts included. `null` while loading.
 * - `indexStatus`: 'unreadable' when the saved dreams could not be read.
 * - `view`: the Dream log's view state from `useLogView()` (tag filter, search, scroll offset),
 *   owned by the parent so it survives leaving the log.
 * - `onOpenDream(id)`: a finished dream was tapped.
 * - `onOpenDraft(dream)`: a draft was tapped.
 * - `onNewDream()`: the "New dream" button was tapped.
 * - `onDeleteDream(dream)`: the user used the Delete action revealed by swiping a finished row (or
 *   the VoiceOver/TalkBack "Delete" action) and chose Delete in the confirmation shown here. The
 *   parent deletes. Keep (or dismissing the dialog) closes the row and deletes nothing.
 * - `journal`: optional, defaults to Dreams. Sets the header and all wording (empty state, search,
 *   New button, delete confirmation and labels, untitled).
 * - `deletingId`: the dream being deleted. Its row is dimmed and cannot be opened, and swiping is
 *   off on every row until the delete ends. Everything else on the screen stays usable.
 */
type Props = {
  dreams: Dream[] | null;
  indexStatus: IndexStatus;
  view: LogView;
  onOpenDream: (id: string) => void;
  onOpenDraft: (dream: Dream) => void;
  onNewDream: () => void;
  onDeleteDream: (dream: Dream) => void;
  deletingId?: string | null;
  journal?: Journal;
};

const FAB_CLEARANCE = 120;

export function DreamLogScreen({
  dreams,
  indexStatus,
  view,
  onOpenDream,
  onOpenDraft,
  onNewDream,
  onDeleteDream,
  deletingId = null,
  journal = BUILT_IN_JOURNALS[0],
}: Props) {
  const kind = journal.kind;
  const copy = journalCopy(kind);
  const insets = useSafeAreaInsets();
  const { tags, query, searching, offsetRef } = view;
  const listRef = useRef<FlatList<LogItem>>(null);
  const restored = useRef(false);

  const index = useMemo(() => buildSearchIndex(dreams ?? []), [dreams]);
  const filtered = useMemo(() => filterDreams(index, { tags, query }), [index, tags, query]);
  const items = useMemo(() => buildLogItems(filtered), [filtered]);
  const chipData = useMemo(() => buildTagChips(dreams ?? [], tags), [dreams, tags]);

  // A changed filter or query starts again at the top (the offset itself is reset by the hook).
  const filterKey = `${tags.join('\n')}\u0000${query}`;
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [filterKey]);

  // Stable row callbacks, so memoized rows do not re-render when the parent passes new functions.
  const openDreamRef = useRef(onOpenDream);
  const openDraftRef = useRef(onOpenDraft);
  useEffect(() => {
    openDreamRef.current = onOpenDream;
    openDraftRef.current = onOpenDraft;
  });
  const deleteDreamRef = useRef(onDeleteDream);
  useEffect(() => {
    deleteDreamRef.current = onDeleteDream;
  });
  // True while the confirmation is up, so a second press cannot stack another Alert.
  const confirmOpen = useRef(false);

  // At most one row is open. A row reports when it opens or closes; anything else the user does
  // (scrolling, opening a dream, opening another row) closes it.
  const openRow = useRef<Swipeable | null>(null);
  const handleRowWillOpen = useCallback((row: Swipeable) => {
    if (openRow.current && openRow.current !== row) openRow.current.close();
    openRow.current = row;
  }, []);
  const handleRowClosed = useCallback((row: Swipeable) => {
    if (openRow.current === row) openRow.current = null;
  }, []);
  const closeOpenRow = useCallback(() => {
    openRow.current?.close();
  }, []);

  const handleOpenDream = useCallback(
    (id: string) => {
      closeOpenRow();
      openDreamRef.current(id);
    },
    [closeOpenRow],
  );
  const handleOpenDraft = useCallback(
    (dream: Dream) => {
      closeOpenRow();
      openDraftRef.current(dream);
    },
    [closeOpenRow],
  );
  const handleDelete = useCallback(
    (dream: Dream, closeRow: () => void) => {
      if (confirmOpen.current) return;
      confirmOpen.current = true;
      confirmDeleteDream({
        hasAudio: hasAudio(dream),
        kind,
        onClose: () => {
          confirmOpen.current = false;
          closeRow();
        },
        onConfirm: () => deleteDreamRef.current(dream),
      });
    },
    [kind],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = e.nativeEvent.contentOffset.y;
    },
    [offsetRef],
  );

  const itemCount = items.length;
  const onContentSizeChange = useCallback(() => {
    if (restored.current || itemCount === 0) return;
    restored.current = true;
    if (offsetRef.current > 0) {
      listRef.current?.scrollToOffset({ offset: offsetRef.current, animated: false });
    }
  }, [itemCount, offsetRef]);

  const renderItem = useCallback(
    ({ item }: { item: LogItem }) =>
      item.type === 'header' ? (
        <Text style={styles.month} accessibilityRole="header">
          {item.label}
        </Text>
      ) : (
        <LogRow
          dream={item.dream}
          copy={copy}
          onOpenDream={handleOpenDream}
          onOpenDraft={handleOpenDraft}
          onDelete={handleDelete}
          onRowWillOpen={handleRowWillOpen}
          onRowClosed={handleRowClosed}
          deleting={deletingId === item.dream.id}
          swipeLocked={deletingId !== null}
        />
      ),
    [
      handleOpenDream,
      handleOpenDraft,
      handleDelete,
      handleRowWillOpen,
      handleRowClosed,
      deletingId,
      copy,
    ],
  );
  const keyExtractor = useCallback(
    (item: LogItem) => (item.type === 'header' ? `h:${item.key}` : `d:${item.dream.id}`),
    [],
  );

  const hasDreams = dreams !== null && dreams.length > 0;
  const showChips = hasDreams && indexStatus !== 'unreadable';
  const filtering = tags.length > 0 || query.trim() !== '';

  let body = null;
  if (dreams === null) {
    body = null;
  } else if (items.length > 0) {
    body = (
      <FlatList
        ref={listRef}
        testID="dream-log-list"
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={onScroll}
        onScrollBeginDrag={closeOpenRow}
        scrollEventThrottle={16}
        onContentSizeChange={onContentSizeChange}
        initialNumToRender={12}
        windowSize={7}
      />
    );
  } else if (dreams.length === 0) {
    body =
      indexStatus === 'unreadable' ? (
        <View style={styles.empty}>
          <Text style={styles.emptyBody}>{copy.unreadableLog}</Text>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{copy.emptyTitle}</Text>
          <Text style={styles.emptyBody}>{copy.emptyBody}</Text>
        </View>
      );
  } else {
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{copy.noMatchTitle}</Text>
        <Text style={styles.emptyBody}>{describeFilter(tags, query)}</Text>
        {filtering && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear"
            onPress={view.clearFilters}
            style={styles.clearButton}
          >
            <Text style={styles.clearLabel}>Clear</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {searching ? (
        <View style={styles.header}>
          <View style={styles.searchField}>
            <TextInput
              autoFocus
              value={query}
              onChangeText={view.setQuery}
              placeholder={copy.searchLabel}
              placeholderTextColor={colors.muted}
              accessibilityLabel={copy.searchLabel}
              returnKeyType="search"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {query !== '' && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => view.setQuery('')}
                hitSlop={8}
                style={styles.clearX}
              >
                <Text style={styles.clearXGlyph}>×</Text>
              </Pressable>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={view.closeSearch}
            style={styles.cancel}
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {copy.logHeader}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.searchLabel}
            onPress={view.openSearch}
            style={styles.searchButton}
          >
            <SearchIcon />
          </Pressable>
        </View>
      )}

      {showChips && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          <TagChipButton
            label={`All · ${chipData.all}`}
            selected={tags.length === 0}
            onPress={view.clearTags}
          />
          {chipData.chips.map((chip) => (
            <TagChipButton
              key={chip.tag}
              label={tagChipLabel(chip.tag, chip.count)}
              selected={chip.selected}
              onPress={() => view.toggleTag(chip.tag)}
            />
          ))}
        </ScrollView>
      )}

      <View style={styles.body}>{body}</View>

      {!searching && (
        <View
          pointerEvents="box-none"
          style={[styles.fabWrap, { bottom: insets.bottom + spacing.md }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.newButton}
            onPress={onNewDream}
            style={styles.fab}
          >
            <MicIcon color={colors.accentDark} size={20} />
            <Text style={styles.fabLabel}>{copy.newButton}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function describeFilter(tags: string[], query: string): string {
  const parts: string[] = [];
  const q = query.trim();
  if (q !== '') parts.push(`“${q}”`);
  if (tags.length > 0) parts.push(`tagged ${tags.join(', ')}`);
  return parts.length > 0 ? `Nothing found for ${parts.join(' ')}.` : 'Nothing found.';
}

function TagChipButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tagChip, selected && styles.tagChipSelected]}
    >
      <Text style={[styles.tagChipText, selected && styles.tagChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/** Magnifier drawn with Views (no icon library). */
function SearchIcon() {
  return (
    <View style={styles.iconBox} importantForAccessibility="no-hide-descendants">
      <View style={styles.lens} />
      <View style={styles.handle} />
    </View>
  );
}

function accessibleLabel(row: DreamRow, dream: Dream): string {
  const date = formatEntryDateTime(new Date(dream.createdAt));
  if (row.isDraft) {
    return [`Draft: ${row.title}`, date, 'Tap to finish'].filter(Boolean).join('. ');
  }
  const parts = [row.title, date];
  if (row.chips.emotions.length > 0) parts.push(`Feelings: ${row.chips.emotions.join(', ')}`);
  if (row.chips.tags.length > 0) parts.push(`Tags: ${row.chips.tags.join(', ')}`);
  return parts.filter(Boolean).join('. ');
}

const LogRow = memo(function LogRow({
  dream,
  copy,
  onOpenDream,
  onOpenDraft,
  onDelete,
  onRowWillOpen,
  onRowClosed,
  deleting,
  swipeLocked,
}: {
  dream: Dream;
  copy: JournalCopy;
  onOpenDream: (id: string) => void;
  onOpenDraft: (dream: Dream) => void;
  onDelete: (dream: Dream, closeRow: () => void) => void;
  onRowWillOpen: (row: Swipeable) => void;
  onRowClosed: (row: Swipeable) => void;
  /** This row's dream is being deleted. */
  deleting: boolean;
  /** Some delete is in flight, so no row can be swiped. */
  swipeLocked: boolean;
}) {
  const swipeRef = useRef<Swipeable>(null);
  // While closed, the Delete action sits behind the card and must stay out of the screen reader.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const row = swipeRef.current;
    return () => {
      if (row) onRowClosed(row);
    };
  }, [onRowClosed]);
  const row = useMemo(() => dreamRow(dream, new Date(), copy.untitled), [dream, copy]);
  const label = useMemo(() => accessibleLabel(row, dream), [row, dream]);
  const chips = useMemo(() => limitChips(row.chips), [row]);

  if (row.isDraft) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onOpenDraft(dream)}
        style={[styles.card, styles.draftCard]}
      >
        <View style={styles.cardMain}>
          <View style={styles.draftTitleRow}>
            <Text style={[styles.cardTitle, styles.draftTitle]} numberOfLines={1}>
              {row.title}
            </Text>
            {row.draftSuffix !== '' && (
              <Text style={[styles.cardTitle, styles.draftSuffix]}>{row.draftSuffix}</Text>
            )}
          </View>
          <Text style={styles.draftHint}>
            <Text style={styles.draftLabel}>{row.draftLabel}</Text>
            {row.draftDate !== '' && ` · ${row.draftDate}`}
          </Text>
        </View>
        <Text style={styles.chevron} importantForAccessibility="no">
          ›
        </Text>
      </Pressable>
    );
  }

  const swipeable = !swipeLocked && !deleting;
  const deleteDream = () => {
    onDelete(dream, () => swipeRef.current?.close());
  };

  const card = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={deleting ? { disabled: true } : undefined}
      accessibilityActions={swipeable ? DELETE_ACTIONS : undefined}
      onAccessibilityAction={
        swipeable
          ? (e) => {
              if (e.nativeEvent.actionName === 'delete') deleteDream();
            }
          : undefined
      }
      disabled={deleting}
      onPress={() => onOpenDream(dream.id)}
      style={[styles.card, styles.swipeCard, deleting && styles.deleting]}
    >
      <View style={styles.dateCol}>
        <Text style={styles.weekday}>{row.weekday}</Text>
        <Text style={styles.day}>{row.day ?? ''}</Text>
      </View>
      <View style={styles.cardMain}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {row.title}
        </Text>
        {row.preview !== '' && (
          <Text style={styles.preview} numberOfLines={2}>
            {row.preview}
          </Text>
        )}
        <DreamChips chips={chips.visible} overflow={chips.overflow} />
      </View>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeRef}
      enabled={swipeable}
      overshootRight={false}
      containerStyle={styles.swipeRow}
      onSwipeableWillOpen={() => {
        setRevealed(true);
        if (swipeRef.current) onRowWillOpen(swipeRef.current);
      }}
      onSwipeableClose={() => {
        setRevealed(false);
        if (swipeRef.current) onRowClosed(swipeRef.current);
      }}
      renderRightActions={() => (
        <View
          style={styles.actionWrap}
          accessibilityElementsHidden={!revealed}
          importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.deleteRowLabel(row.title)}
            onPress={deleteDream}
            style={styles.deleteAction}
          >
            <Text style={styles.deleteLabel}>Delete</Text>
          </Pressable>
        </View>
      )}
    >
      {card}
    </Swipeable>
  );
});

const DELETE_ACTIONS = [{ name: 'delete', label: 'Delete' }];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  iconBox: { width: 22, height: 22 },
  lens: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.muted,
  },
  handle: {
    position: 'absolute',
    right: 1,
    bottom: 3,
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.muted,
    transform: [{ rotate: '45deg' }],
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 10,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  clearX: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  clearXGlyph: { color: colors.muted, fontSize: 22 },
  cancel: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center' },
  cancelLabel: { color: colors.accent, fontSize: 16 },
  chipScroll: { flexGrow: 0 },
  chipRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  tagChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  tagChipSelected: { borderColor: colors.accent, backgroundColor: colors.emotionChipBg },
  tagChipText: { color: colors.muted, fontSize: 14 },
  tagChipTextSelected: { color: colors.emotionChipText },
  body: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: FAB_CLEARANCE, flexGrow: 1 },
  month: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 72,
    marginBottom: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // The margin sits on the swipe container, so the revealed action is exactly as tall as the card.
  swipeRow: { marginBottom: spacing.sm + 2, borderRadius: 16 },
  swipeCard: { marginBottom: 0 },
  deleting: { opacity: 0.45 },
  actionWrap: { width: 96, alignItems: 'stretch' },
  deleteAction: {
    flex: 1,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.draft,
  },
  deleteLabel: { color: colors.accentDark, fontSize: 16, fontWeight: '700' },
  draftCard: { backgroundColor: 'transparent', borderColor: colors.faint },
  dateCol: { width: 36, alignItems: 'center' },
  weekday: { color: colors.muted, fontSize: 11, letterSpacing: 0.8 },
  day: { color: colors.text, fontFamily: fonts.serif, fontSize: 26 },
  cardMain: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.text, fontFamily: fonts.serif, fontSize: 18 },
  draftTitleRow: { flexDirection: 'row', alignItems: 'baseline' },
  draftTitle: { flexShrink: 1 },
  draftSuffix: { flexShrink: 0 },
  preview: { color: colors.muted, fontSize: 14, lineHeight: 19 },
  draftHint: { color: colors.muted, fontSize: 13 },
  draftLabel: { color: colors.draft },
  chevron: { color: colors.muted, fontSize: 24 },
  empty: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 18 },
  emptyBody: { color: colors.muted, fontSize: 16 },
  clearButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  clearLabel: { color: colors.accent, fontSize: 16 },
  fabWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: 26,
    backgroundColor: colors.accent,
  },
  fabLabel: { color: colors.accentDark, fontSize: 17, fontWeight: '700' },
});
