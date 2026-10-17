import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { stopAllPlayback, useRecordingPlayback } from '../hooks/useRecordingPlayback';
import { copyText } from '../services/clipboard';
import { shareRecording, ShareUnavailableError } from '../services/shareRecording';
import {
  RecordingTranscription,
  TranscriptionError,
  TranscriptView,
  transcriptView,
  UNSUPPORTED_TRANSCRIPTION,
} from '../services/transcription';
import { colors, iconCircle, spacing } from '../theme';
import { formatClock, formatRecordedAt, timeTicks } from '../utils/voiceNoteTime';
import { isValidWaveform } from '../utils/waveform';
import { OverflowMenu } from './OverflowMenu';
import { SeekBar } from './SeekBar';
import { ShareIcon, TrashIcon, TranscriptIcon } from './VoiceNoteIcons';

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
  /** When the note was recorded; absent or null leaves the time out of the subtitle. */
  recordedAt?: Date | null;
  /** On-device transcript from the session: undefined = none yet, '' = transcribed, nothing heard. */
  voiceTranscript?: string;
};

const pad = (n: number) => n.toString().padStart(2, '0');
const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};
/** How long the "Copied" pill stays up (ms). */
const COPIED_MS = 1500;

const failureMessage = (error: TranscriptionError) => {
  switch (error.code) {
    case 'unsupported':
      return 'This device cannot transcribe voice notes on-device.';
    case 'no-model':
      return 'The offline speech model for transcription is not installed.';
    case 'permission':
      return 'Speech recognition permission was not granted.';
    default:
      return 'Could not transcribe this voice note.';
  }
};
const speedLabel = (rate: number) => `${rate}x`;
const subtitleOf = (seconds: number, recordedAt: Date | null | undefined) =>
  [mmss(seconds), recordedAt ? formatRecordedAt(recordedAt) : '']
    .filter((s) => s !== '')
    .join(' · ');

type PageProps = {
  note: SheetNote;
  /** Play and seeking are off (a recording is running). */
  playDisabled: boolean;
  /** Playback speed, owned by the sheet so it carries over from note to note. */
  rate: number;
  onRateChange: (rate: number) => void;
  /** A touch went down on / came off the waveform (the sheet stops paging while it is down). */
  onWaveTouch: (down: boolean) => void;
  /** What the transcript area shows for this note; `none` hides the toggle. */
  view: TranscriptView;
  /** The transcript area is showing instead of the waveform. */
  transcriptOpen: boolean;
  onToggleTranscript: () => void;
  transcription: RecordingTranscription;
  /** Transcribe is off (a save is in flight or a recording is running). */
  busy: boolean;
};

function TranscriptArea({
  note,
  view,
  transcription,
  busy,
}: {
  note: SheetNote;
  view: TranscriptView;
  transcription: RecordingTranscription;
  busy: boolean;
}) {
  const action = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[styles.transcriptButton, disabled && styles.off]}
    >
      <Text style={styles.transcriptButtonText}>{label}</Text>
    </Pressable>
  );
  const start = () => void transcription.start(note.id, note.uri, note.durationMs);
  let body: ReactNode = null;
  switch (view.kind) {
    case 'text':
      return (
        <ScrollView
          testID="voice-note-transcript"
          accessibilityLabel="Transcript"
          nestedScrollEnabled
          style={styles.transcriptArea}
          contentContainerStyle={styles.transcriptContent}
        >
          <Text selectable style={styles.transcriptText}>
            {note.voiceTranscript}
          </Text>
        </ScrollView>
      );
    case 'offer':
      body = (
        <>
          <Text style={styles.transcriptNote}>No transcript yet.</Text>
          {view.busyElsewhere && (
            <Text style={styles.transcriptNote}>Another voice note is being transcribed.</Text>
          )}
          {action('Transcribe', start, busy || view.busyElsewhere)}
        </>
      );
      break;
    case 'running':
      body = (
        <View
          testID="voice-note-transcribing"
          accessibilityLiveRegion="polite"
          style={styles.transcriptStack}
        >
          <ActivityIndicator color={colors.muted} />
          <Text style={styles.transcriptNote}>Transcribing...</Text>
          {action('Cancel', () => transcription.cancel(note.id))}
        </View>
      );
      break;
    case 'failed':
      body = (
        <>
          <Text style={styles.transcriptNote}>{failureMessage(view.error)}</Text>
          {action('Try again', start, busy)}
        </>
      );
      break;
    case 'empty':
      body = (
        <>
          <Text style={styles.transcriptNote}>No speech was found in this note.</Text>
          {view.canRetry && action('Try again', start, busy)}
        </>
      );
      break;
    default:
      return null;
  }
  return (
    <View
      testID="voice-note-transcript-state"
      style={[styles.transcriptArea, styles.transcriptCentered]}
    >
      {body}
    </View>
  );
}

/**
 * The live content of one voice note: title, subtitle, waveform with playhead, ticks, clock and
 * the player controls. It owns the note's player, so only the active page of the pager is mounted
 * as this; unmounting it (a swipe, closing the view) pauses the note.
 */
function VoiceNotePage({
  note,
  playDisabled,
  rate,
  onRateChange,
  onWaveTouch,
  view,
  transcriptOpen,
  onToggleTranscript,
  transcription,
  busy,
}: PageProps) {
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
  // A page that mounts with a carried-over speed applies it; the hook starts at 1x.
  const applied = useRef(1);
  useEffect(() => {
    if (applied.current === rate) return;
    applied.current = rate;
    setRate(rate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  const bars = isValidWaveform(note.waveform) ? note.waveform : null;
  const subtitle = subtitleOf(Math.round(total), note.recordedAt);
  const ticks = timeTicks(total);
  const cycleSpeed = () => {
    const at = SPEEDS.findIndex((s) => s === rate);
    onRateChange(SPEEDS[(at + 1) % SPEEDS.length]);
  };
  // Never leave paging locked behind a page that went away mid-touch.
  useEffect(() => () => onWaveTouch(false), [onWaveTouch]);
  const playOff = playDisabled && !playing;
  const showTranscript = transcriptOpen && view.kind !== 'none';
  // The waveform goes away under a touch: never leave paging locked behind it.
  useEffect(() => {
    if (showTranscript) onWaveTouch(false);
  }, [showTranscript, onWaveTouch]);

  return (
    <>
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={styles.title}>
          Audio Recording
        </Text>
        <Text testID="voice-note-subtitle" style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>

      {showTranscript ? (
        <TranscriptArea note={note} view={view} transcription={transcription} busy={busy} />
      ) : (
        <>
          <View
            testID="voice-note-wave-block"
            style={styles.waveBlock}
            onTouchStart={() => onWaveTouch(true)}
            onTouchEnd={() => onWaveTouch(false)}
            onTouchCancel={() => onWaveTouch(false)}
          >
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
                <View
                  key={t.seconds}
                  style={[styles.tick, { left: `${(t.seconds / total) * 100}%` }]}
                >
                  <Text style={styles.tickText}>{t.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text testID="voice-note-clock" style={styles.clock}>
            {formatClock(displayPosition)}
          </Text>
        </>
      )}

      <View testID="voice-note-controls" style={styles.controls}>
        <View testID="voice-note-controls-left" style={styles.sideSlot}>
          {view.kind !== 'none' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showTranscript ? 'Show waveform' : 'Show transcript'}
              accessibilityState={{ selected: showTranscript }}
              onPress={onToggleTranscript}
              hitSlop={4}
              style={styles.toggle}
            >
              <TranscriptIcon color={colors.text} size={28} filled={showTranscript} />
            </Pressable>
          )}
        </View>
        <View testID="voice-note-controls-main" style={styles.mainControls}>
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
        <View testID="voice-note-controls-right" style={styles.sideSlot} />
      </View>
      <View style={styles.speedRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${speedLabel(rate)}`}
          onPress={cycleSpeed}
          hitSlop={8}
          style={styles.speed}
        >
          <Text style={styles.speedText}>{speedLabel(rate)}</Text>
        </Pressable>
      </View>
    </>
  );
}

/** A neighbouring page: static, with no player and no touch handling (hidden from screen readers). */
function VoiceNotePlaceholder({ note }: { note: SheetNote }) {
  const bars = isValidWaveform(note.waveform) ? note.waveform : null;
  return (
    <View
      testID="voice-note-placeholder"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Audio Recording</Text>
        <Text style={styles.subtitle}>{subtitleOf(note.durationMs / 1000, note.recordedAt)}</Text>
      </View>
      <View style={styles.waveBlock}>
        <View style={[styles.staticWave, { height: WAVE_HEIGHT }]}>
          {bars ? (
            bars.map((peak, i) => (
              <View
                key={i}
                testID="placeholder-bar"
                style={[styles.staticBar, { height: Math.max(3, peak * WAVE_HEIGHT) }]}
              />
            ))
          ) : (
            <View style={styles.staticPlain} />
          )}
        </View>
      </View>
    </View>
  );
}

type Props = {
  /** The entry's visible notes, in order. The active note is tracked by id. */
  notes: readonly SheetNote[];
  /** Index of the note to open on (the tapped card). */
  initialIndex: number;
  /** The active page changed (by swipe or by the previous / next buttons). */
  onIndexChange?: (index: number, id: string) => void;
  /** Trash and share are off (a save is in flight or a recording is running). */
  busy?: boolean;
  /** Play and seeking are off (a recording is running). */
  playDisabled?: boolean;
  onClose: () => void;
  /** The trash: the owner marks the note removed (undoable) and closes the view. */
  onRemove: (id: string) => void;
  /** The recognizer behind the transcript area; the default cannot transcribe, so Transcribe is hidden. */
  transcription?: RecordingTranscription;
  /**
   * "Add transcript to entry": the owner appends the text to the entry body (one undo step) and
   * closes the view. The sheet never writes text itself. Without it the menu has no such item.
   */
  onAddTranscript?: (id: string, text: string) => void;
};

/**
 * The expanded voice note view: a full-screen overlay (in-screen, not a Modal or a route) opened by
 * tapping a card. Back arrow, share and trash at the top (they act on the active note); below, a
 * horizontal pager with one page per note: title, "mm:ss · Today, h:mm PM", a large waveform with a
 * playhead (drag or tap to seek, through SeekBar), time ticks, the elapsed time with centiseconds,
 * and back 15 s / play / forward 15 s / speed.
 *
 * Only the active page has a player (fine update interval); neighbours are static placeholders.
 * Swiping unmounts the old page, which pauses its note; the new one starts paused. The playback
 * speed lives here, so it carries over between notes and resets to 1x when the view is opened.
 * A touch on the waveform turns paging off until it ends, so a horizontal drag there scrubs. With
 * several notes a "2 of 3" line with previous / next buttons is the non-gesture way to change page.
 *
 * Transcript: a toggle at the left of the controls row swaps the active page's waveform and clock for
 * the transcript area (text, or the offer / running / failed / empty states, see `transcriptView`).
 * It is shown when the note has a transcript or transcription is supported. Text comes from the
 * note's `voiceTranscript`; the sheet only calls `transcription.start` / `cancel`. A "..." menu
 * (only when the transcript has text) offers Copy transcript and Add transcript to entry.
 *
 * It has its own Android back handler, registered while mounted, so back closes it first. Closing
 * or unmounting stops playback. The trash only reports `onRemove` (the owner's undoable close);
 * nothing is deleted here. Share opens the system share sheet for the note's file and never reads,
 * moves or deletes it.
 */
export function VoiceNoteSheet({
  notes,
  initialIndex,
  onIndexChange,
  busy = false,
  playDisabled = false,
  onClose,
  onRemove,
  transcription = UNSUPPORTED_TRANSCRIPTION,
  onAddTranscript,
}: Props) {
  const count = notes.length;
  const many = count > 1;
  const [activeId, setActiveId] = useState(() => notes[initialIndex]?.id ?? notes[0]?.id ?? '');
  const found = notes.findIndex((n) => n.id === activeId);
  const gone = found < 0;
  const activeIndex = Math.max(0, found);
  const note = notes[activeIndex];
  const [rate, setRate] = useState<number>(1);
  // One flag for the whole sheet: it stays open while paging to another note.
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `sharing` only dims the button; the guard is the ref (two taps can land before a re-render).
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
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
  // The active note is gone (the owner normally closes first).
  useEffect(() => {
    if (gone) closeRef.current();
  }, [gone]);

  // Pager: width, and the lock that keeps a waveform drag from paging. The lock is a ref (read
  // synchronously) mirrored in state (drives `scrollEnabled`).
  const window = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState(0);
  const width = layoutWidth > 0 ? layoutWidth : window.width;
  const pager = useRef<ScrollView>(null);
  const lockRef = useRef(false);
  const [locked, setLocked] = useState(false);
  const [onWaveTouch] = useState(() => (down: boolean) => {
    if (lockRef.current === down) return;
    lockRef.current = down;
    setLocked(down);
  });

  // Resting the pager on the active page. A single scrollTo from a mount effect can be dropped
  // before the native content is laid out, so the offset is applied until a scroll event confirms
  // it: from the mount effect, every layout, every content-size change, and one delayed retry.
  // `targetRef` is the page the pager is heading for (buttons read it so two quick presses move
  // two pages); `programmaticRef` is the page of an animated scroll in flight, whose intermediate
  // settle events must not move the active page.
  const needsRest = useRef(true);
  const targetRef = useRef(activeIndex);
  const programmaticRef = useRef<number | null>(null);
  const programmaticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rest = useRef({ index: -1, width: -1 });
  const [startOffset] = useState(() => ({ x: activeIndex * width, y: 0 }));
  const restPager = () => {
    if (gone) return;
    pager.current?.scrollTo({ x: activeIndex * width, animated: false });
  };
  const restRef = useRef(restPager);
  useEffect(() => {
    restRef.current = restPager;
  });
  const clearProgrammatic = () => {
    programmaticRef.current = null;
    if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
    programmaticTimer.current = null;
  };
  useEffect(() => {
    if (gone) return;
    // A page change the pager already made (swipe or button) needs no jump.
    if (rest.current.index === activeIndex && rest.current.width === width) return;
    rest.current = { index: activeIndex, width };
    targetRef.current = activeIndex;
    needsRest.current = true;
    restPager();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, width, gone]);
  useEffect(() => {
    const retry = setTimeout(() => {
      if (needsRest.current) restRef.current();
    }, 100);
    return () => {
      clearTimeout(retry);
      clearProgrammatic();
    };
  }, []);

  const goTo = (index: number, animated: boolean) => {
    const at = Math.max(0, Math.min(count - 1, index));
    const target = notes[at];
    if (!target || at === targetRef.current) return;
    onWaveTouch(false);
    targetRef.current = at;
    needsRest.current = false;
    rest.current = { index: at, width };
    if (animated) {
      programmaticRef.current = at;
      if (programmaticTimer.current) clearTimeout(programmaticTimer.current);
      programmaticTimer.current = setTimeout(clearProgrammatic, 500);
    }
    setActiveId(target.id);
    pager.current?.scrollTo({ x: at * width, animated });
    onIndexChange?.(at, target.id);
  };
  const settleAt = (x: number) => {
    const page = Math.round(x / width);
    if (programmaticRef.current !== null) {
      // An animated scroll is in flight: only its own end counts.
      if (page === programmaticRef.current) clearProgrammatic();
      return;
    }
    goTo(page, false);
  };
  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    settleAt(e.nativeEvent.contentOffset.x);
  const onDragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // A release exactly on a page boundary has no momentum phase; between pages, momentum follows.
    const x = e.nativeEvent.contentOffset.x;
    if (Math.abs(x - Math.round(x / width) * width) <= 1) settleAt(x);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (needsRest.current && Math.abs(e.nativeEvent.contentOffset.x - activeIndex * width) <= 1) {
      needsRest.current = false;
    }
  };
  const onContentSizeChange = (w: number) => {
    if (needsRest.current && w >= (activeIndex + 1) * width - 1) restPager();
  };
  const onPagerLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== layoutWidth) setLayoutWidth(w);
    if (needsRest.current) restPager();
  };

  const noun = many ? `voice note ${activeIndex + 1} of ${count}` : 'recording';

  const share = async () => {
    if (!note || busy || sharingRef.current) return;
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

  const copyTranscript = async () => {
    const text = note?.voiceTranscript?.trimEnd() ?? '';
    if (text.trim() === '') return;
    try {
      await copyText(text);
    } catch {
      Alert.alert('Could not copy', 'Please try again.');
      return;
    }
    if (!mounted.current) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  if (!note || gone) return null;
  const view = transcriptView(
    note.voiceTranscript,
    transcription.stateOf(note.id),
    transcription.supported,
    transcription.busyId !== null && transcription.busyId !== note.id,
  );
  const hasText = view.kind === 'text';
  const menuItems = [
    { key: 'copy', label: 'Copy transcript', onPress: () => void copyTranscript() },
    ...(onAddTranscript
      ? [
          {
            key: 'add',
            label: 'Add transcript to entry',
            disabled: busy,
            onPress: () => onAddTranscript(note.id, note.voiceTranscript ?? ''),
          },
        ]
      : []),
  ];
  const actionsOff = busy;
  const first = activeIndex === 0;
  const last = activeIndex === count - 1;

  return (
    <SafeAreaView
      testID="voice-note-sheet"
      accessibilityViewIsModal
      style={styles.layer}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <View style={styles.inner}>
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
          <View testID="voice-note-actions" style={[styles.pill, hasText && styles.pillShifted]}>
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

        <ScrollView
          ref={pager}
          testID="voice-note-pager"
          horizontal
          pagingEnabled
          scrollEnabled={many && !locked}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentOffset={startOffset}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onContentSizeChange={onContentSizeChange}
          onLayout={onPagerLayout}
          onMomentumScrollEnd={onSettle}
          onScrollEndDrag={onDragEnd}
          style={styles.pager}
        >
          {notes.map((n, i) => (
            <View key={n.id} testID="voice-note-sheet-page" style={{ width }}>
              {i === activeIndex ? (
                <VoiceNotePage
                  note={n}
                  playDisabled={playDisabled}
                  rate={rate}
                  onRateChange={setRate}
                  onWaveTouch={onWaveTouch}
                  view={view}
                  transcriptOpen={transcriptOpen}
                  onToggleTranscript={() => setTranscriptOpen((o) => !o)}
                  transcription={transcription}
                  busy={busy}
                />
              ) : (
                <VoiceNotePlaceholder note={n} />
              )}
            </View>
          ))}
        </ScrollView>

        {many && (
          <View testID="voice-note-pager-bar" style={styles.pagerBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous voice note"
              accessibilityState={{ disabled: first }}
              disabled={first}
              onPress={() => goTo(targetRef.current - 1, true)}
              hitSlop={8}
              style={[styles.chevron, first && styles.off]}
            >
              <Text style={styles.chevronText}>‹</Text>
            </Pressable>
            <View style={styles.pagerMiddle}>
              <Text
                testID="voice-note-position"
                accessibilityLiveRegion="polite"
                accessibilityLabel={`Voice note ${activeIndex + 1} of ${count}`}
                style={styles.position}
              >
                {activeIndex + 1} of {count}
              </Text>
              <View
                testID="voice-note-sheet-dots"
                style={styles.dots}
                importantForAccessibility="no"
                accessibilityElementsHidden
              >
                {notes.map((n, i) => (
                  <View
                    key={n.id}
                    testID="voice-note-sheet-dot"
                    style={[styles.dot, i === activeIndex && styles.dotOn]}
                  />
                ))}
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next voice note"
              accessibilityState={{ disabled: last }}
              disabled={last}
              onPress={() => goTo(targetRef.current + 1, true)}
              hitSlop={8}
              style={[styles.chevron, last && styles.off]}
            >
              <Text style={styles.chevronText}>›</Text>
            </Pressable>
          </View>
        )}
        {copied && (
          <View pointerEvents="none" style={styles.copiedLayer}>
            <View style={styles.copiedPill}>
              <Text accessibilityLiveRegion="polite" style={styles.copiedText}>
                Copied
              </Text>
            </View>
          </View>
        )}
        {hasText && (
          <OverflowMenu
            items={menuItems}
            top={spacing.sm + (44 - iconCircle) / 2}
            right={spacing.lg}
          />
        )}
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
  pillShifted: { marginRight: iconCircle + spacing.xs },
  inner: { flex: 1 },
  off: { opacity: 0.4 },
  copiedLayer: {
    ...StyleSheet.absoluteFill,
    top: spacing.sm + 44 + spacing.xs,
    alignItems: 'center',
  },
  copiedPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copiedText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  pager: { flex: 1 },
  pagerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chevron: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chevronText: { color: colors.text, fontSize: 30 },
  pagerMiddle: { alignItems: 'center', gap: spacing.xs },
  position: { color: colors.muted, fontSize: 14 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent },
  staticWave: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  staticBar: { flex: 1, borderRadius: 2, backgroundColor: colors.border },
  staticPlain: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
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
  // Play stays centred: the left (transcript toggle, or empty) and right slots share the leftover
  // width equally (flex 1, no padding or margin of their own) around a symmetric back / play /
  // forward cluster. At 320pt: 8 (row padding) + 216 (cluster) leaves 48 per slot for the 44pt toggle.
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xl,
  },
  sideSlot: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  mainControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  transcriptArea: { flex: 1, minHeight: 160, marginTop: spacing.lg },
  transcriptContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  transcriptText: { color: colors.text, fontSize: 17, lineHeight: 26 },
  transcriptCentered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  transcriptStack: { alignItems: 'center', gap: spacing.md },
  transcriptNote: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  transcriptButton: {
    minHeight: 44,
    minWidth: 120,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  transcriptButtonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  skip: { width: 56, height: 48, alignItems: 'center', justifyContent: 'center' },
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
