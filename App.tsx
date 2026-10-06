import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FinishedRecording } from './src/hooks/useDreamRecorder';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { DreamListScreen } from './src/screens/DreamListScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';

type Screen = 'capture' | 'review' | 'list';

// Temporary screen switch; replace with real navigation once that is decided.
export default function App() {
  const [screen, setScreen] = useState<Screen>('capture');
  const [recording, setRecording] = useState<FinishedRecording | null>(null);

  return (
    <SafeAreaProvider>
      {screen === 'capture' && (
        <CaptureScreen
          onRecorded={(r) => {
            setRecording(r);
            setScreen('review');
          }}
          onNoDream={() => setScreen('list')}
        />
      )}
      {screen === 'review' && recording && (
        <ReviewScreen
          recording={recording}
          onSaved={() => {
            setRecording(null);
            setScreen('list');
          }}
          onRerecord={() => {
            setRecording(null);
            setScreen('capture');
          }}
        />
      )}
      {screen === 'list' && <DreamListScreen onRecord={() => setScreen('capture')} />}
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
