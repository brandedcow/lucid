import { useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NoteRow } from '../components/NoteRow';
import { SearchIcon } from '../components/SearchIcon';
import { Note } from '../services/notesStorage';
import { colors, fonts, spacing } from '../theme';
import { MonthSection } from '../utils/noteSearch';
import { NoteRowData, noteRow } from '../utils/noteRow';
import { TagCount } from '../utils/noteViews';

/** All wording of Search, in one place. */
export const SEARCH_COPY = {
  back: 'Back to notes',
  title: 'Search',
  fieldLabel: 'Search notes',
  placeholder: 'Search',
  clear: 'Clear search',
  hint: 'Search your notes by words or #tags.',
  noMatch: 'No notes found.',
  unreadable: 'Your notes could not be read. Nothing was changed.',
} as const;

type Props = {
  /** The text in the field, exactly as typed (never trimmed here). */
  query: string;
  onChangeQuery: (query: string) => void;
  selectedTags: readonly string[];
  onToggleTag: (tag: string) => void;
  /** The chips to show (see `searchChips`). */
  chips: readonly TagCount[];
  /** The results, grouped by month (see `monthSections`). */
  sections: readonly MonthSection[];
  resultCount: number;
  now: Date;
  indexStatus: 'ok' | 'unreadable';
  onOpenNote: (id: string) => void;
  onBack: () => void;
};

function TagChip({
  tag,
  selected,
  onPress,
}: {
  tag: string;
  selected: boolean;
  onPress: (tag: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`#${tag}`}
      accessibilityState={{ selected }}
      onPress={() => onPress(tag)}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {selected && (
        <Text
          testID="chip-check"
          style={styles.chipCheck}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          ✓
        </Text>
      )}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>#{tag}</Text>
    </Pressable>
  );
}

/**
 * The Search page. Props only: no storage, no navigation. Header (back arrow, title), the field
 * with a clear button, a horizontal row of tag chips, then month-grouped results as note rows (no
 * swipe), or one of: the hint (nothing typed or selected), "No notes found.", or the unreadable
 * message (field disabled).
 */
export function NoteSearchScreen({
  query,
  onChangeQuery,
  selectedTags,
  onToggleTag,
  chips,
  sections,
  resultCount,
  now,
  indexStatus,
  onOpenNote,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const unreadable = indexStatus === 'unreadable';
  const idle = query.trim() === '' && selectedTags.length === 0;

  const renderItem = useCallback(
    ({ item }: { item: Note }) => {
      const row: NoteRowData = noteRow(item, now);
      return <NoteRow row={row} onOpen={onOpenNote} />;
    },
    [now, onOpenNote],
  );
  const keyExtractor = useCallback((n: Note) => n.id, []);

  let body = null;
  if (unreadable) {
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{SEARCH_COPY.unreadable}</Text>
      </View>
    );
  } else if (idle) {
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{SEARCH_COPY.hint}</Text>
      </View>
    );
  } else if (resultCount === 0) {
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{SEARCH_COPY.noMatch}</Text>
      </View>
    );
  } else {
    body = (
      <SectionList<Note, MonthSection>
        testID="search-results"
        sections={sections as MonthSection[]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Text style={styles.month} accessibilityRole="header">
            {section.title}
          </Text>
        )}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        windowSize={9}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SEARCH_COPY.back}
          onPress={onBack}
          hitSlop={12}
          style={styles.iconButton}
        >
          <Text style={styles.back} accessible={false}>
            ←
          </Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {SEARCH_COPY.title}
        </Text>
      </View>

      <View style={styles.field}>
        <View style={styles.glyph}>
          <SearchIcon />
        </View>
        <TextInput
          autoFocus
          value={query}
          onChangeText={onChangeQuery}
          editable={!unreadable}
          placeholder={SEARCH_COPY.placeholder}
          placeholderTextColor={colors.muted}
          accessibilityLabel={SEARCH_COPY.fieldLabel}
          returnKeyType="search"
          autoCorrect={false}
          style={styles.input}
        />
        {query !== '' && !unreadable && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={SEARCH_COPY.clear}
            onPress={() => onChangeQuery('')}
            hitSlop={8}
            style={styles.clear}
          >
            <Text style={styles.clearGlyph} accessible={false}>
              ×
            </Text>
          </Pressable>
        )}
      </View>

      {!unreadable && chips.length > 0 && (
        <View style={styles.chipScroll}>
          <ChipRow chips={chips} selectedTags={selectedTags} onToggleTag={onToggleTag} />
        </View>
      )}

      <View style={styles.body}>{body}</View>
    </SafeAreaView>
  );
}

function ChipRow({
  chips,
  selectedTags,
  onToggleTag,
}: {
  chips: readonly TagCount[];
  selectedTags: readonly string[];
  onToggleTag: (tag: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.chipRow}
    >
      {chips.map((c) => (
        <TagChip
          key={c.tag}
          tag={c.tag}
          selected={selectedTags.includes(c.tag)}
          onPress={onToggleTag}
        />
      ))}
    </ScrollView>
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
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.text, fontSize: 24 },
  title: { color: colors.text, fontFamily: fonts.serif, fontSize: 28 },
  field: {
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
  glyph: { marginRight: spacing.sm },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 10,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  clear: { width: 44, height: 42, alignItems: 'center', justifyContent: 'center' },
  clearGlyph: { color: colors.muted, fontSize: 22 },
  chipScroll: { flexGrow: 0 },
  chipRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.emotionChipBg },
  chipCheck: { color: colors.emotionChipText, fontSize: 13 },
  chipText: { color: colors.muted, fontSize: 14 },
  chipTextSelected: { color: colors.emotionChipText },
  body: { flex: 1 },
  month: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 1.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  empty: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: 16, textAlign: 'center' },
});
