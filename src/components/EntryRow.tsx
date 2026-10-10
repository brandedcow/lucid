import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { Dream } from '../types/dream';
import { DreamRow, dreamRow, limitChips } from '../utils/dreamLog';
import { formatEntryDateTime } from '../utils/format';
import { DreamChips } from './DreamChips';

/**
 * One entry as a card: a finished entry (date, title, preview, chips) or a draft (title, "Draft"
 * line). Presentational only: the Dream log wraps it in its swipe row.
 * - `dream`: the entry.
 * - `untitled`: the title shown when the entry has none (journal copy).
 * - `onOpenDream(id)` / `onOpenDraft(dream)`: the card was pressed (finished / draft).
 * - `deleting`: dims the card and disables it.
 * - `onAccessibilityDelete`: when given, screen readers get a "Delete" action that calls it.
 * - `flush`: no bottom margin (the Dream log's swipe row supplies it).
 * - `journalLabel`: when given (e.g. "Dreams"), added to the meta line and the accessibility label.
 */
type Props = {
  dream: Dream;
  untitled: string;
  onOpenDream: (id: string) => void;
  onOpenDraft: (dream: Dream) => void;
  deleting?: boolean;
  onAccessibilityDelete?: () => void;
  flush?: boolean;
  journalLabel?: string;
};

const DELETE_ACTIONS = [{ name: 'delete', label: 'Delete' }];

function accessibleLabel(row: DreamRow, dream: Dream, journalLabel?: string): string {
  const date = formatEntryDateTime(new Date(dream.createdAt));
  if (row.isDraft) {
    return [`Draft: ${row.title}`, date, 'Tap to finish', journalLabel].filter(Boolean).join('. ');
  }
  const parts = [row.title, date];
  if (row.chips.emotions.length > 0) parts.push(`Feelings: ${row.chips.emotions.join(', ')}`);
  if (row.chips.tags.length > 0) parts.push(`Tags: ${row.chips.tags.join(', ')}`);
  if (journalLabel) parts.push(journalLabel);
  return parts.filter(Boolean).join('. ');
}

export const EntryRow = memo(function EntryRow({
  dream,
  untitled,
  onOpenDream,
  onOpenDraft,
  deleting = false,
  onAccessibilityDelete,
  flush = false,
  journalLabel,
}: Props) {
  const row = useMemo(() => dreamRow(dream, new Date(), untitled), [dream, untitled]);
  const label = useMemo(
    () => accessibleLabel(row, dream, journalLabel),
    [row, dream, journalLabel],
  );
  const chips = useMemo(() => limitChips(row.chips), [row]);

  if (row.isDraft) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={deleting ? { disabled: true } : undefined}
        accessibilityActions={onAccessibilityDelete ? DELETE_ACTIONS : undefined}
        onAccessibilityAction={
          onAccessibilityDelete
            ? (e) => {
                if (e.nativeEvent.actionName === 'delete') onAccessibilityDelete();
              }
            : undefined
        }
        disabled={deleting}
        onPress={() => onOpenDraft(dream)}
        style={[styles.card, styles.draftCard, flush && styles.flush, deleting && styles.deleting]}
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
            {journalLabel ? ` · ${journalLabel}` : ''}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={deleting ? { disabled: true } : undefined}
      accessibilityActions={onAccessibilityDelete ? DELETE_ACTIONS : undefined}
      onAccessibilityAction={
        onAccessibilityDelete
          ? (e) => {
              if (e.nativeEvent.actionName === 'delete') onAccessibilityDelete();
            }
          : undefined
      }
      disabled={deleting}
      onPress={() => onOpenDream(dream.id)}
      style={[styles.card, flush && styles.flush, deleting && styles.deleting]}
    >
      <View style={styles.dateCol}>
        <Text style={styles.weekday}>{row.weekday}</Text>
        <Text style={styles.day}>{row.day ?? ''}</Text>
      </View>
      <View style={styles.cardMain}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {row.title}
        </Text>
        {journalLabel ? <Text style={styles.meta}>{journalLabel}</Text> : null}
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
  flush: { marginBottom: 0 },
  deleting: { opacity: 0.45 },
  draftCard: { backgroundColor: 'transparent', borderColor: colors.faint },
  dateCol: { width: 36, alignItems: 'center' },
  weekday: { color: colors.muted, fontSize: 11, letterSpacing: 0.8 },
  day: { color: colors.text, fontFamily: fonts.serif, fontSize: 26 },
  cardMain: { flex: 1, gap: spacing.xs },
  cardTitle: { color: colors.text, fontFamily: fonts.serif, fontSize: 18 },
  draftTitleRow: { flexDirection: 'row', alignItems: 'baseline' },
  draftTitle: { flexShrink: 1 },
  draftSuffix: { flexShrink: 0 },
  meta: { color: colors.muted, fontSize: 13 },
  preview: { color: colors.muted, fontSize: 14, lineHeight: 19 },
  draftHint: { color: colors.muted, fontSize: 13 },
  draftLabel: { color: colors.draft },
});
