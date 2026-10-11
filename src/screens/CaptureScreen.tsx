import { useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FinishedRecording, useDreamRecorder } from '../hooks/useDreamRecorder';
import { useLiveTranscription } from '../hooks/useLiveTranscription';
import { discardRecording } from '../services/dreamStorage';
import { colors } from '../theme';
import { BUILT_IN_JOURNALS, Journal, journalCopy } from '../utils/journals';
import { IdleView } from './capture/IdleView';
import { ListeningView } from './capture/ListeningView';

type Phase = 'idle' | 'listening';

/**
 * Spike toggle (flip with a JS reload): which of the two microphone users starts first.
 * 'recorderFirst' starts the expo-audio recorder, then live text. 'speechFirst' is the reverse.
 */
export const START_ORDER: 'recorderFirst' | 'speechFirst' = 'recorderFirst';

const logRecording = (message: string, ...args: unknown[]) =>
  console.log('[transcription]', message, ...args);

/** Spike diagnostics: how big and how long the saved m4a really is. Never throws. */
function logRecordingFile(uri: string, durationMs: number, startedAt: number) {
  try {
    const bytes = new File(uri).size;
    logRecording(
      'recording file',
      uri,
      'bytes:',
      bytes,
      'durationMs:',
      durationMs,
      'wall-clock s:',
      ((Date.now() - startedAt) / 1000).toFixed(1),
    );
  } catch (e) {
    logRecording('could not read recording file size', e);
  }
}

const TOGGLE_COOLDOWN_MS = 300;
const RECONCILE_DELAY_MS = 500;
const MAX_REPAUSES = 3;

type Props = {
  /** `text` is the final live transcript; '' when live text is unsupported or empty. */
  onRecorded: (recording: FinishedRecording, text: string) => void;
  /** Optional. Without it the "No dream" button is hidden (only the launch capture offers it). */
  onNoDream?: () => void;
  /** Write instead: start a dream with no recording. Never touches the microphone. */
  onWrite?: () => void;
  /** Type instead while recording: the recording is deleted, `text` is the live text so far. */
  onTypeInstead?: (text: string) => void;
  /** Optional, defaults to Dreams. Sets the wording (headline, tips, "No dream", Save, microphone message). */
  journal?: Journal;
  /**
   * Optional. When given, a back arrow is shown (idle and while recording). Idle it calls this;
   * while recording it asks to discard first (see `confirmLeave`).
   */
  onBack?: () => void;
  /** Optional. Called after the user discards a recording to leave. Never called for Keep recording. */
  onLeave?: () => void;
  /** Optional. Set to the screen's `confirmLeave` while mounted (null after), for Android hardware back. */
  leaveRef?: React.MutableRefObject<(() => void) | null>;
  /** Optional, defaults to "Back". Accessibility label of the back arrow. */
  backLabel?: string;
  /** Optional. Called with true when recording starts and false when the screen is idle again, so the parent can hold Android back while recording. */
  onActiveChange?: (active: boolean) => void;
};

export function CaptureScreen({
  onRecorded,
  onNoDream,
  onWrite,
  onTypeInstead,
  journal = BUILT_IN_JOURNALS[0],
  onBack,
  onLeave,
  leaveRef,
  backLabel = 'Back',
  onActiveChange,
}: Props) {
  const copy = journalCopy(journal);
  const [phase, setPhase] = useState<Phase>('idle');
  const activeRef = useRef(onActiveChange);
  useEffect(() => {
    activeRef.current = onActiveChange;
  });
  useEffect(() => {
    activeRef.current?.(phase !== 'idle');
    return () => activeRef.current?.(false);
  }, [phase]);
  const [stopping, setStopping] = useState(false);
  const recorder = useDreamRecorder();
  const transcription = useLiveTranscription();
  const startedAt = useRef(0);

  // The screen's `paused` is the UI truth and follows the recorder. Handlers read the ref mirror.
  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(false);
  const finishingRef = useRef(false);
  const startingRef = useRef(false);
  const lastToggleAt = useRef(0);
  const repauseCount = useRef(0);
  const [reconcileTick, setReconcileTick] = useState(0);
  const isRecordingRef = useRef(recorder.isRecording);
  useEffect(() => {
    isRecordingRef.current = recorder.isRecording;
  }, [recorder.isRecording]);

  const setPaused = (value: boolean) => {
    pausedRef.current = value;
    setPausedState(value);
  };

  // Recorder first, then recognition, neither awaited between them. The recorder is authoritative:
  // a resume() that returns false leaves the recording running without live text.
  const resumeNow = () => {
    try {
      recorder.resume();
    } catch (e) {
      logRecording('recorder resume failed', e);
      return;
    }
    setPaused(false);
    void transcription.resume().then((ok) => {
      if (!ok) logRecording('live text did not resume');
    });
  };

  const togglePause = () => {
    if (finishingRef.current || stopping) return;
    const now = Date.now();
    if (now - lastToggleAt.current < TOGGLE_COOLDOWN_MS) return;
    lastToggleAt.current = now;
    repauseCount.current = 0;
    if (pausedRef.current) {
      resumeNow();
      return;
    }
    try {
      recorder.pause();
    } catch (e) {
      logRecording('recorder pause failed', e);
      return;
    }
    transcription.pause();
    setPaused(true);
  };

  // If the OS restarts the recorder while the UI says paused, pause it again (a few times at most,
  // then follow the recorder). Only the recorder is paused here; live text stays as it is.
  useEffect(() => {
    if (!paused || !recorder.isRecording || stopping) return;
    const t = setTimeout(() => {
      if (!pausedRef.current || !isRecordingRef.current || finishingRef.current) return;
      if (repauseCount.current >= MAX_REPAUSES) {
        resumeNow();
        return;
      }
      repauseCount.current += 1;
      try {
        recorder.pause();
      } catch (e) {
        logRecording('recorder re-pause failed', e);
      }
      // Re-run the effect so a re-pause that changed nothing is checked again (capped above).
      setReconcileTick((n) => n + 1);
    }, RECONCILE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, recorder.isRecording, stopping, reconcileTick]);

  const start = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      // Spike: live text is best effort and never blocks or breaks the recording.
      if (START_ORDER === 'speechFirst') await transcription.start();
      const started = await recorder.start();
      if (!started) {
        if (START_ORDER === 'speechFirst') void transcription.stop();
        Alert.alert('Microphone access needed', copy.microphoneMessage);
        return;
      }
      startedAt.current = Date.now();
      setPaused(false);
      setPhase('listening');
      if (START_ORDER === 'recorderFirst') void transcription.start();
    } catch {
      if (START_ORDER === 'speechFirst') void transcription.stop();
      Alert.alert('Could not start recording', 'Please try again.');
    } finally {
      startingRef.current = false;
    }
  };

  // Stops recording and hands the file to the review step; nothing is saved yet.
  const finish = async () => {
    finishingRef.current = true;
    setStopping(true);
    try {
      // Live text stops in parallel so it never delays the recorder.
      const [recording, finalText] = await Promise.all([recorder.stop(), transcription.stop()]);
      if (!recording) throw new Error('No recording was produced');
      logRecordingFile(recording.uri, recording.durationMs, startedAt.current);
      onRecorded(recording, typeof finalText === 'string' ? finalText : '');
    } catch {
      Alert.alert('Could not finish recording', 'Please try again.');
      finishingRef.current = false;
      setStopping(false);
    }
  };

  const confirmTypeInstead = () => {
    if (finishingRef.current || stopping) return;
    Alert.alert('Type instead?', 'Your recording will be deleted. The text so far is kept.', [
      { text: 'Keep recording', style: 'cancel' },
      { text: 'Type instead', style: 'destructive', onPress: () => void typeInstead() },
    ]);
  };

  // Stops recording, deletes the cache file and opens Read it back with the live text. If the
  // recorder cannot be stopped nothing is deleted and the screen stays.
  const typeInstead = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setStopping(true);
    try {
      const finalText = await transcription.stop();
      const recording = await recorder.stop();
      if (recording) {
        try {
          discardRecording(recording.uri);
        } catch {
          // A leftover cache file is harmless.
        }
      }
      onTypeInstead?.(typeof finalText === 'string' ? finalText : '');
    } catch {
      Alert.alert('Could not finish recording', 'Please try again.');
      finishingRef.current = false;
      setStopping(false);
    }
  };

  const confirmOpenRef = useRef(false);

  // Asks before leaving a live recording. Keep recording changes nothing; Discard stops
  // everything, deletes the unsaved cache file and leaves. The live text is dropped with the screen.
  const confirmLeave = () => {
    if (finishingRef.current || stopping || confirmOpenRef.current) return;
    confirmOpenRef.current = true;
    Alert.alert('Discard this recording?', 'Your recording and the text so far will be deleted.', [
      {
        text: 'Keep recording',
        style: 'cancel',
        onPress: () => {
          confirmOpenRef.current = false;
        },
      },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          confirmOpenRef.current = false;
          void discardAndLeave();
        },
      },
    ]);
  };

  // Mirrors typeInstead, but hands nothing off. If the recorder cannot be stopped nothing is
  // deleted and the screen stays.
  const discardAndLeave = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setStopping(true);
    try {
      try {
        await transcription.stop();
      } catch (e) {
        logRecording('live text stop failed', e);
      }
      const recording = await recorder.stop();
      if (recording) {
        try {
          discardRecording(recording.uri);
        } catch {
          // A leftover cache file is harmless.
        }
      }
    } catch {
      Alert.alert('Could not finish recording', 'Please try again.');
      finishingRef.current = false;
      setStopping(false);
      return;
    }
    onLeave?.();
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

  return (
    <SafeAreaView style={styles.container}>
      {phase === 'idle' ? (
        <IdleView
          onStart={start}
          onSkip={() => onNoDream?.()}
          onWrite={() => onWrite?.()}
          headline={copy.captureHeadline}
          tips={copy.tips}
          skipLabel={onNoDream ? copy.skipLabel : null}
          onBack={onBack}
          backLabel={backLabel}
        />
      ) : (
        <ListeningView
          durationMs={recorder.durationMs}
          level={recorder.level}
          saving={stopping}
          paused={paused}
          onTogglePause={togglePause}
          transcript={transcription.transcript}
          transcriptNote={transcription.error}
          onSave={finish}
          saveLabel={copy.saveButton}
          onTypeInstead={confirmTypeInstead}
          onBack={onBack ? confirmLeave : undefined}
          backLabel={backLabel}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
