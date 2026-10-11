import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Waveform } from '../../components/Waveform';
import { colors, fonts, spacing } from '../../theme';
import { fadeTail } from '../../utils/fadeTail';
import { formatDuration, formatToday } from '../../utils/format';
import { journalCopy } from '../../utils/journals';

type Props = {
  durationMs: number;
  level: number;
  saving: boolean;
  /** Recording is paused: hollow dot, flat waveform, still caret, play icon. */
  paused: boolean;
  onTogglePause: () => void;
  /** Live text from on-device recognition; empty until something is heard. */
  transcript?: string;
  /** Small debug line for the device test; omitted when there is no problem. */
  transcriptNote?: string | null;
  onSave: () => void;
  /** The Save button's label; defaults to the Dreams wording. */
  saveLabel?: string;
  /** Stop recording, delete it and keep the text so far; the screen confirms first. */
  onTypeInstead?: () => void;
  /** Shows a back arrow at the start of the header row; the screen confirms before leaving. */
  onBack?: () => void;
  /** Accessibility label of the back arrow; defaults to "Back". */
  backLabel?: string;
};

function PauseGlyph({ paused }: { paused: boolean }) {
  if (paused) return <View style={styles.play} />;
  return (
    <View style={styles.pauseBars}>
      <View style={styles.pauseBar} />
      <View style={styles.pauseBar} />
    </View>
  );
}

export function ListeningView({
  durationMs,
  level,
  saving,
  paused,
  onTogglePause,
  transcript = '',
  transcriptNote = null,
  onSave,
  saveLabel = journalCopy('dream').saveButton,
  onTypeInstead,
  onBack,
  backLabel = 'Back',
}: Props) {
  const time = formatDuration(Math.floor(durationMs / 1000));
  const tail = useMemo(() => fadeTail(transcript), [transcript]);
  const pauseDisabled = saving;

  return (
    <>
      <View style={[styles.header, onBack && styles.headerWithBack]}>
        <View style={styles.lead}>
          {onBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={onBack}
              hitSlop={12}
              style={[styles.backButton, saving && styles.disabled]}
            >
              <Text style={styles.back}>←</Text>
            </Pressable>
          )}
          <View style={styles.status}>
            <View style={[styles.dot, paused && styles.dotHollow]} />
            <Text style={styles.statusText}>{`${paused ? 'Paused' : 'Listening'} · ${time}`}</Text>
          </View>
        </View>
        <Text style={styles.small}>{formatToday()}</Text>
      </View>

      <View style={styles.transcript}>
        {tail.length === 0 ? (
          <Text style={styles.transcriptEmpty}>{paused ? 'Paused' : 'Listening...'}</Text>
        ) : (
          <Text
            style={styles.transcriptText}
            accessible={paused}
            accessibilityLabel={paused ? transcript : undefined}
            accessibilityElementsHidden={!paused}
            importantForAccessibility={paused ? 'yes' : 'no-hide-descendants'}
          >
            {tail.map(({ word, color }, i) => (
              <Text key={i} style={{ color }}>
                {i < tail.length - 1 ? `${word} ` : word}
              </Text>
            ))}
            <Text style={styles.caret}>|</Text>
          </Text>
        )}
      </View>
      {transcriptNote ? <Text style={styles.note}>{transcriptNote}</Text> : null}

      <View style={styles.waveWrap}>
        <Waveform level={paused ? 0 : level} active={!paused} />
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Resume' : 'Pause'}
          disabled={pauseDisabled}
          onPress={onTogglePause}
          style={[styles.pause, pauseDisabled && styles.disabled]}
        >
          <PauseGlyph paused={paused} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={onSave}
          style={[styles.save, saving && styles.disabled]}
        >
          <Text style={styles.saveLabel}>{saving ? 'Saving…' : saveLabel}</Text>
        </Pressable>
      </View>
      <Text style={styles.caption}>Audio and transcript are both kept</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Type instead"
        disabled={saving}
        onPress={() => onTypeInstead?.()}
        style={[styles.typeInstead, saving && styles.disabled]}
      >
        <Text style={styles.typeInsteadLabel}>Type instead</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerWithBack: { paddingLeft: spacing.sm, paddingTop: spacing.sm },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.text, fontSize: 24 },
  lead: { flexDirection: 'row', alignItems: 'center' },
  small: { color: colors.muted, fontSize: 13 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  dotHollow: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.accent },
  statusText: { color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] },
  transcript: {
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginHorizontal: spacing.lg,
  },
  transcriptText: { color: colors.text, fontFamily: fonts.serif, fontSize: 20, lineHeight: 30 },
  transcriptEmpty: {
    color: colors.faint,
    fontFamily: fonts.serif,
    fontSize: 20,
    textAlign: 'center',
  },
  caret: { color: colors.text },
  note: {
    color: colors.faint,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  waveWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pause: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBars: { flexDirection: 'row', gap: 5 },
  pauseBar: { width: 4, height: 18, borderRadius: 2, backgroundColor: colors.text },
  play: {
    marginLeft: 4,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 16,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.text,
  },
  save: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  saveLabel: { color: colors.accentDark, fontSize: 17, fontWeight: '700' },
  caption: {
    color: colors.faint,
    fontSize: 12,
    textAlign: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  typeInstead: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  typeInsteadLabel: { color: colors.muted, fontSize: 14 },
});
