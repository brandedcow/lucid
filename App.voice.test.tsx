import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, AlertButton, BackHandler } from 'react-native';
import App from './App';
import type { Dream } from './src/types/dream';
import { __fs } from './src/test/fakeFileSystem';

// Integration tests for the voice attachment on the add-entry page: the real hooks, storage and
// screens on the in-memory file system. Only native modules (recorder, player) are faked.
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
jest.mock('./src/screens/CaptureScreen', () => ({ CaptureScreen: () => null }));
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
    handled = handlers.at(-1)?.() ?? false;
  });
  await settle();
  return handled;
};

async function openNewGratitude() {
  await render(<App />);
  await settle();
  await press(byLabel('Open Journals'));
  await press(byLabel('Add entry'));
  await press(screen.getByRole('menuitem', { name: /^Gratitude,/ }));
  expect(byLabel('Journal: Gratitude')).toBeTruthy();
}
const record = async () => {
  await press(byLabel('Record voice note'));
  await press(byLabel('Stop recording'));
};
async function openEdit(title: RegExp) {
  await render(<App />);
  await settle();
  await press(byLabel('Open Journals'));
  await press(byLabel(/^Gratitude, /));
  await press(byLabel(title));
  await press(byLabel('More options'));
  await press(byLabel('Edit entry'));
}

beforeEach(() => {
  jest.clearAllMocks();
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

describe('App voice entry', () => {
  it('records then saves in a custom journal: audio, duration and waveform are stored', async () => {
    await openNewGratitude();
    await record();
    expect(byLabel('Play recording')).toBeTruthy();
    await press(byLabel('Save entry'));
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    const saved = index().find((d) => d.id !== 'g1' && d.id !== 'g2');
    expect(saved).toMatchObject({ journalId: 'j_g1', durationMs: 4000 });
    expect(saved?.audioFileName).toBeDefined();
    expect(saved?.waveform).toHaveLength(56);
    expect(__fs.read(`${DOC}/dreams/${saved?.audioFileName}`)).toBe('new-audio');
    expect(__fs.has(CACHE)).toBe(false);
  });

  it('a closed recording is not saved and only its cache file goes, after the save', async () => {
    await openNewGratitude();
    await record();
    await press(byLabel('Remove recording'));
    expect(__fs.has(CACHE)).toBe(true);
    await fireEvent.changeText(byLabel('Entry text'), 'just words');
    await press(byLabel('Save entry'));
    const saved = index().find((d) => d.id !== 'g1' && d.id !== 'g2');
    expect(saved).toMatchObject({ transcript: 'just words', durationMs: 0 });
    expect(saved).not.toHaveProperty('audioFileName');
    expect(__fs.has(CACHE)).toBe(false);
    expect(__fs.read(STORED_AUDIO)).toBe('old-audio');
  });

  it('Discard on the leave prompt deletes only the cache file and adds no entry', async () => {
    await openNewGratitude();
    await record();
    await press(byLabel('Back'));
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Save a draft?',
      expect.any(String),
      expect.any(Array),
    );
    await choose('Discard');
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(__fs.has(CACHE)).toBe(false);
    expect(__fs.read(STORED_AUDIO)).toBe('old-audio');
    expect(index()).toHaveLength(2);
  });

  it('Keep writing keeps the recording and the cache file', async () => {
    await openNewGratitude();
    await record();
    await press(byLabel('Back'));
    await choose('Keep writing');
    expect(byLabel('Play recording')).toBeTruthy();
    expect(__fs.has(CACHE)).toBe(true);
  });

  it('Save draft with a recording stores a draft with its audio and waveform', async () => {
    await openNewGratitude();
    await record();
    await press(byLabel('Back'));
    await choose('Save draft');
    const draft = index().find((d) => d.status === 'draft');
    expect(draft).toMatchObject({ journalId: 'j_g1', durationMs: 4000 });
    expect(draft?.audioFileName).toBeDefined();
    expect(draft?.waveform).toHaveLength(56);
    expect(__fs.has(CACHE)).toBe(false);
  });

  it('an empty page closes without asking', async () => {
    await openNewGratitude();
    await press(byLabel('Back'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
  });

  it('a closed recording alone is not content; leaving deletes its cache file', async () => {
    await openNewGratitude();
    await record();
    await press(byLabel('Remove recording'));
    await press(byLabel('Back'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(__fs.has(CACHE)).toBe(false);
  });

  describe('while recording', () => {
    it('back asks to discard; Keep recording stays', async () => {
      await openNewGratitude();
      await press(byLabel('Record voice note'));
      await press(byLabel('Back'));
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Discard this recording?',
        'Your recording will be deleted.',
        expect.any(Array),
      );
      await choose('Keep recording');
      expect(byLabel('Stop recording')).toBeTruthy();
      expect(mockRec.stop).not.toHaveBeenCalled();
    });

    it('Android back asks too; Discard stops, deletes the cache file and leaves an empty page', async () => {
      await openNewGratitude();
      await press(byLabel('Record voice note'));
      expect(await hardwareBack()).toBe(true);
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Discard this recording?',
        expect.any(String),
        expect.any(Array),
      );
      await choose('Discard');
      expect(mockRec.stop).toHaveBeenCalledTimes(1);
      expect(__fs.has(CACHE)).toBe(false);
      expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
      expect(index()).toHaveLength(2);
    });

    it('Discard on a page with typed text drops the recording, then asks the usual leave prompt', async () => {
      await openNewGratitude();
      await fireEvent.changeText(byLabel('Entry text'), 'some words');
      await press(byLabel('Record voice note'));
      await press(byLabel('Back'));
      await choose('Discard');
      expect(__fs.has(CACHE)).toBe(false);
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Save a draft?',
        expect.any(String),
        expect.any(Array),
      );
      await choose('Keep writing');
      expect(byLabel('Entry text').props.value).toBe('some words');
      expect(screen.queryByLabelText('Stop recording')).toBeNull();
    });

    it('the check does nothing until the recording is stopped', async () => {
      await openNewGratitude();
      await press(byLabel('Record voice note'));
      expect(byLabel('Save entry').props.accessibilityState.disabled).toBe(true);
      await press(byLabel('Stop recording'));
      expect(byLabel('Save entry').props.accessibilityState.disabled).toBe(false);
    });
  });

  describe('editing a saved entry', () => {
    it('shows its audio in a playable card with no close button, and saving keeps the file', async () => {
      await openEdit(/Thankful for tea/);
      expect(byLabel('Play recording')).toBeTruthy();
      expect(screen.getAllByTestId('wave-bar')).toHaveLength(3);
      expect(screen.queryByLabelText('Remove recording')).toBeNull();
      await fireEvent.changeText(byLabel('Entry text'), 'tea and toast');
      await press(byLabel('Save entry'));
      const saved = index().find((d) => d.id === 'g1');
      expect(saved).toMatchObject({
        audioFileName: 'g1.m4a',
        durationMs: 9000,
        waveform: [0.2, 0.7, 0.4],
        transcript: 'tea and toast',
      });
      expect(__fs.read(STORED_AUDIO)).toBe('old-audio');
    });

    it('adds a recording to a text-only entry on Done, not before', async () => {
      await openEdit(/Plain words/);
      await record();
      expect(index().find((d) => d.id === 'g2')).not.toHaveProperty('audioFileName');
      await press(byLabel('Save entry'));
      const saved = index().find((d) => d.id === 'g2');
      expect(saved?.audioFileName).toBeDefined();
      expect(saved).toMatchObject({ durationMs: 4000, transcript: 'just text' });
      expect(saved?.status).toBeUndefined();
      expect(__fs.has(CACHE)).toBe(false);
    });

    it('leaving an edit with Discard deletes only the new cache file, never stored audio', async () => {
      await openEdit(/Plain words/);
      await record();
      await press(byLabel('Back'));
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Discard changes?',
        expect.any(String),
        expect.any(Array),
      );
      await choose('Discard');
      expect(__fs.has(CACHE)).toBe(false);
      expect(__fs.read(STORED_AUDIO)).toBe('old-audio');
      expect(index().find((d) => d.id === 'g2')).not.toHaveProperty('audioFileName');
    });

    it('an edit never saves a draft, even with a recording', async () => {
      await openEdit(/Plain words/);
      await record();
      await press(byLabel('Save entry'));
      expect(index().find((d) => d.id === 'g2')?.status).toBeUndefined();
    });
  });
});
