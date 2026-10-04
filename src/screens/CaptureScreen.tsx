import { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useMockTranscript } from '../hooks/useMockTranscript';
import { useRecordingTimer } from '../hooks/useRecordingTimer';
import { colors } from '../theme';
import { IdleView } from './capture/IdleView';
import { ListeningView } from './capture/ListeningView';

type Phase = 'idle' | 'listening';

export function CaptureScreen() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [paused, setPaused] = useState(false);

  const running = phase === 'listening' && !paused;
  const timer = useRecordingTimer(running);
  const transcript = useMockTranscript(running);

  const start = () => {
    timer.reset();
    transcript.reset();
    setPaused(false);
    setPhase('listening');
  };

  // TODO: persist the dream (audio + transcript) before returning to idle.
  const save = () => {
    setPhase('idle');
    setPaused(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {phase === 'idle' ? (
        <IdleView onStart={start} onSkip={() => {}} onWrite={() => {}} />
      ) : (
        <ListeningView
          seconds={timer.seconds}
          paused={paused}
          lines={transcript.lines}
          onTogglePause={() => setPaused((p) => !p)}
          onSave={save}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
