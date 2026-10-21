import { render, screen } from '@testing-library/react-native';
import App from './App';

jest.mock('expo-file-system', () => jest.requireActual('./src/test/fakeFileSystem'));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
  RecordingPresets: { HIGH_QUALITY: {} },
}));
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const metrics = {
    frame: { x: 0, y: 0, width: 390, height: 800 },
    insets: { top: 0, left: 0, right: 0, bottom: 34 },
  };
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => (
      <actual.SafeAreaProvider initialMetrics={metrics}>{children}</actual.SafeAreaProvider>
    ),
  };
});

const original = process.env.EXPO_PUBLIC_EDITOR_SPIKE;
afterEach(() => {
  if (original === undefined) delete process.env.EXPO_PUBLIC_EDITOR_SPIKE;
  else process.env.EXPO_PUBLIC_EDITOR_SPIKE = original;
});

describe('App editor spike gate', () => {
  it('shows the harness only when EXPO_PUBLIC_EDITOR_SPIKE=1', async () => {
    process.env.EXPO_PUBLIC_EDITOR_SPIKE = '1';
    await render(<App />);
    expect(screen.getByTestId('spike-body')).toBeTruthy();
  });

  it.each([undefined, '0', 'true'])('shows the normal app when it is %j', async (value) => {
    if (value === undefined) delete process.env.EXPO_PUBLIC_EDITOR_SPIKE;
    else process.env.EXPO_PUBLIC_EDITOR_SPIKE = value;
    await render(<App />);
    expect(screen.queryByTestId('spike-body')).toBeNull();
  });
});
