import { useCallback, useEffect, useMemo, useRef } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { EntryRow } from '../components/EntryRow';
import { SearchIcon } from '../components/SearchIcon';
import { IndexStatus } from '../hooks/useDreamLibrary';
import { LogView } from '../hooks/useLogView';
import { colors, fonts, spacing } from '../theme';
import { Entry } from '../types/dream';
import {
  buildLogItems,
  buildTagChips,
  filterDreams,
  LogItem,
  tagChipLabel,
} from '../utils/dreamLog';
import { Journal, kindCopy } from '../utils/journals';
import { journalLabel, searchModel, untitledLabelOf } from '../utils/journalSearch';

/** All wording of the cross-journal search, in one place. */
export const SEARCH_COPY = {
  title: 'Search',
  fieldLabel: 'Search all journals',
  emptyTitle: 'Nothing to search yet.',
  emptyBody: 'Entries from all your journals show up here.',
  noMatchTitle: 'No entries match',
} as const;

/**
 * Search across every journal: one text field plus tag chips (an entry must have all selected
 * tags), results mixed newest first and grouped by month, each labelled with its journal. Finished
 * entries of known journals only; no drafts, no deleting.
 *
 * Props:
 * - `journals`: the journal registry; only entries of these journals are searched.
 * - `records`: every stored record (all journals, drafts included). `null` while loading.
 * - `indexStatus`: 'unreadable' when the saved entries could not be read.
 * - `view`: this screen's own `useLogView()` instance (tags, query, scroll offset), owned by the
 *   parent so it survives opening a result. `searching` is unused here: the field is always shown.
 * - `onBack()`: the back arrow.
 * - `onOpenDream(id)`: a result was tapped.
 */
type Props = {
  journals: readonly Journal[];
  records: Entry[] | null;
  indexStatus: IndexStatus;
  view: LogView;
  onBack: () => void;
  onOpenDream: (id: string) => void;
};

const NO_DRAFT = () => {};

export function SearchScreen({ journals, records, indexStatus, view, onBack, onOpenDream }: Props) {
  const { tags, query, offsetRef } = view;
  const listRef = useRef<FlatList<LogItem>>(null);
  const restored = useRef(false);

  const model = useMemo(() => searchModel(journals, records ?? []), [journals, records]);
  const filtered = useMemo(
    () => filterDreams(model.searchIndex, { tags, query }),
    [model, tags, query],
  );
  const items = useMemo(() => buildLogItems(filtered), [filtered]);
  const chipData = useMemo(() => buildTagChips(model.entries, tags), [model, tags]);

  // A changed filter or query starts again at the top (the offset itself is reset by the hook).
  const filterKey = `${tags.join('\n')}\u0000${query}`;
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [filterKey]);

  const openRef = useRef(onOpenDream);
  useEffect(() => {
    openRef.current = onOpenDream;
  });
  const handleOpen = useCallback((id: string) => openRef.current(id), []);

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
        <EntryRow
          dream={item.dream}
          journals={journals}
          untitled={untitledLabelOf(journals, item.dream)}
          journalLabel={journalLabel(journals, item.dream)}
          onOpenDream={handleOpen}
          onOpenDraft={NO_DRAFT}
        />
      ),
    [handleOpen, journals],
  );
  const keyExtractor = useCallback(
    (item: LogItem) => (item.type === 'header' ? `h:${item.key}` : `d:${item.dream.id}`),
    [],
  );

  const hasEntries = model.entries.length > 0;
  const showChips = hasEntries && indexStatus !== 'unreadable';
  const filtering = tags.length > 0 || query.trim() !== '';

  let body = null;
  if (records === null) {
    body = null;
  } else if (items.length > 0) {
    body = (
      <FlatList
        ref={listRef}
        testID="search-results-list"
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
  } else if (!hasEntries) {
    body =
      indexStatus === 'unreadable' ? (
        <View style={styles.empty}>
          <Text style={styles.emptyBody}>{kindCopy('journal').unreadableLog}</Text>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{SEARCH_COPY.emptyTitle}</Text>
          <Text style={styles.emptyBody}>{SEARCH_COPY.emptyBody}</Text>
        </View>
      );
  } else {
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{SEARCH_COPY.noMatchTitle}</Text>
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
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={12}
          style={styles.backButton}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {SEARCH_COPY.title}
        </Text>
      </View>

      <View style={styles.searchField}>
        <View style={styles.searchGlyph}>
          <SearchIcon />
        </View>
        <TextInput
          autoFocus
          value={query}
          onChangeText={view.setQuery}
          placeholder={SEARCH_COPY.fieldLabel}
          placeholderTextColor={colors.muted}
          accessibilityLabel={SEARCH_COPY.fieldLabel}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingLeft: spacing.sm,
    paddingRight: spacing.lg,
    paddingTop: spacing.sm,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.text, fontSize: 24 },
  title: { color: colors.text, fontFamily: fonts.serif, fontSize: 34 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
  },
  searchGlyph: { marginRight: spacing.sm },
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
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexGrow: 1 },
  month: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
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
});
