import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { Dream } from '../types/dream';
import { dreamRow, RowChip } from '../utils/dreamLog';
import { formatTimeOfDay } from '../utils/format';
import { entryNoun, Journal, journalOf, journalOrDefault } from '../utils/journals';
import { splitParagraphs } from '../utils/paragraphs';
import { OutlinedChips } from './OutlinedChips';

/**
 * One entry as a flat Today item: a hairline above, a small uppercase label line
 * ("DREAM · 6:22 AM"), a large serif title, the FULL body (never truncated) and outlined chips.
 * A draft keeps the frame but shows a red "DRAFT" in the label line and no body.
 * Same props as `EntryRow`; `untitled` and `flush` are accepted for parity (`flush` is a no-op: the
 * row has no margin). Presentational only: the Today page wraps it in `SwipeEntryRow`.
 */
type Props = {
  dream: Dream;
  journals: readonly Journal[];
  untitled: string;
  onOpenDream: (id: string) => void;
  onOpenDraft: (dream: Dream) => void;
  deleting?: boolean;
  onAccessibilityDelete?: () => void;
  flush?: boolean;
  /** Journal name for the label sentence ("Dream", "Life"). Falls back to the entry noun. */
  journalLabel?: string;
};

const DELETE_ACTIONS = [{ name: 'delete', label: 'Delete' }];

export const TodayEntryRow = memo(function TodayEntryRow({
  dream,
  journals,
  untitled,
  onOpenDream,
  onOpenDraft,
  deleting = false,
  onAccessibilityDelete,
  journalLabel,
}: Props) {
  const row = useMemo(() => dreamRow(dream, new Date(), untitled), [dream, untitled]);
  const journal = journalOrDefault(journals, journalOf(dream));
  const kind = journal.kind;
  const time = formatTimeOfDay(new Date(dream.createdAt));
  const noun = entryNoun(journal);
  const untitledLife = row.ownTitle === '' && kind === 'journal';
  // A draft shows its title (or the untitled copy) and no body; an untitled Life entry has no title line.
  const title = row.isDraft ? row.title : untitledLife ? '' : row.title;
  const paragraphs = useMemo(
    () => (row.isDraft ? [] : splitParagraphs(dream.transcript)),
    [row.isDraft, dream.transcript],
  );
  const chips = useMemo<RowChip[]>(
    () => [
      ...row.chips.emotions.map((label) => ({ kind: 'emotion' as const, label })),
      ...row.chips.tags.map((label) => ({ kind: 'tag' as const, label })),
    ],
    [row],
  );
  const labelText = [noun, time].filter(Boolean).join(' · ');

  const a11y = [
    row.ownTitle || 'Untitled',
    [journalLabel ?? noun, time].filter(Boolean).join(', '),
  ];
  if (row.chips.emotions.length > 0) a11y.push(`Feelings: ${row.chips.emotions.join(', ')}`);
  if (row.chips.tags.length > 0) a11y.push(`Tags: ${row.chips.tags.join(', ')}`);
  if (row.isDraft) a11y.push('Draft', 'Tap to finish');
  const label = a11y.join('. ');

  return (
    <Pressable
      accessible
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
      onPress={() => (row.isDraft ? onOpenDraft(dream) : onOpenDream(dream.id))}
      style={[styles.row, deleting && styles.deleting]}
    >
      <Text style={styles.label}>
        {row.isDraft && <Text style={styles.draft}>DRAFT · </Text>}
        {labelText}
      </Text>
      {title !== '' && <Text style={styles.title}>{title}</Text>}
      {paragraphs.map((p, i) => (
        <Text key={i} style={styles.body}>
          {p}
        </Text>
      ))}
      <OutlinedChips chips={chips} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm + 2,
    paddingVertical: spacing.md + 4,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  deleting: { opacity: 0.45 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' },
  draft: { color: colors.draft },
  title: { color: colors.text, fontFamily: fonts.serif, fontSize: 26, lineHeight: 32 },
  body: { color: colors.text, fontFamily: fonts.serif, fontSize: 17, lineHeight: 25 },
});
