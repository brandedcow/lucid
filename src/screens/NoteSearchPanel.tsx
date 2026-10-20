import { useCallback, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listClearance } from '../components/NewNoteButton';
import { NoteRow } from '../components/NoteRow';
import { SearchIcon } from '../components/SearchIcon';
import { Note } from '../services/notesStorage';
import { colors, spacing } from '../theme';
import { MonthSection, parseQuery } from '../utils/noteSearch';
import { NoteRowData, noteRow } from '../utils/noteRow';
import { TagCount } from '../utils/noteViews';

/** All wording of Search, in one place. */
export const SEARCH_COPY = {
  close: 'Close search',
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

/** The count line: "1 note found" / "N notes found". */
export function foundText(count: number): string {
  return count === 1 ? '1 note found' : `${count} notes found`;
}

type HeaderProps = {
  /** The text in the field, exactly as typed (never trimmed here). */
  query: string;
  onChangeQuery: (query: string) => void;
  onClose: () => void;
  /** The index is unreadable: the field is disabled. */
  disabled?: boolean;
};

/**
 * The search field that takes the place of the note list header while searching: a "Close search"
 * arrow, the field (focused on mount, return key "search") and a clear button. Props only.
 */
export function SearchHeader({ query, onChangeQuery, onClose, disabled = false }: HeaderProps) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SEARCH_COPY.close}
        onPress={onClose}
        hitSlop={12}
        style={styles.iconButton}
      >
        <Text style={styles.back} accessible={false}>
          ←
        </Text>
      </Pressable>
      <View style={styles.field}>
        <View style={styles.glyph}>
          <SearchIcon />
        </View>
        <TextInput
          autoFocus
          value={query}
          onChangeText={onChangeQuery}
          editable={!disabled}
          placeholder={SEARCH_COPY.placeholder}
          placeholderTextColor={colors.muted}
          accessibilityLabel={SEARCH_COPY.fieldLabel}
          returnKeyType="search"
          autoCorrect={false}
          style={styles.input}
        />
        {query !== '' && !disabled && (
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
    </>
  );
}

/**
 * The search results, drawn over the note list body: a row of tag chips, the "N notes found" line
 * (a polite live region), then month-grouped results as note rows with the matches highlighted (no
 * swipe), or one of: the hint (nothing typed or selected), "No notes found.", or the unreadable
 * message. Props only: no storage, no navigation.
 */
export function NoteSearchPanel({
  query,
  selectedTags,
  onToggleTag,
  chips,
  sections,
  resultCount,
  now,
  indexStatus,
  onOpenNote,
}: Props) {
  const insets = useSafeAreaInsets();
  const unreadable = indexStatus === 'unreadable';
  const idle = query.trim() === '' && selectedTags.length === 0;
  const parsed = useMemo(() => parseQuery(query), [query]);

  const renderItem = useCallback(
    ({ item }: { item: Note }) => {
      const row: NoteRowData = noteRow(item, now, parsed);
      return <NoteRow row={row} onOpen={onOpenNote} />;
    },
    [now, parsed, onOpenNote],
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
      <View style={styles.empty} accessibilityLiveRegion="polite">
        <Text style={styles.emptyText}>{SEARCH_COPY.noMatch}</Text>
      </View>
    );
  } else {
    body = (
      <>
        <View accessibilityLiveRegion="polite">
          <Text style={styles.found}>{foundText(resultCount)}</Text>
        </View>
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
          contentContainerStyle={{ paddingBottom: listClearance(insets.bottom) }}
        />
      </>
    );
  }

  return (
    <View style={styles.container} testID="search-panel">
      {!unreadable && chips.length > 0 && (
        <View style={styles.chipScroll}>
          <ChipRow chips={chips} selectedTags={selectedTags} onToggleTag={onToggleTag} />
        </View>
      )}
      <View style={styles.body}>{body}</View>
    </View>
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
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.text, fontSize: 24 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    marginRight: spacing.sm,
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
  found: {
    color: colors.muted,
    fontSize: 13,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
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
