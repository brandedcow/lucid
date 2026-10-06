import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FinishedRecording, useDreamRecorder } from '../hooks/useDreamRecorder';
import { colors } from '../theme';
import { IdleView } from './capture/IdleView';
import { ListeningView } from './capture/ListeningView';

type Phase = 'idle' | 'listening';

type Props = { onRecorded: (recording: FinishedRecording) => void };

export function CaptureScreen({ onRecorded }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [paused, setPaused] = useState(false);
  const [stopping, setStopping] = useState(false);
  const recorder = useDreamRecorder();

  const start = async () => {
    try {
      const started = await recorder.start();
      if (!started) {
        Alert.alert(
          'Microphone access needed',
          'Lucid needs the microphone to record your dream. You can allow it in Settings.',
        );
        return;
      }
      setPaused(false);
      setPhase('listening');
    } catch {
      Alert.alert('Could not start recording', 'Please try again.');
    }
  };

  const togglePause = () => {
    if (paused) recorder.resume();
    else recorder.pause();
    setPaused(!paused);
  };

  // Stops recording and hands the file to the review step; nothing is saved yet.
  const finish = async () => {
    setStopping(true);
    try {
      const recording = await recorder.stop();
      if (!recording) throw new Error('No recording was produced');
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
          paused={paused}
          saving={stopping}
          onTogglePause={togglePause}
          onSave={finish}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
