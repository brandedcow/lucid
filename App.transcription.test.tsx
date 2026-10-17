import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, AlertButton, BackHandler, Platform, Settings } from 'react-native';
import App from './App';
import { runBackChain } from './src/test/hardwareBackChain';
import type { Dream } from './src/types/dream';
import { __fs } from './src/test/fakeFileSystem';
import { fakeSpeech } from './src/test/fakeSpeechRecognition';

// Integration tests for on-device transcription of voice notes: the real hooks, storage and
// screens on the in-memory file system. Only native modules (recorder, player, speech) are faked.
jest.mock('expo-file-system', () => jest.requireActual('./src/test/fakeFileSystem'));
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
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
  RecordingPresets: { HIGH_QUALITY: {} },
}));
const mockRec = { start: jest.fn(), stop: jest.fn(), level: 0.6, durationMs: 0 };
jest.mock('./src/hooks/useDreamRecorder', () => ({
  useDreamRecorder: () => ({ ...mockRec, pause: jest.fn(), resume: jest.fn(), isRecording: true }),
}));

const DOC = 'file:///document';
const CACHE = 'file:///cache/new.m4a';
const now = new Date().toISOString();
const rec = (id: string, title: string, extra: Partial<Dream> = {}): Dream => ({
  id,
  createdAt: now,
  durationMs: 0,
  title,
  tags: [],
  ...extra,
});
const gratitude = {
  id: 'j_g1',
  name: 'Gratitude',
  kind: 'journal',
  createdAt: '2026-10-09T08:00:00Z',
};
const WITH_AUDIO = rec('g1', 'Thankful for tea', {
  journalId: 'j_g1',
  transcript: 'tea',
  audioFileName: 'g1.m4a',
  durationMs: 9000,
  waveform: [0.2, 0.7, 0.4],
});
const TEXT_ONLY = rec('g2', 'Plain words', { journalId: 'j_g1', transcript: 'just text' });
const STORED_AUDIO = `${DOC}/dreams/g1.m4a`;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const press = async (el: ReturnType<typeof screen.getByLabelText>) => {
  await fireEvent.press(el);
  await settle();
};
const byLabel = (label: string | RegExp) => screen.getByLabelText(label);
const index = () => JSON.parse(__fs.read(`${DOC}/dreams.json`) ?? '[]') as Dream[];
const lastButtons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
const choose = async (text: string) => {
  await act(async () => {
    lastButtons()
      .find((b) => b.text === text)
      ?.onPress?.();
  });
  await settle();
};

let handlers: (() => boolean)[] = [];
const hardwareBack = async () => {
  let handled = false;
  await act(async () => {
    handled = runBackChain(handlers);
  });
  await settle();
  return handled;
};

async function openNewGratitude() {
  await render(<App />);
  await settle();
  await press(byLabel('Add entry'));
  await press(screen.getByRole('menuitem', { name: /^Gratitude,/ }));
  expect(byLabel('Journal: Gratitude')).toBeTruthy();
}
const record = async () => {
  await press(byLabel('Record voice note'));
  await press(byLabel('Start recording'));
  await press(byLabel('Stop recording'));
};
async function openEdit(title: RegExp) {
  await render(<App />);
  await settle();
  await press(byLabel('Open Journals'));
  await press(byLabel(/^Gratitude, /));
  await press(byLabel(title));
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeSpeech.reset();
  fakeSpeech.enable();
  // iPhone: the system locale (Settings 'AppleLocale') is the only recognition locale.
  jest
    .spyOn(Settings, 'get')
    .mockImplementation((key: string) => (key === 'AppleLocale' ? 'en_US' : undefined));
  __fs.reset();
  handlers = [];
  mockRec.start.mockResolvedValue(true);
  mockRec.stop.mockResolvedValue({ uri: CACHE, durationMs: 4000 });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
    handlers.push(h as () => boolean);
    return {
      remove: () => {
        handlers = handlers.filter((x) => x !== h);
      },
    };
  });
  __fs.put(`${DOC}/journals.json`, JSON.stringify({ version: 1, journals: [gratitude] }));
  __fs.put(`${DOC}/settings.json`, JSON.stringify({ autoOpenDreamCapture: false }));
  __fs.put(`${DOC}/dreams.json`, JSON.stringify([WITH_AUDIO, TEXT_ONLY]));
  __fs.put(STORED_AUDIO, 'old-audio');
  __fs.put(CACHE, 'new-audio');
});
afterEach(() => jest.restoreAllMocks());

const emit = (fn: () => void) =>
  act(async () => {
    fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const heard = async (text: string) => {
  await emit(() => fakeSpeech.result(text, true));
  await emit(() => fakeSpeech.end());
};
const openSheetTranscript = async () => {
  await press(byLabel('Open recording'));
  await press(byLabel('Show transcript'));
};

describe('App transcription', () => {
  it('tapping the bubble starts an on-device run and shows the result', async () => {
    await openEdit(/Thankful for tea/);
    await openSheetTranscript();
    expect(fakeSpeech.starts).toHaveLength(1);
    expect(fakeSpeech.starts[0]).toMatchObject({
      requiresOnDeviceRecognition: true,
      audioSource: { uri: STORED_AUDIO },
    });
    expect(screen.getByText('Transcribing...')).toBeTruthy();
    await heard('tea with honey');
    expect(screen.getByText('tea with honey')).toBeTruthy();
  });

  it('hides Transcribe when the device cannot transcribe on-device', async () => {
    fakeSpeech.set({ onDevice: false });
    await openEdit(/Thankful for tea/);
    await press(byLabel('Open recording'));
    expect(screen.queryByLabelText('Show transcript')).toBeNull();
    expect(screen.queryByLabelText('Transcribe')).toBeNull();
  });

  it('the text survives removing the note and Undo', async () => {
    await openEdit(/Thankful for tea/);
    await openSheetTranscript();
    await heard('kept words');
    await press(byLabel('Close voice note'));
    await press(byLabel('Remove recording'));
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    await press(byLabel('Undo'));
    await openSheetTranscript();
    expect(screen.getByText('kept words')).toBeTruthy();
  });

  it('a result for a note removed while it ran still lands (Undo shows it)', async () => {
    await openEdit(/Thankful for tea/);
    await openSheetTranscript();
    await press(byLabel('Close voice note'));
    await press(byLabel('Remove recording'));
    expect(fakeSpeech.aborts).toBe(0); // removing a note does not cancel the run
    await heard('late words');
    await press(byLabel('Undo'));
    await openSheetTranscript();
    expect(screen.getByText('late words')).toBeTruthy();
  });

  it('leaving the page cancels the run and nothing lands', async () => {
    await openEdit(/Thankful for tea/);
    await openSheetTranscript();
    await press(byLabel('Close voice note'));
    expect(await hardwareBack()).toBe(true);
    expect(fakeSpeech.aborts).toBe(1);
    await heard('too late');
    expect(screen.queryByText('too late')).toBeNull();
  });

  it('a recording in progress blocks Transcribe', async () => {
    await openEdit(/Thankful for tea/);
    await press(byLabel('Record voice note'));
    await press(byLabel('Start recording'));
    await press(byLabel('Open recording'));
    await press(byLabel('Show transcript'));
    expect(screen.queryByLabelText('Transcribe')).toBeNull();
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(fakeSpeech.permissionRequests).toEqual([]);
  });

  it('does not ask for any permission before the bubble is tapped', async () => {
    await openEdit(/Thankful for tea/);
    await press(byLabel('Open recording'));
    expect(fakeSpeech.permissionRequests).toEqual([]);
    await press(byLabel('Show transcript'));
    expect(fakeSpeech.permissionRequests).toEqual(['requestSpeechRecognizerPermissionsAsync']);
  });
});

describe('App online transcription (opt-in)', () => {
  const allowOnline = () =>
    __fs.put(
      `${DOC}/settings.json`,
      JSON.stringify({ autoOpenDreamCapture: false, onlineTranscription: true }),
    );
  // An iPhone whose system locale cannot transcribe on-device: only the online route can work.
  const noOnDevice = () => fakeSpeech.set({ onDevice: false });

  it('setting ON, no on-device support: the bubble starts an online run with the Apple line', async () => {
    allowOnline();
    noOnDevice();
    await openEdit(/Thankful for tea/);
    await openSheetTranscript();
    expect(fakeSpeech.starts).toHaveLength(1);
    expect(fakeSpeech.starts[0]).toMatchObject({
      requiresOnDeviceRecognition: false,
      lang: 'en-US',
      audioSource: { uri: STORED_AUDIO },
    });
    expect(screen.getByText('Transcribing online...')).toBeTruthy();
    expect(screen.getByText("Uses Apple's servers")).toBeTruthy();
    await heard('online words');
    expect(screen.getByText('online words')).toBeTruthy();
  });

  it('setting ON but on-device works: no server line and the flag is true', async () => {
    allowOnline();
    await openEdit(/Thankful for tea/);
    await openSheetTranscript();
    expect(screen.queryByText(/Uses .* servers/)).toBeNull();
    expect(fakeSpeech.starts[0].requiresOnDeviceRecognition).toBe(true);
  });

  it('setting OFF (default): no on-device support hides Transcribe, nothing online', async () => {
    noOnDevice();
    await openEdit(/Thankful for tea/);
    await press(byLabel('Open recording'));
    expect(screen.queryByLabelText('Show transcript')).toBeNull();
    expect(fakeSpeech.starts).toHaveLength(0);
  });

  it('a network error in an online run shows the needs-internet message', async () => {
    allowOnline();
    noOnDevice();
    await openEdit(/Thankful for tea/);
    await openSheetTranscript();
    await emit(() => fakeSpeech.error('network'));
    await emit(() => fakeSpeech.end());
    expect(
      screen.getByText(
        "Transcribing online needs an internet connection. Try again when you're online.",
      ),
    ).toBeTruthy();
    expect(fakeSpeech.starts).toHaveLength(1);
  });

  it('Android is never online: with the setting ON and no on-device support nothing is offered', async () => {
    allowOnline();
    noOnDevice();
    const r = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await openEdit(/Thankful for tea/);
      await press(byLabel('Open recording'));
      expect(screen.queryByLabelText('Show transcript')).toBeNull();
      expect(fakeSpeech.starts).toHaveLength(0);
    } finally {
      r.restore();
    }
  });

  it('the Settings toggle (after the confirmation) saves the setting and re-evaluates Transcribe', async () => {
    noOnDevice();
    await render(<App />);
    await settle();
    await press(byLabel('Open Settings'));
    await fireEvent(
      screen.getByRole('switch', { name: 'Transcribe voice notes online' }),
      'valueChange',
      true,
    );
    await settle();
    // Not saved until the confirmation is accepted.
    expect(
      JSON.parse(__fs.read(`${DOC}/settings.json`) ?? '{}').onlineTranscription,
    ).toBeUndefined();
    expect(lastButtons().map((b) => b.text)).toEqual(['Cancel', 'Turn on']);
    await choose('Turn on');
    expect(JSON.parse(__fs.read(`${DOC}/settings.json`) ?? '{}').onlineTranscription).toBe(true);
    await press(byLabel('Back to Today'));
    await press(byLabel('Open Journals'));
    await press(byLabel(/^Gratitude, /));
    await press(byLabel(/Thankful for tea/));
    await openSheetTranscript();
    expect(screen.getByText("Uses Apple's servers")).toBeTruthy();
  });

  it('turning it back OFF in Settings removes the online route', async () => {
    allowOnline();
    noOnDevice();
    await render(<App />);
    await settle();
    await press(byLabel('Open Settings'));
    await fireEvent(
      screen.getByRole('switch', { name: 'Transcribe voice notes online' }),
      'valueChange',
      false,
    );
    await settle();
    expect(JSON.parse(__fs.read(`${DOC}/settings.json`) ?? '{}').onlineTranscription).toBe(false);
    await press(byLabel('Back to Today'));
    await press(byLabel('Open Journals'));
    await press(byLabel(/^Gratitude, /));
    await press(byLabel(/Thankful for tea/));
    await press(byLabel('Open recording'));
    expect(screen.queryByLabelText('Show transcript')).toBeNull();
  });
});
