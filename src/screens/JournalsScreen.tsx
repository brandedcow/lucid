import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchIcon } from '../components/SearchIcon';
import { colors, fonts, spacing } from '../theme';
import { JournalId } from '../types/entry';
import { Journal, kindCopy } from '../utils/journals';

/**
 * Props:
 * - `journals`: the journals to list, in display order.
 * - `counts`: finished entries per journal, computed by the parent. `null` while loading (no count
 *   line is shown).
 * - `unreadable`: the saved entries could not be read. Cards stay tappable, without counts, and a
 *   message sits under the header.
 * - `onOpenJournal(id)`: a journal card was tapped.
 * - `onSearch()`: the search button was tapped (search across all journals).
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
}: Props) {
  const showCounts = counts !== null && !unreadable;
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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

      <View style={styles.list}>
        {journals.map((journal) => {
          const count = showCounts ? (counts[journal.id] ?? 0) : null;
          const line = count === null ? null : countLabel(journal, count);
          return (
            <Pressable
              key={journal.id}
              accessibilityRole="button"
              accessibilityLabel={line === null ? journal.name : `${journal.name}, ${line}`}
              onPress={() => onOpenJournal(journal.id)}
              style={styles.card}
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
        })}
      </View>
    </SafeAreaView>
  );
}

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
  cardMain: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.text, fontFamily: fonts.serif, fontSize: 26 },
  count: { color: colors.muted, fontSize: 14 },
  chevron: { color: colors.muted, fontSize: 24 },
});
