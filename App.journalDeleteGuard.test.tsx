import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AlertButton, BackHandler } from 'react-native';
import App from './App';
import type { Dream } from './src/types/dream';
import { __fs } from './src/test/fakeFileSystem';

// Safety tests for the App's journal delete handler. Journals home is replaced by a stub that can
// call onDeleteJournal with ANY id (the real screen never offers Delete on Dreams or Life), so the
// handler's own guards are what is tested. Real hooks and storage on the in-memory file system.
jest.mock('./src/screens/JournalsScreen', () => {
  const { Pressable, Text } = require('react-native');
  return {
    JournalsScreen: ({ onDeleteJournal, deletingId }: any) => (
      <>
        <Text>journals-screen</Text>
        <Text>{`deleting:${deletingId}`}</Text>
        {['dreams', 'life', 'j_unknown', 'j_g1', 'J_G1', '', '__proto__'].map((id) => (
          <Pressable key={id} onPress={() => onDeleteJournal(id)}>
            <Text>{`ask-${id}`}</Text>
          </Pressable>
        ))}
      </>
    ),
  };
});
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

// The recording flow is not under test here and needs native modules.
jest.mock('./src/screens/CaptureScreen', () => ({ CaptureScreen: () => null }));
jest.mock('./src/screens/ReadItBackScreen', () => ({ ReadItBackScreen: () => null }));
jest.mock('./src/screens/ReviewScreen', () => ({ ReviewScreen: () => null }));

// What the world looked like at the moment the registry entry was removed, and how often it was.
let mockRemoveJournalCalls: { id: string; entriesLeft: string[] }[] = [];
jest.mock('./src/services/journalStorage', () => {
  const actual = jest.requireActual('./src/services/journalStorage');
  return {
    ...actual,
    removeJournal: (id: string) => {
      const { __fs: fs } = require('./src/test/fakeFileSystem');
      const text = fs.read('file:///document/dreams.json');
      const list: { id: string; journalId?: string }[] = text ? JSON.parse(text) : [];
      mockRemoveJournalCalls.push({
        id,
        entriesLeft: list.filter((d) => d.journalId === id).map((d) => d.id),
      });
      return actual.removeJournal(id);
    },
  };
});
// A test can hold every entry delete until it opens the gate.
let mockGate: Promise<void> | null = null;
jest.mock('./src/services/dreamStorage', () => {
  const actual = jest.requireActual('./src/services/dreamStorage');
  return {
    ...actual,
    deleteDream: async (id: string) => {
      if (mockGate) await mockGate;
      return actual.deleteDream(id);
    },
  };
});

const DOC = 'file:///document';
const now = new Date().toISOString();
const rec = (id: string, title: string, extra: Partial<Dream> = {}): Dream => ({
  id,
  createdAt: now,
  durationMs: 0,
  title,
  tags: [],
  ...extra,
});
const withAudio = (id: string): Partial<Dream> => ({
  durationMs: 5000,
  audioFileName: `${id}.m4a`,
});

const gratitude = {
  id: 'j_g1',
  name: 'Gratitude',
  kind: 'journal',
  createdAt: '2026-10-09T08:00:00Z',
};
const travel = { id: 'j_t1', name: 'Travel', kind: 'journal', createdAt: '2026-10-09T09:00:00Z' };

// Three Gratitude entries (two finished, one with audio, and a draft), one Travel entry, and one
// each of Dreams (legacy, no journalId), Dreams (explicit) and Life.
const RECORDS = [
  rec('d1', 'Old dream', withAudio('d1')), // legacy: no journalId, counts as Dreams
  rec('d2', 'Explicit dream', { journalId: 'dreams' }),
  rec('l1', 'Walk', { journalId: 'life', transcript: 'went for a walk' }),
  rec('g1', 'Thankful for tea', { journalId: 'j_g1', transcript: 'tea', ...withAudio('g1') }),
  rec('g2', 'Half-written', { journalId: 'j_g1', status: 'draft' }),
  rec('g3', 'Warm sun', { journalId: 'j_g1', transcript: 'sun' }),
  rec('t1', 'Lisbon trip', { journalId: 'j_t1', transcript: 'trams' }),
];

const putAll = (records = RECORDS, journals = [gratitude, travel]) => {
  __fs.put(`${DOC}/journals.json`, JSON.stringify({ version: 1, journals }));
  __fs.put(`${DOC}/settings.json`, JSON.stringify({ autoOpenDreamCapture: false }));
  __fs.put(`${DOC}/dreams.json`, JSON.stringify(records));
  for (const r of records) {
    if (r.audioFileName) __fs.put(`${DOC}/dreams/${r.audioFileName}`, 'audio');
  }
};
const storedIds = () =>
  (JSON.parse(__fs.read(`${DOC}/dreams.json`) ?? '[]') as { id: string }[]).map((d) => d.id);
const storedJournals = () =>
  (
    JSON.parse(__fs.read(`${DOC}/journals.json`) ?? '{"journals":[]}').journals as { id: string }[]
  ).map((j) => j.id);

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function renderApp() {
  await render(<App />);
  await settle();
}
const lastButtons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
const pressAlert = (text: string) =>
  act(async () => {
    lastButtons()
      .find((b) => b.text === text)
      ?.onPress?.();
  });
const ask = (id: string) => fireEvent.press(screen.getByText(`ask-${id}`));

beforeEach(() => {
  jest.clearAllMocks();
  __fs.reset();
  mockRemoveJournalCalls = [];
  mockGate = null;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove: () => {} }));
  putAll();
});
afterEach(() => jest.restoreAllMocks());

const untouched = () => {
  expect(storedIds()).toEqual(RECORDS.map((r) => r.id));
  expect(storedJournals()).toEqual(['j_g1', 'j_t1']);
  expect(mockRemoveJournalCalls).toEqual([]);
};

describe('App journal delete handler guards', () => {
  beforeEach(async () => {
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Open Journals'));
  });

  it.each(['dreams', 'life'])(
    'refuses the built-in journal "%s": no dialog, nothing deleted',
    async (id) => {
      await ask(id);
      expect(Alert.alert).not.toHaveBeenCalled();
      untouched();
    },
  );

  it.each(['j_unknown', 'J_G1', '', '__proto__'])(
    'refuses an unknown id %j: no dialog, nothing deleted',
    async (id) => {
      await ask(id);
      expect(Alert.alert).not.toHaveBeenCalled();
      untouched();
    },
  );

  it('deletes only the entries of the exact journal asked for', async () => {
    await ask('j_g1');
    await pressAlert('Delete');
    await waitFor(() => expect(mockRemoveJournalCalls).toHaveLength(1));
    await settle();
    expect(storedIds()).toEqual(['d1', 'd2', 'l1', 't1']);
    expect(storedJournals()).toEqual(['j_t1']);
  });

  it('a second request for the same journal while the dialog is up opens no second dialog', async () => {
    await ask('j_g1');
    await ask('j_g1');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('asking again after the journal was removed is refused', async () => {
    await ask('j_g1');
    await pressAlert('Delete');
    await waitFor(() => expect(mockRemoveJournalCalls).toHaveLength(1));
    await settle();
    // Asking again for the now-unknown journal is refused.
    await ask('j_g1');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(storedIds()).toEqual(['d1', 'd2', 'l1', 't1']);
  });

  it('while one journal delete runs, a second request is ignored', async () => {
    let open!: () => void;
    mockGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    await ask('j_g1');
    await pressAlert('Delete');
    expect(screen.getByText('deleting:j_g1')).toBeTruthy();
    await ask('j_g1');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    await act(async () => open());
    await waitFor(() => expect(mockRemoveJournalCalls).toHaveLength(1));
    await settle();
    expect(screen.getByText('deleting:null')).toBeTruthy();
  });
});

describe('App journal delete with unreadable or unloaded entries', () => {
  it('refuses when the saved entries cannot be read (they would look empty)', async () => {
    __fs.put(`${DOC}/dreams.json`, '{not json');
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Open Journals'));
    await ask('j_g1');
    expect(jest.mocked(Alert.alert).mock.calls.at(-1)).toEqual([
      'Could not delete "Gratitude"',
      'Your saved entries could not be read, so nothing was deleted.',
    ]);
    expect(storedJournals()).toEqual(['j_g1', 'j_t1']);
    expect(mockRemoveJournalCalls).toEqual([]);
    expect(__fs.read(`${DOC}/dreams.json`)).toBe('{not json');
  });
});
