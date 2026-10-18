import { MutableRefObject, useEffect, useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { FinishedRecording, useDreamRecorder } from '../hooks/useDreamRecorder';
import { discardRecording } from '../services/recordingFiles';
import { colors, spacing } from '../theme';
import { formatDuration } from '../utils/format';
import { downsamplePeaks } from '../utils/waveform';
import { RecordingWaveform } from './RecordingWaveform';

/** How often the recorder's level is sampled for the waveform. */
export const LEVEL_SAMPLE_MS = 100;

export type PanelRecording = FinishedRecording & { waveform?: number[] };

type Props = {
  /** The microphone-denied message for the journal (journalCopy(...).microphoneMessage). */
  microphoneMessage: string;
  /** Recording stopped: the cache file and its waveform. The parent unmounts the panel. */
  onRecorded: (recording: PanelRecording) => void;
  /** The panel was closed with nothing recorded (handle swipe or tap, back while idle). The parent unmounts it. */
  onClosed: () => void;
  /** The user discarded the recording to leave: recorder stopped, cache file deleted. */
  onDiscarded: () => void;
  /**
   * Set to the panel's back handling while mounted (null after), for the page's back: idle it closes
   * the panel with no confirmation; once recording it shows the "Discard this recording?" confirmation.
   */
  leaveRef?: MutableRefObject<(() => void) | null>;
};

type Phase = 'idle' | 'starting' | 'recording' | 'stopping';

/** Swipe down on the handle this far (points) to close the idle panel. */
const CLOSE_SWIPE = 40;
/** How many recent level samples the live waveform keeps. */
const LEVEL_HISTORY = 40;

/**
 * The recording sheet shown in the bottom dock. It opens IDLE: nothing is recorded and the microphone
 * permission is not asked until the big red button is tapped. Layout: drag handle, big timer,
 * waveform, red record/stop button. Idle, the handle (swipe down or tap) and back close it with no
 * confirmation; while recording the handle does nothing and back asks to discard. No pause.
 */
export function RecordingPanel({
  microphoneMessage,
  onRecorded,
  onClosed,
  onDiscarded,
  leaveRef,
}: Props) {
  const recorder = useDreamRecorder();
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase | 'done'>('idle');
  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const levelRef = useRef(0);
  const samples = useRef<number[]>([]);
  const [levels, setLevels] = useState<number[]>([]);
  const confirmOpen = useRef(false);
  // The latest recorder and callbacks, for async code and cleanups that outlive a render.
  const recorderRef = useRef(recorder);
  const handlers = useRef({ onRecorded, onClosed, onDiscarded });
  useEffect(() => {
    levelRef.current = recorder.level;
    recorderRef.current = recorder;
    handlers.current = { onRecorded, onClosed, onDiscarded };
  });

  // A function, so TypeScript does not keep the narrowed phase across an await.
  const isDone = () => phaseRef.current === 'done';

  // The red button in idle: ask for permission and start. Denied or failed: alert, back to idle.
  const start = async () => {
    if (phaseRef.current !== 'idle') return;
    setPhaseBoth('starting');
    try {
      const started = await recorderRef.current.start();
      if (isDone()) return;
      if (!started) {
        setPhaseBoth('idle');
        Alert.alert('Microphone access needed', microphoneMessage);
        return;
      }
      setPhaseBoth('recording');
    } catch {
      if (isDone()) return;
      setPhaseBoth('idle');
      Alert.alert('Could not start recording', 'Please try again.');
    }
  };

  // Level samples for the waveform, about ten a second while recording.
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => {
      samples.current.push(levelRef.current);
      setLevels((prev) => [...prev, levelRef.current].slice(-LEVEL_HISTORY));
    }, LEVEL_SAMPLE_MS);
    return () => clearInterval(id);
  }, [phase]);

  // Left while the recorder runs (the screen was replaced): stop it and delete the cache file.
  // Nothing to clean up when the panel never started recording.
  useEffect(
    () => () => {
      const was = phaseRef.current;
      if (was === 'done') return;
      phaseRef.current = 'done';
      if (was === 'idle') return;
      const live = recorderRef.current;
      live
        .stop()
        .then((rec) => {
          if (rec) discardRecording(rec.uri);
        })
        .catch(() => {});
    },
    [],
  );

  const stop = async () => {
    if (phaseRef.current !== 'recording') return;
    setPhaseBoth('stopping');
    try {
      const rec = await recorderRef.current.stop();
      if (!rec) throw new Error('No recording was produced');
      phaseRef.current = 'done';
      // One last sample, so even a very short recording has a waveform.
      samples.current.push(levelRef.current);
      handlers.current.onRecorded({ ...rec, waveform: downsamplePeaks(samples.current) });
    } catch {
      Alert.alert('Could not finish recording', 'Please try again.');
      setPhaseBoth('recording');
    }
  };

  // Stops the recorder and deletes the cache file, then tells the parent to go on leaving. If the
  // recorder cannot be stopped nothing is deleted and the page stays.
  const discard = async () => {
    if (phaseRef.current === 'stopping' || phaseRef.current === 'done') return;
    const before = phaseRef.current;
    setPhaseBoth('stopping');
    try {
      const rec = await recorderRef.current.stop();
      if (rec) {
        try {
          discardRecording(rec.uri);
        } catch {
          // A leftover cache file is harmless.
        }
      }
      phaseRef.current = 'done';
      handlers.current.onDiscarded();
    } catch {
      Alert.alert('Could not finish recording', 'Please try again.');
      setPhaseBoth(before === 'starting' ? 'starting' : 'recording');
    }
  };

  // Idle: nothing was recorded, so closing needs no confirmation.
  const closeIdle = () => {
    if (phaseRef.current !== 'idle') return;
    phaseRef.current = 'done';
    handlers.current.onClosed();
  };
  const closeIdleRef = useRef(closeIdle);

  const confirmLeave = () => {
    if (phaseRef.current === 'idle') {
      closeIdle();
      return;
    }
    if (phaseRef.current === 'stopping' || phaseRef.current === 'done' || confirmOpen.current)
      return;
    confirmOpen.current = true;
    Alert.alert('Discard this recording?', 'Your recording will be deleted.', [
      {
        text: 'Keep recording',
        style: 'cancel',
        onPress: () => {
          confirmOpen.current = false;
        },
      },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          confirmOpen.current = false;
          void discard();
        },
      },
    ]);
  };
  const confirmLeaveRef = useRef(confirmLeave);
  useEffect(() => {
    confirmLeaveRef.current = confirmLeave;
    closeIdleRef.current = closeIdle;
  });
  useEffect(() => {
    if (!leaveRef) return;
    leaveRef.current = () => confirmLeaveRef.current();
    return () => {
      leaveRef.current = null;
    };
  }, [leaveRef]);

  // Swipe down on the handle closes the idle panel. It never claims the touch while recording.
  // The responder is created once; its callbacks only read refs when a touch happens, not in render.
  // eslint-disable-next-line react-hooks/refs
  const [handlePan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        phaseRef.current === 'idle' && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy >= CLOSE_SWIPE) closeIdleRef.current();
      },
    }),
  );

  const idle = phase === 'idle';
  const recording = phase === 'recording' || phase === 'stopping';
  const elapsed = formatDuration(Math.floor(recorder.durationMs / 1000));
  return (
    <View style={styles.sheet}>
      <View testID="recording-handle-area" style={styles.handleArea} {...handlePan.panHandlers}>
        {idle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close recording panel"
            onPress={closeIdle}
            hitSlop={12}
            style={styles.handleHit}
          >
            <View style={styles.handle} />
          </Pressable>
        ) : (
          <View style={styles.handleHit} importantForAccessibility="no">
            <View style={styles.handle} />
          </View>
        )}
      </View>
      <Text style={styles.timer} accessibilityLiveRegion="none">
        {elapsed}
      </Text>
      <RecordingWaveform recording={recording} levels={levels} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
        accessibilityState={{ disabled: phase === 'starting' || phase === 'stopping' }}
        disabled={phase === 'starting' || phase === 'stopping'}
        onPress={() => void (recording ? stop() : start())}
        hitSlop={8}
        style={[styles.ring, (phase === 'starting' || phase === 'stopping') && styles.ringBusy]}
      >
        <View style={recording ? styles.stopSquare : styles.recordDot} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    alignItems: 'stretch',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: colors.surface,
  },
  handleArea: { alignItems: 'center' },
  handleHit: { alignItems: 'center', justifyContent: 'center', width: 96, height: 28 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.faint },
  timer: {
    color: colors.text,
    fontSize: 48,
    fontWeight: '300',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  ring: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringBusy: { opacity: 0.4 },
  recordDot: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.draft },
  stopSquare: { width: 28, height: 28, borderRadius: 6, backgroundColor: colors.draft },
});
