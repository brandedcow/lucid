import { render, screen, waitFor } from '@testing-library/react-native';
import App from './App';
import { resetLegacyImportForTests } from './src/services/legacyImport';
import { resetCorruptCopyGuard } from './src/services/notesStorage';
import { writeSettings } from './src/services/settingsStorage';
import { __fs } from './src/test/fakeFileSystem';

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

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  resetLegacyImportForTests();
});

// The shell, mounted for real: provider, launch gate, navigator and routes. The flows themselves are
// covered by the provider, route and screen tests.
describe('App (notes shell)', () => {
  it('a cold start with the setting on opens a new note over the list', async () => {
    await render(<App />);
    await waitFor(() => expect(screen.getByTestId('note-page')).toBeTruthy());
  });

  it('with the setting off it opens to the note list', async () => {
    await writeSettings({ autoOpenDreamCapture: false });
    await render(<App />);
    await waitFor(() => expect(screen.getByRole('header', { name: 'All Notes' })).toBeTruthy());
    expect(screen.queryByTestId('note-page')).toBeNull();
  });
});
