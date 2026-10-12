import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { stopAllPlayback, useRecordingPlayback } from '../hooks/useRecordingPlayback';
import { shareRecording, ShareUnavailableError } from '../services/shareRecording';
import { colors, spacing } from '../theme';
import { formatClock, formatRecordedAt, timeTicks } from '../utils/voiceNoteTime';
import { isValidWaveform } from '../utils/waveform';
import { SeekBar } from './SeekBar';
import { ShareIcon, TrashIcon } from './VoiceNoteIcons';

/** Seconds moved by the back / forward buttons. */
export const SKIP_SECONDS = 15;
/** Position update interval (ms) while the view is open; finer than the default for the clock and playhead. */
export const SHEET_UPDATE_INTERVAL = 50;
/** Playback speeds, in the order the speed button cycles through them. */
export const SPEEDS = [1, 1.5, 2, 0.75] as const;

const WAVE_HEIGHT = 96;
const EDGE = 20;

export type SheetNote = {
  id: string;
  uri: string;
  durationMs: number;
  waveform?: number[];
};

type Props = {
  note: SheetNote;
  /** Place among the entry's visible notes (1-based); labels read "voice note N of M" when count > 1. */
  index: number;
  count: number;
  /** When the note was recorded; null leaves the time out of the subtitle. */
  recordedAt: Date | null;
  /** Trash and share are off (a save is in flight or a recording is running). */
  busy?: boolean;
  /** Play and seeking are off (a recording is running). */
  playDisabled?: boolean;
  onClose: () => void;
  /** The trash: the owner marks the note removed (undoable) and closes the view. */
  onRemove: (id: string) => void;
};

const pad = (n: number) => n.toString().padStart(2, '0');
const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};
const speedLabel = (rate: number) => `${rate}x`;

/**
 * The expanded voice note view: a full-screen overlay (in-screen, not a Modal or a route) opened by
 * tapping a card. Back arrow, share and trash at the top; title, "mm:ss · Today, h:mm PM", a large
 * waveform with a playhead (drag or tap to seek, through SeekBar), time ticks, the elapsed time with
 * centiseconds, and back 15 s / play / forward 15 s / speed.
 *
 * It has its own player (fine update interval, only while mounted) and its own Android back handler,
 * registered while mounted, so back closes it first. Closing or unmounting stops its playback. The
 * trash only reports `onRemove` (the owner's undoable close); nothing is deleted here. Share opens
 * the system share sheet for the note's file and never reads, moves or deletes it.
 */
export function VoiceNoteSheet({
  note,
  index,
  count,
  recordedAt,
  busy = false,
  playDisabled = false,
  onClose,
  onRemove,
}: Props) {
  const {
    playing,
    total,
    toggle,
    skip,
    seekTo,
    seekBy,
    scrub,
    displayProgress,
    displayPosition,
    setRate,
  } = useRecordingPlayback(note.uri, note.durationMs, playDisabled, {
    updateInterval: SHEET_UPDATE_INTERVAL,
  });
  const [speedIndex, setSpeedIndex] = useState(0);
  // `sharing` only dims the button; the guard is the ref (two taps can land before a re-render).
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Android back closes this view before anything else.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const noun = count > 1 ? `voice note ${index} of ${count}` : 'recording';
  const bars = isValidWaveform(note.waveform) ? note.waveform : null;
  const lengthSec = Math.round(total);
  const subtitle = [mmss(lengthSec), recordedAt ? formatRecordedAt(recordedAt) : '']
    .filter((s) => s !== '')
    .join(' · ');
  const ticks = timeTicks(total);

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    setRate(SPEEDS[next]);
  };

  const share = async () => {
    if (busy || sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    // The share sheet takes over: pause playback first.
    stopAllPlayback();
    try {
      await shareRecording(note.uri);
    } catch (e) {
      Alert.alert(
        'Could not share',
        e instanceof ShareUnavailableError
          ? 'Sharing is not available on this device.'
          : 'This voice note could not be shared.',
      );
    } finally {
      sharingRef.current = false;
      if (mounted.current) setSharing(false);
    }
  };

  const actionsOff = busy;
  const playOff = playDisabled && !playing;

  return (
    <SafeAreaView
      testID="voice-note-sheet"
      accessibilityViewIsModal
      style={styles.layer}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close voice note"
          onPress={onClose}
          hitSlop={8}
          style={styles.iconButton}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>
        <View style={styles.pill}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share voice note"
            accessibilityState={{ disabled: actionsOff || sharing }}
            disabled={actionsOff || sharing}
            onPress={share}
            hitSlop={4}
            style={[styles.pillButton, (actionsOff || sharing) && styles.off]}
          >
            <ShareIcon color={colors.text} size={22} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${noun}`}
            accessibilityState={{ disabled: actionsOff }}
            disabled={actionsOff}
            onPress={() => onRemove(note.id)}
            hitSlop={4}
            style={[styles.pillButton, actionsOff && styles.off]}
          >
            <TrashIcon color={colors.text} size={22} />
          </Pressable>
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={styles.title}>
          Audio Recording
        </Text>
        <Text testID="voice-note-subtitle" style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.waveBlock}>
        <SeekBar
          progress={displayProgress}
          peaks={bars}
          waveHeight={WAVE_HEIGHT}
          onSeek={seekTo}
          scrub={scrub}
          onStep={seekBy}
          disabled={playDisabled}
          label="Voice note position"
          valueText={`${mmss(displayPosition)} of ${mmss(total)}`}
        >
          <View
            testID="sheet-playhead"
            style={[styles.playhead, { left: `${displayProgress * 100}%` }]}
          >
            <View style={[styles.playheadDot, styles.dotTop]} />
            <View style={styles.playheadLine} />
            <View style={[styles.playheadDot, styles.dotBottom]} />
          </View>
        </SeekBar>
        <View testID="voice-note-ticks" style={styles.ticks} pointerEvents="none">
          {ticks.map((t) => (
            <View key={t.seconds} style={[styles.tick, { left: `${(t.seconds / total) * 100}%` }]}>
              <Text style={styles.tickText}>{t.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text testID="voice-note-clock" style={styles.clock}>
        {formatClock(displayPosition)}
      </Text>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back ${SKIP_SECONDS} seconds`}
          accessibilityState={{ disabled: playDisabled }}
          disabled={playDisabled}
          onPress={() => skip(-SKIP_SECONDS)}
          hitSlop={8}
          style={[styles.skip, playDisabled && styles.off]}
        >
          <Text style={styles.skipText}>↺ {SKIP_SECONDS}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause audio recording' : 'Play audio recording'}
          accessibilityState={{ disabled: playOff }}
          disabled={playOff}
          onPress={toggle}
          style={[styles.play, playOff && styles.off]}
        >
          <Text style={styles.playGlyph}>{playing ? 'ǁ' : '▶'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Forward ${SKIP_SECONDS} seconds`}
          accessibilityState={{ disabled: playDisabled }}
          disabled={playDisabled}
          onPress={() => skip(SKIP_SECONDS)}
          hitSlop={8}
          style={[styles.skip, playDisabled && styles.off]}
        >
          <Text style={styles.skipText}>{SKIP_SECONDS} ↻</Text>
        </Pressable>
      </View>
      <View style={styles.speedRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${speedLabel(SPEEDS[speedIndex])}`}
          onPress={cycleSpeed}
          hitSlop={8}
          style={styles.speed}
        >
          <Text style={styles.speedText}>{speedLabel(SPEEDS[speedIndex])}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, zIndex: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.text, fontSize: 26 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: spacing.xs,
  },
  pillButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.4 },
  titleBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.xs },
  title: { color: colors.text, fontSize: 24, fontWeight: '600' },
  subtitle: { color: colors.muted, fontSize: 14 },
  waveBlock: { paddingHorizontal: spacing.lg + EDGE, paddingTop: spacing.xl },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 0, alignItems: 'center' },
  playheadLine: { flex: 1, width: 2, backgroundColor: colors.text },
  playheadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.text },
  dotTop: { marginTop: -2 },
  dotBottom: { marginBottom: -2 },
  ticks: { height: 24, marginTop: spacing.xs },
  tick: { position: 'absolute', width: 40, marginLeft: -20, alignItems: 'center' },
  tickText: { color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  clock: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '300',
    textAlign: 'center',
    marginTop: spacing.xl,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.xl,
  },
  skip: { minWidth: 56, height: 48, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: colors.text, fontSize: 18 },
  play: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { color: colors.accentDark, fontSize: 26, fontWeight: '700' },
  speedRow: { alignItems: 'center', marginTop: spacing.lg },
  speed: {
    minWidth: 64,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  speedText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
