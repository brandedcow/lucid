import { Fragment, memo } from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts, spacing } from '../theme';
import { TextPart } from '../utils/noteHighlight';
import { NoteRowData } from '../utils/noteRow';

type Props = {
  row: NoteRowData;
  onOpen: (id: string) => void;
  /** Screen-reader actions (the swipe row's Pin and Delete). Omitted = none. */
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (e: AccessibilityActionEvent) => void;
};

/** A small pin drawn with Views (no icon library). Hidden from screen readers; the row's label says "Pinned". */
function PinGlyph() {
  return (
    <View
      testID="note-row-pin"
      style={styles.pin}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.pinHead} />
      <View style={styles.pinNeedle} />
    </View>
  );
}

/** Text with matched parts bold on a tinted background (not colour alone). */
function Highlighted({
  parts,
  fallback,
  matchStyle = styles.match,
}: {
  parts: TextPart[] | undefined;
  fallback: string;
  matchStyle?: object;
}) {
  if (!parts) return <>{fallback}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <Text key={i} style={matchStyle}>
            {p.text}
          </Text>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * One row of the note list: serif title (one line) with the time and, when pinned, a pin glyph at
 * its right; the preview (two lines, muted) and the tags (accent) below. No fixed heights, so
 * large text wraps. Tapping calls `onOpen(id)`.
 */
function NoteRowImpl({ row, onOpen, accessibilityActions, onAccessibilityAction }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.a11yLabel}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPress={() => onOpen(row.id)}
      style={styles.row}
    >
      <View style={styles.titleLine}>
        <Text style={styles.title} numberOfLines={1}>
          <Highlighted parts={row.titleParts} fallback={row.title} />
        </Text>
        {row.pinned && <PinGlyph />}
        {row.time !== '' && <Text style={styles.time}>{row.time}</Text>}
      </View>
      {(row.previewParts ? row.previewParts.length > 0 : row.preview !== '') && (
        <Text style={styles.preview} numberOfLines={2}>
          <Highlighted
            parts={row.previewParts}
            fallback={row.preview}
            matchStyle={styles.matchOnMuted}
          />
        </Text>
      )}
      {row.tagLine !== '' && (
        <Text style={styles.tags} numberOfLines={1}>
          <Highlighted parts={row.tagParts} fallback={row.tagLine} />
        </Text>
      )}
    </Pressable>
  );
}

export const NoteRow = memo(NoteRowImpl);

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontFamily: fonts.serif, fontSize: 18 },
  time: { color: colors.faint, fontSize: 12 },
  preview: { color: colors.muted, fontSize: 15 },
  tags: { color: colors.accent, fontSize: 13 },
  /** Matched preview text: full text colour on the tint (the muted colour is too faint there). */
  matchOnMuted: { backgroundColor: colors.highlight, fontWeight: '700', color: colors.text },
  match: { backgroundColor: colors.highlight, fontWeight: '700' },
  pin: { width: 10, height: 14, alignItems: 'center' },
  pinHead: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  pinNeedle: { width: 2, height: 6, backgroundColor: colors.accent },
});
