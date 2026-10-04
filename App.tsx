import { StatusBar } from 'expo-status-bar';
import { CaptureScreen } from './src/screens/CaptureScreen';

export default function App() {
  return (
    <>
      <CaptureScreen />
      <StatusBar style="light" />
    </>
  );
}
