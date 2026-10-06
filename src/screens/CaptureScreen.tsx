import { useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FinishedRecording, useDreamRecorder } from '../hooks/useDreamRecorder';
import { useLiveTranscription } from '../hooks/useLiveTranscription';
import { colors } from '../theme';
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

type Props = { onRecorded: (recording: FinishedRecording) => void };

export function CaptureScreen({ onRecorded }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [stopping, setStopping] = useState(false);
  const recorder = useDreamRecorder();
  const transcription = useLiveTranscription();
  const startedAt = useRef(0);

  const start = async () => {
    try {
      // Spike: live text is best effort and never blocks or breaks the recording.
      if (START_ORDER === 'speechFirst') await transcription.start();
      const started = await recorder.start();
      if (!started) {
        if (START_ORDER === 'speechFirst') void transcription.stop();
        Alert.alert(
          'Microphone access needed',
          'Lucid needs the microphone to record your dream. You can allow it in Settings.',
        );
        return;
      }
      startedAt.current = Date.now();
      setPhase('listening');
      if (START_ORDER === 'recorderFirst') void transcription.start();
    } catch {
      if (START_ORDER === 'speechFirst') void transcription.stop();
      Alert.alert('Could not start recording', 'Please try again.');
    }
  };

  // Stops recording and hands the file to the review step; nothing is saved yet.
  const finish = async () => {
    setStopping(true);
    try {
      // Live text stops in parallel so it never delays the recorder; its final text is unused for now.
      const [recording] = await Promise.all([recorder.stop(), transcription.stop()]);
      if (!recording) throw new Error('No recording was produced');
      logRecordingFile(recording.uri, recording.durationMs, startedAt.current);
      onRecorded(recording);
    } catch {
      Alert.alert('Could not finish recording', 'Please try again.');
      setStopping(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {phase === 'idle' ? (
        <IdleView onStart={start} onSkip={() => {}} onWrite={() => {}} />
      ) : (
        <ListeningView
          durationMs={recorder.durationMs}
          level={recorder.level}
          saving={stopping}
          transcript={transcription.transcript}
          transcriptNote={transcription.error}
          onSave={finish}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
