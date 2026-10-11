import { MutableRefObject, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { FinishedRecording, useDreamRecorder } from '../hooks/useDreamRecorder';
import { discardRecording } from '../services/dreamStorage';
import { colors, spacing } from '../theme';
import { formatDuration } from '../utils/format';
import { downsamplePeaks } from '../utils/waveform';

/** How often the recorder's level is sampled for the waveform. */
export const LEVEL_SAMPLE_MS = 100;

export type PanelRecording = FinishedRecording & { waveform?: number[] };

type Props = {
  /** The microphone-denied message for the journal (journalCopy(...).microphoneMessage). */
  microphoneMessage: string;
  /** Recording stopped: the cache file and its waveform. The parent unmounts the panel. */
  onRecorded: (recording: PanelRecording) => void;
  /** Recording never started (permission denied, error). The parent unmounts the panel. */
  onClosed: () => void;
  /** The user discarded the recording to leave: recorder stopped, cache file deleted. */
  onDiscarded: () => void;
  /** Set to the discard confirmation while mounted (null after), for the page's back handling. */
  leaveRef?: MutableRefObject<(() => void) | null>;
};

/**
 * The card shown above the title while recording: red dot, elapsed time and a stop button. Mounted
 * only while a recording is wanted, so the recorder (and its polling) exists only then. It starts
 * recording on mount. No pause: pause/resume is not offered on the page.
 */
export function RecordingPanel({
  microphoneMessage,
  onRecorded,
  onClosed,
  onDiscarded,
  leaveRef,
}: Props) {
  const recorder = useDreamRecorder();
  const [phase, setPhase] = useState<'starting' | 'recording' | 'stopping'>('starting');
  const phaseRef = useRef<'starting' | 'recording' | 'stopping' | 'done'>('starting');
  const setPhaseBoth = (next: 'starting' | 'recording' | 'stopping') => {
    phaseRef.current = next;
    setPhase(next);
  };
  const levelRef = useRef(0);
  const samples = useRef<number[]>([]);
  const startedRef = useRef(false);
  const confirmOpen = useRef(false);
  // The latest recorder and callbacks, for async code and cleanups that outlive a render.
  const recorderRef = useRef(recorder);
  const handlers = useRef({ onRecorded, onClosed, onDiscarded });
  useEffect(() => {
    levelRef.current = recorder.level;
    recorderRef.current = recorder;
    handlers.current = { onRecorded, onClosed, onDiscarded };
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const started = await recorderRef.current.start();
        if (phaseRef.current === 'done') return;
        if (!started) {
          phaseRef.current = 'done';
          Alert.alert('Microphone access needed', microphoneMessage);
          handlers.current.onClosed();
          return;
        }
        setPhaseBoth('recording');
      } catch {
        if (phaseRef.current === 'done') return;
        phaseRef.current = 'done';
        Alert.alert('Could not start recording', 'Please try again.');
        handlers.current.onClosed();
      }
    })();
    // Starts once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Level samples for the waveform, about ten a second while recording.
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => samples.current.push(levelRef.current), LEVEL_SAMPLE_MS);
    return () => clearInterval(id);
  }, [phase]);

  // Left while the recorder runs (the screen was replaced): stop it and delete the cache file.
  useEffect(
    () => () => {
      if (phaseRef.current === 'done') return;
      phaseRef.current = 'done';
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

  const confirmLeave = () => {
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
  });
  useEffect(() => {
    if (!leaveRef) return;
    leaveRef.current = () => confirmLeaveRef.current();
    return () => {
      leaveRef.current = null;
    };
  }, [leaveRef]);

  const elapsed = formatDuration(Math.floor(recorder.durationMs / 1000));
  return (
    <View style={styles.card}>
      <View style={styles.dot} />
      <Text style={styles.status} accessibilityLiveRegion="polite">
        {phase === 'starting' ? 'Starting...' : `Recording ${elapsed}`}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop recording"
        accessibilityState={{ disabled: phase !== 'recording' }}
        disabled={phase !== 'recording'}
        onPress={() => void stop()}
        hitSlop={8}
        style={[styles.stop, phase !== 'recording' && styles.stopDisabled]}
      >
        <View style={styles.stopSquare} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.draft },
  status: { flex: 1, color: colors.text, fontSize: 15, fontVariant: ['tabular-nums'] },
  stop: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopDisabled: { opacity: 0.4 },
  stopSquare: { width: 14, height: 14, borderRadius: 2, backgroundColor: colors.accentDark },
});
