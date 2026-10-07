import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DreamChips } from '../components/DreamChips';
import { MicIcon } from '../components/MicIcon';
import { IndexStatus } from '../hooks/useDreamLibrary';
import { LogView } from '../hooks/useLogView';
import { colors, fonts, spacing } from '../theme';
import { Dream } from '../types/dream';
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

/**
 * Props:
 * - `dreams`: stored dreams, newest first, drafts included. `null` while loading.
 * - `indexStatus`: 'unreadable' when the saved dreams could not be read.
 * - `view`: the Dream log's view state from `useLogView()` (tag filter, search, scroll offset),
 *   owned by the parent so it survives leaving the log.
 * - `onOpenDream(id)`: a finished dream was tapped.
 * - `onOpenDraft(dream)`: a draft was tapped.
 * - `onNewDream()`: the "New dream" button was tapped.
 */
type Props = {
  dreams: Dream[] | null;
  indexStatus: IndexStatus;
  view: LogView;
  onOpenDream: (id: string) => void;
  onOpenDraft: (dream: Dream) => void;
  onNewDream: () => void;
};

const UNREADABLE_MESSAGE = 'Your saved dreams could not be read. Your recordings are safe.';
const FAB_CLEARANCE = 120;

export function DreamLogScreen({
  dreams,
  indexStatus,
  view,
  onOpenDream,
  onOpenDraft,
  onNewDream,
}: Props) {
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
  const handleOpenDream = useCallback((id: string) => openDreamRef.current(id), []);
  const handleOpenDraft = useCallback((dream: Dream) => openDraftRef.current(dream), []);

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
        <LogRow dream={item.dream} onOpenDream={handleOpenDream} onOpenDraft={handleOpenDraft} />
      ),
    [handleOpenDream, handleOpenDraft],
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
          <Text style={styles.emptyBody}>{UNREADABLE_MESSAGE}</Text>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No dreams yet.</Text>
          <Text style={styles.emptyBody}>Tap New dream to record one.</Text>
        </View>
      );
  } else {
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No dreams match</Text>
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
              placeholder="Search dreams"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Search dreams"
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
            Dreams
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search dreams"
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
            onPress={() => tags.forEach((t) => view.toggleTag(t))}
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
            accessibilityLabel="New dream"
            onPress={onNewDream}
            style={styles.fab}
          >
            <MicIcon color={colors.accentDark} size={20} />
            <Text style={styles.fabLabel}>New dream</Text>
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
    return [`Draft: ${row.title}`, date, 'Not reviewed yet', 'Finish now']
      .filter(Boolean)
      .join('. ');
  }
  const parts = [row.title, date];
  if (row.chips.emotions.length > 0) parts.push(`Feelings: ${row.chips.emotions.join(', ')}`);
  if (row.chips.tags.length > 0) parts.push(`Tags: ${row.chips.tags.join(', ')}`);
  return parts.filter(Boolean).join('. ');
}

const LogRow = memo(function LogRow({
  dream,
  onOpenDream,
  onOpenDraft,
}: {
  dream: Dream;
  onOpenDream: (id: string) => void;
  onOpenDraft: (dream: Dream) => void;
}) {
  const row = useMemo(() => dreamRow(dream), [dream]);
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
          <Text style={styles.cardTitle} numberOfLines={1}>
            {row.title + row.draftSuffix}
          </Text>
          <Text style={styles.draftHint}>
            <Text style={styles.draftLabel}>{row.draftLabel}</Text>
            {` · ${row.draftHint}`}
          </Text>
        </View>
        <Text style={styles.chevron} importantForAccessibility="no">
          ›
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onOpenDream(dream.id)}
      style={styles.card}
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
});

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
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
  clearX: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  draftCard: { backgroundColor: 'transparent', borderColor: colors.faint },
  dateCol: { width: 36, alignItems: 'center' },
  weekday: { color: colors.muted, fontSize: 11, letterSpacing: 0.8 },
  day: { color: colors.text, fontFamily: fonts.serif, fontSize: 26 },
  cardMain: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.text, fontFamily: fonts.serif, fontSize: 18 },
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
