import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MicIcon } from '../../components/MicIcon';
import { colors, fonts, spacing } from '../../theme';
import { formatToday } from '../../utils/format';

import { journalCopy } from '../../utils/journals';

const DREAM_COPY = journalCopy('dream');

type Props = {
  onStart: () => void;
  onSkip: () => void;
  onWrite: () => void;
  /** Wording; defaults to the Dreams copy. */
  headline?: string;
  tips?: readonly string[];
  /** The skip pill's label; null hides the pill. Defaults to "No dream". */
  skipLabel?: string | null;
  /** Shows a back arrow (top left) that calls it. Omitted for the launch capture. */
  onBack?: () => void;
  /** Accessibility label of the back arrow; defaults to "Back". */
  backLabel?: string;
};

export function IdleView({
  onStart,
  onSkip,
  onWrite,
  headline = DREAM_COPY.captureHeadline,
  tips = DREAM_COPY.tips,
  skipLabel = DREAM_COPY.skipLabel,
  onBack,
  backLabel = 'Back',
}: Props) {
  return (
    <>
      <View style={[styles.header, onBack && styles.headerWithBack]}>
        {onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            hitSlop={12}
            style={styles.backButton}
          >
            <Text style={styles.back}>←</Text>
          </Pressable>
        )}
        <Text style={styles.small}>{formatToday()}</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.headline}>{headline}</Text>
        <View style={styles.tips}>
          {tips.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <View style={styles.tipDot} />
              <Text style={styles.tip}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.bottom}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tap to talk"
          onPress={onStart}
          style={styles.ringOuter}
        >
          <View style={styles.ringInner}>
            <View style={styles.mic}>
              <MicIcon color={colors.accentDark} />
            </View>
          </View>
        </Pressable>
        <Text style={styles.tapLabel}>Tap to talk</Text>

        <View style={styles.actions}>
          <Pressable onPress={onWrite} style={styles.pill}>
            <Text style={styles.pillIcon}>⌨</Text>
            <Text style={styles.pillLabel}>Write instead</Text>
          </Pressable>
          {skipLabel !== null && (
            <Pressable onPress={onSkip} style={styles.pill}>
              <Text style={styles.pillIcon}>☾</Text>
              <Text style={styles.pillLabel}>{skipLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerWithBack: { alignItems: 'center', paddingLeft: spacing.sm, paddingTop: spacing.sm },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.text, fontSize: 24 },
  small: { color: colors.muted, fontSize: 13 },
  hero: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  headline: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 40,
    lineHeight: 44,
    textAlign: 'left',
  },
  tips: { marginTop: spacing.lg, gap: spacing.sm + 2 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  tipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  tip: { color: colors.muted, fontSize: 16 },
  bottom: { alignItems: 'center', paddingBottom: spacing.xl, gap: spacing.md },
  ringOuter: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: 'rgba(232,164,100,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: 'rgba(232,164,100,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mic: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapLabel: { color: colors.muted, fontSize: 14 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillIcon: { color: colors.muted, fontSize: 14 },
  pillLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
