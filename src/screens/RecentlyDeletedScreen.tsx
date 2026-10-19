import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeletedNoteRow } from '../components/DeletedNoteRow';
import { Note } from '../services/notesStorage';
import { colors, fonts, spacing } from '../theme';
import { DeletedRowData, deletedRow } from '../utils/deletedRow';

export const RECENTLY_DELETED_COPY = {
  title: 'Recently Deleted',
  back: 'Back to notes',
  empty: 'Deleted notes will appear here.',
  emptyHint: 'They stay here until you delete them forever.',
  unreadable: 'Your notes could not be read. Nothing was changed.',
  emptyButton: 'Empty',
  emptyButtonLabel: 'Empty Recently Deleted',
} as const;

type Props = {
  /** Trashed notes, deletion-newest-first as given; null = still loading. */
  notes: Note[] | null;
  now: Date;
  indexStatus: 'ok' | 'unreadable';
  /** True while a restore or delete is running: every action is disabled. */
  busy: boolean;
  /** A short status line under the header ("Restored"), announced politely; null = none. */
  notice: string | null;
  onBack: () => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onEmpty: () => void;
};

/**
 * Recently Deleted. Props only: it reads no storage, shows no Alert and holds no async state.
 * Header (back, title, Empty), an optional status line, then the rows or one of: nothing
 * (loading), the unreadable message (all actions off), or the empty text.
 */
export function RecentlyDeletedScreen({
  notes,
  now,
  indexStatus,
  busy,
  notice,
  onBack,
  onRestore,
  onDeleteForever,
  onEmpty,
}: Props) {
  const insets = useSafeAreaInsets();
  const unreadable = indexStatus === 'unreadable';
  const locked = busy || unreadable;

  const renderItem = useCallback(
    ({ item }: { item: Note }) => {
      const row: DeletedRowData = deletedRow(item, now);
      return (
        <DeletedNoteRow
          row={row}
          busy={locked}
          onRestore={onRestore}
          onDeleteForever={onDeleteForever}
        />
      );
    },
    [now, locked, onRestore, onDeleteForever],
  );
  const keyExtractor = useCallback((n: Note) => n.id, []);

  const emptyDisabled = locked || notes === null || notes.length === 0;

  let body = null;
  if (unreadable) {
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{RECENTLY_DELETED_COPY.unreadable}</Text>
      </View>
    );
  } else if (notes === null) {
    body = null;
  } else if (notes.length === 0) {
    body = (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{RECENTLY_DELETED_COPY.empty}</Text>
        <Text style={styles.emptyHint}>{RECENTLY_DELETED_COPY.emptyHint}</Text>
      </View>
    );
  } else {
    body = (
      <FlatList
        testID="deleted-list"
        data={notes}
        extraData={`${now.getTime()}|${locked}`}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
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
          accessibilityLabel={RECENTLY_DELETED_COPY.back}
          onPress={onBack}
          hitSlop={12}
          style={styles.iconButton}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {RECENTLY_DELETED_COPY.title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={RECENTLY_DELETED_COPY.emptyButtonLabel}
          accessibilityState={{ disabled: emptyDisabled }}
          disabled={emptyDisabled}
          onPress={onEmpty}
          style={[styles.emptyAction, emptyDisabled && styles.disabled]}
        >
          <Text style={styles.emptyActionText}>{RECENTLY_DELETED_COPY.emptyButton}</Text>
        </Pressable>
      </View>
      {notice !== null && (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}
      <View style={styles.body}>{body}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.text, fontSize: 24 },
  title: { flex: 1, color: colors.text, fontFamily: fonts.serif, fontSize: 28 },
  emptyAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  emptyActionText: { color: colors.draft, fontSize: 16 },
  disabled: { opacity: 0.4 },
  notice: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  noticeText: { color: colors.muted, fontSize: 14 },
  body: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: 4 },
  emptyText: { color: colors.muted, fontSize: 16, textAlign: 'center' },
  emptyHint: { color: colors.faint, fontSize: 14, textAlign: 'center' },
});
