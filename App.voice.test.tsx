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
    it('shows its audio in a playable card with a close button, and saving keeps the file', async () => {
      await openEdit(/Thankful for tea/);
      expect(byLabel('Play recording')).toBeTruthy();
      expect(screen.getAllByTestId('wave-bar')).toHaveLength(3);
      expect(byLabel('Remove recording')).toBeTruthy();
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

    it('closing the recording then Done removes it: entry kept, file deleted', async () => {
      await openEdit(/Thankful for tea/);
      await press(byLabel('Remove recording'));
      expect(screen.queryByLabelText('Play recording')).toBeNull();
      // Nothing is deleted before Done.
      expect(__fs.read(STORED_AUDIO)).toBe('old-audio');
      expect(index().find((d) => d.id === 'g1')?.audioFileName).toBe('g1.m4a');
      await press(byLabel('Save entry'));
      const saved = index().find((d) => d.id === 'g1');
      expect(saved).not.toHaveProperty('audioFileName');
      expect(saved).not.toHaveProperty('waveform');
      expect(saved).toMatchObject({ title: 'Thankful for tea', transcript: 'tea', durationMs: 0 });
      expect(saved?.status).toBeUndefined();
      expect(__fs.has(STORED_AUDIO)).toBe(false);
    });

    it('closing then undoing the close, then Done, keeps the stored audio', async () => {
      await openEdit(/Thankful for tea/);
      await press(byLabel('Remove recording'));
      await press(byLabel('Undo'));
      expect(byLabel('Play recording')).toBeTruthy();
      await press(byLabel('Save entry'));
      const saved = index().find((d) => d.id === 'g1');
      expect(saved).toMatchObject({ audioFileName: 'g1.m4a', waveform: [0.2, 0.7, 0.4] });
      expect(__fs.read(STORED_AUDIO)).toBe('old-audio');
    });

    it('closing, undo, redo, then Done removes the stored audio', async () => {
      await openEdit(/Thankful for tea/);
      await press(byLabel('Remove recording'));
      await press(byLabel('Undo'));
      await press(byLabel('Redo'));
      expect(screen.queryByLabelText('Play recording')).toBeNull();
      expect(__fs.read(STORED_AUDIO)).toBe('old-audio');
      await press(byLabel('Save entry'));
      expect(index().find((d) => d.id === 'g1')).not.toHaveProperty('audioFileName');
      expect(__fs.has(STORED_AUDIO)).toBe(false);
    });

    it('closing then recording again replaces the stored recording on Done', async () => {
      await openEdit(/Thankful for tea/);
      await press(byLabel('Remove recording'));
      await record();
      await press(byLabel('Save entry'));
      const saved = index().find((d) => d.id === 'g1');
      expect(saved?.audioFileName).toBeDefined();
      expect(saved?.audioFileName).not.toBe('g1.m4a');
      expect(saved?.durationMs).toBe(4000);
      expect(__fs.has(STORED_AUDIO)).toBe(false);
      expect(__fs.read(`${DOC}/dreams/${saved?.audioFileName}`)).toBe('new-audio');
    });

    it('back with only a removal asks Discard changes; Discard deletes nothing', async () => {
      await openEdit(/Thankful for tea/);
      await press(byLabel('Remove recording'));
      await press(byLabel('Back'));
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Discard changes?',
        expect.any(String),
        expect.any(Array),
      );
      await choose('Discard');
      expect(__fs.read(STORED_AUDIO)).toBe('old-audio');
      expect(index().find((d) => d.id === 'g1')?.audioFileName).toBe('g1.m4a');
    });

    it('Keep editing after back keeps the mark; Android back asks too and commits nothing', async () => {
      await openEdit(/Thankful for tea/);
      await press(byLabel('Remove recording'));
      expect(await hardwareBack()).toBe(true);
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(__fs.read(STORED_AUDIO)).toBe('old-audio');
      expect(index().find((d) => d.id === 'g1')?.audioFileName).toBe('g1.m4a');
      expect(screen.queryByLabelText('Play recording')).toBeNull();
    });

    it('a record whose audio file is missing still opens on the page', async () => {
      __fs.reset();
      __fs.put(`${DOC}/journals.json`, JSON.stringify({ version: 1, journals: [gratitude] }));
      __fs.put(`${DOC}/settings.json`, JSON.stringify({ autoOpenDreamCapture: false }));
      __fs.put(`${DOC}/dreams.json`, JSON.stringify([WITH_AUDIO]));
      await openEdit(/Thankful for tea/);
      expect(byLabel('Play recording')).toBeTruthy();
      await press(byLabel('Remove recording'));
      await press(byLabel('Save entry'));
      expect(index()[0]).not.toHaveProperty('audioFileName');
    });

    it('an edit never saves a draft, even with a recording', async () => {
      await openEdit(/Plain words/);
      await record();
      await press(byLabel('Save entry'));
      expect(index().find((d) => d.id === 'g2')?.status).toBeUndefined();
    });
  });

  describe('reopening a draft with a recording', () => {
    const DRAFT = rec('g3', 'Half done', {
      journalId: 'j_g1',
      transcript: 'draft words',
      status: 'draft',
      audioFileName: 'g3.m4a',
      durationMs: 6000,
    });
    const DRAFT_AUDIO = `${DOC}/dreams/g3.m4a`;
    const openDraft = async () => {
      __fs.put(`${DOC}/dreams.json`, JSON.stringify([DRAFT]));
      __fs.put(DRAFT_AUDIO, 'draft-audio');
      await render(<App />);
      await settle();
      await press(byLabel('Open Journals'));
      await press(byLabel(/^Gratitude, /));
      await press(byLabel(/Half done/));
    };

    it('back with a removal asks Save draft / Discard / Keep writing and commits nothing', async () => {
      await openDraft();
      await press(byLabel('Remove recording'));
      await press(byLabel('Back'));
      expect(lastButtons().map((b) => b.text)).toEqual(['Save draft', 'Discard', 'Keep writing']);
      expect(__fs.read(DRAFT_AUDIO)).toBe('draft-audio');
      await choose('Discard');
      expect(__fs.read(DRAFT_AUDIO)).toBe('draft-audio');
      expect(index().find((d) => d.id === 'g3')?.audioFileName).toBe('g3.m4a');
    });

    it('Save draft removes the recording and stays a draft', async () => {
      await openDraft();
      await press(byLabel('Remove recording'));
      await press(byLabel('Back'));
      await choose('Save draft');
      const saved = index().find((d) => d.id === 'g3');
      expect(saved).not.toHaveProperty('audioFileName');
      expect(saved?.status).toBe('draft');
      expect(__fs.has(DRAFT_AUDIO)).toBe(false);
    });

    it('Done removes the recording and finishes the draft', async () => {
      await openDraft();
      await press(byLabel('Remove recording'));
      await press(byLabel('Save entry'));
      const saved = index().find((d) => d.id === 'g3');
      expect(saved).not.toHaveProperty('audioFileName');
      expect(saved?.status).toBeUndefined();
      expect(__fs.has(DRAFT_AUDIO)).toBe(false);
    });
  });
});

describe('App launch page with voice', () => {
  const marker = () => __fs.read(`${DOC}/no-dream.json`);
  const dayKey = (() => {
    const d = new Date();
    const two = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  })();
  async function launch() {
    // Auto-open on: nothing in the Dreams journal today, so the app opens the Dreams page.
    __fs.put(`${DOC}/settings.json`, JSON.stringify({ autoOpenDreamCapture: true }));
    await render(<App />);
    await settle();
    expect(byLabel('Title')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Today' })).toBeNull();
  }

  it('opens the add-entry page for Dreams, with the voice toolbar', async () => {
    await launch();
    expect(byLabel('Journal: Dreams')).toBeTruthy();
    expect(byLabel('Record voice note')).toBeTruthy();
  });

  it('back on the empty page is No dream: marker written, Today, no alert', async () => {
    await launch();
    await press(byLabel('Back'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(marker()).toContain(dayKey);
  });

  it('back while recording asks first; Keep recording stays and marks nothing', async () => {
    await launch();
    await press(byLabel('Record voice note'));
    await press(byLabel('Back'));
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Discard this recording?',
      'Your recording will be deleted.',
      expect.any(Array),
    );
    await choose('Keep recording');
    expect(byLabel('Stop recording')).toBeTruthy();
    expect(marker()).toBeUndefined();
    expect(mockRec.stop).not.toHaveBeenCalled();
  });

  it('Android back while recording asks; Discard stops, deletes the cache file, then counts as No dream', async () => {
    await launch();
    await press(byLabel('Record voice note'));
    expect(await hardwareBack()).toBe(true);
    await choose('Discard');
    expect(mockRec.stop).toHaveBeenCalledTimes(1);
    expect(__fs.has(CACHE)).toBe(false);
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(marker()).toContain(dayKey);
    expect(index()).toHaveLength(2);
  });

  it('with a finished recording, back asks Save draft / Discard / Keep writing and is not No dream', async () => {
    await launch();
    await record();
    await press(byLabel('Back'));
    expect(lastButtons().map((b) => b.text)).toEqual(['Save draft', 'Discard', 'Keep writing']);
    await choose('Discard');
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(marker()).toBeUndefined();
    expect(__fs.has(CACHE)).toBe(false);
    expect(index()).toHaveLength(2);
  });

  it('records and saves a Dream from the launch page: audio stored, back on Today, no marker', async () => {
    await launch();
    await fireEvent.changeText(byLabel('Title'), 'Flying');
    await record();
    await press(byLabel('Save dream'));
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    const saved = index().find((d) => d.title === 'Flying');
    expect(saved).toMatchObject({ durationMs: 4000 });
    expect(saved?.journalId).toBe('dreams');
    expect(saved?.audioFileName).toBeDefined();
    expect(__fs.has(CACHE)).toBe(false);
    expect(marker()).toBeUndefined();
  });
});
